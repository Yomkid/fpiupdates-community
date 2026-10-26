import { useDevice } from './useDevice';
import { FeaturedSports } from './Sports';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, mediaUrl } from './api';
import { ErrorBox } from './components';
import { toast } from './toast';
import { useSession } from './session';
type Card = {
  sidebar?: boolean;
  feed?: boolean;
  desktop?: boolean;
  mobile?: boolean;
  updatedAt?: string;
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  position: number;
};
type Discovery = {
  announcement: Card | null;
  sponsored: Card | null;
  trends: { tag: string; posts: number; authors: number }[];
  topics: { id: string; title: string; body: string; href: string }[];
  articles: {
    id: string;
    slug: string;
    title: string;
    publishedAt: string;
    coverMediaId: string | null;
    coverAlt: string | null;
  }[];
  updatedAt: string;
};
function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith('/') ? (
    <Link to={href}>{children}</Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow sponsored">
      {children}
    </a>
  );
}
export function DiscoveryPanels({
  announcementsOnly = false,
  hideAnnouncement = false,
  section = 'all',
}: {
  announcementsOnly?: boolean;
  hideAnnouncement?: boolean;
  section?: 'all' | 'topics' | 'articles' | 'sports';
}) {
  const device = useDevice();
  const placement = announcementsOnly ? 'feed' : 'sidebar';
  const { user } = useSession();
  const [data, setData] = useState<Discovery | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    const c = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api<Discovery>(
          '/discovery/sidebar?' + new URLSearchParams({ placement, device }),
          { signal: c.signal },
        );
        if (!c.signal.aborted) setData(result);
      } catch {
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 600000);
    window.addEventListener('discovery-updated', load);
    return () => {
      c.abort();
      clearInterval(timer);
      window.removeEventListener('discovery-updated', load);
    };
  }, [user?.id, placement, device]);
  if (!data) return null;
  const announcement = data.announcement;
  return (
    <>
      {section === 'articles' && !data.articles.length && (
        <p className="page-panel">No published articles yet.</p>
      )}
      {section === 'topics' && !data.trends.length && !data.topics.length && (
        <p className="page-panel">No topics available yet.</p>
      )}
      {section === 'all' &&
        !hideAnnouncement &&
        announcement &&
        !dismissed.includes(announcement.id + announcement.updatedAt) && (
          <section
            className="discovery-panel platform-announcement"
            aria-label="Platform announcement"
          >
            <div className="section-title">
              <strong>From FpiUpdates</strong>
              <button
                className="icon-button"
                aria-label="Dismiss announcement"
                onClick={() =>
                  setDismissed((x) => [...x, announcement.id + announcement.updatedAt])
                }
              >
                ×
              </button>
            </div>
            <CardLink href={announcement.href}>
              <h3>{announcement.title}</h3>
              <p>{announcement.body}</p>
              <span className="text-button">Read more →</span>
            </CardLink>
          </section>
        )}
      {!announcementsOnly && ['all', 'sports'].includes(section) && <FeaturedSports />}
      {!announcementsOnly && (
        <>
          {section === 'all' && data.sponsored && (
            <section className="discovery-panel sponsored-card">
              <span className="eyebrow">SPONSORED</span>
              <CardLink href={data.sponsored.href}>
                <h3>{data.sponsored.title}</h3>
                <p>{data.sponsored.body}</p>
                <span className="text-button">Learn more ↗</span>
              </CardLink>
            </section>
          )}
          {['all', 'topics'].includes(section) &&
            (data.trends.length > 0 || data.topics.length > 0) && (
              <section className="discovery-panel">
                <h2>{data.trends.length ? 'Trending in Ilaro' : 'Explore topics'}</h2>
                <p className="discovery-caption">
                  {data.trends.length
                    ? 'Conversations in the last 24 hours'
                    : 'Selected topics to explore'}
                </p>
                {data.trends.map((t) => (
                  <Link
                    className="discovery-item"
                    to={'/tags/' + encodeURIComponent(t.tag)}
                    key={t.tag}
                  >
                    <strong>#{t.tag}</strong>
                    <small>
                      {t.posts.toLocaleString()} posts · {t.authors.toLocaleString()} people
                    </small>
                  </Link>
                ))}
                {data.topics.map((t) => (
                  <div className="discovery-item" key={t.id}>
                    <CardLink href={t.href}>
                      <strong>{t.title}</strong>
                      {t.body && <small>{t.body}</small>}
                    </CardLink>
                  </div>
                ))}
                <Link className="text-button" to="/tags">
                  Explore hashtags →
                </Link>
              </section>
            )}
          {['all', 'articles'].includes(section) && data.articles.length > 0 && (
            <section className="discovery-panel">
              <h2>Latest articles</h2>
              {data.articles.map((a) => (
                <Link
                  className="discovery-item discovery-article"
                  key={a.id}
                  to={'/articles/' + a.slug}
                >
                  {a.coverMediaId && (
                    <img src={mediaUrl(a.coverMediaId)} alt={a.coverAlt ?? ''} loading="lazy" />
                  )}
                  <span>
                    <strong>{a.title}</strong>
                    <small>{new Date(a.publishedAt).toLocaleDateString('en-NG')}</small>
                  </span>
                </Link>
              ))}
              <Link className="text-button" to="/articles">
                All articles →
              </Link>
            </section>
          )}
        </>
      )}
    </>
  );
}
const localInput = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function DiscoveryAdmin() {
  const [rows, setRows] = useState<Card[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    api<Card[]>('/admin/discovery', { signal: c.signal })
      .then(setRows)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [version]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      await api('/admin/discovery/' + editing.id, {
        method: 'PUT',
        body: JSON.stringify({
          kind: f.get('kind'),
          title: f.get('title'),
          body: f.get('body'),
          href: f.get('href'),
          position: Number(f.get('position')),
          enabled: f.has('enabled'),
          sidebar: f.has('sidebar'),
          feed: f.has('feed'),
          mobile: f.has('mobile'),
          desktop: f.has('desktop'),
          startsAt: new Date(String(f.get('startsAt'))).toISOString(),
          endsAt: new Date(String(f.get('endsAt'))).toISOString(),
        }),
      });
      setEditing(null);
      setVersion((n) => n + 1);
      toast('Discovery card saved.', 'success');
      window.dispatchEvent(new Event('discovery-updated'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-panel">
      <h2>Discovery & announcements</h2>
      <p>
        Schedule platform announcements, selected topics and labelled sponsor cards. Times use your
        device timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). The first active
        announcement and sponsor by position appear; selected topics appear when no trends qualify.
      </p>
      {error && <ErrorBox message={error} />}
      <button
        className="button primary"
        onClick={() =>
          setEditing({
            id: crypto.randomUUID(),
            kind: 'ANNOUNCEMENT',
            title: '',
            body: '',
            href: '/about',
            enabled: false,
            sidebar: true,
            feed: false,
            mobile: true,
            desktop: true,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            position: 0,
          })
        }
      >
        Add card
      </button>
      {editing && (
        <form key={editing.id} className="feature-form admin-editor" onSubmit={save}>
          <label>
            Type
            <select name="kind" defaultValue={editing.kind}>
              <option value="ANNOUNCEMENT">Platform announcement</option>
              <option value="TOPIC">Selected topic</option>
              <option value="SPONSORED">Sponsored card</option>
            </select>
          </label>
          <label>
            Title
            <input name="title" required maxLength={100} defaultValue={editing.title} />
          </label>
          <label>
            Description
            <textarea name="body" maxLength={400} defaultValue={editing.body} />
          </label>
          <label>
            Destination
            <input
              name="href"
              required
              maxLength={500}
              defaultValue={editing.href}
              placeholder="/articles/story or https://example.com"
            />
          </label>
          <label>
            Starts
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={localInput(editing.startsAt)}
            />
          </label>
          <label>
            Expires
            <input
              type="datetime-local"
              name="endsAt"
              required
              defaultValue={localInput(editing.endsAt)}
            />
          </label>
          <label>
            Position
            <input
              type="number"
              name="position"
              min={0}
              max={100}
              defaultValue={editing.position}
            />
          </label>
          <fieldset className="display-controls">
            <legend>Where to display</legend>
            <label className="checkbox-label">
              <input type="checkbox" name="sidebar" defaultChecked={editing.sidebar ?? true} />
              Sidebar
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="feed" defaultChecked={editing.feed ?? false} />
              Home feed
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="mobile" defaultChecked={editing.mobile ?? true} />
              Mobile
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="desktop" defaultChecked={editing.desktop ?? true} />
              Desktop / tablet
            </label>
          </fieldset>
          <p className="form-note">
            The sidebar appears on wide screens. Choose Home feed to reach mobile readers.
          </p>
          <label className="checkbox-label">
            <input name="enabled" type="checkbox" defaultChecked={editing.enabled} />
            Enabled
          </label>
          <button className="button primary" disabled={busy}>
            Save card
          </button>
          <button className="button secondary" type="button" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </form>
      )}
      <div className="admin-list">
        {rows.map((r) => (
          <section className="admin-card" key={r.id}>
            <strong>{r.title}</strong>
            <p>
              {r.kind} · {r.enabled ? 'Enabled' : 'Disabled'} · Ends{' '}
              {new Date(r.endsAt).toLocaleString()}
            </p>
            <button className="text-button" onClick={() => setEditing(r)}>
              Edit card
            </button>
          </section>
        ))}
      </div>
    </section>
  );
}
