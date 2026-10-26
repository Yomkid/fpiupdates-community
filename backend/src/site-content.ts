import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import sanitize from 'sanitize-html';
import { Database } from './database';
import { SessionGuard, AuthRequest } from './auth';
import { PermissionGuard, RequirePermission } from './permissions';
export function cleanPage(html: string) {
  return sanitize(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'hr',
      'code',
      'pre',
    ],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
  });
}
class PageDraft {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsString() @MinLength(2) @MaxLength(80) category!: string;
  @IsString() @MaxLength(70000) html!: string;
  @IsInt() @Min(0) @Max(999) position!: number;
}
class PublishDto {
  @IsISO8601() effectiveAt!: string;
  @IsBoolean() confirm!: boolean;
}
@Controller('content')
export class ContentController {
  constructor(private readonly db: Database) {}
  @Get() list() {
    return this.db.siteDocument.findMany({
      where: { publishedHtml: { not: null } },
      select: {
        slug: true,
        publishedTitle: true,
        category: true,
        position: true,
        effectiveAt: true,
      },
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    });
  }
  @Get(':slug') async page(@Param('slug') slug: string) {
    const row = await this.db.siteDocument.findUnique({
      where: { slug },
      select: {
        slug: true,
        publishedTitle: true,
        publishedHtml: true,
        effectiveAt: true,
        category: true,
      },
    });
    if (!row?.publishedHtml) throw new NotFoundException();
    return row;
  }
  @Get(':slug/history') history(@Param('slug') slug: string) {
    return this.db.siteDocumentVersion.findMany({
      where: { slug },
      select: { id: true, title: true, html: true, effectiveAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
@Controller('admin/content')
@UseGuards(SessionGuard, PermissionGuard)
export class ContentAdminController {
  constructor(private readonly db: Database) {}
  @Get() @RequirePermission('pages.edit') list() {
    return this.db.siteDocument.findMany({ orderBy: [{ position: 'asc' }, { slug: 'asc' }] });
  }
  @Put(':slug') @RequirePermission('pages.edit') async save(
    @Param('slug') slug: string,
    @Body() dto: PageDraft,
    @Req() req: AuthRequest,
  ) {
    if (
      !/^(about|privacy|terms|guidelines|faq|help(?:-[a-z0-9-]+)?)$/.test(slug) ||
      slug.length > 100
    )
      throw new BadRequestException(
        'Use about, privacy, terms, guidelines, faq or help-article-name',
      );
    const data = {
      title: dto.title,
      category: dto.category,
      draftHtml: cleanPage(dto.html),
      position: dto.position,
    };
    return this.db.$transaction(async (tx) => {
      const row = await tx.siteDocument.upsert({
        where: { slug },
        create: { slug, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'content.draft.save',
          targetId: slug,
          reason: 'Draft saved; published version unchanged',
        },
      });
      return row;
    });
  }
  @Put(':slug/publish') @RequirePermission('pages.publish') async publish(
    @Param('slug') slug: string,
    @Body() dto: PublishDto,
    @Req() req: AuthRequest,
  ) {
    if (!dto.confirm) throw new BadRequestException('Confirm publication of the reviewed draft');
    const effectiveAt = new Date(dto.effectiveAt);
    if (effectiveAt > new Date())
      throw new BadRequestException(
        'Scheduled policy publication is not supported; use an effective date at or before publication',
      );
    return this.db.$transaction(async (tx) => {
      // Lock the draft so concurrent editing cannot produce mismatched versions.
      await tx.$queryRaw`SELECT "slug" FROM "SiteDocument" WHERE "slug" = ${slug} FOR UPDATE`;
      const row = await tx.siteDocument.findUniqueOrThrow({ where: { slug } });
      if (!sanitize(row.draftHtml, { allowedTags: [] }).trim())
        throw new BadRequestException('Add page content before publishing');
      const html = cleanPage(row.draftHtml);
      await tx.siteDocumentVersion.create({
        data: { slug, title: row.title, html, effectiveAt, publishedById: req.account.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.account.id,
          action: 'content.publish',
          targetId: slug,
          reason:
            'Reviewed content published; assess whether users need notification or renewed consent',
        },
      });
      return tx.siteDocument.update({
        where: { slug },
        data: { publishedHtml: html, publishedTitle: row.title, effectiveAt },
      });
    });
  }
}
