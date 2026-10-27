import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import DOMPurify from 'dompurify';
import { BrandMark } from './BrandMark';
import './launch.css';
const API = import.meta.env.VITE_API_URL || '/api/v1';
type Status = { configured: boolean; locked: boolean; allowed: boolean; mode: 'OPEN' | 'COUNTDOWN' | 'MAINTENANCE'; launchAt: string; title: string; message: string; allowedPages: string[]; serverTime: string };
const fallback = Date.parse('2026-10-30T17:00:00Z');

// The gate runs before SessionProvider, so reuse the existing splash's appearance
// without using StartupScreen's session-dependent retry handler.
function LaunchStatusScreen({ error, retry }: { error: string; retry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <main className="startup-screen" aria-label="Loading FpiUpdates">
      <BrandMark large />
      <h1>FpiUpdates</h1>
      <p role="status">{error || (slow ? 'The server is taking a little longer to respond.' : 'Your people. Your updates.')}</p>
      {(error || slow) && <button className="button secondary" onClick={retry}>Try again</button>}
    </main>
  );
}
export function LaunchGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null), [opened, setOpened] = useState(false), [tick, setTick] = useState(Date.now()), [offset, setOffset] = useState(0);
  const [error, setError] = useState(''), [tester, setTester] = useState(false), [busy, setBusy] = useState(false), [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(''), [emergency, setEmergency] = useState(false);
  const [page, setPage] = useState<{title: string; html: string} | null>(null);
  const enabled = import.meta.env.VITE_LAUNCH_GATE_ENABLED === 'true';
  async function check() {
    try {
      const response = await fetch(`${API}/launch/status`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const next: Status = await response.json();
      setOffset(Date.parse(next.serverTime) - Date.now() || 0); setStatus(next);
      setError(next.configured ? '' : 'Launch access is being prepared. Please check back shortly.');
      if (next.configured && next.locked) setOpened(next.allowed);
      return next;
    } catch { setError('Connecting to FpiUpdates. Please try again shortly.'); return null; }
  }
  useEffect(() => {
    if (!enabled) return;
    void check();
    const timer = window.setInterval(() => setTick(Date.now()), 1000), refresh = window.setInterval(() => void check(), 15000);
    return () => { clearInterval(timer); clearInterval(refresh); };
  }, [enabled]);
  const slug = location.pathname.replace(/^\/+|\/+$/g, '');
  const publicPage = !!status?.locked && !!status?.allowedPages?.includes(slug);
  useEffect(() => {
    if (!publicPage) return;
    fetch(`${API}/content/${encodeURIComponent(slug)}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => setPage(data ? { title: data.publishedTitle, html: data.publishedHtml } : null)).catch(() => setPage(null));
  }, [publicPage, slug]);
  async function enterTester(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch(`${API}${emergency ? '/launch/access' : '/auth/browser/login'}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emergency ? { passcode: code } : { identifier, password }) });
      if (!r.ok) { const body = await r.json(); throw new Error(body.message || 'Could not enter.'); }
      setCode(''); setPassword(''); const result = await check();
      if (!result?.allowed) throw new Error('This account does not have preview access.');
      setOpened(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  if (!enabled) return children;
  if (!status || !status.configured) return <LaunchStatusScreen error={error} retry={() => void check()} />;
  if (opened || status.mode === 'OPEN') return children;
  const target = status?.launchAt ? Date.parse(status.launchAt) : fallback;
  const remaining = Math.max(0, Math.floor((target - (tick + offset)) / 1000));
  const units = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
  const live = !!status?.configured && status.mode === 'COUNTDOWN' && !status.locked;
  const date = new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(target);
  return <main className="launch-page"><div className="launch-shell"><header className="launch-header"><BrandMark /><strong>FpiUpdates</strong><span>COMMUNITY</span></header><section className="launch-content">
    {publicPage ? <><a href="/">← Back</a><h1>{page?.title || slug[0]?.toUpperCase() + slug.slice(1)}</h1>{page?.html ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(page.html) }} /> : <p>This page is currently unavailable.</p>}</> : <>
    <span className="launch-tag">{status?.mode === 'MAINTENANCE' ? 'TEMPORARILY UNAVAILABLE' : 'STARTING IN ILARO · GROWING TOGETHER'}</span>
    <h1>{live ? 'FpiUpdates is now live.' : status?.title || 'A place for our community to come together.'}</h1><p>{status?.message || 'Discover conversations, campus updates and opportunities. FpiUpdates starts in Ilaro, and everyone is welcome.'}</p>
    {!live && status?.mode !== 'MAINTENANCE' && <div className="launch-countdown" aria-label="Time until launch">{units.map((n, i) => <div key={i}><strong>{String(n).padStart(2, '0')}</strong><span>{['DAYS','HOURS','MINUTES','SECONDS'][i]}</span></div>)}</div>}
    {status?.mode !== 'MAINTENANCE' && <p className="launch-date">{date} WAT</p>}
    {live ? <button className="launch-primary" onClick={() => setOpened(true)}>Enter FpiUpdates →</button> : <button className="launch-primary" onClick={() => { const url = location.origin; if (navigator.share) void navigator.share({ title: 'FpiUpdates', text: 'Join the FpiUpdates community.', url }).catch(() => {}); else void navigator.clipboard.writeText(url).then(() => setError('Link copied. Share it with your community.')).catch(() => setError('Copy the address from your browser to share.')); }}>Share ↗</button>}
    {error && <p className="launch-message" role="status">{error} <button onClick={() => void check()}>Retry</button></p>}
    <div className="launch-tester"><button onClick={() => setTester(!tester)}>{tester ? 'Close' : 'Staff and tester access'}</button>{tester && <form onSubmit={enterTester}>{emergency ? <label>Emergency access code<input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required /></label> : <><label>Email or username<input value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label></>}<button disabled={busy}>Continue</button><button type="button" onClick={() => setEmergency(!emergency)}>{emergency ? 'Use account' : 'Use emergency code'}</button></form>}</div>
    {(status?.allowedPages || []).map(p => <a className="launch-public-link" href={'/' + p} key={p}>{p}</a>)}
    </>}</section><footer>© 2026 FpiUpdates · Made for community</footer></div></main>;
}
