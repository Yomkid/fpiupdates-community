import {sessionTracker} from './notification-throttle';
import {BadRequestException,Body,Post,Put,Controller,Get,Param,Query,Req,UseGuards,NotFoundException} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {Transform,Type} from 'class-transformer';
import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsBoolean,IsEmail,IsInt,IsOptional,IsString,IsUUID,Matches,Max,Min} from 'class-validator';
import {Prisma} from '@prisma/client';
import {AuthRequest,publicUser,SessionGuard} from './auth';
import {Database} from './database';
import {visibleAuthor} from './post-visibility';
class PeopleQuery{@IsOptional() @Matches(/^[a-z0-9_]{3,30}$/) context?:string;@IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(30) limit=20;}
class MutualQuery{@IsOptional() @IsUUID() before?:string;@IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(30) limit=3;}
class DiscoveryPreferences { @IsBoolean() discoverByEmail!:boolean; @IsBoolean() discoverByPhone!:boolean; }
class ContactsDto { @Transform(({value})=>Array.isArray(value)?value.map(v=>typeof v==='string'?v.trim().toLowerCase():v):value) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsEmail({}, {each:true}) emails!:string[]; }
@Controller('people') @UseGuards(SessionGuard)
export class PeopleController{
 constructor(private readonly db:Database){}
 @Get('discoverability') async preferences(@Req()req:AuthRequest){const u=await this.db.user.findUniqueOrThrow({where:{id:req.account.id},select:{discoverByEmail:true,discoverByPhone:true,emailVerifiedAt:true,phoneVerifiedAt:true}});return {discoverByEmail:u.discoverByEmail,discoverByPhone:u.discoverByPhone,emailReady:!!u.emailVerifiedAt,phoneReady:!!u.phoneVerifiedAt};}
 @Put('discoverability') async savePreferences(@Req()req:AuthRequest,@Body()dto:DiscoveryPreferences){if(dto.discoverByEmail&&!req.account.emailVerifiedAt)throw new BadRequestException('Verify your email before allowing discovery by email');if(dto.discoverByPhone&&!req.account.phoneVerifiedAt)throw new BadRequestException('Phone discovery requires verified phone ownership; phone verification is not available yet');await this.db.user.update({where:{id:req.account.id},data:dto});return this.preferences(req);}
 @Post('contacts') @Throttle({default:{limit:5,ttl:60000,getTracker:sessionTracker}}) async contacts(@Req()req:AuthRequest,@Body()dto:ContactsDto){if(!req.account.emailVerifiedAt)throw new BadRequestException('Verify your email before finding contacts');const data=await this.db.user.findMany({where:{AND:[visibleAuthor(req.account.id,true),{id:{not:req.account.id},email:{in:dto.emails},emailVerifiedAt:{not:null},discoverByEmail:true}]},select:publicUser,take:20});const follows=await this.db.follow.findMany({where:{followerId:req.account.id,followingId:{in:data.map(u=>u.id)}},select:{followingId:true}});return {data:data.map(u=>({...u,isFollowing:follows.some(f=>f.followingId===u.id)}))};}
 @Get('suggestions') async suggestions(@Req()req:AuthRequest,@Query()q:PeopleQuery){
  const viewer=req.account.id;let contextId:string|undefined;
  if(q.context){const context=await this.db.user.findFirst({where:{AND:[visibleAuthor(viewer),{username:q.context}]},select:{id:true}});if(!context)return {data:[]};contextId=context.id;}
  const where:Prisma.UserWhereInput={AND:[visibleAuthor(viewer,true),{id:{notIn:[viewer,...(contextId?[contextId]:[])]},followers:{none:{followerId:viewer}}}]};
  const network=await this.db.follow.groupBy({by:['followingId'],where:{following:where,follower:{AND:[visibleAuthor(viewer,true),{followers:{some:{followerId:viewer}}}]}},_count:{_all:true},orderBy:[{_count:{followingId:'desc'}},{followingId:'desc'}],take:q.limit});
  const ids=network.map(f=>f.followingId);const [ranked,fallback]=await Promise.all([this.db.user.findMany({where:{AND:[where,{id:{in:ids}}]},select:publicUser}),this.db.user.findMany({where:{AND:[where,{id:{notIn:ids}}]},orderBy:[{followers:{_count:'desc'}},{createdAt:'desc'},{id:'desc'}],take:q.limit,select:publicUser})]);
  return {data:[...ids.flatMap(id=>{const u=ranked.find(p=>p.id===id);return u?[{...u,isFollowing:false,reason:'Followed by people you follow'}]:[];}),...fallback.map(u=>({...u,isFollowing:false,reason:'Discover a community member'}))].slice(0,q.limit)};
 }
 @Get('mutual/:username') async mutual(@Param('username')username:string,@Req()req:AuthRequest,@Query()q:MutualQuery){
  if(!/^[a-z0-9_]{3,30}$/.test(username))throw new NotFoundException();const viewer=req.account.id;
  const profile=await this.db.user.findFirst({where:{AND:[visibleAuthor(viewer),{username}]},select:{id:true}});if(!profile)throw new NotFoundException();
  const where:Prisma.FollowWhereInput={followingId:profile.id,followerId:{not:viewer},follower:{AND:[visibleAuthor(viewer,true),{followers:{some:{followerId:viewer}}}]}};
  const [total,rows]=await Promise.all([this.db.follow.count({where}),this.db.follow.findMany({where:{AND:[where,...(q.before?[{followerId:{lt:q.before}}]:[])]},orderBy:{followerId:'desc'},take:q.limit+1,select:{follower:{select:publicUser}}})]);
  return {total,data:rows.slice(0,q.limit).map(r=>({...r.follower,isFollowing:true})),nextCursor:rows.length>q.limit?rows[q.limit-1].follower.id:null};
 }
}
