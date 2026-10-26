import { sessionTracker } from './notification-throttle';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import sharp, { type OutputInfo } from 'sharp';
import { storeImage, loadImage, removeStoredImage } from './media-storage';
export { mediaDirectory } from './media-storage';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { Database } from './database';
import { AuthRequest, OptionalSessionGuard, SessionGuard } from './auth';
import { VerifiedGuard } from './permissions';
import { postVisibility, visibleAuthor } from './post-visibility';
sharp.concurrency(1);
sharp.cache(false);
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
@Injectable()
export class MediaService {
  private processing = 0;
  constructor(private readonly db: Database) {}
  async assertOwned(id: string | null | undefined, ownerId: string, kind: string) {
    if (!id) return;
    if (!(await this.db.media.findFirst({ where: { id, ownerId, kind } })))
      throw new BadRequestException('Select an image uploaded by you for this purpose');
  }
  async upload(ownerId: string, kind: string, file?: Express.Multer.File) {
    if (!['AVATAR', 'POST', 'COVER', 'PROFILE', 'SPORT'].includes(kind))
      throw new BadRequestException('Unknown image purpose');
    if (!file?.buffer?.length) throw new BadRequestException('Select an image');
    if (file.size > MAX_UPLOAD_BYTES)
      throw new BadRequestException('Images must be 5 MB or smaller');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Use a JPEG, PNG or WebP image');
    const bytes = file.buffer;
    const signature =
      bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
    if (!signature) throw new BadRequestException('This file is not a supported image');
    if (this.processing >= 2)
      throw new ServiceUnavailableException('Image processing is busy. Try again shortly');
    const existing = await this.db.media.aggregate({ where: { ownerId }, _sum: { bytes: true } });
    if ((existing._sum.bytes ?? 0) >= 100 * 1024 * 1024)
      throw new BadRequestException('Your image storage allowance is full');
    if (this.processing >= 2)
      throw new ServiceUnavailableException('Image processing is busy. Try again shortly');
    this.processing++;
    let encoded: { data: Buffer; info: OutputInfo };
    try {
      const image = sharp(file.buffer, { limitInputPixels: 16_000_000, failOn: 'warning' });
      const metadata = await image.metadata();
      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp'].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      encoded = await image
        .rotate()
        .resize({
          width: kind === 'AVATAR' ? 512 : 1920,
          height: kind === 'AVATAR' ? 512 : 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      if (encoded.data.length > MAX_UPLOAD_BYTES) throw new Error('Image too large');
    } catch {
      throw new BadRequestException(
        'Unable to read this image. Use a valid, non-animated JPEG, PNG or WebP, up to 16 megapixels',
      );
    } finally {
      this.processing--;
    }
    const id = randomUUID();
    let location;
    try {
      location = await storeImage(id, encoded.data);
    } catch {
      throw new ServiceUnavailableException('Image storage is unavailable. Try again shortly');
    }
    try {
      return await this.db.$transaction(
        async (tx) => {
          const global = await tx.media.aggregate({ _sum: { bytes: true } });
          if ((global._sum.bytes ?? 0) + encoded.data.length > 512 * 1024 * 1024)
            throw new BadRequestException(
              'Image storage is currently full. Contact the site administrator',
            );
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const total = await tx.media.aggregate({ where: { ownerId }, _sum: { bytes: true } });
          if (
            (total._sum.bytes ?? 0) + encoded.data.length > 100 * 1024 * 1024 ||
            (await tx.media.count({ where: { ownerId, createdAt: { gte: since } } })) >= 50
          )
            throw new BadRequestException(
              'Image allowance reached: 100 MB storage and 50 uploads per 24 hours',
            );
          return tx.media.create({
            data: {
              id,
              ownerId,
              kind,
              ...location,
              bytes: encoded.data.length,
              width: encoded.info.width,
              height: encoded.info.height,
            },
            select: { id: true, width: true, height: true, bytes: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      await removeStoredImage(id, location).catch(() => {
        console.error('Uncommitted media cleanup failed:', id);
      });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new BadRequestException('Another upload is finishing. Try again');
      throw error;
    }
  }
  async image(id: string, viewer?: string, permissions: string[] = []) {
    const media = await this.db.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Image not found');
    if (media.ownerId !== viewer) {
      const avatar = await this.db.user.findFirst({
        where: {
          AND: [
            { OR: [{ avatarMediaId: id }, { profileCoverMediaId: id }] },
            visibleAuthor(viewer),
          ],
        },
        select: { id: true },
      });
      const post = avatar
        ? null
        : await this.db.post.findFirst({
            where: { AND: [postVisibility(viewer), { imageMediaId: id }] },
            select: { id: true },
          });
      const cover =
        avatar || post
          ? null
          : await this.db.article.findFirst({
              where: permissions.includes('articles.manage')
                ? { coverMediaId: id }
                : {
                    coverMediaId: id,
                    status: 'PUBLISHED',
                    author: visibleAuthor(viewer),
                    discussionPost: postVisibility(viewer),
                  },
              select: { id: true },
            });
      const privateCover =
        !avatar && !post && !cover && viewer
          ? await this.db.articleWorkingCopy.findFirst({
              where: {
                ...(permissions.includes('articles.manage') ? {} : { authorId: viewer }),
                payload: { path: ['coverMediaId'], equals: id },
              },
              select: { id: true },
            })
          : null;
      const sports =
        !avatar && !post && !cover && !privateCover
          ? await this.db.sportsTeam.findFirst({
              where: {
                ...(permissions.includes('sports.manage')
                  ? {}
                  : { competition: { published: true } }),
                OR: [{ logoMediaId: id }, { players: { some: { photoMediaId: id } } }],
              },
              select: { id: true },
            })
          : null;
      if (!avatar && !post && !cover && !privateCover && !sports)
        throw new NotFoundException('Image not found');
    }
    try {
      return await loadImage(id, media);
    } catch {
      throw new NotFoundException('Image file is unavailable');
    }
  }
}
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post(':kind')
  @UseGuards(SessionGuard, VerifiedGuard)
  @Throttle({ default: { limit: 10, ttl: 60000, getTracker: sessionTracker } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    if (kind.toUpperCase() === 'SPORT' && !req.permissions.includes('sports.manage'))
      throw new ForbiddenException('Sports management permission required');
    if (kind.toUpperCase() === 'COVER' && !req.permissions.includes('articles.write'))
      throw new ForbiddenException('Editorial permission required');
    return this.media.upload(req.account.id, kind.toUpperCase(), file);
  }
  @Get(':id')
  @UseGuards(OptionalSessionGuard)
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const data = await this.media.image(id, req.account?.id, req.permissions);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${id}.webp"`);
    res.send(data);
  }
}
