import { InstallPromotion } from './PWA';
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
  const session = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [account, setAccount] = useState({ displayName: '', email: '', password: '' });
  const heading = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  useEffect(() => {
    setStep(0);
    setError('');
  }, [register]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (!register || step !== 1) return;
    const controller = new AbortController();
    api<string[]>('/auth/username-suggestions?name=' + encodeURIComponent(account.displayName), {
      signal: controller.signal,
    })
      .then(setSuggestions)
      .catch(() => {});
    return () => controller.abort();
  }, [step, register, account.displayName]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError('');
    if (register && step === 0) {
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const username = String(form.get('username') ?? '')
        .trim()
        .toLowerCase();
      if (register) {
        const result = await api<{ available: boolean }>(
          '/auth/username-availability?username=' + encodeURIComponent(username),
        );
        if (!result.available) throw Error('This username is unavailable. Try another.');
      }
      await api('/auth/browser/' + (register ? 'register' : 'login'), {
        method: 'POST',
        body: JSON.stringify(
          register
            ? { ...account, username }
            : { identifier: form.get('identifier'), password: form.get('password') },
        ),
      });
      const me = await api<User>('/auth/me');
      session.setUser(me);
      onSuccess();
      if (!me.emailVerified) {
        const next = safeNext(
          new URLSearchParams(location.search).get('next') ?? location.pathname + location.search,
        );
        navigate('/check-email?next=' + encodeURIComponent(next), { replace: true });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-form">
      <h1 ref={heading} tabIndex={-1}>
        {register ? (step === 0 ? 'Create your account' : 'Choose your username') : 'Welcome back'}
      </h1>
      <p>
        {register
          ? 'Just the essentials. Complete your profile later.'
          : 'Sign in to continue the conversation.'}
      </p>
      {new URLSearchParams(location.search).has('google') && (
        <p className="form-feedback info">
          Google sign-in could not finish. Try again, or sign in to your existing account to connect
          Google in Settings.
        </p>
      )}
      {(!register || step === 0) && <GoogleButton />}
      {register && step === 0 && (
        <p className="form-note">
          Represent a business, institution or public agency? Create an account with its public
          name, then request identity review in Settings after confirming your email.
        </p>
      )}
      {register && <p className="signup-step">Step {step + 1} of 2</p>}
      <form key={(register ? 'register' : 'login') + step} onSubmit={submit}>
        {register ? (
          step === 0 ? (
            <>
              <AccountField
                label="Display name"
                name="displayName"
                autoComplete="name"
                value={account.displayName}
                onChange={(displayName) => setAccount((a) => ({ ...a, displayName }))}
                maxLength={80}
              />
              <AccountField
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                value={account.email}
                onChange={(email) => setAccount((a) => ({ ...a, email }))}
                maxLength={254}
                helper="We will send your verification link here."
              />
              <AccountField
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={account.password}
                onChange={(password) => setAccount((a) => ({ ...a, password }))}
                minLength={12}
                maxLength={128}
                helper="Use at least 12 characters."
              />
            </>
          ) : (
            <>
              <UsernameField key={chosen} initial={chosen} />
              <div className="username-suggestions">
                {suggestions.map((name) => (
                  <button type="button" key={name} onClick={() => setChosen(name)}>
                    @{name}
                  </button>
                ))}
              </div>
              <label className="checkbox-label">
                <input type="checkbox" required />{' '}
                <span>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/guidelines" target="_blank">
                    Community Guidelines
                  </Link>
                  , and have read the{' '}
                  <Link to="/privacy" target="_blank">
                    Privacy Policy
                  </Link>
                  .
                </span>
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
            <Link to="/forgot-password" className="text-button">
              Forgot password?
            </Link>
          </>
        )}
        {error && (
          <div className="form-feedback error" role="alert">
            {error}
            <button
              type="button"
              className="text-button"
              onClick={() => setError('')}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        <button className="button primary full" disabled={busy}>
          {busy
            ? 'Please wait…'
            : register
              ? step === 0
                ? 'Continue'
                : 'Create account'
              : 'Sign in'}
        </button>
        {register && step === 1 && (
          <button type="button" className="text-button" disabled={busy} onClick={() => setStep(0)}>
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
        className={'field-hint ' + (message ? 'field-error' : '')}
        role={message ? 'alert' : undefined}
      >
        {message || helper}
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
    if (session.user && !session.user.emailVerified) {
      navigate('/check-email?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }
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
      {session.user?.emailVerified && composerStarted && (
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
        <BrandMark /> FpiUpdates <span className="beta">BETA</span>
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
        <GoogleButton />
        <InstallPromotion />
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
