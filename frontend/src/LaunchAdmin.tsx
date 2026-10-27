import { useEffect, useState } from 'react';
import { api, errorMessage, type User } from './api';
import { Avatar } from './Avatar';
import { ErrorBox } from './components';
import { toast } from './toast';
type Account = Pick<User, 'id' | 'username' | 'displayName' | 'avatarMediaId' | 'identityStatus' | 'identityCategory'>;
type Settings = { gateEnabled: boolean; mode: 'OPEN' | 'COUNTDOWN' | 'MAINTENANCE'; launchAt: string; title: string; message: string; allowedPages: string[]; allowedUserIds: string[]; allowedUsers: Account[] };
const pages = ['about', 'help', 'privacy', 'terms'];
const localDate = (iso: string) => new Date(new Date(iso).getTime() + 3600000).toISOString().slice(0, 16);
export function LaunchAdmin() {
  const [s, setS] = useState<Settings | null>(null), [wat, setWat] = useState(''), [query, setQuery] = useState(''), [people, setPeople] = useState<Account[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api<Settings>('/admin/launch').then(x => { setS(x); setWat(localDate(x.launchAt)); }).catch(e => setError(errorMessage(e))); }, []);
  useEffect(() => { if (query.trim().replace(/^@/, '').length < 2) { setPeople([]); return; } const controller = new AbortController(); const timer = setTimeout(() => void api<Account[]>('/admin/launch/users?q=' + encodeURIComponent(query), { signal: controller.signal }).then(setPeople).catch(() => {}), 300); return () => { clearTimeout(timer); controller.abort(); }; }, [query]);
  async function save() {
    if (!s) return; setBusy(true); setError('');
    try {
      const date = new Date(wat + ':00+01:00'); if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.');
      await api('/admin/launch', { method: 'PUT', body: JSON.stringify({ mode: s.mode, launchAt: date.toISOString(), title: s.title, message: s.message, allowedPages: s.allowedPages, allowedUserIds: s.allowedUserIds }) });
      toast('Launch and maintenance settings saved.');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (!s) return error ? <ErrorBox message={error} /> : <p>Loading settings…</p>;
  return <div className="launch-admin"><h2>Launch & maintenance</h2><p>Choose what visitors can see. Times below are Nigeria time (WAT). Staff with feature management permission retain access.</p>{error && <ErrorBox message={error} />}
    <label>Platform mode<select value={s.mode} onChange={e => setS({ ...s, mode: e.target.value as Settings['mode'] })}><option value="OPEN">Open to everyone</option><option value="COUNTDOWN">Countdown until launch</option><option value="MAINTENANCE">Maintenance</option></select></label>
    <label>Launch date and time (WAT)<input type="datetime-local" value={wat} onChange={e => setWat(e.target.value)} /></label>
    <label>Page heading<input maxLength={160} value={s.title} onChange={e => setS({ ...s, title: e.target.value })} /></label>
    <label>Message<textarea maxLength={500} value={s.message} onChange={e => setS({ ...s, message: e.target.value })} /></label>
    <fieldset><legend>Public information pages available while closed</legend>{pages.map(p => <label className="launch-admin-check" key={p}><input type="checkbox" checked={s.allowedPages.includes(p)} onChange={e => setS({ ...s, allowedPages: e.target.checked ? [...s.allowedPages, p] : s.allowedPages.filter(x => x !== p) })} /> {p}</label>)}<p>Only published pages can be shown.</p></fieldset>
    <fieldset><legend>Preview access for accounts</legend><p>Search for existing accounts. They can sign in from the countdown page.</p><input placeholder="Search by name or username" value={query} onChange={e => setQuery(e.target.value)} />{people.map(person => <button type="button" className="launch-admin-person" key={person.id} onClick={() => { if (!s.allowedUserIds.includes(person.id)) setS({ ...s, allowedUserIds: [...s.allowedUserIds, person.id], allowedUsers: [...s.allowedUsers, person] }); setQuery(''); setPeople([]); }}><Avatar user={person} /><span>{person.displayName} <small>@{person.username}</small></span></button>)}
    {s.allowedUsers.map(person => <div className="launch-admin-person" key={person.id}><Avatar user={person}/><span>{person.displayName} <small>@{person.username}</small></span><button type="button" onClick={() => setS({ ...s, allowedUsers: s.allowedUsers.filter(x => x.id !== person.id), allowedUserIds: s.allowedUserIds.filter(x => x !== person.id) })}>Remove</button></div>)}</fieldset>
    <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>Save settings</button>
    <p>{s.gateEnabled ? 'Backend launch gate is enabled. The frontend must also have the launch gate enabled.' : 'The backend launch gate is disabled. Saving settings alone will not restrict access until it is enabled on Render and Vercel.'}</p></div>;
}
