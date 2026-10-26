import { OccupationFields, GenderField, parseSkills } from './OccupationFields';
import { BrandMark } from './BrandMark';
import { GoogleButton } from './GoogleAuth';
import { useEffect, useRef, useState, useId, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage, type Topic, type User } from './api';
import { Composer, ErrorBox, Modal } from './components';
import { InterestChoices } from './FeaturePages';
import { UsernameField, PersonalFields } from './ProfileFields';
import { useSession } from './session';
import { InteractionContext, useInteractions } from './interactions';
import { BackButton, safeNext } from './Navigation';

function AuthForm({
  register,
  onMode,
  onSuccess,
}: {
  register: boolean;
  onMode: (register: boolean) => void;
  onSuccess: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  const googleStatus = new URLSearchParams(location.search).get('google');
  const session = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsError, setTopicsError] = useState(false);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [chosen, setChosen] = useState('');
  const [account, setAccount] = useState({
    displayName: '',
    email: '',
    password: '',
    dateOfBirth: '',
    phoneNumber: '',
    location: '',
    gender: '',
    occupation: '',
    skills: [] as string[],
  });
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const dialog = heading.closest('dialog');
    if (dialog) dialog.scrollTop = 0;
    else window.scrollTo(0, 0);
  }, [step, register]);
  useEffect(() => {
    if (register)
      api<Topic[]>('/catalog/topics')
        .then(setTopics)
        .catch(() => setTopicsError(true));
    setStep(0);
    setError('');
  }, [register]);
  useEffect(() => {
    if (!register || step !== 1 || !account.displayName) return;
    const c = new AbortController();
    api<string[]>('/auth/username-suggestions?name=' + encodeURIComponent(account.displayName), {
      signal: c.signal,
    })
      .then(setSuggestions)
      .catch(() => {});
    return () => c.abort();
  }, [step, register, account.displayName]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    const f = new FormData(e.currentTarget);
    if (register && step === 0) {
      setStep(1);
      return;
    }
    if (register && step === 1) {
      setBusy(true);
      try {
        const name = String(f.get('username') ?? '')
          .trim()
          .toLowerCase();
        const available = await api<{ available: boolean }>(
          '/auth/username-availability?username=' + encodeURIComponent(name),
        );
        if (!available.available)
          throw Error('That username is unavailable. Choose another one below.');
        setChosen(name);
        setStep(2);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (register && step === 2) {
      setAccount((a) => ({
        ...a,
        dateOfBirth: String(f.get('dateOfBirth') ?? ''),
        phoneNumber: String(f.get('phoneNumber') ?? ''),
        location: String(f.get('location') ?? ''),
        gender: String(f.get('gender') ?? ''),
        occupation: String(f.get('occupation') ?? ''),
        skills: parseSkills(f.get('skills')),
      }));
      setStep(3);
      return;
    }
    setBusy(true);
    try {
      const registration = {
        displayName: account.displayName,
        email: account.email,
        password: account.password,
        username: chosen,
        topicIds,
        ...Object.fromEntries(
          Object.entries(account).filter(
            ([key, value]) => !['displayName', 'email', 'password'].includes(key) && value !== '',
          ),
        ),
      };
      await api('/auth/browser/' + (register ? 'register' : 'login'), {
        method: 'POST',
        body: JSON.stringify(
          register
            ? registration
            : { identifier: f.get('identifier'), password: f.get('password') },
        ),
      });
      const me = await api<User>('/auth/me');
      session.setUser(me);
      onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const headings = [
    'Create your account',
    'Choose your username',
    'A little about you',
    'What interests you?',
  ];
  const descriptions = [
    'Your name, email and a secure password.',
    'Choose the @name people will use to find you.',
    'Everything here is optional. You can update it in Settings.',
    'Choose a few topics, or start exploring and pick them later.',
  ];
  return (
    <div className="account-form">
      <h1 ref={headingRef} tabIndex={-1}>
        {register ? headings[step] : 'Welcome back'}
      </h1>
      <p>{register ? descriptions[step] : 'Sign in to continue the conversation.'}</p>
      {googleStatus && (
        <p className="auth-provider-note">
          {googleStatus === 'existing'
            ? 'An account already uses that email. Sign in, then connect Google in Settings.'
            : 'Google sign-in was cancelled or could not be completed. Please try again.'}
        </p>
      )}
      {(!register || step === 0) && <GoogleButton />}
      {register && (
        <div className="signup-progress" aria-label={`Step ${step + 1} of 4`}>
          <span>Step {step + 1} of 4</span>
          <div>
            {headings.map((h, i) => (
              <span key={h} className={i <= step ? 'complete' : ''} />
            ))}
          </div>
        </div>
      )}
      <form key={register ? 'register-' + step : 'login'} onSubmit={submit}>
        {register ? (
          step === 0 ? (
            <>
              <AccountField
                label="Display name"
                name="displayName"
                autoComplete="name"
                value={account.displayName}
                onChange={(v) => setAccount((a) => ({ ...a, displayName: v }))}
                maxLength={80}
                helper="Use the name you want people to see."
              />
              <AccountField
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                value={account.email}
                onChange={(v) => setAccount((a) => ({ ...a, email: v }))}
                maxLength={254}
                helper="We will send verification instructions here."
              />
              <AccountField
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={account.password}
                onChange={(v) => setAccount((a) => ({ ...a, password: v }))}
                minLength={12}
                maxLength={128}
                helper="Use at least 12 characters."
              />
            </>
          ) : step === 1 ? (
            <>
              <UsernameField key={chosen} initial={chosen} />
              {suggestions.length > 0 && (
                <div className="username-suggestions">
                  <span>Try an available name</span>
                  {suggestions.map((name) => (
                    <button type="button" key={name} onClick={() => setChosen(name)}>
                      @{name}
                    </button>
                  ))}
                </div>
              )}
              <p className="form-note">
                You can change this later. A username is reserved when your account is created.
              </p>
            </>
          ) : step === 2 ? (
            <div className="signup-optional-fields">
              <PersonalFields user={account} />
              <GenderField value={account.gender} />
              <OccupationFields user={account} />
            </div>
          ) : (
            <>
              <InterestChoices topics={topics} selected={topicIds} onChange={setTopicIds} />
              {topicsError && (
                <p className="form-feedback info">
                  Topics could not load. You can choose them later in Settings.
                </p>
              )}
              <p className="form-note">
                No topics selected? Your feed will still show conversations across FpiUpdates. Next,
                you can discover people to follow.
              </p>
              <label className="checkbox-label">
                <input type="checkbox" required />I agree to the{' '}
                <a href="/about" target="_blank" rel="noopener noreferrer">
                  community guidelines
                </a>
                .
              </label>
            </>
          )
        ) : (
          <>
            <AccountField
              label="Email or username"
              name="identifier"
              autoComplete="username"
              maxLength={254}
            />
            <AccountField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
            <Link className="text-button" to="/forgot-password">
              Forgot password?
            </Link>
          </>
        )}
        {error && (
          <p className="form-feedback error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy
            ? 'Please wait…'
            : register
              ? step < 3
                ? 'Next'
                : 'Create your account'
              : 'Sign in'}
        </button>
        {register && step === 2 && (
          <button
            className="button secondary full"
            type="button"
            onClick={() => {
              setAccount((a) => ({
                ...a,
                dateOfBirth: '',
                phoneNumber: '',
                location: '',
                gender: '',
                occupation: '',
                skills: [],
              }));
              setStep(3);
            }}
          >
            Skip for now
          </button>
        )}
        {register && step > 0 && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setError('');
              setStep((s) => s - 1);
            }}
          >
            Previous step
          </button>
        )}
      </form>
      <p className="auth-switch">
        {register ? 'Already have an account?' : 'New here?'}{' '}
        <button className="text-button" onClick={() => onMode(!register)}>
          {register ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  );
}
function AccountField({
  label,
  name,
  type = 'text',
  helper,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  helper?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}) {
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const id = useId();
  return (
    <label>
      {label}
      <input
        {...props}
        id={id}
        name={name}
        aria-label={label}
        type={type}
        required
        aria-describedby={id + '-hint'}
        aria-invalid={!!message}
        onInvalid={(e) => {
          setTouched(true);
          setMessage(e.currentTarget.validationMessage);
        }}
        onBlur={(e) => {
          setTouched(true);
          setMessage(e.currentTarget.validationMessage);
        }}
        onChange={(e) => {
          props.onChange?.(e.target.value);
          if (touched) setMessage(e.currentTarget.validationMessage);
        }}
      />
      <small
        id={id + '-hint'}
        className={'field-hint ' + (message ? 'field-error' : touched ? 'field-success' : '')}
        role={message ? 'alert' : undefined}
      >
        {message || (touched ? '✓ Looks good.' : helper)}
      </small>
    </label>
  );
}

export function InteractionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [auth, setAuth] = useState<'login' | 'register' | null>(null);
  const [compose, setCompose] = useState(false);
  const [composerStarted, setComposerStarted] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const onSuccess = useRef<(() => void) | undefined>(undefined);
  const returnTo = useRef('/home');
  useEffect(() => {
    setAuth(null);
    setCompose(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!session.user) {
      setCompose(false);
      setComposerStarted(false);
      setComposerKey((n) => n + 1);
    }
  }, [session.user?.id]);
  function openAuth(mode: 'login' | 'register' = 'login', done?: () => void) {
    returnTo.current =
      location.pathname === '/' ? '/home' : location.pathname + location.search + location.hash;
    onSuccess.current = done;
    setAuth(mode);
  }
  function success() {
    setAuth(null);
    const done = onSuccess.current;
    onSuccess.current = undefined;
    if (location.pathname === '/' || /^\/(login|register)$/.test(location.pathname))
      navigate(safeNext(returnTo.current), { replace: true });
    done?.();
  }
  function openCompose() {
    if (session.loading) return;
    if (session.user) {
      setComposerStarted(true);
      setCompose(true);
    } else
      openAuth('login', () => {
        setComposerStarted(true);
        setCompose(true);
      });
  }
  return (
    <InteractionContext.Provider value={{ auth: openAuth, compose: openCompose }}>
      {children}
      {auth && (
        <Modal
          title={auth === 'register' ? 'Create your account' : 'Sign in'}
          onClose={() => {
            setAuth(null);
            onSuccess.current = undefined;
          }}
        >
          <AuthForm
            register={auth === 'register'}
            onMode={(r) => setAuth(r ? 'register' : 'login')}
            onSuccess={success}
          />
        </Modal>
      )}
      {session.user && composerStarted && (
        <Modal open={compose} wide title="Create a post" onClose={() => setCompose(false)}>
          <p className="draft-note">Closing keeps this draft while this tab is open.</p>
          <Composer
            key={session.user.id + '-' + composerKey}
            autoFocus={compose}
            onPublished={() => {
              setCompose(false);
              window.dispatchEvent(new Event('feed-updated'));
            }}
          />
          <button
            className="text-button discard-composer"
            onClick={() => setComposerKey((n) => n + 1)}
          >
            Discard draft
          </button>
        </Modal>
      )}
    </InteractionContext.Provider>
  );
}
export function StandaloneAuth({ register = false }: { register?: boolean }) {
  const [params] = useSearchParams();
  const session = useSession();
  const navigate = useNavigate();
  const destination = safeNext(params.get('next'));
  if (session.user) return <Navigate to={destination} replace />;
  return (
    <main className="standalone-auth">
      <BackButton />
      <Link className="auth-wordmark" to="/">
        FpiUpdates <span className="beta">BETA</span>
      </Link>
      <AuthForm
        register={register}
        onMode={(r) =>
          navigate((r ? '/register' : '/login') + '?next=' + encodeURIComponent(destination), {
            replace: true,
          })
        }
        onSuccess={() => navigate(destination, { replace: true })}
      />
    </main>
  );
}
export function WelcomePage() {
  const { user, loading } = useSession();
  const ui = useInteractions();
  if (loading) return <p className="loading-message">Loading FpiUpdates…</p>;
  if (user) return <Navigate to="/home" replace />;
  return (
    <main className="welcome-page">
      <section className="welcome-entry">
        <Link className="welcome-wordmark" to="/">
          FpiUpdates <span className="beta">BETA</span>
        </Link>
        <h1>
          Your people.
          <br />
          Your updates.
        </h1>
        <p>
          Conversations, campus stories and connections.
          <br />
          Rooted in Ilaro. Open to your next chapter.
        </p>
        <Link className="button primary full" to="/register">
          Create your account
        </Link>
        <span className="welcome-or">Already part of the community?</span>
        <Link className="button secondary full" to="/login">
          Sign in
        </Link>
        <p className="welcome-discover">
          <Link to="/search">Explore conversations</Link> ·{' '}
          <Link to="/articles">Read articles</Link> · <Link to="/sports">Campus sports</Link>
        </p>
      </section>
      <div className="welcome-brand-art" aria-hidden="true">
        <BrandMark large />
      </div>
      <footer>
        <Link to="/about">About & guidelines</Link>
        <Link to="/stats">Platform stats</Link>
        <span>Independent community platform · © {new Date().getFullYear()} FpiUpdates</span>
      </footer>
    </main>
  );
}
export function GuestBanner() {
  const { user, loading } = useSession();
  const ui = useInteractions();
  if (user || loading) return null;
  return (
    <aside className="guest-banner">
      <div>
        <strong>Your people are here.</strong>
        <span>Sign in to join the conversation.</span>
      </div>
      <button className="button secondary small" onClick={() => ui.auth('login')}>
        Sign in
      </button>
      <button className="button primary small" onClick={() => ui.auth('register')}>
        Join
      </button>
    </aside>
  );
}
