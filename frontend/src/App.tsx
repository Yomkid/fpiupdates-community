import { GoogleButton } from './GoogleAuth';
import { isPublicRoute, canShowMobileComposer } from './access-policy';
import { StartupScreen, VerifyEntry, ProfileCompletion } from './AccountEntry';
import { IdentitySettings, AccountNotices } from './Identity';
import { ManagedPage } from './ContentPages';
import { AdsPage } from './Ads';
import { PublicInfoPage, PageTitles } from './PublicInfo';
import { InstallPromotion } from './PWA';
import { OnboardingCard } from './Onboarding';
import { useFeatures, featureForPath, FeatureRoute } from './Features';
import { ContextPeople, PeoplePage, PeopleSuggestions, useSidebarPosition } from './People';
import { BrandMark } from './BrandMark';
import { MessageBadge } from './message-state';
import { GoogleSetup } from './GoogleAuth';
import { ActivityPage } from './Activity';
import { SearchPage } from './Search';
import { AppearanceSync } from './Appearance';
import { MoreMenu } from './MoreMenu';
import { BackButton, NavigationRestoration, safeNext } from './Navigation';
import { GuestBanner, StandaloneAuth, WelcomePage } from './AuthFlows';
import { useInteractions } from './interactions';
import { ConversationPage, RelevantPeople } from './Conversations';
import { SportsPage, MatchPage, SportsDesk, FeaturedSports } from './Sports';
import { RichProfilePage } from './Profile';
import { DiscoveryPanels, DiscoveryAdmin } from './Discovery';
import { StatsPage } from './Stats';
import { HashtagPage } from './Hashtags';
import {
  NotificationsPage,
  UnreadBadge,
  useNotifications,
  notificationLabel,
} from './Notifications';
import { SafetyControls, SafetySettings } from './Safety';
import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Navigate,
} from 'react-router-dom';
import {
  Bell,
  Newspaper,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  Feather,
  GraduationCap,
  Home,
  Info,
  LogOut,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  RefreshCw,
  UserRound,
  Users,
  UserPlus,
  X,
} from 'lucide-react';
import { api, mediaUrl, ApiError, errorMessage, type Community, type Post, type User } from './api';
import { Avatar, Composer, ErrorBox, PostCard, PostList } from './components';
import { useSession } from './session';
import {
  SettingsPage,
  RecoveryPage,
  BookmarksPage,
  CommunitiesPage,
  ArticlesPage,
  FollowButton,
  MyProfileRedirect,
  EditorialPage,
} from './FeaturePages';
import AdminPage from './AdminPage';
const MessagesPage = lazy(() => import('./Messages').then((m) => ({ default: m.MessagesPage })));
const MessageReportsPage = lazy(() =>
  import('./Messages').then((m) => ({ default: m.MessageReportsPage })),
);
function Brand() {
  return (
    <Link to="/" className="brand" aria-label="FpiUpdates home">
      <BrandMark />
      <div>
        FpiUpdates <b className="beta">BETA</b>
        <span>YOUR CAMPUS, CONNECTED.</span>
      </div>
    </Link>
  );
}
function Layout() {
  const sidebarRef = useSidebarPosition();
  const ui = useInteractions();
  const { flags } = useFeatures();
  const { unreadCount } = useNotifications();
  const session = useSession();
  const [menus, setMenus] = useState<{ key: string; label: string; path: string }[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<{ key: string; label: string; path: string }[]>('/navigation')
        .then((data) => {
          if (active) setMenus(data);
        })
        .catch(() => {});
    void load();
    window.addEventListener('navigation-updated', load);
    return () => {
      active = false;
      window.removeEventListener('navigation-updated', load);
    };
  }, [session.user]);
  const availableMenus = menus.filter((m) => {
    const key = featureForPath(m.path);
    return !key || flags[key];
  });
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const location = useLocation();
  const guest = !session.user;
  useEffect(() => {
    setError('');
  }, [location.pathname]);
  async function logout() {
    try {
      await session.logout();
      navigate('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function invite() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copy the address from your browser to invite a friend.');
    }
  }
  return (
    <div
      className={'site-layout' + (guest ? ' guest-layout' : '')}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
        if (
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          !e.altKey &&
          session.user &&
          a &&
          a.origin === locationOrigin() &&
          ['/', '/home'].includes(a.pathname) &&
          location.pathname === '/home'
        ) {
          e.preventDefault();
          window.dispatchEvent(new Event('home-refresh'));
          return;
        }
        if (
          !e.ctrlKey &&
          !e.metaKey &&
          !e.shiftKey &&
          !e.altKey &&
          !session.user &&
          a &&
          a.origin === locationOrigin() &&
          ['/login', '/register'].includes(a.pathname)
        ) {
          e.preventDefault();
          ui.auth(a.pathname === '/register' ? 'register' : 'login');
        }
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header
        className={'mobile-header' + (location.pathname === '/home' ? ' mobile-home-header' : '')}
      >
        {location.pathname === '/home' && session.user ? (
          <>
            <Link
              to={session.user ? '/u/' + session.user.username : '/login'}
              className="mobile-home-avatar"
              aria-label="Your profile"
            >
              {session.user ? <Avatar user={session.user} /> : <UserRound size={24} />}
            </Link>
            <Link to="/home" className="mobile-home-brand" aria-label="FpiUpdates home">
              <BrandMark />
              <strong>
                FpiUpdates <b className="beta">BETA</b>
              </strong>
            </Link>
          </>
        ) : (
          <Brand />
        )}
        <div className="mobile-header-actions">
          {session.user && menus.some((m) => m.path === '/notifications') && (
            <NavLink
              className="notification-bell"
              to="/notifications"
              aria-label={notificationLabel(unreadCount)}
            >
              <Bell size={23} />
              <UnreadBadge />
            </NavLink>
          )}
        </div>
      </header>
      <div className="app-shell">
        <aside className="left-sidebar">
          {guest ? (
            <Link to="/" className="guest-brand" aria-label="FpiUpdates home">
              <BrandMark />
            </Link>
          ) : (
            <Brand />
          )}
          {!guest && (
            <>
              <nav aria-label="Main navigation">
                {availableMenus
                  .filter((menu) =>
                    [
                      '/',
                      '/home',
                      '/search',
                      '/notifications',
                      '/me',
                      '/communities',
                      '/messages',
                      '/people',
                    ].includes(menu.path),
                  )
                  .map((menu) => (
                    <NavLink
                      key={menu.key}
                      to={menu.path}
                      end={['/', '/home'].includes(menu.path)}
                      aria-label={
                        menu.path === '/notifications' ? notificationLabel(unreadCount) : undefined
                      }
                    >
                      {menu.path === '/notifications' ? (
                        <Bell size={21} />
                      ) : ['/', '/home'].includes(menu.path) ? (
                        <Home size={21} />
                      ) : menu.path === '/messages' ? (
                        <MessageCircle size={21} />
                      ) : menu.path === '/me' ? (
                        <UserRound size={21} />
                      ) : menu.path === '/people' ? (
                        <UserPlus size={21} />
                      ) : menu.path === '/communities' ? (
                        <Users size={21} />
                      ) : (
                        <Compass size={21} />
                      )}
                      <span>{menu.label}</span>
                      {menu.path === '/notifications' && <UnreadBadge />}
                      {menu.path === '/messages' && <MessageBadge />}
                    </NavLink>
                  ))}
                <MoreMenu
                  menus={availableMenus.filter(
                    (menu) =>
                      ![
                        '/',
                        '/home',
                        '/search',
                        '/notifications',
                        '/me',
                        '/communities',
                        '/messages',
                        '/people',
                      ].includes(menu.path),
                  )}
                />
              </nav>
              <button
                disabled={session.loading}
                onClick={() => (session.user ? ui.compose() : ui.auth('register'))}
                className="button primary sidebar-cta"
              >
                <Feather size={18} />
                {session.user ? 'Post' : 'Join the community'}
              </button>
              <div className="sidebar-account">
                {session.user ? (
                  <>
                    <Link to={`/u/${session.user.username}`} className="account-person">
                      <Avatar user={session.user} />
                      <span>
                        <strong>{session.user.displayName}</strong>
                        <small>@{session.user.username}</small>
                      </span>
                    </Link>
                    <button
                      className="icon-button"
                      title="Sign out"
                      aria-label="Sign out"
                      onClick={() => void logout()}
                    >
                      <LogOut size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="guest-avatar small">F</span>
                    <span>
                      Already one of us?
                      <Link to="/login">
                        Sign in <ArrowUpRight size={13} />
                      </Link>
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </aside>
        <main id="main-content" className="main-column">
          {session.unavailable && (
            <ErrorBox
              message="We couldn’t check your session. You can retry when connected."
              retry={() => void session.refresh()}
            />
          )}
          {error && <ErrorBox message={error} />}
          <FeatureRoute>
            <Outlet />
          </FeatureRoute>
        </main>
        <aside className="right-sidebar" ref={sidebarRef}>
          {guest ? (
            <>
              <section className="guest-entry-card">
                <h2>Join FpiUpdates</h2>
                <p>Your people. Your updates. Join the conversation.</p>
                <GoogleButton />
                <Link className="button primary full" to="/register">
                  Create an account
                </Link>
                <Link className="button secondary full" to="/login">
                  Sign in
                </Link>
              </section>
              <RelevantPeople />
            </>
          ) : (
            <>
              <form
                className="search-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(`/search?q=${encodeURIComponent(search.trim())}`);
                }}
              >
                <Search size={18} />
                <label className="sr-only" htmlFor="sidebar-search">
                  Search FpiUpdates
                </label>
                <input
                  id="sidebar-search"
                  value={search}
                  maxLength={80}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search FpiUpdates"
                />
                <kbd>↵</kbd>
              </form>
              <RelevantPeople />
              <ContextPeople placement="top" />
              <DiscoveryPanels />
              <ContextPeople />
            </>
          )}
          <footer className="side-footer">
            <Link to="/about">About</Link> · <Link to="/help">Help</Link> ·{' '}
            <Link to="/install">Install app</Link> · <Link to="/privacy">Privacy</Link> ·{' '}
            <Link to="/terms">Terms</Link> · <Link to="/guidelines">Guidelines</Link> ·{' '}
            <Link to="/advertise">Advertising</Link>
            <p>
              Independent. Student-powered.
              <br />
              Not an official school platform.
            </p>
            <small>© {new Date().getFullYear()} FpiUpdates</small>
          </footer>
        </aside>
      </div>
      {!guest && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <NavLink to="/home" end>
            <Home size={21} />
            <span>Campus</span>
          </NavLink>
          <NavLink to="/search">
            <Search size={21} />
            <span>Explore</span>
          </NavLink>
          <NavLink to="/articles">
            <Newspaper size={21} />
            <span>Articles</span>
          </NavLink>
          <NavLink to={session.user ? `/u/${session.user.username}` : '/login'}>
            <UserRound size={21} />
            <span>Profile</span>
          </NavLink>
          <MoreMenu
            menus={availableMenus.filter(
              (m) => !['/home', '/', '/me', '/settings'].includes(m.path),
            )}
          />
        </nav>
      )}
      {canShowMobileComposer(location.pathname, session.user) && (
        <button
          disabled={session.loading}
          className="mobile-compose floating-compose"
          onClick={() => ui.compose()}
          aria-label="Write a post"
        >
          <Feather size={24} />
        </button>
      )}
      <GuestBanner />
    </div>
  );
}
function locationOrigin() {
  return window.location.origin;
}
function DiscoveryAdminRoute() {
  const { user } = useSession();
  return user?.permissions?.includes('discovery.manage') ? (
    <DiscoveryAdmin />
  ) : (
    <div className="page-panel">Discovery management permission required.</div>
  );
}
function Feed() {
  const { user } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [params, setParams] = useSearchParams();
  const mode = !user
    ? 'for-you'
    : params.get('mode') === 'following'
      ? 'following'
      : params.get('mode') === 'community'
        ? 'community'
        : 'for-you';
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityError, setCommunityError] = useState('');
  const [communityLoading, setCommunityLoading] = useState(true);
  const [chosen, setChosen] = useState(() => {
    try {
      return localStorage.getItem('fpi-community-' + user?.id) ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    const controller = new AbortController();
    api<Community[]>('/catalog/communities', { signal: controller.signal })
      .then((data) => setCommunities(data.filter((c) => c.joined)))
      .catch((e) => {
        if (!controller.signal.aborted) setCommunityError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommunityLoading(false);
      });
    return () => controller.abort();
  }, [user?.id]);
  const requested = params.get('communityId') ?? chosen;
  const current = communities.find((c) => c.id === requested) ?? communities[0];
  useEffect(() => {
    if (current) {
      setChosen(current.id);
      try {
        localStorage.setItem('fpi-community-' + user?.id, current.id);
      } catch {}
    }
  }, [current?.id, user?.id]);
  useEffect(() => {
    const refresh = () => {
      setParams({}, { replace: true });
      setRefresh((n) => n + 1);
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    };
    window.addEventListener('home-refresh', refresh);
    return () => window.removeEventListener('home-refresh', refresh);
  }, [setParams]);
  useEffect(() => {
    if (params.has('compose'))
      document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
  }, [params]);
  const endpoint =
    mode === 'community'
      ? current
        ? '/posts?communityId=' + current.id
        : null
      : '/posts?mode=' + mode;
  return (
    <>
      <div className="home-timeline-header">
        <h1 className="sr-only">Home</h1>
        <div className="feature-tabs feed-tabs" aria-label="Home timelines">
          {(user ? ['for-you', 'following'] : ['for-you']).map((value) => (
            <button
              key={value}
              className={mode === value ? 'active' : ''}
              aria-pressed={mode === value}
              onClick={() => {
                if (mode === value) {
                  setRefresh((n) => n + 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else setParams(value === 'for-you' ? {} : { mode: value });
              }}
            >
              {value === 'for-you' ? 'For you' : 'Following'}
            </button>
          ))}
          {user && (
            <div className={'community-feed-tab ' + (mode === 'community' ? 'active' : '')}>
              <button
                className="community-tab-label"
                aria-pressed={mode === 'community'}
                onClick={() =>
                  setParams({ mode: 'community', ...(current ? { communityId: current.id } : {}) })
                }
              >
                {current?.name ?? (communityLoading ? 'Loading…' : 'Your communities')}
              </button>
              <select
                aria-label="Switch community feed"
                value={current?.id ?? ''}
                disabled={!communities.length}
                onChange={(e) => {
                  setChosen(e.target.value);
                  setParams({ mode: 'community', communityId: e.target.value });
                }}
              >
                <option value="" disabled>
                  Choose a community
                </option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">▾</span>
            </div>
          )}
        </div>
        <button
          className="icon-button feed-refresh"
          aria-label="Refresh feed"
          title="Refresh feed"
          onClick={() => {
            setRefresh((n) => n + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <RefreshCw size={19} />
        </button>
      </div>
      {user && !user.emailVerified && (
        <section className="email-participation-note">
          <strong>Confirm your email to join in</strong>
          <p>You can read public conversations now.</p>
          <Link className="content-link" to="/check-email?next=%2Fhome">
            Verify your email →
          </Link>
        </section>
      )}
      <AccountNotices />
      <ProfileCompletion />
      <OnboardingCard />
      <InstallPromotion />
      {mode === 'community' && communityError && <ErrorBox message={communityError} />}
      {user?.emailVerified && (mode !== 'community' || current) ? (
        <Composer
          key={mode === 'community' ? current?.id : 'public'}
          communityId={mode === 'community' ? current?.id : undefined}
          onPublished={() => {
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      <div className="feed-announcements">
        <DiscoveryPanels announcementsOnly />
      </div>
      <div className="feed-featured-sports">
        <FeaturedSports placement="feed" />
      </div>
      {endpoint ? (
        <PostList live endpoint={endpoint} refreshKey={refresh} />
      ) : (
        <div className="empty-state">
          <h2>{communityLoading ? 'Loading communities…' : 'Choose your community'}</h2>
          <p>Join a community to add its feed here.</p>
          <Link className="button primary" to="/communities">
            Explore communities
          </Link>
        </div>
      )}
      <div className="mobile-follow-suggestions">
        <PeopleSuggestions />
      </div>
      <div className="feed-end">Made for the people who make Ilaro.</div>
    </>
  );
}

function AboutPage() {
  return (
    <>
      <div className="page-heading">
        <BackButton />
        <div>
          <h1>A place for all of us.</h1>
          <p>Rooted in Ilaro. Open to every chapter.</p>
        </div>
      </div>
      <section className="about-hero">
        <span className="eyebrow">OUR COMMUNITY</span>
        <h2>
          The campus changes.
          <br />
          The connections stay.
        </h2>
        <p>
          FpiUpdates brings students, aspirants and alumni together to share everyday moments, find
          useful answers and stay connected to Ilaro.
        </p>
      </section>
      <section className="about-content">
        <p className="emoji-attribution">
          Emoji artwork:{' '}
          <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer">
            Twemoji
          </a>{' '}
          by Twitter and contributors, licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0
          </a>
          . SVG artwork is unchanged; picker artwork is arranged into a sprite.
        </p>
        <h2>Our story</h2>
        <p>
          FpiUpdates began as a website built from scratch by Odewaye Mayomi Peter, using PHP, HTML,
          CSS, JavaScript and MySQL. It became a familiar source of updates within the Ilaro
          community around 2022–2024.
        </p>
        <p>
          After the original website went offline, work began in 2026 to rebuild it as a community:
          a place for conversations, articles and connections between students, aspirants, alumni
          and people around Ilaro. Ilaro is our starting point, with room to grow.
        </p>
        <h2>Meet the founder</h2>
        <p>
          Odewaye Mayomi Peter is a Computer Engineering graduate of Federal Polytechnic Ilaro and
          founder of OMPPEAK Technology. FpiUpdates grew from his interest in making useful
          information and community connections easier to find.
        </p>
        <h2>Come as you are.</h2>
        <p>
          Your first admission question. Your last examination. Your favourite campus memory.
          There’s room for all of it here.
        </p>
        <h2>A few things we ask</h2>
        <ol>
          <li>
            <strong>Respect the person behind the post.</strong> Disagree with ideas without threats
            or harassment.
          </li>
          <li>
            <strong>Share responsibly.</strong> Check sources before presenting information as fact.
            Do not impersonate people or school officials.
          </li>
          <li>
            <strong>Keep people safe.</strong> No scams, private personal details or dangerous
            content. Use the report option when something is wrong.
          </li>
        </ol>
        <div className="about-notice">
          <Info size={21} />
          <div>
            <strong>Independent, always.</strong>
            <p>
              FpiUpdates is not an official school website. Confirm admission requirements, payments
              and deadlines through the institution’s official channels.
            </p>
          </div>
        </div>
        <h2>We’re building this together.</h2>
        <p>
          This early beta supports text conversations and profiles. Reports can be reviewed through
          the moderator dashboard. Moderator staffing and response procedures must be arranged
          before public launch. It is not an emergency service. Public launch will follow further
          safety, privacy and reliability work.
        </p>
        <Link className="button primary" to="/">
          Back to campus <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
function NotFound() {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Compass size={30} />
      </span>
      <h1>A little off campus?</h1>
      <p>We couldn’t find that page.</p>
      <Link className="button primary" to="/">
        Back to campus <ArrowRight size={16} />
      </Link>
    </div>
  );
}
function HomeFeed() {
  const { user, loading } = useSession();
  if (loading) return <p className="loading-message">Loading…</p>;
  return <Feed />;
}
export default function App() {
  const session = useSession();
  const location = useLocation();
  if (session.loading) return <StartupScreen />;
  if (session.user && !session.user.emailVerified && !isPublicRoute(location.pathname))
    return <VerifyEntry />;
  return (
    <>
      <AppearanceSync />
      <PageTitles />
      <NavigationRestoration />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/auth/google/setup" element={<GoogleSetup />} />
        <Route path="/login" element={<StandaloneAuth />} />
        <Route path="/register" element={<StandaloneAuth register />} />
        <Route
          path="/check-email"
          element={
            session.user && !session.user.emailVerified ? (
              <VerifyEntry />
            ) : (
              <Navigate to={safeNext(new URLSearchParams(location.search).get('next'))} replace />
            )
          }
        />
        <Route element={<Layout />}>
          <Route path="ads" element={<AdsPage />} />
          <Route path="admin/ads" element={<AdsPage review />} />
          <Route path="home" element={<HomeFeed />} />
          <Route path="sports" element={<SportsPage />} />
          <Route path="sports/desk" element={<SportsDesk />} />
          <Route path="sports/matches/:id" element={<MatchPage />} />
          <Route path="sports/:id" element={<SportsPage />} />
          <Route path="admin/discovery" element={<DiscoveryAdminRoute />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="admin/analytics" element={<StatsPage admin />} />
          <Route
            path="messages"
            element={
              <Suspense fallback={<p className="page-panel">Loading messages…</p>}>
                <MessagesPage />
              </Suspense>
            }
          />
          <Route
            path="messages/:id"
            element={
              <Suspense fallback={<p className="page-panel">Loading messages…</p>}>
                <MessagesPage />
              </Suspense>
            }
          />
          <Route
            path="admin/message-reports"
            element={
              <Suspense fallback={<p className="page-panel">Loading reports…</p>}>
                <MessageReportsPage />
              </Suspense>
            }
          />
          <Route path="notifications/posts" element={<ActivityPage subscribed />} />
          <Route path="notifications/activity/:id" element={<ActivityPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="tags" element={<HashtagPage />} />
          <Route path="tags/:tag" element={<HashtagPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="u/:username" element={<RichProfilePage />} />
          <Route path="posts/:id" element={<ConversationPage />} />
          <Route path="about" element={<ManagedPage />} />
          <Route path="faq" element={<ManagedPage />} />
          {[
            'help-verification',
            'help-usernames',
            'help-email',
            'help-posting',
            'help-safety',
            'help-notifications',
            'help-contact',
          ].map((path) => (
            <Route key={path} path={path} element={<ManagedPage />} />
          ))}
          <Route path="help/:article" element={<ManagedPage />} />
          <Route path="settings/verification" element={<IdentitySettings />} />
          <Route path="install" element={<PublicInfoPage />} />
          <Route path="help" element={<ManagedPage />} />
          <Route path="privacy" element={<ManagedPage />} />
          <Route path="terms" element={<ManagedPage />} />
          <Route path="guidelines" element={<ManagedPage />} />
          <Route path="advertise" element={<PublicInfoPage />} />
          <Route path="settings/safety" element={<SafetySettings />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="me" element={<MyProfileRedirect />} />
          <Route path="bookmarks" element={<BookmarksPage />} />
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="communities/:slug" element={<CommunitiesPage />} />
          <Route path="articles" element={<ArticlesPage />} />
          <Route path="articles/:slug" element={<ArticlesPage />} />
          <Route path="editorial" element={<EditorialPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="forgot-password" element={<RecoveryPage mode="forgot" />} />
          <Route path="reset-password" element={<RecoveryPage key="reset" mode="reset" />} />
          <Route path="verify-email" element={<RecoveryPage key="verify" mode="verify" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
