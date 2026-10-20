import { BadRequestException, Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import {previewProvider,parseOEmbed,type PreviewMetadata} from './preview-providers';
import { detectedLinks } from './links';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import {publicUrl} from './preview-url';
export {publicUrl} from './preview-url';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import sharp from 'sharp';
import type { Response } from 'express';
import { Database } from './database';
import { AuthRequest, SessionGuard } from './auth';
export function firstLink(text:string){for(const link of detectedLinks(text)){try{return publicUrl(link.url).href;}catch{}}return null;}
export function publicAddress(address:string){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
export async function resolvePublic(hostname:string){let timer:ReturnType<typeof setTimeout>|undefined;try{const answers=await Promise.race([lookup(hostname,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS timeout')),1500);})]);if(!answers.length||answers.some(x=>!publicAddress(x.address)))throw new Error('Private address blocked');return answers.find(answer=>answer.family===4)??answers[0];}finally{if(timer)clearTimeout(timer);}}
// Connect to the exact validated DNS address; redirects go through validation again.
export async function readPublicUrl(value:string,maxBytes:number,deadline=Date.now()+6000,redirects=0):Promise<{body:Buffer;type:string;url:string}>{
 const url=publicUrl(value);if(Date.now()>=deadline||redirects>3)throw new Error('Preview budget exceeded');const target=await resolvePublic(url.hostname);
 return new Promise((resolve,reject)=>{let size=0;const chunks:Buffer[]=[];let finished=false;const done=(error?:Error,result?:{body:Buffer;type:string;url:string})=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result!);};
 const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{family:target.family,lookup:(_host,_options,callback)=>callback(null,target.address,target.family),headers:{'User-Agent':'FpiUpdates-LinkPreview/1.0','Accept':'text/html,application/json,image/jpeg,image/png,image/webp;q=0.8','Accept-Encoding':'gzip, deflate, br'},agent:false},res=>{
  const status=res.statusCode??500;if([301,302,303,307,308].includes(status)&&res.headers.location){res.destroy();const next=new URL(res.headers.location,url).href;readPublicUrl(next,maxBytes,deadline,redirects+1).then(result=>done(undefined,result),e=>done(e));return;}
  if(status<200||status>=300){res.destroy();done(new Error('Unsupported response'));return;}
  const type=(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();if(!['application/json','text/json','text/html','application/xhtml+xml','image/jpeg','image/png','image/webp'].includes(type)){res.destroy();done(new Error('Unsupported content'));return;}
  if(Number(res.headers['content-length']??0)>maxBytes){res.destroy();done(new Error('Response too large'));return;}
  const encoding=(res.headers['content-encoding']??'identity').toLowerCase();
  const decoder=encoding==='gzip'?createGunzip():encoding==='deflate'?createInflate():encoding==='br'?createBrotliDecompress():null;
  if(!decoder&&encoding!=='identity'){res.destroy();done(new Error('Unsupported encoding'));return;}
  let wireBytes=0;
  if(decoder){res.on('data',(chunk:Buffer)=>{wireBytes+=chunk.length;if(wireBytes>maxBytes){res.destroy();decoder.destroy();done(new Error('Response too large'));}});res.pipe(decoder);}
  const stream=decoder??res;
  stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){res.destroy();decoder?.destroy();done(new Error('Response too large'));}else chunks.push(chunk);});stream.on('end',()=>done(undefined,{body:Buffer.concat(chunks),type,url:url.href}));stream.on('error',e=>done(e));res.on('error',e=>{decoder?.destroy();done(e);});res.on('aborted',()=>{decoder?.destroy();done(new Error('Response interrupted'));});
 });const timer=setTimeout(()=>{req.destroy();done(new Error('Preview timeout'));},Math.max(1,deadline-Date.now()));req.on('error',e=>done(e));req.end();
 });
}
export function parsePreview(html:string,url:string){const $=load(html);const meta=(name:string)=>$('meta').toArray().find(el=>($(el).attr('property')??$(el).attr('name')??'').toLowerCase()===name);const value=(name:string)=>{const element=meta(name);return element?$(element).attr('content')??'':'';};const clean=(text:string,max:number)=>text.replace(/\s+/g,' ').trim().slice(0,max);let image:string|null=null;try{const source=value('og:image:secure_url')||value('og:image')||value('twitter:image')||value('twitter:image:src');if(source)image=publicUrl(new URL(source,url).href).href;}catch{}
 return {url,title:clean(value('og:title')||value('twitter:title')||$('title').first().text()||new URL(url).hostname,300),description:clean(value('og:description')||value('twitter:description')||value('description'),600),siteName:clean(value('og:site_name')||new URL(url).hostname,100),image};}
export const previewSelect={id:true,url:true,title:true,description:true,siteName:true,imageWidth:true,imageHeight:true} as const;
@Injectable()
export class LinkPreviewService {
 private running=0;private failures=new Map<string,number>();private pending=new Map<string,Promise<any>>();private refreshed=new Map<string,number>();
 constructor(private readonly db:Database){}
 async get(value:string){let url:string;try{url=publicUrl(value).href;}catch{return null;}
 const cached=await this.db.linkPreview.findUnique({where:{url},select:previewSelect});
 // Retry old text-only/failed cards, but never hit the origin on every render.
 if(cached?.imageWidth)return this.project(cached);
 if(this.pending.has(url))return this.pending.get(url)!;
 if((this.failures.get(url)??0)>Date.now()||(this.refreshed.get(url)??0)>Date.now()||this.running>=3)return cached?this.project(cached):null;
 const work=this.fetch(url,!!cached);this.pending.set(url,work);try{return (await work)??(cached?this.project(cached):null);}finally{this.pending.delete(url);if(this.refreshed.size>=500)this.refreshed.delete(this.refreshed.keys().next().value!);this.refreshed.set(url,Date.now()+300000);}
 }
 private project(row:{id:string;url:string;title:string;description:string;siteName:string;imageWidth:number|null;imageHeight:number|null}){return {id:row.id,url:row.url,title:row.title,description:row.description,siteName:row.siteName,imageWidth:row.imageWidth,imageHeight:row.imageHeight};}
 private async fetch(url:string,existing=false){this.running++;try{
  // Preview thumbnails have a separate bounded cache; never fill upload storage.
  if(!existing&&await this.db.linkPreview.count()>=500)return null;
  const deadline=Date.now()+8000;const provider=previewProvider(url);let metadata:PreviewMetadata|null=null;
  if(provider){try{const page=await readPublicUrl(provider.endpoint,96*1024,Math.min(deadline,Date.now()+2500));if(!['application/json','text/json'].includes(page.type))throw Error();metadata=parseOEmbed(JSON.parse(page.body.toString('utf8')),url,provider.name);}catch{}}
  if(!metadata){try{const page=await readPublicUrl(url,2*1024*1024,Math.min(deadline,Date.now()+3500));if(!['text/html','application/xhtml+xml'].includes(page.type))throw Error();metadata=parsePreview(page.body.toString('utf8'),page.url);metadata.url=url;}catch{}}
  if(!metadata)metadata={url,title:provider?.name??(new URL(url).hostname==='facebook.com'?'Facebook':new URL(url).hostname),description:'',siteName:provider?.name??new URL(url).hostname,image:null};
  if(!metadata.image&&provider?.fallbackImage)metadata.image=provider.fallbackImage;
  let imageBytes:Buffer|null=null;let imageWidth:number|null=null;let imageHeight:number|null=null;
  if(metadata.image){try{const image=await readPublicUrl(metadata.image,2*1024*1024,deadline);if(!image.type.startsWith('image/'))throw Error();const bytes=image.body;const signature=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');if(!signature)throw Error();const decoder=sharp(image.body,{limitInputPixels:12_000_000});const info=await decoder.metadata();if(!['jpeg','png','webp'].includes(info.format??'')||(info.pages??1)>1)throw Error();const result=await decoder.rotate().resize({width:1000,height:600,fit:'inside',withoutEnlargement:true}).webp({quality:65}).toBuffer({resolveWithObject:true});if(result.data.length<=256*1024){imageBytes=result.data;imageWidth=result.info.width;imageHeight=result.info.height;}}catch{/* Keep a text card if an image cannot be fetched safely. */}}
  const row=await this.db.linkPreview.upsert({where:{url},create:{url,title:metadata.title,description:metadata.description,siteName:metadata.siteName,imageBytes:imageBytes?Uint8Array.from(imageBytes):null,imageWidth,imageHeight},update:{title:metadata.title,description:metadata.description,siteName:metadata.siteName,...(imageBytes?{imageBytes:Uint8Array.from(imageBytes),imageWidth,imageHeight}:{})}});return this.project(row);
 }catch{if(this.failures.size>=100)this.failures.delete(this.failures.keys().next().value!);this.failures.set(url,Date.now()+60000);return null;}finally{this.running--;}}
}
class PreviewDto {@IsString() @MaxLength(2048) url!:string;}
@Controller('link-previews')
export class LinkPreviewController {
 constructor(private readonly previews:LinkPreviewService,private readonly db:Database){}
 @Post() @UseGuards(SessionGuard) @Throttle({default:{ttl:60000,limit:15}}) async preview(@Body()dto:PreviewDto){return {preview:await this.previews.get(dto.url)};}
 @Get(':id/image') async image(@Param('id',ParseUUIDPipe)id:string,@Res()res:Response){const item=await this.db.linkPreview.findUnique({where:{id},select:{imageBytes:true}});if(!item?.imageBytes)throw new BadRequestException('Preview image unavailable');res.setHeader('Content-Type','image/webp');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('X-Content-Type-Options','nosniff');res.send(Buffer.from(item.imageBytes));}
}
