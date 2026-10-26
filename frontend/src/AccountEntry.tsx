import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import { useSession } from './session';
import { api, errorMessage } from './api';
import { safeNext } from './Navigation';
export function StartupScreen() {
  const { refresh } = useSession();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="startup-screen" aria-label="Loading FpiUpdates">
      <BrandMark large />
      <h1>FpiUpdates</h1>
      <p role="status">
        {slow ? 'The server is taking a little longer to respond.' : 'Your people. Your updates.'}
      </p>
      {slow && (
        <button className="button secondary" onClick={() => void refresh()}>
          Try again
        </button>
      )}
    </main>
  );
}
export function VerifyEntry() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [cooldown, setCooldown] = useState(0),
    [change, setChange] = useState(false);
  useEffect(() => {
    const focus = () => void session.refresh();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (location.pathname !== '/check-email')
      navigate(
        '/check-email?next=' + encodeURIComponent(safeNext(location.pathname + location.search)),
        { replace: true },
      );
  }, []);
  async function resend() {
    setBusy(true);
    setError('');
    try {
      await api('/account/send-verification', { method: 'POST' });
      setMessage('Verification email requested. Check your inbox and spam folder.');
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/account/change-unverified-email', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
      });
      await session.refresh();
      setChange(false);
      setMessage('Address updated. Request a verification email for your new address.');
      setCooldown(0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="standalone-auth verify-entry">
      <Link to="/" className="auth-wordmark">
        <BrandMark /> FpiUpdates
      </Link>
      <h1>Check your email</h1>
      <p>
        Verify <strong>{session.user?.email}</strong> to enter your account. Open the verification
        email and confirm using its button.
      </p>
      <p className="muted">
        Check Spam or Junk too. If this browser already has your session, return here after
        confirming.
      </p>
      <button
        className="button primary full"
        disabled={busy || cooldown > 0}
        onClick={() => void resend()}
      >
        {busy
          ? 'Please wait…'
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : 'Resend verification email'}
      </button>
      <button
        className="button secondary full"
        disabled={busy}
        onClick={() => void session.refresh()}
      >
        I have verified my email
      </button>
      {session.user?.email && (
        <button className="text-button" onClick={() => setChange((v) => !v)}>
          Wrong email address?
        </button>
      )}
      {change && (
        <form className="feature-form" onSubmit={changeEmail}>
          <label>
            Correct email
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label>
            Current password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button className="button secondary" disabled={busy}>
            Update email
          </button>
          <small>Google-only accounts: sign out and use the correct Google account.</small>
        </form>
      )}
      {message && (
        <p role="status" className="form-feedback info">
          {message}
          <button
            className="text-button"
            onClick={() => setMessage('')}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
          <button className="text-button" onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </p>
      )}
      <p>
        <Link to="/help-email">Email verification help</Link>
      </p>
      <button
        className="text-button"
        onClick={() => void session.logout().catch((e) => setError(errorMessage(e)))}
      >
        Sign out
      </button>
    </main>
  );
}
export function ProfileCompletion() {
  const session = useSession();
  const user = session.user;
  const [error, setError] = useState('');
  if (!user || user.profileCompletionDismissed) return null;
  const tasks = [
    ['Profile photo', !!user.avatarMediaId, '/settings#profile'],
    ['Bio', !!user.bio?.trim(), '/settings#profile'],
    ['Interests', !!user.interests?.length, '/settings#profile'],
  ] as const;
  const done = tasks.filter((t) => t[1]).length;
  if (done === tasks.length) return null;
  const percentage = Math.round((done / tasks.length) * 100);
  return (
    <section className="completion-card">
      <svg
        width="52"
        height="52"
        viewBox="0 0 44 44"
        role="img"
        aria-label={`${percentage}% complete`}
      >
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border,#ddd)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="#15803d"
          strokeWidth="4"
          pathLength="100"
          strokeDasharray={`${percentage} 100`}
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="26" textAnchor="middle" fontSize="11" fill="currentColor">
          {percentage}%
        </text>
      </svg>
      <div>
        <strong>Complete your profile</strong>
        <p>{tasks.length - done} steps remaining · entirely optional</p>
        {tasks
          .filter((t) => !t[1])
          .map((t) => (
            <Link key={t[0]} to={t[2]}>
              {t[0]} →{' '}
            </Link>
          ))}
        {error && <p role="alert">{error}</p>}
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss profile completion"
        onClick={() =>
          void api('/identity/completion-dismiss', { method: 'PUT' })
            .then(() => session.refresh())
            .catch((e) => setError(errorMessage(e)))
        }
      >
        ×
      </button>
    </section>
  );
}
