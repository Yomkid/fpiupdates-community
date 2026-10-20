import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, IsUrl, MaxLength, Min, IsISO8601 } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, SessionGuard } from './auth';
import { PermissionGuard, RequirePermission, VerifiedGuard } from './permissions';
import { MediaService } from './media';
import { articleSlug, cleanArticleHtml } from './editorial';
import sanitizeHtml from 'sanitize-html';

export class WorkingCopyDto {
 @IsInt() @Min(0) version!:number;
 @IsString() @MaxLength(200) title!:string;
 @IsString() @MaxLength(400) excerpt!:string;
 @IsString() @MaxLength(50000) body!:string;
 @IsIn(['HTML','PLAIN']) bodyFormat!:string;
 @IsOptional() @IsUUID() coverMediaId?:string|null;
 @IsOptional() @IsString() @MaxLength(500) coverAlt?:string;
 @IsOptional() @IsUrl({protocols:['http','https'],require_protocol:true}) @MaxLength(1000) sourceUrl?:string;
}
export class PublicationDto {
 @IsInt() @Min(1) version!:number;
 @IsIn(['publish','schedule','cancel','unpublish']) action!:'publish'|'schedule'|'cancel'|'unpublish';
 @IsOptional() @IsISO8601({strict:true}) scheduledAt?:string;
}
type Payload=Omit<WorkingCopyDto,'version'>;
type Tx=Prisma.TransactionClient;
@Injectable()
export class PublishingService implements OnModuleInit, OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>; private running=false; private logger=new Logger('Publishing');
 constructor(private readonly db:Database,private readonly media:MediaService){}
 onModuleInit(){if(process.env.PUBLISHING_WORKER_DISABLED==='true')return;this.timer=setInterval(()=>void this.tick(),15000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async access(id:string,req:AuthRequest){
  const draft=await this.db.articleWorkingCopy.findUnique({where:{id}});
  const live=await this.db.article.findUnique({where:{id}});
  const authorId=draft?.authorId??live?.authorId??req.account.id;
  if(authorId!==req.account.id&&!req.permissions.includes('articles.manage'))throw new ForbiddenException('You may only edit your own articles');
  return {draft,live,authorId};
 }
 async get(id:string,req:AuthRequest){const {draft,live}=await this.access(id,req);if(draft)return draft;if(!live)throw new NotFoundException('Draft not found');return {id,authorId:live.authorId,version:0,publishedVersion:0,scheduledAt:null,scheduledById:null,scheduleError:null,updatedAt:live.updatedAt,payload:{title:live.title,excerpt:live.excerpt,body:live.body,bodyFormat:live.bodyFormat,coverMediaId:live.coverMediaId,coverAlt:live.coverAlt??'',...(live.sourceUrl?{sourceUrl:live.sourceUrl}:{})}};}
 async save(id:string,dto:WorkingCopyDto,req:AuthRequest){
  const {draft,live,authorId}=await this.access(id,req);
  if(draft?.scheduledAt)throw new ConflictException('Cancel the schedule before editing this draft');
  if(dto.version!==(draft?.version??0))throw new ConflictException('This draft changed elsewhere. Reopen it before saving.');
  const {version,...raw}=dto;
  if(raw.coverMediaId!==(draft?.payload as unknown as Payload)?.coverMediaId&&raw.coverMediaId!==live?.coverMediaId)await this.media.assertOwned(raw.coverMediaId,req.account.id,'COVER');
  const payload={...raw,body:raw.bodyFormat==='HTML'?cleanArticleHtml(raw.body):raw.body};
  try{return await this.db.$transaction(async tx=>{
   if(!draft){return tx.articleWorkingCopy.create({data:{id,authorId,payload:payload as Prisma.InputJsonValue}});}
   const changed=await tx.articleWorkingCopy.updateMany({where:{id,version,scheduledAt:null},data:{payload:payload as Prisma.InputJsonValue,version:{increment:1},scheduleError:null}});
   if(!changed.count)throw new ConflictException('This draft changed elsewhere. Reopen it before saving.');
   return tx.articleWorkingCopy.findUniqueOrThrow({where:{id}});
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new ConflictException('This draft changed elsewhere. Reopen it before saving.');throw e;}
 }
 validate(payload:Payload){if(payload.title.trim().length<3||!sanitizeHtml(payload.body,{allowedTags:[],allowedAttributes:{}}).trim())throw new BadRequestException('Add a title (at least 3 characters) and article text before publishing');}
 async canPublish(tx:Tx,actorId:string,authorId:string){
  const actor=await tx.user.findUnique({where:{id:actorId},include:{roles:{include:{role:true}}}});
  const author=await tx.user.findUnique({where:{id:authorId}});
  const permissions=actor?.roles.flatMap(r=>r.role.permissions)??[];
  if(!actor||actor.status!=='ACTIVE'||author?.status!=='ACTIVE'||!permissions.includes('articles.write')||!permissions.includes('articles.publish')||(actorId!==authorId&&!permissions.includes('articles.manage'))||((process.env.NODE_ENV==='production'||process.env.REQUIRE_VERIFIED_EMAIL==='true')&&!actor.emailVerifiedAt))throw new ForbiddenException('Publishing permissions or account verification changed. Review and schedule again.');
 }
 async action(id:string,dto:PublicationDto,req:AuthRequest){await this.access(id,req);return this.perform(id,dto,req.account.id);}
 async perform(id:string,dto:PublicationDto,actorId:string,due=false){return this.db.$transaction(async tx=>{
 if((await tx.featureSwitch.findUnique({where:{key:'articlePublishing'}}))?.enabled===false)throw new ConflictException('Article publishing is paused');
  // Conditional update acquires the row lock; racing saves/workers cannot publish stale content.
  const claim=await tx.articleWorkingCopy.updateMany({where:{id,version:dto.version,...(due?{scheduledAt:{lte:new Date()}}:{})},data:{version:{increment:1}}});
  if(!claim.count)throw new ConflictException('Draft changed. Reopen it and try again.');
  const draft=await tx.articleWorkingCopy.findUniqueOrThrow({where:{id}});
  const payload=draft.payload as unknown as Payload;
  if(dto.action!=='cancel')await this.canPublish(tx,actorId,draft.authorId);
  if(dto.action==='publish'||dto.action==='schedule')this.validate(payload);
  if(dto.action==='unpublish')await tx.article.updateMany({where:{id,authorId:draft.authorId},data:{status:'DRAFT'}});
  let scheduledAt:Date|null=null;
  if(dto.action==='schedule'){
   if(!dto.scheduledAt||!/(Z|[+-]\d{2}:\d{2})$/.test(dto.scheduledAt))throw new BadRequestException('A date with timezone is required');
   scheduledAt=new Date(dto.scheduledAt);const delay=scheduledAt.getTime()-Date.now();
   if(!Number.isFinite(delay)||delay<60000||delay>366*86400000)throw new BadRequestException('Choose a time at least one minute ahead and within one year');
  }
  if(dto.action==='publish'){
   const existing=await tx.article.findUnique({where:{id}});
   if(existing&&existing.authorId!==draft.authorId)throw new ForbiddenException('Article ownership changed. Reopen the article.');
   let discussionPostId=existing?.discussionPostId;
   const body=`${payload.title.trim()}\n\n${payload.excerpt}`.trim();
   if(!discussionPostId){const post=await tx.post.create({data:{authorId:draft.authorId,replyPolicyOwnerId:draft.authorId,body}});discussionPostId=post.id;}
   else await tx.post.update({where:{id:discussionPostId},data:{body}});
   const data={...payload,title:payload.title.trim(),coverMediaId:payload.coverMediaId??null,coverAlt:payload.coverAlt??'',sourceUrl:payload.sourceUrl??null,status:'PUBLISHED',discussionPostId,publishedAt:existing?.publishedAt??new Date()};
   await tx.article.upsert({where:{id},create:{...data,id,authorId:draft.authorId,slug:articleSlug(data.title,id)},update:data});
  }
  const result=await tx.articleWorkingCopy.update({where:{id},data:{scheduledAt,scheduledById:scheduledAt?actorId:null,scheduleError:null,...(dto.action==='publish'||draft.publishedVersion===dto.version?{publishedVersion:draft.version}:{})}});
  await tx.auditLog.create({data:{actorId,action:`article.${dto.action}`,targetId:id,reason:scheduledAt?`Scheduled for ${scheduledAt.toISOString()}`:dto.action==='publish'?'Published saved revision':dto.action==='unpublish'?'Withdrew public article':'Canceled publication schedule'}});
  return {...result,publicSlug:dto.action==='publish'?(await tx.article.findUniqueOrThrow({where:{id},select:{slug:true}})).slug:null};
 });}
 async tick(){if(this.running)return;this.running=true;try{
  if((await this.db.featureSwitch.findUnique({where:{key:'articlePublishing'}}))?.enabled===false)return;
  const due=await this.db.articleWorkingCopy.findMany({where:{scheduledAt:{lte:new Date()}},orderBy:{scheduledAt:'asc'},take:20});
  for(const draft of due){try{
   if(!draft.scheduledById)throw new ForbiddenException('Scheduling account is unavailable');
   await this.perform(draft.id,{version:draft.version,action:'publish'},draft.scheduledById,true);
  }catch(e){if(e instanceof ConflictException)continue;
   const message=e instanceof ForbiddenException||e instanceof BadRequestException?e.message:'Publication failed. Review the article and schedule again.';
   await this.db.articleWorkingCopy.updateMany({where:{id:draft.id,version:draft.version},data:{scheduledAt:null,scheduledById:null,scheduleError:message,version:{increment:1}}});
   this.logger.warn(`Scheduled publication requires review: ${draft.id}`);
  }}
 }catch{this.logger.error('Publication worker could not check due articles; it will retry.');}finally{this.running=false;}}
}
@Controller('publishing') @UseGuards(SessionGuard,PermissionGuard) @RequirePermission('articles.write')
export class PublishingController {
 constructor(private readonly service:PublishingService,private readonly db:Database){}
 @Get() async list(@Req()req:AuthRequest){return this.db.articleWorkingCopy.findMany({where:req.permissions.includes('articles.manage')?{}:{authorId:req.account.id},orderBy:{updatedAt:'desc'},take:100});}
 @Get(':id') get(@Param('id',ParseUUIDPipe)id:string,@Req()req:AuthRequest){return this.service.get(id,req);}
 @Put(':id') @UseGuards(VerifiedGuard) save(@Param('id',ParseUUIDPipe)id:string,@Body()dto:WorkingCopyDto,@Req()req:AuthRequest){return this.service.save(id,dto,req);}
 @Put(':id/publication') @UseGuards(VerifiedGuard) action(@Param('id',ParseUUIDPipe)id:string,@Body()dto:PublicationDto,@Req()req:AuthRequest){return this.service.action(id,dto,req);}
}
