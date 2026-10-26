import { FindContacts } from './Discoverability';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, errorMessage, type User } from './api';
import { Avatar, ErrorBox } from './components';
import { FollowAction } from './Conversations';
import { BackButton } from './Navigation';
import { useSession } from './session';
type Suggestion = User & { reason: string };
export function PeopleSuggestions({ full = false, context }: { full?: boolean; context?: string }) {
  const { user } = useSession();
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setRows([]);
    setError('');
    setLoading(true);
    if (!user) {
      setLoading(false);
      return;
    }
    api<{ data: Suggestion[] }>(
      '/people/suggestions?' +
        new URLSearchParams({ limit: full ? '30' : '3', ...(context ? { context } : {}) }),
      { signal: c.signal },
    )
      .then((r) => {
        if (!c.signal.aborted) setRows(r.data);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [user?.id, context, full, version]);
  useEffect(() => {
    const reset = () => setVersion((v) => v + 1);
    window.addEventListener('feed-updated', reset);
    return () => window.removeEventListener('feed-updated', reset);
  }, []);
  if (!user) return full ? <p className="page-panel">Sign in to find people to follow.</p> : null;
  if (!full && !loading && !rows.length) return null;
  return (
    <section
      className={full ? 'people-directory' : 'discovery-panel people-suggestions'}
      aria-label={context ? 'You might like' : 'Who to follow'}
    >
      {!full && <h2>{context ? 'You might like' : 'Who to follow'}</h2>}
      {full && (
        <p className="people-intro">Discover people through your connections and the community.</p>
      )}
      {rows.map((person) => (
        <div className="suggested-person" key={person.id}>
          <Link className="suggested-identity" to={'/u/' + person.username}>
            <Avatar user={person} />
            <span>
              <strong>{person.displayName}</strong>
              <small>@{person.username}</small>
              {full && <p>{person.bio || person.reason}</p>}
            </span>
          </Link>
          <FollowAction author={person} />
        </div>
      ))}
      {loading && (
        <p className="people-status" role="status">
          Finding people…
        </p>
      )}
      {error && full && <ErrorBox message={error} retry={() => setVersion((v) => v + 1)} />}
      {full && !loading && !rows.length && !error && (
        <p className="page-panel">
          No new suggestions right now. <Link to="/search?type=people">Search people</Link> to find
          someone.
        </p>
      )}
      {!full && rows.length > 0 && (
        <Link
          className="text-button people-more"
          to={'/people' + (context ? '?context=' + encodeURIComponent(context) : '')}
        >
          Show more →
        </Link>
      )}
    </section>
  );
}
export function PeoplePage() {
  const [params] = useSearchParams();
  return (
    <>
      <div className="page-heading">
        <BackButton />
        <div>
          <h1>Who to follow</h1>
          <p>Find your people</p>
        </div>
      </div>
      <PeopleSuggestions full context={params.get('context') ?? undefined} />
      <FindContacts />
    </>
  );
}
export function ContextPeople({ placement = 'bottom' }: { placement?: 'top' | 'bottom' }) {
  const location = useLocation();
  const match = location.pathname.match(/^\/u\/([a-z0-9_]+)$/);
  if (location.pathname === '/people' || (match ? placement !== 'top' : placement !== 'bottom'))
    return null;
  return <PeopleSuggestions context={match?.[1]} />;
}
/** A tall sticky column scrolls with the document until its bottom reaches the viewport. */
export function useSidebarPosition() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      el.style.setProperty(
        '--sidebar-sticky-top',
        Math.min(12, innerHeight - el.offsetHeight - 12) + 'px',
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return ref;
}
