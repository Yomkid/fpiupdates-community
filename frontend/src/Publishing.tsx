import { BackButton } from './Navigation';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api, errorMessage, mediaUrl, type Article } from './api';
import { useSession } from './session';
import { ImageUpload } from './ImageUpload';
import { safeArticleHtml } from './article-html';
import { ErrorBox, LinkText } from './components';
import { toast } from './toast';
const ArticleEditor = lazy(() =>
  import('./ArticleEditor').then((m) => ({ default: m.ArticleEditor })),
);
type Payload = {
  title: string;
  excerpt: string;
  body: string;
  bodyFormat: string;
  coverMediaId?: string | null;
  coverAlt?: string;
  sourceUrl?: string;
};
type Draft = {
  publicSlug?: string | null;
  id: string;
  payload: Payload;
  version: number;
  publishedVersion: number;
  scheduledAt: string | null;
  scheduleError: string | null;
};
const empty: Payload = {
  title: '',
  excerpt: '',
  body: '',
  bodyFormat: 'HTML',
  coverMediaId: null,
  coverAlt: '',
};
function nigeriaTime(at: string) {
  return new Date(at).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
export function EditorialPage() {
  const { user } = useSession();
  const [articles, setArticles] = useState<Article[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const canWrite = user?.permissions?.includes('articles.write');
  async function reload() {
    try {
      const [a, d] = await Promise.all([api<Article[]>('/editorial'), api<Draft[]>('/publishing')]);
      setArticles(a);
      setDrafts(d);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    if (canWrite) void reload();
  }, [canWrite, user?.id]);
  async function open(id: string) {
    try {
      setEditing(await api<Draft>(`/publishing/${id}`));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const ids = [...new Set([...drafts.map((d) => d.id), ...articles.map((a) => a.id)])];
  return (
    <>
      <div className="page-heading">
        <BackButton />
        <div>
          <h1>Editorial studio</h1>
          <p>Write privately. Preview your story. Publish when it is ready.</p>
        </div>
      </div>
      <section className="page-panel">
        {!canWrite ? (
          <ErrorBox message="Editorial permission required." />
        ) : editing ? (
          <DraftEditor
            key={editing.id}
            initial={editing}
            published={articles.some((a) => a.id === editing.id && a.status === 'PUBLISHED')}
            canPublish={!!user?.permissions?.includes('articles.publish')}
            onClose={() => {
              setEditing(null);
              void reload();
            }}
          />
        ) : (
          <>
            <button
              className="button primary"
              onClick={() =>
                setEditing({
                  id: crypto.randomUUID(),
                  version: 0,
                  publishedVersion: 0,
                  payload: { ...empty },
                  scheduledAt: null,
                  scheduleError: null,
                })
              }
            >
              New article
            </button>
            <div className="admin-list">
              {ids.map((id) => {
                const d = drafts.find((x) => x.id === id),
                  a = articles.find((x) => x.id === id);
                return (
                  <div key={id}>
                    <strong>{d?.payload.title || a?.title || 'Untitled draft'}</strong>
                    <span>
                      {d?.scheduledAt
                        ? `Scheduled · ${nigeriaTime(d.scheduledAt)} WAT`
                        : d?.scheduleError
                          ? 'Schedule needs review'
                          : a?.status === 'PUBLISHED'
                            ? d && d.version !== d.publishedVersion
                              ? 'Published · unpublished edits'
                              : 'Published'
                            : 'Draft'}
                    </span>
                    <button className="text-button" onClick={() => void open(id)}>
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {error && <ErrorBox message={error} />}
      </section>
    </>
  );
}
function DraftEditor({
  initial,
  canPublish,
  onClose,
  published,
}: {
  initial: Draft;
  canPublish: boolean;
  published: boolean;
  onClose: () => void;
}) {
  const [isPublished, setIsPublished] = useState(published);
  const [payload, setPayload] = useState(initial.payload);
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState(initial.version ? 'Saved' : 'Not saved yet');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Payload | null>(null);
  const [mobile, setMobile] = useState(false);
  const [time, setTime] = useState('');
  const current = useRef(initial.payload),
    saved = useRef(JSON.stringify(initial.payload)),
    record = useRef(initial),
    pending = useRef<Promise<Draft> | null>(null),
    alive = useRef(true),
    conflict = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function change(patch: Partial<Payload>) {
    current.current = { ...current.current, ...patch };
    setPayload(current.current);
    setStatus('Unsaved changes');
  }
  async function save(): Promise<Draft> {
    if (pending.current) {
      await pending.current;
      return save();
    }
    if (conflict.current) throw new Error('Reopen the article to load its latest saved draft.');
    if (record.current.version && saved.current === JSON.stringify(current.current))
      return record.current;
    const snapshot = { ...current.current };
    const serialized = JSON.stringify(snapshot);
    setStatus('Saving…');
    const task = api<Draft>(`/publishing/${initial.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...snapshot, version: record.current.version }),
    })
      .then((result) => {
        record.current = result;
        saved.current = serialized;
        if (alive.current) {
          setDraft(result);
          setStatus(JSON.stringify(current.current) === serialized ? 'Saved' : 'Unsaved changes');
          setError('');
        }
        return result;
      })
      .catch((e) => {
        if (
          String(errorMessage(e)).includes('elsewhere') ||
          String(errorMessage(e)).includes('schedule')
        )
          conflict.current = true;
        if (alive.current) {
          setStatus('Could not save');
          setError(errorMessage(e));
        }
        throw e;
      })
      .finally(() => {
        pending.current = null;
      });
    pending.current = task;
    return task;
  }
  useEffect(() => {
    if (
      draft.scheduledAt ||
      uploading ||
      conflict.current ||
      saved.current === JSON.stringify(payload)
    )
      return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [payload, uploading, draft.scheduledAt]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || saved.current !== JSON.stringify(current.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  // Stop link navigation while a save is pending or content is unsaved.
  useEffect(() => {
    const guard = (e: MouseEvent) => {
      if (
        (e.target as Element).closest('a[href]') &&
        (pending.current || saved.current !== JSON.stringify(current.current))
      ) {
        e.preventDefault();
        toast('Save your draft and close the editor before leaving.', 'error');
      }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, []);
  async function action(kind: 'publish' | 'schedule' | 'cancel' | 'unpublish') {
    setBusy(true);
    setError('');
    try {
      const latest = await save();
      if (kind === 'schedule' && !time) throw new Error('Choose a date and time in Nigeria time.');
      const result = await api<Draft>(`/publishing/${initial.id}/publication`, {
        method: 'PUT',
        body: JSON.stringify({
          action: kind,
          version: latest.version,
          ...(kind === 'schedule'
            ? { scheduledAt: new Date(`${time}:00+01:00`).toISOString() }
            : {}),
        }),
      });
      record.current = result;
      setDraft(result);
      setStatus('Saved');
      conflict.current = false;
      if (kind === 'publish') setIsPublished(true);
      if (kind === 'unpublish') setIsPublished(false);
      toast(
        kind === 'publish'
          ? 'Article published.'
          : kind === 'schedule'
            ? 'Publication scheduled.'
            : kind === 'unpublish'
              ? 'Article unpublished.'
              : 'Schedule canceled.',
        'success',
        result.publicSlug ? { label: 'View', href: `/articles/${result.publicSlug}` } : undefined,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function showPreview() {
    setBusy(true);
    try {
      await save();
      const result = await api<Draft>(`/publishing/${initial.id}`);
      setPreview(result.payload);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = !!draft.scheduledAt;
  return (
    <>
      <div className="publishing-status" role="status">
        <strong>{status}</strong>
        <span>Private draft · live articles change only when published</span>
      </div>
      {draft.scheduledAt && (
        <p className="publishing-banner">
          Scheduled for {nigeriaTime(draft.scheduledAt)} WAT. Cancel the schedule to edit.
        </p>
      )}
      {draft.scheduleError && <ErrorBox message={draft.scheduleError} />}
      <form
        className="feature-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save()
            .then(() => toast('Draft saved.'))
            .catch(() => {});
        }}
      >
        <fieldset disabled={locked || busy} className="publishing-fields">
          <label>
            Title
            <input
              value={payload.title}
              maxLength={200}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <p className="form-note">
            The address is generated automatically on publication and stays the same.
          </p>
          <div
            onChange={(e) => {
              const el = e.target as HTMLInputElement;
              if (el.name === 'coverAlt') change({ coverAlt: el.value });
            }}
          >
            <ImageUpload
              kind="cover"
              name="coverMediaId"
              altName="coverAlt"
              initialId={payload.coverMediaId}
              initialAlt={payload.coverAlt}
              onChange={(id) => change({ coverMediaId: id })}
              onBusyChange={setUploading}
            />
          </div>
          <label>
            Summary
            <textarea
              value={payload.excerpt}
              maxLength={400}
              onChange={(e) => change({ excerpt: e.target.value })}
            />
          </label>
          <div>
            <strong>Article text</strong>
            <Suspense fallback={<p>Loading editor…</p>}>
              <ArticleEditor
                disabled={locked || busy}
                body={initial.payload.body}
                format={initial.payload.bodyFormat}
                onChange={(body) => change({ body, bodyFormat: 'HTML' })}
              />
            </Suspense>
          </div>
          <label>
            Source URL (optional)
            <input
              type="url"
              value={payload.sourceUrl ?? ''}
              onChange={(e) => change({ sourceUrl: e.target.value || undefined })}
            />
          </label>
        </fieldset>
        <div className="publishing-actions">
          <button className="button secondary" disabled={busy || uploading || locked}>
            Save draft
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={busy || uploading}
            onClick={() => void showPreview()}
          >
            Preview
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy || uploading}
            onClick={async () => {
              try {
                if (!locked) await save();
                onClose();
              } catch {}
            }}
          >
            Save & close
          </button>
        </div>
        {canPublish && !locked && (
          <>
            <div className="publishing-actions">
              <button
                className="button primary"
                type="button"
                disabled={busy || uploading}
                onClick={() => void action('publish')}
              >
                Publish now
              </button>
            </div>
            <label>
              Schedule in Nigeria time (WAT, UTC+1)
              <input
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={busy || uploading}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              disabled={busy || uploading || !time}
              onClick={() => void action('schedule')}
            >
              Schedule publication
            </button>
            <p className="form-note">
              Choose at least one minute ahead. Publication runs while the API server is running; an
              overdue article publishes after it restarts.
            </p>
          </>
        )}
        {canPublish && isPublished && !locked && (
          <button
            className="text-button"
            type="button"
            disabled={busy || uploading}
            onClick={() => void action('unpublish')}
          >
            Unpublish article
          </button>
        )}
        {locked && (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void action('cancel')}
          >
            Cancel schedule
          </button>
        )}
      </form>
      {error && (
        <>
          <ErrorBox message={error} />
          <button type="button" className="text-button" onClick={onClose}>
            Close editor without saving
          </button>
        </>
      )}
      {preview && (
        <PreviewDialog onClose={() => setPreview(null)}>
          <div className="article-preview-toolbar">
            <strong>Private preview</strong>
            <button type="button" onClick={() => setMobile(!mobile)}>
              {mobile ? 'Desktop width' : 'Mobile width'}
            </button>
            <button type="button" autoFocus onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
          <article
            className={`article-page article-preview ${mobile ? 'article-preview-mobile' : ''}`}
          >
            <span className="eyebrow">UNPUBLISHED PREVIEW</span>
            {preview.coverMediaId && (
              <img
                className="article-cover"
                src={mediaUrl(preview.coverMediaId)}
                alt={preview.coverAlt ?? ''}
              />
            )}
            <h1>{preview.title || 'Untitled draft'}</h1>
            <p className="article-excerpt">{preview.excerpt}</p>
            <div className="article-body">
              {preview.bodyFormat === 'HTML' ? (
                <div dangerouslySetInnerHTML={{ __html: safeArticleHtml(preview.body) }} />
              ) : (
                <LinkText text={preview.body} />
              )}
            </div>
          </article>
        </PreviewDialog>
      )}
    </>
  );
}

function PreviewDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="article-preview-overlay"
      aria-label="Private article preview"
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
