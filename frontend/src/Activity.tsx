import { VerifiedBadge } from './Identity';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, errorMessage, type Post, type User } from './api';
import { PostCard, ErrorBox, Avatar } from './components';
import { BackButton } from './Navigation';
type Activity = {
  actor?: User;
  data: { id: string; actor?: User; kind: string; createdAt: string; post: Post | null }[];
  nextCursor: string | null;
};
export function ActivityPage({ subscribed = false }: { subscribed?: boolean }) {
  const { id } = useParams();
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = subscribed ? '/notification-groups/posts' : '/notification-groups/' + id;
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    api<Activity>(path, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [path]);
  async function more() {
    if (!data?.nextCursor || busy) return;
    setBusy(true);
    try {
      const next = await api<Activity>(path + '?cursor=' + encodeURIComponent(data.nextCursor));
      setData((old) =>
        old
          ? {
              ...next,
              data: [...old.data, ...next.data.filter((n) => !old.data.some((x) => x.id === n.id))],
            }
          : next,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <BackButton />
        <div>
          <h1>{subscribed ? 'Posts' : 'Activity'}</h1>
          <p>
            {subscribed
              ? 'From accounts with post alerts enabled.'
              : 'Posts related to this notification.'}
          </p>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {!data && !error && <p className="page-panel">Loading activity…</p>}
      {data?.data.map((row) =>
        row.post ? (
          <PostCard key={row.id} post={row.post} />
        ) : row.actor ? (
          <div key={row.id} className="notification-row">
            <Link to={'/u/' + row.actor.username}>
              <Avatar user={row.actor} />
            </Link>
            <Link to={'/u/' + row.actor.username}>
              <strong>{row.actor.displayName}</strong>
              <p>@{row.actor.username} followed you</p>
            </Link>
          </div>
        ) : null,
      )}
      {data && !data.data.length && (
        <div className="empty-state">
          <h2>No updates yet</h2>
          <p>
            Follow an account and turn on its profile bell to receive new posts, reposts and quotes
            here.
          </p>
          <Link to="/people" className="text-button">
            Find people
          </Link>
        </div>
      )}
      {data?.nextCursor && (
        <div className="load-more">
          <button className="button secondary" disabled={busy} onClick={() => void more()}>
            More updates
          </button>
        </div>
      )}
    </>
  );
}
