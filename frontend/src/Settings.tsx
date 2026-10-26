import { PushSettings } from './PushSettings';
import { OccupationFields, GenderField, parseSkills } from './OccupationFields';
import { InstallApp } from './PWA';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppearanceControls } from './Appearance';
import { GoogleConnections } from './GoogleAuth';
import { MessagePrivacy } from './message-controls';
import { DesktopNotificationControls } from './Notifications';
import { DiscoverabilitySettings } from './Discoverability';
import { ImageUpload } from './ImageUpload';
import { UsernameField, PersonalFields } from './ProfileFields';
import { InterestChoices, PageHeading } from './FeaturePages';
import { useSession } from './session';
import { api, errorMessage, type Topic } from './api';
import { ErrorBox } from './components';
import { useToastNotice } from './toast';
export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = location.hash.slice(1);
  const section = ['profile', 'privacy', 'notifications', 'account', 'appearance', 'app'].includes(
    requested,
  )
    ? requested
    : requested === 'messages'
      ? 'privacy'
      : 'profile';
  const [tab, setTab] = useState(section);
  useEffect(() => setTab(section), [section]);
  const session = useSession();
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  useToastNotice(notice);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Topic[]>('/catalog/topics')
      .then(setTopics)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(
    () => setSelected(session.user?.interests?.map((i) => i.topicId) ?? []),
    [session.user],
  );
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading || coverUploading) return;
    setBusy(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget);
    const website = String(f.get('website') ?? '').trim();
    try {
      await api('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          gender: f.get('gender') || null,
          occupation: f.get('occupation') || null,
          skills: parseSkills(f.get('skills')),
          username: f.get('username'),
          phoneNumber: f.get('phoneNumber') || null,
          dateOfBirth: f.get('dateOfBirth') || null,
          location: f.get('location') || null,
          profileCoverMediaId: f.get('profileCoverMediaId') || null,
          campusIdentity: f.get('campusIdentity') || null,
          avatarMediaId: f.get('avatarMediaId') || null,
          displayName: f.get('displayName'),
          bio: f.get('bio'),
          department: f.get('department'),
          ...(website ? { website } : {}),
        }),
      });
      await api('/profile/interests', {
        method: 'PUT',
        body: JSON.stringify({ topicIds: selected }),
      });
      await session.refresh();
      setNotice('Profile and interests saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Settings" subtitle="Your profile, privacy and account preferences." />
      {!session.user ? (
        <p className="page-panel">
          <Link to="/login">Sign in to manage settings</Link>
        </p>
      ) : (
        <div className="settings-layout">
          <nav className="settings-navigation" aria-label="Settings sections">
            {[
              ['profile', 'Profile'],
              ['privacy', 'Privacy & discovery'],
              ['notifications', 'Notifications'],
              ['account', 'Account & security'],
              ['appearance', 'Appearance'],
              ['app', 'App & installation'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? 'active' : ''}
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => {
                  setTab(key);
                  navigate('/settings#' + key, { replace: true });
                }}
              >
                {label}
                <span>›</span>
              </button>
            ))}
          </nav>
          <section className="settings-panel" hidden={tab !== 'profile'}>
            <h2>Profile</h2>
            <p className="muted">Choose how you appear in the community.</p>
            <form className="feature-form" onSubmit={save}>
              <ImageUpload
                key={session.user.id}
                kind="avatar"
                name="avatarMediaId"
                initialId={session.user.avatarMediaId}
                onBusyChange={setUploading}
              />
              <ImageUpload
                key={session.user.id + '-cover'}
                kind="profile"
                name="profileCoverMediaId"
                initialId={session.user.profileCoverMediaId}
                onBusyChange={setCoverUploading}
              />
              <label>
                Campus identity (optional)
                <select name="campusIdentity" defaultValue={session.user.campusIdentity ?? ''}>
                  <option value="">Prefer not to say</option>
                  {[
                    ['STUDENT', 'Student'],
                    ['ASPIRANT', 'Aspirant'],
                    ['ALUMNUS', 'Alumnus'],
                    ['STAFF', 'Staff'],
                    ['RESIDENT', 'Resident'],
                    ['OTHER', 'Other'],
                  ].map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Display name
                <input
                  name="displayName"
                  defaultValue={session.user.displayName}
                  maxLength={80}
                  required
                />
              </label>
              <UsernameField initial={session.user.username} />
              <PersonalFields user={session.user} />
              <GenderField value={session.user.gender} />
              <OccupationFields user={session.user} />
              <label>
                Bio
                <textarea
                  name="bio"
                  rows={3}
                  maxLength={300}
                  defaultValue={session.user.bio ?? ''}
                  placeholder="A little about you"
                />
              </label>
              <label>
                Department
                <input
                  name="department"
                  maxLength={100}
                  defaultValue={session.user.department ?? ''}
                />
              </label>
              <label>
                Website
                <input
                  name="website"
                  type="url"
                  maxLength={500}
                  placeholder="https://example.com"
                  defaultValue={session.user.website ?? ''}
                />
              </label>
              <InterestChoices topics={topics} selected={selected} onChange={setSelected} />
              <button className="button primary" disabled={busy || uploading || coverUploading}>
                {busy ? 'Saving…' : 'Save profile & interests'}
              </button>
            </form>
          </section>
          <section className="settings-panel" hidden={tab !== 'privacy'}>
            <DiscoverabilitySettings />
            <MessagePrivacy />
            <div className="settings-card">
              <h2>Safety and audience</h2>
              <Link className="settings-link" to="/settings/safety">
                Blocked and muted accounts →
              </Link>
              <Link className="settings-link" to="/stats#stats-privacy">
                Audience measurement and public rankings →
              </Link>
            </div>
          </section>
          <section className="settings-panel" hidden={tab !== 'notifications'}>
            <h2>Notifications</h2>
            <PushSettings />
            <DesktopNotificationControls />
          </section>
          <section className="settings-panel" hidden={tab !== 'account'}>
            <div className="settings-card">
              <h2>{session.user.emailVerified ? 'Email verified' : 'Verify your email'}</h2>
              <p>{session.user.email}</p>
              {!session.user.emailVerified && (
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await api('/account/send-verification', { method: 'POST' });
                      setNotice('Verification instructions requested. Check your inbox.');
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Send verification email
                </button>
              )}
              <Link className="settings-link" to="/forgot-password">
                Reset your password →
              </Link>
            </div>
            <GoogleConnections />
          </section>
          <section className="settings-panel" hidden={tab !== 'appearance'}>
            <h2>Appearance</h2>
            <p>Choose a light, dark or system theme.</p>
            <AppearanceControls />
          </section>
          <section className="settings-panel" hidden={tab !== 'app'}>
            <InstallApp details />
          </section>
          {error && <ErrorBox message={error} />}
        </div>
      )}
    </>
  );
}
