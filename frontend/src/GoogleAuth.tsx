import { BrandMark } from './BrandMark';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage, type Topic, type User } from './api';
import { useSession } from './session';
import { ErrorBox } from './components';
import { UsernameField } from './ProfileFields';
import { InterestChoices } from './FeaturePages';
import { safeNext, BackButton } from './Navigation';
import { toast } from './toast';
const apiBase = () => import.meta.env.VITE_API_URL || '/api/v1';
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false);
  const location = useLocation();
  useEffect(() => {
    let active = true;
    api<{ google: boolean }>('/auth/providers')
      .then((x) => {
        if (active) setEnabled(x.google);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!enabled) return null;
  const query = new URLSearchParams(location.search);
  const next = /^\/(?:login|register)$/.test(location.pathname)
    ? safeNext(query.get('next'))
    : safeNext(location.pathname + location.search);
  return (
    <div className="google-entry">
      <a
        className="button google-button full"
        href={apiBase() + '/auth/google/start?' + new URLSearchParams({ next })}
      >
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59A14.4 14.4 0 019.75 24c0-1.59.27-3.13.77-4.59l-7.98-6.19A23.87 23.87 0 000 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        Continue with Google
      </a>
      <span className="account-divider">or use your account details</span>
    </div>
  );
}
export function GoogleSetup() {
  const session = useSession();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ email: string; displayName: string } | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    api<typeof pending>('/auth/google/pending', { signal: c.signal })
      .then(setPending)
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    api<Topic[]>('/catalog/topics', { signal: c.signal })
      .then(setTopics)
      .catch(() => {});
    return () => c.abort();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const result = await api<{ next: string }>('/auth/google/complete', {
        method: 'POST',
        body: JSON.stringify({
          username: f.get('username'),
          displayName: f.get('displayName'),
          topicIds: selected,
          agreed: true,
        }),
      });
      const me = await api<User>('/auth/me');
      session.setUser(me);
      const next = safeNext(result.next);
      navigate(me.emailVerified ? next : '/check-email?next=' + encodeURIComponent(next), {
        replace: true,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="standalone-auth">
      <BackButton />
      <Link className="auth-wordmark" to="/">
        <BrandMark /> FpiUpdates <span className="beta">BETA</span>
      </Link>
      <div className="account-form">
        <h1>Make it yours.</h1>
        <p>Choose your FpiUpdates username to finish joining.</p>
        {error && <ErrorBox message={error} />}
        {pending ? (
          <form onSubmit={submit}>
            <p className="form-note">Google account: {pending.email}</p>
            <label>
              Display name
              <input
                name="displayName"
                required
                maxLength={80}
                defaultValue={pending.displayName}
              />
            </label>
            <UsernameField />
            <p className="form-note">Choose interests later from your feed or Settings.</p>
            <label className="checkbox-label">
              <input type="checkbox" required />I agree to the{' '}
              <Link to="/guidelines" target="_blank">
                community guidelines
              </Link>
              .
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? 'Creating account…' : 'Create your account'}
            </button>
          </form>
        ) : !error ? (
          <p>Loading your Google account…</p>
        ) : (
          <Link to="/login">Start sign-in again</Link>
        )}
      </div>
    </main>
  );
}
export function GoogleConnections() {
  const { user } = useSession();
  const [status, setStatus] = useState<{
    enabled: boolean;
    connected: boolean;
    passwordEnabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user)
      api<typeof status>('/auth/google/connection')
        .then(setStatus)
        .catch(() => {});
  }, [user?.id]);
  if (!user || !status) return null;
  return (
    <section className="connected-accounts">
      <h2>Connected accounts</h2>
      <p>
        Google:{' '}
        {status.connected
          ? 'Connected'
          : status.enabled
            ? 'Not connected'
            : 'Sign-in setup is not configured yet'}
      </p>
      {status.connected && !status.passwordEnabled ? (
        <p className="form-note">
          To disconnect Google,{' '}
          <Link to="/forgot-password">set a password using email recovery</Link> first.
        </p>
      ) : (
        (status.enabled || status.connected) && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const password = new FormData(e.currentTarget).get('password');
              try {
                if (status.connected) {
                  await api('/auth/google/connection', {
                    method: 'DELETE',
                    body: JSON.stringify({ password }),
                  });
                  setStatus({ ...status, connected: false });
                  toast('Google disconnected.', 'success');
                } else {
                  const result = await api<{ url: string }>('/auth/google/link', {
                    method: 'POST',
                    body: JSON.stringify({ password }),
                  });
                  window.location.assign(result.url);
                }
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Confirm current password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              {busy ? 'Please wait…' : status.connected ? 'Disconnect Google' : 'Connect Google'}
            </button>
          </form>
        )
      )}
      {error && <ErrorBox message={error} />}
    </section>
  );
}
