import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
const dns: typeof import('node:dns/promises') = require('node:dns/promises');
const http: typeof import('node:http') = require('node:http');
import { birthDate } from '../src/auth';
import {
  firstLink,
  parsePreview,
  publicAddress,
  publicUrl,
  readPublicUrl,
  resolvePublic,
} from '../src/link-previews';
test('preview URLs and address validation reject local, reserved and encoded IP destinations', () => {
  for (const url of [
    'http://127.0.0.1',
    'http://2130706433',
    'http://[::1]',
    'http://user:pass@example.com',
    'http://example.com:8080',
    'file:///etc/passwd',
    'http://metadata.google.internal',
  ])
    assert.throws(() => publicUrl(url));
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.2',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('93.184.216.34'), true);
  assert.equal(
    firstLink('First https://example.com/a, then https://second.example.com'),
    'https://example.com/a',
  );
  assert.equal(firstLink('www.example.com.'), 'https://www.example.com/');
  assert.equal(firstLink('http://localhost/a'), null);
});
test('metadata parser prioritizes Open Graph, resolves relative images and never runs markup', () => {
  const result = parsePreview(
    '<title>Fallback</title><meta property="og:title" content="Campus &amp; news"><meta property="og:description" content="A helpful guide"><meta property="og:image" content="/cover.jpg"><script>throw Error()</script>',
    'https://example.com/story',
  );
  assert.equal(result.title, 'Campus & news');
  assert.equal(result.image, 'https://example.com/cover.jpg');
  assert.equal(result.description, 'A helpful guide');
  assert.equal(
    parsePreview(
      '<meta property="og:image" content="http://127.0.0.1/private">',
      'https://example.com',
    ).image,
    null,
  );
});
test('preview transport pins DNS and refuses redirects into private addresses and oversized bodies', async (t) => {
  let calls = 0;
  let mode = 'normal';
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(http, 'request', (_url: any, options: any, callback: any) => {
    calls++;
    options.lookup('example.com', {}, (error: any, address: string) => {
      assert.equal(error, null);
      assert.equal(address, '93.184.216.34');
    });
    assert.equal(options.headers.Authorization, undefined);
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () => {
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = mode === 'redirect' ? 302 : 200;
        res.headers =
          mode === 'redirect'
            ? { location: 'http://127.0.0.1/private' }
            : { 'content-type': 'text/html' };
        res.destroy = () => {};
        callback(res);
        if (mode !== 'redirect') {
          res.emit('data', Buffer.from(mode === 'large' ? '123456789' : 'hello'));
          res.emit('end');
        }
      });
    };
    return req;
  });
  const normal = await readPublicUrl('http://example.com/', 20);
  assert.equal(normal.body.toString(), 'hello');
  mode = 'redirect';
  await assert.rejects(() => readPublicUrl('http://example.com/', 20));
  assert.equal(calls, 2);
  mode = 'large';
  await assert.rejects(() => readPublicUrl('http://example.com/', 3), /too large/);
  t.mock.method(dns, 'lookup', async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await assert.rejects(() => readPublicUrl('http://example.com/', 20), /Private address/);
  assert.equal(calls, 3);
  t.mock.method(dns, 'lookup', async () => [
    { address: '2606:4700:4700::1111', family: 6 },
    { address: '93.184.216.34', family: 4 },
  ]);
  assert.equal((await resolvePublic('example.com')).family, 4);
});
test('birth dates reject impossible and future calendar dates', () => {
  assert.equal(birthDate('2000-02-29')?.toISOString().slice(0, 10), '2000-02-29');
  for (const date of ['2001-02-29', '2020-13-01', '2099-01-01', '1800-01-01'])
    assert.throws(() => birthDate(date));
});
test('preview pipeline fetches and optimizes an image once, then serves cached metadata', async (t) => {
  const sharp = require('sharp');
  const { LinkPreviewService } = await import('../src/link-previews');
  const image = await sharp({
    create: { width: 800, height: 420, channels: 3, background: '#31724f' },
  })
    .png()
    .toBuffer();
  let requests = 0;
  let row: any = null;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(http, 'request', (url: any, _options: any, callback: any) => {
    requests++;
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.headers = { 'content-type': url.pathname === '/cover.png' ? 'image/png' : 'text/html' };
        res.destroy = () => {};
        callback(res);
        res.emit(
          'data',
          url.pathname === '/cover.png'
            ? image
            : Buffer.from(
                '<meta property="og:title" content="Campus guide"><meta property="og:image" content="/cover.png">',
              ),
        );
        res.emit('end');
      });
    return req;
  });
  const db: any = {
    linkPreview: {
      findUnique: async () => row,
      count: async () => 0,
      upsert: async (args: any) => {
        row = { id: '00000000-0000-4000-8000-000000000001', ...args.create };
        return row;
      },
    },
  };
  const service = new LinkPreviewService(db);
  const first = await service.get('http://example.com/story');
  assert.equal(first?.title, 'Campus guide');
  assert.equal(first?.imageWidth, 800);
  assert.equal((await sharp(Buffer.from(row.imageBytes)).metadata()).format, 'webp');
  const cached = await service.get('http://example.com/story');
  assert.equal(cached?.id, first?.id);
  assert.equal(requests, 2);
});

test('bare domains, suffixes, punctuation and first valid links agree with publication entity offsets', () => {
  assert.equal(firstLink('Read krosscheckapp.com, then x.com'), 'https://krosscheckapp.com/');
  assert.equal(
    firstLink('youtube.com/watch?v=dGoHLoDmHdI'),
    'https://youtube.com/watch?v=dGoHLoDmHdI',
  );
  assert.equal(
    firstLink('mail person@example.com and 1.25 or file.php or thing.notarealtld'),
    null,
  );
  assert.equal(firstLink('localhost then x.com.'), 'https://x.com/');
  assert.equal(firstLink('http://127.0.0.1/a and fpiupdates.com.ng'), 'https://fpiupdates.com.ng/');
  assert.equal(firstLink('example.com/a_(b).'), 'https://example.com/a_(b)');
  const { parseEntities } = require('../src/text-entities');
  assert.deepEqual(parseEntities('example.com/path#section/@someone'), []);
  assert.equal(parseEntities('A real #section here')[0].hashtag, 'section');
});
test('preview transport accepts bounded gzip but rejects decompression bombs', async (t) => {
  const { gzipSync } = require('node:zlib');
  let body = gzipSync(Buffer.from('<title>Compressed page</title>'));
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(http, 'request', (_u: any, _o: any, callback: any) => {
    const { PassThrough } = require('node:stream');
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new PassThrough();
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html', 'content-encoding': 'gzip' };
        callback(res);
        res.end(body);
      });
    return req;
  });
  assert.equal(
    (await readPublicUrl('http://example.com/', 1024)).body.toString(),
    '<title>Compressed page</title>',
  );
  body = gzipSync(Buffer.from('a'.repeat(4096)));
  await assert.rejects(() => readPublicUrl('http://example.com/', 1024), /too large/);
});
test('provider URLs use exact allowlisted hosts, canonical YouTube IDs and safe JSON-only metadata', () => {
  const { previewProvider, parseOEmbed } = require('../src/preview-providers');
  for (const url of [
    'https://youtu.be/dGoHLoDmHdI?si=tracking',
    'https://www.youtube.com/shorts/dGoHLoDmHdI',
    'https://m.youtube.com/watch?v=dGoHLoDmHdI',
    'https://www.youtube.com/live/dGoHLoDmHdI',
  ])
    assert.equal(
      new URL(previewProvider(url).endpoint).searchParams.get('url'),
      'https://www.youtube.com/watch?v=dGoHLoDmHdI',
    );
  assert.equal(previewProvider('https://youtube.com.evil.example/watch?v=dGoHLoDmHdI'), null);
  assert.equal(previewProvider('https://youtu.be/bad'), null);
  assert.ok(
    previewProvider('https://www.facebook.com/example/posts/123').endpoint.startsWith(
      'https://graph.facebook.com/oembed_post?',
    ),
  );
  assert.ok(
    previewProvider('https://www.facebook.com/example/videos/123').endpoint.startsWith(
      'https://graph.facebook.com/oembed_video?',
    ),
  );
  assert.equal(previewProvider('https://facebook.com/'), null);
  const parsed = parseOEmbed(
    {
      title: 'A <script>bad()</script> title',
      thumbnail_url: 'https://i.ytimg.com/vi/dGoHLoDmHdI/hqdefault.jpg',
      html: '<script>never execute</script>',
    },
    'https://youtu.be/dGoHLoDmHdI',
    'YouTube',
  );
  assert.equal(parsed.title, 'A bad() title');
  assert.ok(parsed.image);
  assert.equal(parsed.html, undefined);
  assert.equal(
    parseOEmbed(
      { html: '<blockquote><p>Public Facebook update</p></blockquote><script>never()</script>' },
      'https://facebook.com/example/posts/123',
      'Facebook',
    ).description,
    'Public Facebook update',
  );
  assert.equal(
    parseOEmbed(
      { title: 'Safe', thumbnail_url: 'http://127.0.0.1/secret' },
      'https://example.com',
      'Example',
    ).image,
    null,
  );
});
test('YouTube JSON metadata yields a cached image even when the watch HTML cannot be fetched', async (t) => {
  const https: typeof import('node:https') = require('node:https');
  const sharp = require('sharp');
  const image = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#222' },
  })
    .png()
    .toBuffer();
  const paths: string[] = [];
  let row: any = null;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(https, 'request', (url: any, _o: any, callback: any) => {
    paths.push(url.href);
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.headers = {
          'content-type': url.hostname === 'i.ytimg.com' ? 'image/png' : 'application/json',
        };
        res.destroy = () => {};
        callback(res);
        res.emit(
          'data',
          url.hostname === 'i.ytimg.com'
            ? image
            : Buffer.from(
                JSON.stringify({
                  title: 'A real video title',
                  thumbnail_url: 'https://i.ytimg.com/vi/dGoHLoDmHdI/hqdefault.jpg',
                }),
              ),
        );
        res.emit('end');
      });
    return req;
  });
  const db: any = {
    linkPreview: {
      findUnique: async () => row,
      count: async () => 0,
      upsert: async (args: any) =>
        (row = { id: '00000000-0000-4000-8000-000000000003', ...args.create }),
    },
  };
  const { LinkPreviewService } = require('../src/link-previews');
  const service = new LinkPreviewService(db);
  const result = await service.get('https://youtu.be/dGoHLoDmHdI?si=abc');
  assert.equal(result.title, 'A real video title');
  assert.equal(result.imageWidth, 640);
  assert.equal(paths.length, 2);
  assert.ok(paths[0].includes('/oembed?'));
  assert.ok(!paths.some((p) => p.includes('/watch?')));
  await service.get('https://youtu.be/dGoHLoDmHdI?si=abc');
  assert.equal(paths.length, 2);
});
test('stale text-only previews refresh in place without changing IDs used by existing posts', async (t) => {
  let row: any = {
    id: '00000000-0000-4000-8000-000000000004',
    url: 'http://example.com/',
    title: 'example.com',
    description: '',
    siteName: 'example.com',
    imageWidth: null,
    imageHeight: null,
  };
  let requests = 0;
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  t.mock.method(http, 'request', (_u: any, _o: any, callback: any) => {
    requests++;
    const req = new EventEmitter() as any;
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.headers = { 'content-type': 'text/html' };
        res.destroy = () => {};
        callback(res);
        res.emit('data', Buffer.from('<meta property="og:title" content="Refreshed title">'));
        res.emit('end');
      });
    return req;
  });
  const db: any = {
    linkPreview: {
      findUnique: async () => row,
      count: async () => 500,
      upsert: async (args: any) => (row = { ...row, ...args.update }),
    },
  };
  const { LinkPreviewService } = require('../src/link-previews');
  const service = new LinkPreviewService(db);
  const result = await service.get('http://example.com/');
  assert.equal(result.id, row.id);
  assert.equal(result.title, 'Refreshed title');
  await service.get('http://example.com/');
  assert.equal(requests, 1);
});
