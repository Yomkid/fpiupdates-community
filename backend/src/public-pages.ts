import { Database } from './database';
import { postVisibility, visibleAuthor } from './post-visibility';
import sharp from 'sharp';
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const publicBase = () => {
  const u = new URL(process.env.APP_URL ?? 'http://localhost:5173');
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw Error('Invalid APP_URL');
  return u.origin;
};
export type PublicPage = {
  title: string;
  description: string;
  path: string;
  public: boolean;
  missing?: boolean;
  author?: string;
  image?: string;
  kind?: string;
};
const pages: Record<string, [string, string]> = {
  '/': [
    'FpiUpdates — Your community, connected.',
    'Conversations, useful updates and lasting connections. Rooted in Ilaro, open to every chapter.',
  ],
  '/about': ['About FpiUpdates', 'Our story and the community we are rebuilding.'],
  '/install': ['Install FpiUpdates', 'Installation guides for iPhone, Android and computers.'],
  '/help': [
    'FpiUpdates Help',
    'Help with your account, notifications, installation and reporting.',
  ],
  '/privacy': [
    'Privacy on FpiUpdates',
    'Public content, account information, measurement and notification choices.',
  ],
  '/terms': ['FpiUpdates Terms', 'Conditions for participating in the FpiUpdates beta.'],
  '/guidelines': [
    'Community guidelines',
    'Share responsibly, respect others and keep the community safe.',
  ],
  '/advertise': [
    'Advertise on FpiUpdates',
    'Learn about sponsored posts and the advertising beta.',
  ],
  '/articles': ['Articles / FpiUpdates', 'Stories and useful updates from the community.'],
  '/stats': ['Platform statistics / FpiUpdates', 'Public measurements of activity.'],
};
export async function publicPage(db: Database, path: string): Promise<PublicPage> {
  if (pages[path])
    return { title: pages[path][0], description: pages[path][1], path, public: true };
  let m;
  if ((m = /^\/u\/([a-zA-Z0-9_]{3,30})$/.exec(path))) {
    const u = await db.user.findFirst({
      where: { username: { equals: m[1], mode: 'insensitive' }, ...visibleAuthor() },
      select: { username: true, displayName: true, bio: true },
    });
    if (u)
      return {
        title: `${u.displayName} (@${u.username}) / FpiUpdates`,
        description: u.bio || `Follow @${u.username} on FpiUpdates.`,
        path: '/u/' + u.username,
        public: true,
        author: u.displayName,
        kind: 'profile',
      };
    return unavailable(path, 'Profile');
  }
  if ((m = /^\/posts\/([a-f0-9-]{36})$/i.exec(path))) {
    const p = await db.post.findFirst({
      where: { id: m[1], ...postVisibility() },
      select: {
        body: true,
        imageMediaId: true,
        author: { select: { displayName: true, username: true } },
      },
    });
    if (p)
      return {
        title: `${p.author.displayName} on FpiUpdates`,
        description: p.body.slice(0, 280),
        author: `${p.author.displayName} (@${p.author.username})`,
        image: p.imageMediaId ?? undefined,
        path,
        public: true,
        kind: 'article',
      };
    return unavailable(path, 'Post');
  }
  if ((m = /^\/articles\/([a-z0-9-]{1,120})$/.exec(path))) {
    const a = await db.article.findFirst({
      where: { slug: m[1], status: 'PUBLISHED', author: visibleAuthor() },
      select: {
        title: true,
        excerpt: true,
        coverMediaId: true,
        author: { select: { displayName: true } },
      },
    });
    if (a)
      return {
        title: `${a.title} / FpiUpdates`,
        description: a.excerpt,
        author: a.author.displayName,
        image: a.coverMediaId ?? undefined,
        path,
        public: true,
        kind: 'article',
      };
    return unavailable(path, 'Article');
  }
  return { title: 'FpiUpdates', description: 'Your community, connected.', path, public: false };
}
function unavailable(path: string, name: string): PublicPage {
  return {
    title: name + ' unavailable / FpiUpdates',
    description: 'This content is unavailable.',
    path,
    public: false,
    missing: true,
  };
}
export function metadata(p: PublicPage) {
  const e = escapeHtml,
    b = publicBase(),
    image = p.image
      ? `${b}/api/v1/media/${p.image}`
      : `${b}/og.png?path=${encodeURIComponent(p.path)}`;
  return `<title>${e(p.title)}</title><meta name="description" content="${e(p.description)}"><meta name="robots" content="${p.public ? 'index,follow' : 'noindex,nofollow'}"><link rel="canonical" href="${e(b + p.path)}"><meta property="og:site_name" content="FpiUpdates"><meta property="og:type" content="${p.kind ?? 'website'}"><meta property="og:title" content="${e(p.title)}"><meta property="og:description" content="${e(p.description)}"><meta property="og:url" content="${e(b + p.path)}"><meta property="og:image" content="${e(image)}"><meta property="og:image:alt" content="${e(p.title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(p.title)}"><meta name="twitter:description" content="${e(p.description)}"><meta name="twitter:image" content="${e(image)}">`;
}
export function renderPublicHtml(template: string, p: PublicPage) {
  const clean = template
    .replace(/<title>.*?<\/title>/s, '')
    .replace(/<meta name="description"[^>]*>/, '');
  const summary = p.public
    ? `<article><h1>${escapeHtml(p.title)}</h1>${p.author ? `<p>${escapeHtml(p.author)}</p>` : ''}<p>${escapeHtml(p.description)}</p><a href="/articles">Articles</a> · <a href="/about">About FpiUpdates</a></article>`
    : '';
  return clean
    .replace('</head>', metadata(p) + '</head>')
    .replace('<div id="root"></div>', `<div id="root">${summary}</div>`);
}
export async function previewImage(p: PublicPage, logo: Buffer) {
  const words = (p.description || p.title)
    .replace(/[\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).length > 49) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
    if (lines.length === 5) break;
  }
  if (lines.length < 5 && line) lines.push(line);
  const e = escapeHtml;
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="white"/><rect width="1200" height="12" fill="#15803d"/><image x="1040" y="40" width="110" height="110" href="data:image/png;base64,${logo.toString('base64')}"/><g font-family="DejaVu Sans, sans-serif" fill="#111"><text x="56" y="94" font-size="36" font-weight="bold">FpiUpdates</text><text x="56" y="150" font-size="26" fill="#555">${e((p.author ?? 'Your community, connected.').slice(0, 65))}</text>${lines.map((l, i) => `<text x="56" y="${235 + i * 62}" font-size="38">${e(l.slice(0, 60))}</text>`).join('')}<text x="56" y="588" font-size="22" fill="#15803d">${e(new URL(publicBase()).host)}</text></g></svg>`,
    ),
  )
    .png()
    .toBuffer();
}
