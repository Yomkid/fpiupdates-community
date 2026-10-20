import {BadRequestException,Body,Controller,Get,NotFoundException,Param,ParseUUIDPipe,Post,Put,Req,UseGuards} from '@nestjs/common';
import {IsIn,IsInt,IsISO8601,IsOptional,IsString,IsUrl,IsUUID,Max,MaxLength,Min,MinLength} from 'class-validator';
import {Database} from './database';
import {AuthRequest,SessionGuard} from './auth';
import {PermissionGuard,RequirePermission,VerifiedGuard} from './permissions';
import {postVisibility} from './post-visibility';
class CampaignDto {
 @IsString() @MinLength(2) @MaxLength(100) name!:string;
 @IsString() @MinLength(1) @MaxLength(280) body!:string;
 @IsOptional() @IsUrl({protocols:['https'],require_protocol:true}) @MaxLength(1000) link?:string;
 @IsOptional() @IsUUID() sourcePostId?:string;
 @IsOptional() @IsUUID() communityId?:string;
 @IsIn(['FEED','COMMUNITY']) placement!:'FEED'|'COMMUNITY';
 @IsInt() @Min(10000) @Max(100000000) budgetKobo!:number;
 @IsISO8601({strict:true}) startAt!:string;
 @IsISO8601({strict:true}) endAt!:string;
}
class ReviewDto { @IsIn(['APPROVED','REJECTED']) status!:'APPROVED'|'REJECTED';@IsString() @MinLength(3) @MaxLength(500) note!:string; }
export function validateCampaignDates(start:Date,end:Date,now=Date.now()){if(start.getTime()<now-60000||end<=start||end.getTime()-start.getTime()>30*86400000||start.getTime()>now+90*86400000)throw new BadRequestException('Choose a future start and a duration of up to 30 days, within the next 90 days');}
@Controller('ads') @UseGuards(SessionGuard,VerifiedGuard)
export class AdsController {
 constructor(private readonly db:Database){}
 @Get() async mine(@Req()req:AuthRequest){return {data:await this.db.adCampaign.findMany({where:{ownerId:req.account.id},orderBy:{createdAt:'desc'},take:100}),paymentsEnabled:false,deliveryEnabled:false};}
 private async data(d:CampaignDto,owner:string){const startAt=new Date(d.startAt),endAt=new Date(d.endAt);validateCampaignDates(startAt,endAt);if(!d.name.trim()||!d.body.trim())throw new BadRequestException('Add a name and message');if(d.link){const u=new URL(d.link);if(u.username||u.password)throw new BadRequestException('Use a link without embedded credentials');}if(d.sourcePostId&&!await this.db.post.findFirst({where:{id:d.sourcePostId,authorId:owner,parentId:null,...postVisibility(owner)},select:{id:true}}))throw new BadRequestException('Select your own eligible public post');if(d.placement==='COMMUNITY'&&(!d.communityId||!await this.db.community.findFirst({where:{id:d.communityId,active:true},select:{id:true}})))throw new BadRequestException('Choose an active community');return {...d,name:d.name.trim(),body:d.body.trim(),link:d.link??null,sourcePostId:d.sourcePostId??null,communityId:d.placement==='COMMUNITY'?d.communityId!:null,startAt,endAt};}
 @Post() async create(@Body()d:CampaignDto,@Req()req:AuthRequest){return this.db.adCampaign.create({data:{...await this.data(d,req.account.id),ownerId:req.account.id}});}
 @Put(':id') async edit(@Param('id',ParseUUIDPipe)id:string,@Body()d:CampaignDto,@Req()req:AuthRequest){const data=await this.data(d,req.account.id);const result=await this.db.adCampaign.updateMany({where:{id,ownerId:req.account.id,status:{in:['DRAFT','REJECTED']}},data:{...data,status:'DRAFT',reviewNote:null}});if(!result.count)throw new NotFoundException('Editable campaign not found');return {ok:true};}
 @Post(':id/submit') async submit(@Param('id',ParseUUIDPipe)id:string,@Req()req:AuthRequest){const c=await this.db.adCampaign.findFirst({where:{id,ownerId:req.account.id,status:'DRAFT'}});if(!c)throw new NotFoundException('Draft not found');validateCampaignDates(c.startAt,c.endAt);if(c.sourcePostId&&!await this.db.post.findFirst({where:{id:c.sourcePostId,authorId:req.account.id,...postVisibility(req.account.id)},select:{id:true}}))throw new BadRequestException('Selected post unavailable');if(c.communityId&&!await this.db.community.findFirst({where:{id:c.communityId,active:true},select:{id:true}}))throw new BadRequestException('Community unavailable');const updated=await this.db.adCampaign.updateMany({where:{id,ownerId:req.account.id,status:'DRAFT'},data:{status:'SUBMITTED'}});return {submitted:updated.count===1,paymentRequired:false,deliveryEnabled:false};}
 @Post(':id/cancel') async cancel(@Param('id',ParseUUIDPipe)id:string,@Req()req:AuthRequest){const result=await this.db.adCampaign.updateMany({where:{id,ownerId:req.account.id,status:{not:'CANCELLED'}},data:{status:'CANCELLED'}});return {cancelled:result.count===1};}
}
@Controller('admin/ads') @UseGuards(SessionGuard,PermissionGuard) @RequirePermission('discovery.manage')
export class AdsReviewController {
 constructor(private readonly db:Database){}
 @Get() list(){return this.db.adCampaign.findMany({orderBy:{createdAt:'desc'},take:100,include:{owner:{select:{username:true,displayName:true}}}});}
 @Put(':id/review') async review(@Param('id',ParseUUIDPipe)id:string,@Body()d:ReviewDto,@Req()req:AuthRequest){if(!d.note.trim())throw new BadRequestException('Add a review note');return this.db.$transaction(async tx=>{const result=await tx.adCampaign.updateMany({where:{id,status:'SUBMITTED',ownerId:{not:req.account.id}},data:{status:d.status,reviewNote:d.note.trim()}});if(!result.count)throw new BadRequestException('Submitted campaign not found, or you cannot review your own campaign');await tx.auditLog.create({data:{actorId:req.account.id,action:'ads.review',targetId:id,reason:d.status+': '+d.note.trim()}});return {ok:true,deliveryEnabled:false};});}
}
