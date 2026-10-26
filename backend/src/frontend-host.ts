import { statSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { static as staticFiles, type Request, type Response, type NextFunction } from 'express';
import type { INestApplication } from '@nestjs/common';
import { Database } from './database';
import { publicBase, publicPage, renderPublicHtml, previewImage, escapeHtml } from './public-pages';
export function hostFrontend(app: INestApplication) {
  if (process.env.SERVE_FRONTEND !== 'true') return;
  const directory = resolve(process.env.FRONTEND_DIRECTORY ?? '../frontend/dist');
  if (!statSync(resolve(directory, 'index.html')).isFile())
    throw new Error('Build the frontend before serving it');
  const template = readFileSync(resolve(directory, 'index.html'), 'utf8'),
    logo = readFileSync(resolve(directory, 'pwa/icon-192.png'));
  const db = app.get(Database);
  let rendering = 0;
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method !== 'GET') return next();
      if (req.path === '/robots.txt') {
        res
          .type('text/plain')
          .send(
            `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /settings\nDisallow: /messages\nDisallow: /admin\nDisallow: /editorial\nSitemap: ${publicBase()}/sitemap.xml\n`,
          );
        return;
      }
      if (req.path === '/sitemap.xml') {
        const rows = await db.article.findMany({
          where: { status: 'PUBLISHED', author: { status: 'ACTIVE' } },
          orderBy: { publishedAt: 'desc' },
          take: 1000,
          select: { slug: true },
        });
        const paths = [
          '/',
          '/about',
          '/help',
          '/install',
          '/guidelines',
          '/articles',
          ...rows.map((a) => '/articles/' + a.slug),
        ];
        res
          .type('application/xml')
          .send(
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escapeHtml(publicBase() + p)}</loc></url>`).join('')}</urlset>`,
          );
        return;
      }
      if (req.path === '/og.png') {
        if (rendering >= 2) {
          res.sendStatus(503);
          return;
        }
        const path = typeof req.query.path === 'string' ? req.query.path : '/';
        if (path.length > 200 || !/^\/(?!\/)/.test(path)) {
          res.sendStatus(400);
          return;
        }
        rendering++;
        try {
          const p = await publicPage(db, path);
          if (!p.public) {
            res.sendStatus(404);
            return;
          }
          res.type('png').setHeader('Cache-Control', 'no-store');
          res.send(await previewImage(p, logo));
        } finally {
          rendering--;
        }
        return;
      }
      return next();
    } catch {
      return res.status(503).send('Public preview temporarily unavailable');
    }
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (/^\/api(?:\/|$)/i.test(req.path)) return next();
    return staticFiles(directory, {
      index: false,
      fallthrough: true,
      redirect: false,
      setHeaders: (out, path) =>
        out.setHeader(
          'Cache-Control',
          /[/\\]assets[/\\].+-[a-zA-Z0-9_-]+\.(js|css)$/.test(path)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        ),
    })(req, res, next);
  });
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (
      req.method !== 'GET' ||
      /^\/api(?:\/|$)/i.test(req.path) ||
      req.path.split('/').some((part) => part.startsWith('.')) ||
      extname(req.path) ||
      !req.accepts('html')
    )
      return next();
    try {
      const p = await publicPage(db, req.path);
      res.setHeader('Cache-Control', 'no-store');
      return res
        .status(p.missing ? 404 : 200)
        .type('html')
        .send(renderPublicHtml(template, p));
    } catch {
      return res.status(503).send('FpiUpdates is temporarily unavailable. Please retry.');
    }
  });
}
