import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ReportReason } from '@prisma/client';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;
export class RegisterDto {
 @IsOptional() @IsIn(['MALE','FEMALE','NON_BINARY','OTHER','PREFER_NOT_TO_SAY']) gender?:string|null;
 @IsOptional() @Transform(({value}:{value:unknown})=>typeof value==='string'?value.trim():value) @IsString() @MaxLength(120) occupation?:string|null;
 @IsOptional() @Transform(({value}:{value:unknown})=>Array.isArray(value)?value.map(x=>typeof x==='string'?x.trim():x):value) @IsArray() @ArrayUnique() @ArrayMaxSize(8) @IsString({each:true}) @MinLength(1,{each:true}) @MaxLength(40,{each:true}) skills?:string[];

 @IsOptional() @Matches(/^\+[1-9]\d{6,14}$/) phoneNumber?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateOfBirth?:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(100) location?:string;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsUUID('all',{each:true}) topicIds?: string[];
  @Transform(lower) @IsEmail() @MaxLength(254) email!: string;
  @Transform(lower) @Matches(/^[a-z0-9_]{3,30}$/) username!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class LoginDto {
  @IsOptional() @Transform(lower) @IsEmail() @MaxLength(254) email?:string;
  @IsOptional() @Transform(lower) @IsString() @MinLength(3) @MaxLength(254) identifier?:string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
export class CreatePostDto {
 @IsOptional() @IsUUID() sportsCompetitionId?:string;
 @IsOptional() @IsUUID() sportsMatchId?:string;
 @IsOptional() @IsIn(['EVERYONE','FOLLOWING']) replyPolicy?:string;
 @IsOptional() @IsUUID() quotedPostId?:string;
  @IsOptional() @IsUUID() imageMediaId?:string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) imageAlt?:string;
  @IsOptional() @IsUUID() communityId?:string;
  @IsOptional() @IsUUID() topicId?:string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(280) body!: string;
  @IsOptional() @IsUUID() parentId?: string;
}
export class FeedQuery {
 @IsOptional() @IsIn(['latest','oldest']) replyOrder?:'latest'|'oldest';
 @IsOptional() @IsIn(['true']) mediaOnly?:string;
 @IsOptional() @IsIn(['true']) branches?:string;
 @IsOptional() @IsUUID() sportsCompetitionId?:string;
 @IsOptional() @IsUUID() sportsMatchId?:string;
  @IsOptional() @IsIn(['posts','replies','media']) profileTab?:string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) hashtag?:string;
  @IsOptional() @IsIn(['latest','following','for-you','reposts']) mode?:string;
  @IsOptional() @IsUUID() communityId?:string;
  @IsOptional() @IsUUID() topicId?:string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class ReportDto {
  @IsEnum(ReportReason) reason!: ReportReason;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) details?: string;
}

export class CreateThreadDto extends CreatePostDto {
 @IsUUID() requestId!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(9) @Transform(({value}:{value:unknown})=>Array.isArray(value)?value.map(x=>typeof x==='string'?x.trim():x):value) @IsString({each:true}) @MinLength(1,{each:true}) @MaxLength(280,{each:true}) continuations!:string[];
}
