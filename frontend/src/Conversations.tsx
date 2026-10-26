import { Bell, BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, type Post, type Page, type User } from './api';
import { Avatar, Composer, ErrorBox, PostCard } from './components';
import { BackButton } from './Navigation';
import { useSession } from './session';
import { useInteractions } from './interactions';

export function FollowAction({ author }: { author: User }) {
  const { user } = useSession();
  const ui = useInteractions();
  const [following, setFollowing] = useState(!!author.isFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setFollowing(!!author.isFollowing);
    if (user && author.id !== user.id && author.isFollowing === undefined)
      api<User>('/users/' + encodeURIComponent(author.username))
        .then((p) => {
          if (active) setFollowing(!!p.isFollowing);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [author.id, author.isFollowing, user?.id]);
  useEffect(() => {
    const changed = (event: Event) => {
      const d = (event as CustomEvent<{ userId: string; accountId: string; following: boolean }>)
        .detail;
      if (d.userId === user?.id && d.accountId === author.id) setFollowing(d.following);
    };
    window.addEventListener('follow-updated', changed);
    return () => window.removeEventListener('follow-updated', changed);
  }, [author.id, user?.id]);
  if (user?.id === author.id) return null;
  return (
    <>
      <button
        className="button secondary small follow-action"
        aria-pressed={following}
        disabled={busy}
        onClick={async () => {
          if (!user) {
            ui.auth();
            return;
          }
          setBusy(true);
          try {
            await api('/social/users/' + author.id + '/follow', {
              method: following ? 'DELETE' : 'PUT',
            });
            setFollowing(!following);
            window.dispatchEvent(
              new CustomEvent('follow-updated', {
                detail: { userId: user.id, accountId: author.id, following: !following },
              }),
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {following ? 'Following' : 'Follow'}
      </button>
      {error && <ErrorBox message={error} />}
    </>
  );
}
export function ProfileAlerts({ accountId }: { accountId: string }) {
  const { user } = useSession();
  const [state, setState] = useState<{ following: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () =>
      api<{ following: boolean; enabled: boolean }>('/profile-alerts/' + accountId)
        .then((x) => {
          if (active) setState(x);
        })
        .catch(() => {});
    if (user && user.id !== accountId) void load();
    window.addEventListener('follow-updated', load);
    return () => {
      active = false;
      window.removeEventListener('follow-updated', load);
    };
  }, [accountId, user?.id]);
  if (!user || !state?.following || user.id === accountId) return null;
  const Icon = state.enabled ? BellRing : Bell;
  return (
    <>
      <button
        className="icon-button profile-alert-toggle"
        aria-label={state.enabled ? 'Turn off post alerts' : 'Turn on post alerts'}
        title={state.enabled ? 'Post alerts enabled' : 'Notify me about posts, reposts and quotes'}
        aria-pressed={state.enabled}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setState(
              await api('/profile-alerts/' + accountId + '/' + (state.enabled ? 'off' : 'on'), {
                method: 'PUT',
              }),
            );
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon size={21} />
      </button>
      {error && <ErrorBox message={error} />}
    </>
  );
}
export function RelevantPeople() {
  const location = useLocation();
  const { user } = useSession();
  const [people, setPeople] = useState<User[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setPeople([]);
    setExpanded(false);
    const match = location.pathname.match(/^\/posts\/([^/]+)$/);
    if (match)
      api<User[]>('/posts/' + match[1] + '/people', { signal: c.signal })
        .then(setPeople)
        .catch(() => {});
    else {
      const article = location.pathname.match(/^\/articles\/([^/]+)$/);
      if (article)
        api<{ discussion?: Post }>('/articles/' + article[1], { signal: c.signal })
          .then(async (a) => {
            if (a.discussion) {
              const people = await api<User[]>('/posts/' + a.discussion.id + '/people', {
                signal: c.signal,
              });
              if (!c.signal.aborted) setPeople(people);
            }
          })
          .catch(() => {});
    }
    return () => c.abort();
  }, [location.pathname, user?.id]);
  if (!people.length) return null;
  return (
    <section className="side-card relevant-people">
      <h2>People in this conversation</h2>
      {people.slice(0, expanded ? 20 : 3).map((person) => (
        <div className="relevant-person" key={person.id}>
          <Link to={'/u/' + person.username} aria-label={'View @' + person.username}>
            <Avatar user={person} />
          </Link>
          <div className="relevant-person-copy">
            <Link className="author-name" title={person.displayName} to={'/u/' + person.username}>
              {person.displayName}
            </Link>
            <Link className="person-handle" to={'/u/' + person.username}>
              @{person.username}
            </Link>
            {person.bio && <p className="person-bio">{person.bio}</p>}
          </div>
          <FollowAction author={person} />
        </div>
      ))}
      {people.length > 3 && (
        <button className="text-button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'See more people'}
        </button>
      )}
    </section>
  );
}
export function JoinPrompt() {
  const ui = useInteractions();
  return (
    <div className="join-preview">
      <h3>Keep the conversation going.</h3>
      <p>Sign in to see more and connect with the community.</p>
      <button className="button primary" onClick={() => ui.auth()}>
        Sign in
      </button>
    </div>
  );
}
function ReplyBranch({
  post,
  parent,
  rootAuthor,
  depth = 0,
  onChanged,
}: {
  post: Post;
  parent: Post;
  rootAuthor: string;
  depth?: number;
  onChanged: () => void;
}) {
  const { user } = useSession();
  const ui = useInteractions();
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  // Preview one real child. Deep branches stay lazy until explicitly expanded.
  const preview = depth < 8;
  const loadChildren = post._count.replies > 0 && (preview || expanded);
  useEffect(() => {
    if (!loadChildren) {
      if (!post._count.replies) {
        setItems([]);
        setCursor(null);
      }
      return;
    }
    const c = new AbortController();
    setError('');
    api<Page>('/posts/' + post.id + '/replies?replyOrder=oldest&limit=5', { signal: c.signal })
      .then((page) => {
        setItems((old) => {
          const previous = old.slice(5);
          return [...page.data, ...previous.filter((x) => !page.data.some((p) => p.id === x.id))];
        });
        setCursor(page.nextCursor);
        setLoaded(true);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [post.id, post._count.replies, loadChildren, version, user?.id]);
  const shown = expanded ? items : preview ? items.slice(0, 1) : [];
  const remaining = Math.max(0, post._count.replies - shown.length);
  async function more() {
    if (!user) {
      ui.auth();
      return;
    }
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await api<Page>(
        '/posts/' +
          post.id +
          '/replies?replyOrder=oldest&limit=5&cursor=' +
          encodeURIComponent(cursor),
      );
      setItems((old) => [...old, ...page.data.filter((p) => !old.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={'reply-branch depth-' + depth}
      data-reply-id={post.id}
      data-parent-id={parent.id}
      aria-label={'Reply by @' + post.author.username}
    >
      <div
        className={
          'conversation-row' + (depth ? ' has-parent' : '') + (shown.length ? ' has-child' : '')
        }
      >
        <PostCard
          post={post}
          replyTo={{ id: parent.id, username: parent.author.username }}
          onDeleted={onChanged}
          onReplied={() => {
            setVersion((v) => v + 1);
            onChanged();
          }}
        />
      </div>
      {shown.length > 0 && (
        <div className="reply-children">
          {shown.map((p, i) => (
            <div key={p.id} className={i ? 'alternate-reply' : ''}>
              <ReplyBranch
                post={p}
                parent={post}
                rootAuthor={rootAuthor}
                depth={depth + 1}
                onChanged={() => {
                  setVersion((v) => v + 1);
                  onChanged();
                }}
              />
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="branch-error">
          <ErrorBox message={error} retry={() => setVersion((n) => n + 1)} />
        </div>
      )}
      {remaining > 0 && (!expanded || !!cursor || !loaded || !user) && (
        <button
          type="button"
          className="text-button branch-more"
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? 'Loading…' : `Show ${remaining} more ${remaining === 1 ? 'reply' : 'replies'}`}
        </button>
      )}
    </section>
  );
}
function ReplyDock({ post }: { post: Post }) {
  const { user } = useSession();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.querySelector('.opened-post-composer');
    if (!target) return;
    const observer = new IntersectionObserver((entries) => setVisible(!entries[0].isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [post.id]);
  if (!user || !visible) return null;
  return (
    <button
      className="reply-dock"
      aria-label={'Reply to @' + post.author.username}
      onClick={() => {
        const composer = document.querySelector<HTMLElement>('.opened-post-composer');
        composer?.scrollIntoView({ block: 'center', behavior: 'instant' });
        composer?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
      }}
    >
      <Avatar user={user} />
      <span>Post your reply</span>
      <Send size={19} />
    </button>
  );
}
export function ConversationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  const [ancestors, setAncestors] = useState<{
    data: Post[];
    unavailable: boolean;
    earlierId: string | null;
  }>({ data: [], unavailable: false, earlierId: null });
  const [replies, setReplies] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPost(null);
    setReplies([]);
    setCursor(null);
    setAncestors({ data: [], unavailable: false, earlierId: null });
  }, [id, user?.id]);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    api<Post>('/posts/' + id, { signal: c.signal })
      .then(async (p) => {
        setPost(p);
        const [r, a] = await Promise.all([
          api<Page>('/posts/' + p.id + '/replies?replyOrder=oldest&limit=15', { signal: c.signal }),
          p.parentId
            ? api<typeof ancestors>('/posts/' + p.id + '/ancestors', { signal: c.signal })
            : Promise.resolve({ data: [], unavailable: false, earlierId: null }),
        ]);
        if (!c.signal.aborted) {
          setReplies(r.data);
          setCursor(r.nextCursor);
          setRequiresLogin(!!r.requiresLogin);
          setAncestors(a);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [id, refresh, user?.id]);
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const p = await api<Page>(
        '/posts/' + id + '/replies?replyOrder=oldest&limit=15&cursor=' + encodeURIComponent(cursor),
      );
      setReplies((old) => [...old, ...p.data.filter((p) => !old.some((x) => x.id === p.id))]);
      setCursor(p.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const changed = () => setRefresh((v) => v + 1);
  const parent = ancestors.data.at(-1);
  const owner = ancestors.data[0]?.author.id ?? post?.author.id ?? '';
  return (
    <>
      <div className="page-heading conversation-heading">
        <BackButton />
        <div>
          <h1>Post</h1>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {!post && !error && <p className="loading-message">Loading conversation…</p>}
      {post && (
        <>
          {ancestors.earlierId && (
            <Link className="branch-more text-button" to={'/posts/' + ancestors.earlierId}>
              View earlier context →
            </Link>
          )}
          {ancestors.unavailable && (
            <p className="page-panel muted">Earlier context is unavailable.</p>
          )}
          {ancestors.data.length > 0 && (
            <section className="ancestor-context" aria-label="Parent posts">
              {ancestors.data.map((a, i) => (
                <div className="ancestor-row" key={a.id}>
                  <PostCard
                    post={a}
                    replyTo={
                      i
                        ? {
                            id: ancestors.data[i - 1].id,
                            username: ancestors.data[i - 1].author.username,
                          }
                        : undefined
                    }
                  />
                </div>
              ))}
            </section>
          )}
          <PostCard
            detail
            post={post}
            replyTo={parent ? { id: parent.id, username: parent.author.username } : undefined}
            onDeleted={() => navigate('/home', { replace: true })}
            onReplied={changed}
          />
          <section className="opened-post-composer" aria-label="Reply to opened post">
            <div className="reply-composer-label">
              Replying to <Link to={'/u/' + post.author.username}>@{post.author.username}</Link>
            </div>
            <Composer compact key={post.id} parentId={post.id} onPublished={changed} />
          </section>
          <div className="feed-intro">
            <span>Replies</span>
          </div>
          {replies.map((p) => (
            <ReplyBranch key={p.id} post={p} parent={post} rootAuthor={owner} onChanged={changed} />
          ))}
          {!replies.length && !requiresLogin && <p className="page-panel muted">No replies yet.</p>}
          {cursor && (
            <div className="load-more">
              <button className="button secondary" disabled={busy} onClick={() => void more()}>
                {busy ? 'Loading…' : 'Show more replies'}
              </button>
            </div>
          )}
          {requiresLogin && <JoinPrompt />}
          <div className="mobile-conversation-people">
            <RelevantPeople />
          </div>
          <ReplyDock post={post} />
        </>
      )}
    </>
  );
}
