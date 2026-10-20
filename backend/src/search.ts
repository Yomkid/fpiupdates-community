import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Database } from './database';
import { AuthRequest, OptionalSessionGuard, publicUser } from './auth';
import { postVisibility, visibleAuthor } from './post-visibility';

class SearchQuery {
 @IsOptional() @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MaxLength(80) q='';
 @IsIn(['people','articles','communities']) type!:string;
 @IsOptional() @IsString() @MaxLength(400) cursor?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(30) limit=15;
}
type Cursor={type:string;q:string;key:string;at?:string;rank?:number;name?:string};
function unpack(raw:string|undefined,type:string,q:string):Cursor|undefined{
 if(!raw)return;try{const c=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as Cursor;
 if(c.type!==type||c.q!==q||typeof c.key!=='string')throw Error();
 if(type==='people'){if(!/^[a-z0-9_]{3,30}$/.test(c.key)||!Number.isInteger(c.rank)||c.rank!<0||c.rank!>2)throw Error();}
 else {if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(c.key))throw Error();if(type==='articles'&&(typeof c.at!=='string'||!Number.isFinite(Date.parse(c.at))))throw Error();if(type==='communities'&&(typeof c.name!=='string'||c.name.length>100))throw Error();}
 return c;}catch{throw new BadRequestException('Invalid search cursor');}
}
const pack=(value:Cursor)=>Buffer.from(JSON.stringify(value)).toString('base64url');
@Controller('search')
export class SearchController {
 constructor(private readonly db:Database){}
 @Get() @UseGuards(OptionalSessionGuard)
 async search(@Query()query:SearchQuery,@Req()req:AuthRequest){
  const q=query.q.trim(),viewer=req.account?.id,cursor=unpack(query.cursor,query.type,q);
  if(!q)return {data:[],nextCursor:null,requiresLogin:false};
  if(!viewer&&cursor)return {data:[],nextCursor:null,requiresLogin:true};
  const limit=viewer?query.limit:Math.min(query.limit,5);
  if(query.type==='people'){
   const handle=q.replace(/^@/,'').toLowerCase();
   const exact:Prisma.UserWhereInput={username:handle};const prefix:Prisma.UserWhereInput={username:{startsWith:handle}};
   const match:Prisma.UserWhereInput={OR:[{username:{contains:handle,mode:'insensitive'}},{displayName:{contains:q,mode:'insensitive'}},{bio:{contains:q,mode:'insensitive'}}]};
   const buckets:Prisma.UserWhereInput[]=[exact,{AND:[prefix,{NOT:exact}]},{AND:[match,{NOT:prefix}]}];
   const groups=await Promise.all(buckets.map(async (bucket,rank)=>rank<(cursor?.rank??0)?[]:(await this.db.user.findMany({where:{AND:[visibleAuthor(viewer,true),bucket,...(cursor?.rank===rank?[{username:{gt:cursor.key}}]:[])]},select:publicUser,orderBy:{username:'asc'},take:limit+1})).map(user=>({user,rank}))));
   const rows=groups.flat(),page=rows.slice(0,limit),last=page.at(-1);
   const follows=viewer?await this.db.follow.findMany({where:{followerId:viewer,followingId:{in:page.map(r=>r.user.id)}},select:{followingId:true}}):[];
   return {data:page.map(({user})=>({...user,isFollowing:follows.some(f=>f.followingId===user.id)})),requiresLogin:!viewer&&rows.length>limit,nextCursor:viewer&&rows.length>limit&&last?pack({type:query.type,q,key:last.user.username,rank:last.rank}):null};
  }
  if(query.type==='articles'){
   const rows=await this.db.article.findMany({where:{AND:[{status:'PUBLISHED',publishedAt:{not:null},author:visibleAuthor(viewer,true),discussionPost:postVisibility(viewer,true)},{OR:[{title:{contains:q,mode:'insensitive'}},{excerpt:{contains:q,mode:'insensitive'}}]},...(cursor?[{OR:[{publishedAt:{lt:new Date(cursor.at!)}},{publishedAt:new Date(cursor.at!),id:{lt:cursor.key}}]}]:[])]},select:{id:true,slug:true,title:true,excerpt:true,publishedAt:true,coverMediaId:true,coverAlt:true,author:{select:publicUser}},orderBy:[{publishedAt:'desc'},{id:'desc'}],take:limit+1});
   const page=rows.slice(0,limit),last=page.at(-1);return {data:page,requiresLogin:!viewer&&rows.length>limit,nextCursor:viewer&&rows.length>limit&&last?pack({type:query.type,q,key:last.id,at:last.publishedAt!.toISOString()}):null};
  }
  const rows=await this.db.community.findMany({where:{AND:[{active:true},{OR:[{name:{contains:q,mode:'insensitive'}},{slug:{contains:q,mode:'insensitive'}},{description:{contains:q,mode:'insensitive'}}]},...(cursor?[{OR:[{name:{gt:cursor.name!}},{name:cursor.name!,id:{gt:cursor.key}}]}]:[])]},select:{id:true,name:true,slug:true,description:true,kind:true,_count:{select:{members:true}}},orderBy:[{name:'asc'},{id:'asc'}],take:limit+1});
  const page=rows.slice(0,limit),last=page.at(-1);return {data:page,requiresLogin:!viewer&&rows.length>limit,nextCursor:viewer&&rows.length>limit&&last?pack({type:query.type,q,key:last.id,name:last.name}):null};
 }
}
