import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export const PERMISSIONS = [
  'usernames.manage',
  'verification.manage',
  'pages.edit',
  'pages.publish',
  'features.manage',
  'sports.manage',
  'sports.report',
  'discovery.manage',
  'analytics.view',
  'analytics.manage',
  'moderation.manage',
  'users.manage',
  'roles.manage',
  'menus.manage',
  'articles.write',
  'articles.publish',
  'articles.manage',
  'communities.manage',
  'topics.manage',
] as const;
export const clean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class ProfileDto {
  @IsOptional() @IsIn(['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY']) gender?:
    string | null;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  occupation?: string | null;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((x) => (typeof x === 'string' ? x.trim() : x)) : value,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(40, { each: true })
  skills?: string[];

  @IsOptional() @IsUUID() profileCoverMediaId?: string | null;
  @IsOptional()
  @IsIn(['STUDENT', 'ASPIRANT', 'ALUMNUS', 'STAFF', 'RESIDENT', 'OTHER'])
  campusIdentity?: string | null;
  @IsOptional() @Transform(clean) @Matches(/^[a-z0-9_]{3,30}$/) username?: string;
  @IsOptional() @Matches(/^\+[1-9]\d{6,14}$/) phoneNumber?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateOfBirth?: string | null;
  @IsOptional() @Transform(clean) @IsString() @MaxLength(100) location?: string | null;
  @IsOptional() @IsUUID() avatarMediaId?: string | null;
  @Transform(clean) @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
  @Transform(clean) @IsString() @MaxLength(300) bio!: string;
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  website?: string;
  @IsOptional() @Transform(clean) @IsString() @MaxLength(100) department?: string;
}
export class InterestsDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsUUID('all', { each: true }) topicIds!: string[];
}
export class RoleDto {
  @Transform(clean) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(40)
  @IsIn(PERMISSIONS, { each: true })
  permissions!: string[];
}
export class RolesDto {
  @IsArray() @ArrayUnique() @ArrayMaxSize(10) @IsUUID('all', { each: true }) roleIds!: string[];
}
export class MenuDto {
  @Transform(clean) @IsString() @MinLength(1) @MaxLength(80) label!: string;
  @IsIn([
    '/home',
    '/sports',
    '/sports/desk',
    '/',
    '/notifications',
    '/messages',
    '/admin/message-reports',
    '/search',
    '/articles',
    '/communities',
    '/bookmarks',
    '/settings',
    '/me',
    '/admin',
    '/editorial',
  ])
  path!: string;
  @IsOptional() @IsIn(PERMISSIONS) permission?: string;
  @IsBoolean() membersOnly!: boolean;
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) @Max(100) position!: number;
}
export class CommunityDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(80) slug!: string;
  @Transform(clean) @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @Transform(clean) @IsString() @MaxLength(1000) description!: string;
  @IsIn(['DEPARTMENT', 'INTEREST', 'ASPIRANTS', 'ALUMNI']) kind!: string;
  @IsBoolean() active!: boolean;
}
export class TopicDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(60) slug!: string;
  @Transform(clean) @IsString() @MinLength(2) @MaxLength(80) name!: string;
}
export class ArticleDto {
  @IsOptional() @IsUUID() coverMediaId?: string | null;
  @IsOptional() @Transform(clean) @IsString() @MaxLength(500) coverAlt?: string;
  @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(120) slug?: string;
  @IsOptional() @IsIn(['PLAIN', 'HTML']) bodyFormat?: string;
  @Transform(clean) @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @Transform(clean) @IsString() @MaxLength(400) excerpt!: string;
  @Transform(clean) @IsString() @MinLength(1) @MaxLength(50000) body!: string;
  @IsIn(['DRAFT', 'PUBLISHED']) status!: string;
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(1000)
  sourceUrl?: string;
}
export class ModerationDto {
  @IsIn(['HIDDEN', 'PUBLISHED']) status!: 'HIDDEN' | 'PUBLISHED';
  @Transform(clean) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class StatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status!: 'ACTIVE' | 'SUSPENDED';
  @Transform(clean) @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
export class EmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class TokenDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class ResetDto extends TokenDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class ReportFilterDto {
  @IsOptional() @IsIn(['OPEN', 'RESOLVED', 'ALL']) status?: string;
  @IsOptional() @IsIn(['SCAM', 'IMPERSONATION', 'THREAT', 'HARASSMENT', 'OTHER']) reason?:
    'SCAM' | 'IMPERSONATION' | 'THREAT' | 'HARASSMENT' | 'OTHER';
  @IsOptional() @IsUUID() before?: string;
}
export class ReviewDto {
  @IsOptional() @Transform(clean) @IsString() @MinLength(5) @MaxLength(500) note?: string;
}
