import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { api, type Preview } from './api';
import { detectedLinks } from './links';
import { useSession } from './session';
export function firstPostLink(body: string) {
  return detectedLinks(body)[0]?.url ?? null;
}
const fallback = (url: string): Preview => ({
  url,
  title: new URL(url).hostname,
  description: '',
  siteName: new URL(url).hostname,
});
const resolved = new Map<string, { preview: Preview; expires: number }>();
const pending = new Map<string, Promise<Preview>>();
function fetchPreview(url: string, signal?: AbortSignal) {
  const cached = resolved.get(url);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.preview);
  // Composer requests are cancellable; feed cards share requests for the same URL.
  if (!signal && pending.has(url)) return pending.get(url)!;
  const work = api<{ preview: Preview | null }>('/link-previews', {
    method: 'POST',
    body: JSON.stringify({ url }),
    signal,
  }).then((x) => {
    const result = x.preview ?? fallback(url);
    if (result.id) {
      resolved.set(url, {
        preview: result,
        expires: Date.now() + (result.imageWidth ? 86400000 : 300000),
      });
      if (resolved.size > 100) resolved.delete(resolved.keys().next().value!);
    }
    return result;
  });
  if (!signal) {
    pending.set(url, work);
    void work.finally(() => pending.delete(url)).catch(() => {});
  }
  return work;
}
export function LinkPreviewCard({ preview }: { preview: Preview }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [preview.id, preview.imageWidth]);
  const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
    new URL(preview.url).hostname,
  );
  const large =
    (preview.imageWidth ?? 0) >= 480 &&
    ((preview.imageWidth ?? 0) / (preview.imageHeight || 1) >= 1.45 || youtube);
  const image = !!preview.id && !!preview.imageWidth && !failed;
  return (
    <a
      className={`link-preview-card ${image && large ? 'preview-large' : 'preview-compact'}`}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
    >
      {image ? (
        <img
          src={`${import.meta.env.VITE_API_URL || '/api/v1'}/link-previews/${preview.id}/image`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="preview-placeholder" aria-hidden="true">
          <Link2 size={26} />
        </span>
      )}
      <div className="preview-copy">
        <small>{preview.siteName || new URL(preview.url).hostname}</small>
        <strong>{preview.title}</strong>
        {preview.description && <p>{preview.description}</p>}
      </div>
    </a>
  );
}
export function PublishedLinkPreview({
  body,
  preview,
}: {
  body: string;
  preview?: Preview | null;
}) {
  const { user } = useSession();
  const url = preview?.url ?? firstPostLink(body);
  const [fetched, setFetched] = useState<Preview | null>(null);
  useEffect(() => {
    let active = true;
    setFetched(null);
    if (user && url && !preview?.imageWidth)
      void fetchPreview(url)
        .then((value) => {
          if (active) setFetched(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [url, preview?.id, preview?.imageWidth, user?.id]);
  const value = fetched ?? preview ?? (url ? fallback(url) : null);
  return value ? <LinkPreviewCard preview={value} /> : null;
}
export function ComposerLinkPreview({ body }: { body: string }) {
  const link = firstPostLink(body);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setLoading(!!link);
    if (!link) return;
    const timer = setTimeout(() => {
      fetchPreview(link, controller.signal)
        .then((x) => {
          if (!controller.signal.aborted) setPreview(x);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPreview(fallback(link));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 550);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [link]);
  if (!link) return null;
  return (
    <div className="composer-link-preview">
      {loading ? (
        <p className="muted" role="status">
          Loading link preview…
        </p>
      ) : (
        preview && <LinkPreviewCard preview={preview} />
      )}
    </div>
  );
}
