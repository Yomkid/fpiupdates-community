import { ImageLightbox } from './ImageTools';
import { ProfileMenu } from './ProfileMenu';
import { FollowAction } from './Conversations';
import { MessageProfileButton } from './message-controls';
import { ProfileAlerts } from './Conversations';
import { BackButton } from './Navigation';
import { useInteractions } from './interactions';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, CalendarDays, Link as LinkIcon, Pin, Search } from 'lucide-react';
import { api, errorMessage, mediaUrl, type User, type Post, type Article } from './api';
import { Avatar, ErrorBox, Modal, PostCard, PostList, LinkText, BioText } from './components';
import { FollowButton } from './FeaturePages';
import { useSession } from './session';
type Mutual = { total: number; data: User[]; nextCursor: string | null };
type Profile = User & { pinnedPost?: Post | null; postCount?: number; followsYou?: boolean };
function Connections({
  username,
  kind,
  onClose,
}: {
  username: string;
  kind: 'followers' | 'following' | 'known';
  onClose: () => void;
}) {
  const [rows, setRows] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load(next?: string) {
    setLoading(true);
    setError('');
    try {
      const path =
        kind === 'known'
          ? '/people/mutual/' +
            encodeURIComponent(username) +
            '?limit=30' +
            (next ? '&before=' + encodeURIComponent(next) : '')
          : `/users/${encodeURIComponent(username)}/${kind}?limit=30` +
            (next ? '&cursor=' + encodeURIComponent(next) : '');
      const page = await api<{ data: User[]; nextCursor: string | null }>(path);
      setRows((old) =>
        next ? [...old, ...page.data.filter((r) => !old.some((u) => u.id === r.id))] : page.data,
      );
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [username, kind]);
  return (
    <Modal
      title={
        kind === 'known' ? 'Followers you know' : kind === 'followers' ? 'Followers' : 'Following'
      }
      onClose={onClose}
    >
      <div className="connection-list">
        {rows.map((u) => (
          <div className="connection-person" key={u.id}>
            <Link to={'/u/' + u.username} onClick={onClose}>
              <Avatar user={u} />
              <span>
                <strong>{u.displayName}</strong>
                <small>@{u.username}</small>
              </span>
            </Link>
            <FollowAction author={u} />
          </div>
        ))}
        {!rows.length && !loading && !error && <p>No accounts to show yet.</p>}
        {loading && <p role="status">Loading people…</p>}
        {error && <ErrorBox message={error} retry={() => void load(cursor ?? undefined)} />}{' '}
        {cursor && (
          <button disabled={loading} className="button secondary" onClick={() => void load(cursor)}>
            More people
          </button>
        )}
      </div>
    </Modal>
  );
}
export function RichProfilePage() {
  const [viewImage, setViewImage] = useState<{ src: string; alt: string } | null>(null);
  const ui = useInteractions();
  const { username = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'posts';
  const session = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [connections, setConnections] = useState<'followers' | 'following' | 'known' | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setProfile(null);
    setError('');
    setConnections(null);
    api<Profile>('/users/' + encodeURIComponent(username), { signal: c.signal })
      .then(setProfile)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [username, refresh, session.user?.id]);
  useEffect(() => {
    if (tab !== 'articles') return;
    const c = new AbortController();
    setArticles([]);
    setLoadingArticles(true);
    api<Article[]>('/users/' + encodeURIComponent(username) + '/articles', { signal: c.signal })
      .then(setArticles)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoadingArticles(false);
      });
    return () => c.abort();
  }, [username, tab, refresh]);
  useEffect(() => {
    const changed = () => setRefresh((n) => n + 1);
    window.addEventListener('profile-updated', changed);
    return () => window.removeEventListener('profile-updated', changed);
  }, []);
  const [mutual, setMutual] = useState<Mutual | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setMutual(null);
    const load = () => {
      if (session.user && profile && !profile.blocked && profile.id !== session.user.id)
        api<Mutual>('/people/mutual/' + encodeURIComponent(username), { signal: c.signal })
          .then(setMutual)
          .catch(() => {});
    };
    load();
    window.addEventListener('follow-updated', load);
    return () => {
      c.abort();
      window.removeEventListener('follow-updated', load);
    };
  }, [username, profile?.id, profile?.blocked, session.user?.id]);
  const own = profile?.id === session.user?.id;
  return (
    <>
      <div className="page-heading profile-heading">
        <BackButton />
        <div className="heading-grow">
          <h1>{profile?.displayName ?? 'Profile'}</h1>
          <p>
            {profile
              ? `${(profile.postCount ?? 0).toLocaleString()} ${profile.postCount === 1 ? 'post' : 'posts'}`
              : 'Community profile'}
          </p>
        </div>
        {profile && !profile.blocked && (
          <Link
            className="icon-button"
            aria-label={'Search posts by @' + profile.username}
            title="Search this profile"
            to={'/search?q=' + encodeURIComponent('from:' + profile.username)}
          >
            <Search size={20} />
          </Link>
        )}
      </div>
      {error && <ErrorBox message={error} />}{' '}
      {!profile && !error && (
        <p className="page-panel" role="status">
          Loading profile…
        </p>
      )}
      {profile && (
        <>
          <div className="profile-cover rich-profile-cover">
            {profile.profileCoverMediaId ? (
              <button
                className="profile-cover-view"
                aria-label="View profile cover"
                onClick={() =>
                  setViewImage({
                    src: mediaUrl(profile.profileCoverMediaId!),
                    alt: profile.displayName + ' profile cover',
                  })
                }
              >
                <img src={mediaUrl(profile.profileCoverMediaId)} alt="Profile cover" />
              </button>
            ) : (
              <span>YOUR PEOPLE. YOUR COMMUNITY.</span>
            )}
          </div>
          <section className="profile-details rich-profile-details">
            <div className="profile-avatar-actions">
              <button
                className="profile-avatar-view"
                aria-label="View profile picture"
                disabled={!profile.avatarMediaId}
                onClick={() =>
                  profile.avatarMediaId &&
                  setViewImage({
                    src: mediaUrl(profile.avatarMediaId),
                    alt: profile.displayName + ' profile picture',
                  })
                }
              >
                <Avatar user={profile} large />
              </button>
              <div>
                {own ? (
                  <Link className="button secondary" to="/settings">
                    Edit profile
                  </Link>
                ) : (
                  <>
                    <MessageProfileButton account={profile} />
                    <ProfileAlerts accountId={profile.id} />
                    <ProfileMenu account={profile} onChange={() => setRefresh((n) => n + 1)} />
                    {!profile.blocked && (
                      <FollowButton
                        profile={profile}
                        onChange={() =>
                          setProfile((p) =>
                            p
                              ? {
                                  ...p,
                                  isFollowing: !p.isFollowing,
                                  followers: Math.max(
                                    0,
                                    (p.followers ?? 0) + (p.isFollowing ? -1 : 1),
                                  ),
                                }
                              : p,
                          )
                        }
                      />
                    )}
                  </>
                )}
              </div>
            </div>
            <h2>{profile.displayName}</h2>
            <p className="profile-handle">
              @{profile.username} {profile.followsYou && <span className="pill">Follows you</span>}
            </p>
            {!profile.blocked && (
              <>
                {profile.bio && (
                  <div className="profile-bio">
                    <BioText text={profile.bio} />
                  </div>
                )}
                <div className="profile-meta">
                  {profile.campusIdentity && (
                    <span>
                      {
                        (
                          {
                            STUDENT: 'Student',
                            ASPIRANT: 'Aspirant',
                            ALUMNUS: 'Alumnus',
                            STAFF: 'Staff',
                            RESIDENT: 'Resident',
                            OTHER: 'Community member',
                          } as Record<string, string>
                        )[profile.campusIdentity]
                      }
                    </span>
                  )}
                  {profile.occupation && (
                    <span className="profile-occupation">{profile.occupation}</span>
                  )}
                  {profile.department && <span>{profile.department}</span>}
                  {profile.location && (
                    <span>
                      <MapPin size={15} />
                      {profile.location}
                    </span>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                    >
                      <LinkIcon size={15} />
                      {profile.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {profile.createdAt && (
                    <span>
                      <CalendarDays size={15} />
                      Joined{' '}
                      {new Date(profile.createdAt).toLocaleDateString('en-NG', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                {(profile.skills?.length ?? 0) > 0 && (
                  <div className="profile-skills" aria-label="Skills">
                    {profile.skills!.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                )}
                <div className="profile-counts">
                  <button
                    onClick={() =>
                      session.user
                        ? setConnections('following')
                        : ui.auth('login', () => setConnections('following'))
                    }
                  >
                    <strong>{profile.following ?? 0}</strong> Following
                  </button>
                  <button
                    onClick={() =>
                      session.user
                        ? setConnections('followers')
                        : ui.auth('login', () => setConnections('followers'))
                    }
                  >
                    <strong>{profile.followers ?? 0}</strong> Followers
                  </button>
                </div>
                {mutual && mutual.total > 0 && (
                  <button className="mutual-followers" onClick={() => setConnections('known')}>
                    <span className="mutual-avatars">
                      {mutual.data.map((u) => (
                        <Avatar key={u.id} user={u} />
                      ))}
                    </span>
                    <span>
                      Followed by{' '}
                      {mutual.data.slice(0, 2).map((u, i) => (
                        <span key={u.id}>
                          {i ? (mutual.total === 2 ? ' and ' : ', ') : ''}
                          <strong>{u.displayName}</strong>
                        </span>
                      ))}
                      {mutual.total > 2
                        ? ` and ${mutual.total - 2} ${mutual.total === 3 ? 'other' : 'others'} you follow`
                        : ''}
                    </span>
                  </button>
                )}
              </>
            )}
          </section>
          {profile.blocked ? (
            <p className="page-panel">You have blocked this account. Unblock to see its posts.</p>
          ) : (
            <>
              <div
                className="feature-tabs profile-tabs"
                role="navigation"
                aria-label="Profile content"
              >
                {['posts', 'replies', 'media', 'articles'].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? 'active' : ''}
                    onClick={() =>
                      !session.user && t !== 'posts'
                        ? ui.auth('login', () => setParams({ tab: t }))
                        : setParams(t === 'posts' ? {} : { tab: t })
                    }
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {tab === 'posts' && profile.pinnedPost && (
                <section className="pinned-post">
                  <p>
                    <Pin size={14} />
                    Pinned
                  </p>
                  <PostCard post={profile.pinnedPost} />
                </section>
              )}
              {tab === 'articles' ? (
                <div className="page-panel">
                  {loadingArticles ? (
                    <p>Loading articles…</p>
                  ) : articles.length ? (
                    articles.map((a) => (
                      <article className="article-summary" key={a.id}>
                        {a.coverMediaId && (
                          <Link to={'/articles/' + a.slug}>
                            <img
                              className="article-cover-card"
                              src={mediaUrl(a.coverMediaId)}
                              alt={a.coverAlt ?? ''}
                            />
                          </Link>
                        )}
                        <h2>
                          <Link to={'/articles/' + a.slug}>{a.title}</Link>
                        </h2>
                        <p>{a.excerpt}</p>
                        <Link className="text-button" to={'/articles/' + a.slug}>
                          Read article →
                        </Link>
                      </article>
                    ))
                  ) : (
                    <p>No published articles yet.</p>
                  )}
                </div>
              ) : (
                <PostList
                  endpoint={
                    `/users/${encodeURIComponent(username)}/posts` +
                    (['replies', 'media'].includes(tab) ? '?profileTab=' + tab : '')
                  }
                  refreshKey={refresh}
                  emptyTitle="Nothing here yet"
                  emptyText={`This member’s ${tab} will appear here.`}
                />
              )}
            </>
          )}
          {viewImage && (
            <ImageLightbox
              src={viewImage.src}
              alt={viewImage.alt}
              onClose={() => setViewImage(null)}
            />
          )}
          {connections && (
            <Connections
              username={username}
              kind={connections}
              onClose={() => setConnections(null)}
            />
          )}
        </>
      )}
    </>
  );
}
