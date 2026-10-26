import { useFeatures } from './Features';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api';
import { PageHeading } from './FeaturePages';
import { PublicInfoPage } from './PublicInfo';
const ArticleEditor = lazy(() =>
  import('./ArticleEditor').then((m) => ({ default: m.ArticleEditor })),
);
import { safeArticleHtml } from './article-html';
import { useSession } from './session';
import { toast } from './toast';
type Document = {
  slug: string;
  title: string;
  category: string;
  draftHtml: string;
  publishedHtml: string | null;
  publishedTitle: string | null;
  effectiveAt: string | null;
  position: number;
};
export function ManagedPage() {
  const { pathname } = useLocation();
  const { flags } = useFeatures();
  const slug = pathname.slice(1).replace(/^help\//, 'help-');
  const [page, setPage] = useState<Document | null>(null),
    [links, setLinks] = useState<Document[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [versions, setVersions] = useState<
      { id: string; title: string; html: string; effectiveAt: string }[] | null
    >(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(null);
    setError('');
    setVersions(null);
    api<Document>('/content/' + encodeURIComponent(slug))
      .then((p) => {
        if (active) setPage(p);
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 404)) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    if (slug === 'help' || slug === 'faq')
      api<Document[]>('/content')
        .then((rows) => {
          if (active) setLinks(rows.filter((p) => p.slug.startsWith('help-') || p.slug === 'faq'));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug]);
  return (
    <>
      {loading ? (
        <p className="page-panel" role="status">
          Loading page…
        </p>
      ) : error ? (
        <p className="page-panel form-feedback error" role="alert">
          {error}
        </p>
      ) : page ? (
        <>
          <PageHeading title={page.publishedTitle ?? page.title} />
          <article className="public-info">
            <div
              className="article-body"
              dangerouslySetInnerHTML={{ __html: safeArticleHtml(page.publishedHtml ?? '') }}
            />
            {slug === 'help-verification' && (
              <section className="verification-colour-help">
                <h2>Badge colours and account types</h2>
                <p>
                  {flags.identityBadgeColours
                    ? 'Green is used for verified individuals, creators and media; gold for verified businesses and institutions; grey for verified government accounts.'
                    : 'All verified accounts currently use a green badge. Account categories still identify the kind of account after review.'}
                </p>
                <p>
                  A badge means the account has been reviewed for identity or authority. Selecting a
                  category or paying for a future subscription does not grant verification.
                </p>
              </section>
            )}
            {page.effectiveAt && (
              <p className="muted">Effective {new Date(page.effectiveAt).toLocaleDateString()}</p>
            )}
            {['privacy', 'terms', 'guidelines'].includes(slug) && (
              <button
                className="text-button"
                onClick={() =>
                  void api<typeof versions>('/content/' + slug + '/history')
                    .then(setVersions)
                    .catch((e) => toast(errorMessage(e), 'error'))
                }
              >
                Published versions
              </button>
            )}
            {versions?.map((v) => (
              <details key={v.id}>
                <summary>
                  {v.title} · {new Date(v.effectiveAt).toLocaleDateString()}
                </summary>
                <div dangerouslySetInnerHTML={{ __html: safeArticleHtml(v.html) }} />
              </details>
            ))}
            <nav>
              <Link to="/help">Help Centre</Link> ·{' '}
              <Link to="/settings/verification">Identity & username requests</Link>
            </nav>
          </article>
        </>
      ) : (
        <PublicInfoPage />
      )}
      {(slug === 'help' || slug === 'faq') && (
        <section className="page-panel help-index">
          {Array.from(new Set(links.map((p) => p.category))).map((category) => (
            <section key={category}>
              <h2>{category}</h2>
              {links
                .filter((p) => p.category === category)
                .map((p) => (
                  <p key={p.slug}>
                    <Link
                      to={p.slug.startsWith('help-') ? '/help/' + p.slug.slice(5) : '/' + p.slug}
                    >
                      {p.publishedTitle}
                    </Link>
                  </p>
                ))}
            </section>
          ))}
        </section>
      )}
    </>
  );
}
export function ContentDesk() {
  const { user } = useSession();
  const [rows, setRows] = useState<Document[]>([]),
    [selected, setSelected] = useState<Document | null>(null),
    [html, setHtml] = useState(''),
    [preview, setPreview] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    api<Document[]>('/admin/content')
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
  }, [refresh]);
  function choose(row: Document | null) {
    setSelected(row);
    setHtml(row?.draftHtml ?? '');
    setPreview(false);
    setError('');
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const row = await api<Document>('/admin/content/' + f.get('slug'), {
        method: 'PUT',
        body: JSON.stringify({
          title: f.get('title'),
          category: f.get('category'),
          position: Number(f.get('position')),
          html,
        }),
      });
      setSelected(row);
      setRefresh((n) => n + 1);
      toast('Draft saved. The live page is unchanged.', 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await api('/admin/content/' + selected.slug + '/publish', {
        method: 'PUT',
        body: JSON.stringify({
          effectiveAt: new Date(String(f.get('effectiveAt'))).toISOString(),
          confirm: f.has('confirm'),
        }),
      });
      setRefresh((n) => n + 1);
      toast('Saved draft published.', 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-desk">
      <h2>Pages & Help Centre</h2>
      <p>
        Drafts are private. Save, preview and review before publishing. Assess whether policy
        changes need user notice or renewed consent; publishing does not collect consent
        automatically.
      </p>
      <label>
        Choose a page
        <select
          value={selected?.slug ?? ''}
          onChange={(e) => choose(rows.find((p) => p.slug === e.target.value) ?? null)}
        >
          <option value="">Create a page or help article</option>
          {rows.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title} · {p.publishedHtml ? 'Published' : 'Draft'}
            </option>
          ))}
        </select>
      </label>
      <form className="feature-form" onSubmit={save} key={selected?.slug ?? 'new'}>
        <label>
          Page address
          <input
            name="slug"
            required
            defaultValue={selected?.slug}
            readOnly={!!selected}
            pattern="(about|privacy|terms|guidelines|faq|help(-[a-z0-9-]+)?)"
            maxLength={100}
            placeholder="help-verification"
          />
        </label>
        <label>
          Title
          <input
            name="title"
            defaultValue={selected?.title}
            required
            minLength={2}
            maxLength={160}
          />
        </label>
        <label>
          Help category
          <input
            name="category"
            defaultValue={selected?.category ?? 'General'}
            required
            maxLength={80}
          />
        </label>
        <label>
          Display order
          <input
            type="number"
            name="position"
            defaultValue={selected?.position ?? 0}
            min={0}
            max={999}
            required
          />
        </label>
        <Suspense fallback={<p>Loading editor…</p>}>
          <ArticleEditor
            key={selected?.slug ?? 'new'}
            body={selected?.draftHtml ?? ''}
            format="HTML"
            onChange={setHtml}
          />
        </Suspense>
        <div className="onboarding-actions">
          <button className="button primary" disabled={busy}>
            Save draft
          </button>
          <button className="button secondary" type="button" onClick={() => setPreview((p) => !p)}>
            Preview current edits
          </button>
        </div>
      </form>
      {preview && (
        <article
          className="public-info article-body"
          dangerouslySetInnerHTML={{ __html: safeArticleHtml(html) }}
        />
      )}
      {selected && user?.permissions?.includes('pages.publish') && (
        <form className="feature-form publish-page" onSubmit={publish}>
          <h3>Publish the saved draft</h3>
          <p>Save any changes above first. Earlier published versions remain available.</p>
          <label>
            Effective date
            <input
              type="date"
              name="effectiveAt"
              required
              max={new Date().toISOString().slice(0, 10)}
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required />I reviewed the saved draft and its
            publication requirements.
          </label>
          <button className="button secondary" disabled={busy}>
            Publish saved draft
          </button>
          <Link to={'/' + selected.slug} target="_blank">
            View public page
          </Link>
        </form>
      )}
      {error && (
        <p className="form-feedback error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
