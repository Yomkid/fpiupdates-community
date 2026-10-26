import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { api, errorMessage } from './api';
import { toast } from './toast';
export type Flags = {
  advertising: boolean;
  identityBadgeColours: boolean;
  organisationAvatars: boolean;
  postImages: boolean;
  sports: boolean;
  messages: boolean;
  articlePublishing: boolean;
};
const Context = createContext<{ flags: Flags; ready: boolean; uploadsAvailable: boolean }>({
  flags: {
    advertising: false,
    identityBadgeColours: false,
    organisationAvatars: false,
    postImages: false,
    sports: false,
    messages: false,
    articlePublishing: false,
  },
  ready: false,
  uploadsAvailable: false,
});
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Flags>({
      advertising: false,
      identityBadgeColours: false,
      organisationAvatars: false,
      postImages: false,
      sports: false,
      messages: false,
      articlePublishing: false,
    }),
    [ready, setReady] = useState(false),
    [uploadsAvailable, setUploadsAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    const c = new AbortController();
    const load = () =>
      api<Flags & { uploadsAvailable: boolean }>('/features', { signal: c.signal })
        .then((f) => {
          if (alive) {
            setFlags((current) => ({ ...current, ...f }));
            setUploadsAvailable(f.uploadsAvailable);
            setReady(true);
          }
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    window.addEventListener('features-updated', load);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      c.abort();
      clearInterval(timer);
      window.removeEventListener('features-updated', load);
      window.removeEventListener('focus', load);
    };
  }, []);
  return <Context.Provider value={{ flags, ready, uploadsAvailable }}>{children}</Context.Provider>;
}
export const useFeatures = () => useContext(Context);
export function featureForPath(path: string): keyof Flags | undefined {
  if (/^\/ads(?:\/|$)/.test(path)) return 'advertising';
  if (/^\/sports(?:\/|$)/.test(path)) return 'sports';
  if (/^\/messages(?:\/|$)/.test(path)) return 'messages';
  if (/^\/editorial(?:\/|$)/.test(path)) return 'articlePublishing';
}
export function FeatureRoute({ children }: { children: ReactNode }) {
  const { flags, ready } = useFeatures();
  const { pathname } = useLocation();
  const key = featureForPath(pathname);
  return key && !ready ? (
    <p className="page-panel">Checking availability…</p>
  ) : key && !flags[key] ? (
    <section className="empty-state">
      <h2>Not available yet</h2>
      <p>This feature is paused. Your existing content is preserved.</p>
    </section>
  ) : (
    <>{children}</>
  );
}
const labels: Record<keyof Flags, [string, string]> = {
  identityBadgeColours: [
    'Category badge colours',
    'Show green for verified individuals and creators, gold for verified businesses and institutions, and grey for verified government accounts. Identity still requires manual review; review any custom Help content before release.',
  ],
  organisationAvatars: [
    'Organisation profile shapes',
    'Use rounded-square profile pictures for verified businesses and institutions. Government and individual accounts remain circular.',
  ],
  advertising: [
    'Advertising drafts (beta)',
    'Enable draft campaigns and staff review. Payments and delivery remain unavailable.',
  ],
  postImages: [
    'Post image uploads',
    'Allow new images in posts, replies and threads. Existing images stay visible; profile pictures and article covers are separate.',
  ],
  sports: ['Campus sports', 'Show sports pages/cards and allow sports management and updates.'],
  messages: [
    'Private messages',
    'Allow message pages, requests and inbox activity. Existing conversations are retained.',
  ],
  articlePublishing: [
    'Article publishing',
    'Allow editorial tools and scheduled publication. Published articles stay readable; due schedules resume when enabled.',
  ],
};
export function FeatureSettings() {
  const { flags, ready } = useFeatures();
  const [draft, setDraft] = useState(flags);
  useEffect(() => setDraft(flags), [flags]);
  const [busy, setBusy] = useState(false);
  async function save(key?: keyof Flags) {
    setBusy(true);
    const previous = draft;
    setDraft(
      key
        ? { ...draft, [key]: !draft[key] }
        : { ...draft, postImages: false, sports: false, messages: false },
    );
    try {
      const next = await api<Flags>(key ? '/features' : '/features/text-first', {
        method: 'PUT',
        ...(key ? { body: JSON.stringify({ key, enabled: !draft[key] }) } : {}),
      });
      setDraft(next);
      window.dispatchEvent(new Event('features-updated'));
      toast(key ? 'Feature availability saved.' : 'Text-first launch preset applied.', 'success');
    } catch (e) {
      setDraft(previous);
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="feature-settings">
      <h2>Feature releases</h2>
      <p>
        Choose what members can use. API features are enforced by the backend; appearance options
        change the interface. Switches do not delete content. Other open tabs refresh availability
        within 30 seconds or when focused.
      </p>
      <button className="button secondary" disabled={busy || !ready} onClick={() => void save()}>
        Apply text-first launch preset
      </button>
      <p className="form-note">
        Pauses post image uploads, sports and messages. Profiles, text posts, articles and
        communities remain available.
      </p>
      {(Object.keys(labels) as (keyof Flags)[]).map((key) => (
        <label className="settings-toggle" key={key}>
          <span>
            <strong>{labels[key][0]}</strong>
            <small>{labels[key][1]}</small>
          </span>
          <input
            type="checkbox"
            checked={draft[key]}
            disabled={busy || !ready}
            onChange={() => void save(key)}
          />
        </label>
      ))}
    </section>
  );
}
