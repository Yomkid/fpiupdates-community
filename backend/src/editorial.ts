import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { postVisibility, visibleAuthor } from './post-visibility';
import sanitizeHtml from 'sanitize-html';
import { MediaService } from './media';
import { Database } from './database';
import { AuthRequest, publicUser, SessionGuard, OptionalSessionGuard } from './auth';
import { ArticleDto } from './feature-dtos';
import { PermissionGuard, RequirePermission, VerifiedGuard } from './permissions';
import { PostsService } from './posts';
export function cleanArticleHtml(body:string){return sanitizeHtml(body,{allowedTags:['p','br','h2','h3','strong','em','s','u','blockquote','ul','ol','li','pre','code','hr','a'],allowedAttributes:{a:['href','target','rel']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{href:attrs.href??'',target:'_blank',rel:'noopener noreferrer nofollow ugc'}})}});}
export function articleSlug(title:string,id:string){const base=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75).replace(/-$/,'')||'article';return `${base}-${id}`;}
@Controller('articles')
export class ArticlesController {
 constructor(private readonly db:Database,private readonly posts:PostsService){}
 @Get() @UseGuards(OptionalSessionGuard) list(@Req()req:AuthRequest){return this.db.article.findMany({where:{status:'PUBLISHED',author:visibleAuthor(req.account?.id,true),discussionPost:postVisibility(req.account?.id,true)},orderBy:[{publishedAt:'desc'},{id:'desc'}],take:100,select:{id:true,slug:true,title:true,excerpt:true,publishedAt:true,legacySource:true,coverMediaId:true,coverAlt:true,author:{select:publicUser}}});}
 @Get(':slug') @UseGuards(OptionalSessionGuard) async get(@Param('slug')slug:string,@Req()req:AuthRequest){const item=await this.db.article.findFirst({where:{slug,status:'PUBLISHED',author:{status:'ACTIVE'}},include:{author:{select:publicUser}}});if(!item||!item.discussionPostId)throw new NotFoundException('Article not found');return {...item,discussion:await this.posts.get(item.discussionPostId,req.account?.id)};}
}
@Controller('editorial') @UseGuards(SessionGuard,PermissionGuard)
export class EditorialController {
 constructor(private readonly db:Database,private readonly media:MediaService){}
 @Get() @RequirePermission('articles.write') list(@Req()req:AuthRequest){return this.db.article.findMany({where:req.permissions.includes('articles.manage')?{}:{authorId:req.account.id},orderBy:{updatedAt:'desc'},take:100});}
 @Put(':id') @RequirePermission('articles.write') @UseGuards(VerifiedGuard)
 async save(@Param('id',ParseUUIDPipe)id:string,@Body()dto:ArticleDto,@Req()req:AuthRequest){
  if(await this.db.articleWorkingCopy.findUnique({where:{id}}))throw new ForbiddenException('Use the draft publishing workflow for this article');
  const existing=await this.db.article.findUnique({where:{id}});
  if(existing&&existing.authorId!==req.account.id&&!req.permissions.includes('articles.manage'))throw new ForbiddenException('You may only edit your own articles');
  if((dto.status==='PUBLISHED'||existing?.status==='PUBLISHED')&&!req.permissions.includes('articles.publish'))throw new ForbiddenException('Publishing permission required');
  if(dto.coverMediaId!==existing?.coverMediaId)await this.media.assertOwned(dto.coverMediaId,req.account.id,'COVER');
  const bodyFormat=dto.bodyFormat??existing?.bodyFormat??'PLAIN';const body=bodyFormat==='HTML'?cleanArticleHtml(dto.body):dto.body;
  if(!sanitizeHtml(body,{allowedTags:[],allowedAttributes:{}}).trim())throw new BadRequestException('Article text is required');
  // The server owns the URL. Once created, the slug survives title changes.
  const data={coverMediaId:dto.coverMediaId,coverAlt:dto.coverAlt,title:dto.title,excerpt:dto.excerpt,body,bodyFormat,status:dto.status,sourceUrl:dto.sourceUrl??null};
  return this.db.$transaction(async tx=>{
   let discussionPostId=existing?.discussionPostId??null;
   if(dto.status==='PUBLISHED'&&!discussionPostId){const post=await tx.post.create({data:{authorId:existing?.authorId??req.account.id,replyPolicyOwnerId:existing?.authorId??req.account.id,body:`${dto.title}\n\n${dto.excerpt}`.trim()}});discussionPostId=post.id;}
   else if(discussionPostId)await tx.post.update({where:{id:discussionPostId},data:{body:`${dto.title}\n\n${dto.excerpt}`.trim()}});
   const item=await tx.article.upsert({where:{id},create:{id,...data,slug:articleSlug(dto.title,id),authorId:req.account.id,discussionPostId,publishedAt:dto.status==='PUBLISHED'?new Date():null},update:{...data,discussionPostId,publishedAt:dto.status==='PUBLISHED'?(existing?.publishedAt??new Date()):null}});
   await tx.auditLog.create({data:{actorId:req.account.id,action:'article.save',targetId:id,reason:`Saved article as ${dto.status}`}});return item;
  });
 }
}
