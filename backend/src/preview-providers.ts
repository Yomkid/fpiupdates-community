import {load} from 'cheerio';
import {publicUrl} from './preview-url';
export type PreviewMetadata={url:string;title:string;description:string;siteName:string;image:string|null};
export function previewProvider(value:string){
 const url=publicUrl(value),host=url.hostname.toLowerCase().replace(/^www\./,'');
 if(['youtube.com','m.youtube.com','youtu.be','youtube-nocookie.com'].includes(host)){
  const id=host==='youtu.be'?url.pathname.slice(1).split('/')[0]:url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed|v|live)\/([^/]+)/)?.[1];
  if(id&&/^[\w-]{11}$/.test(id)){const canonical='https://www.youtube.com/watch?v='+id;return {name:'YouTube',endpoint:'https://www.youtube.com/oembed?'+new URLSearchParams({url:canonical,format:'json'}),fallbackImage:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'};}
 }
 if(['facebook.com','m.facebook.com','web.facebook.com','fb.watch'].includes(host)){
  const video=host==='fb.watch'||/\/(?:videos|reel|watch)(?:\/|$)/.test(url.pathname)||url.pathname==='/video.php';
  const post=/\/(?:posts|permalink|photos)(?:\/|$)/.test(url.pathname)||['/permalink.php','/photo.php'].includes(url.pathname);
  if(video||post)return {name:'Facebook',endpoint:'https://graph.facebook.com/'+(video?'oembed_video':'oembed_post')+'?'+new URLSearchParams({url:url.href,omitscript:'true'}),fallbackImage:null};
 }
 return null;
}
export function parseOEmbed(value:unknown,url:string,name:string):PreviewMetadata{
 if(!value||typeof value!=='object')throw Error('Invalid provider metadata');const data=value as Record<string,unknown>;
 const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,max):'';
 const $=load(typeof data.html==='string'?data.html:'');$('script,style,iframe').remove();const excerpt=clean($('blockquote p').first().text()||$('blockquote').text(),600);const title=clean(data.title,300)||clean(data.author_name,300)||(excerpt?'Post on '+name:'');let image:string|null=null;try{if(typeof data.thumbnail_url==='string')image=publicUrl(data.thumbnail_url).href;}catch{}
 if(!title&&!image)throw Error('Provider metadata unavailable');
 return {url,title:title||name,description:excerpt,siteName:name,image};
}
