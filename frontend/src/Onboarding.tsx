import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Users, Sparkles } from 'lucide-react';
import { api, errorMessage, type Topic, type User } from './api';
import { Avatar } from './Avatar';
import { InterestChoices } from './FeaturePages';
import { useSession } from './session';
export function OnboardingCard() {
  const session = useSession();
  const user = session.user;
  const stage = user?.onboardingStage ?? 'DONE';
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [followed, setFollowed] = useState(new Set<string>());
  useEffect(() => {
    setSelected(user?.interests?.map((i) => i.topicId) ?? []);
    setFollowed(new Set());
  }, [user?.id]);
  useEffect(() => {
    if (!user || stage === 'DONE') return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    if (stage === 'TOPICS')
      api<Topic[]>('/catalog/topics', { signal: c.signal })
        .then(setTopics)
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    else
      api<{ data: User[] }>('/people/suggestions?limit=10', { signal: c.signal })
        .then((r) => setPeople(r.data.slice(0, 6)))
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    return () => c.abort();
  }, [user?.id, stage]);
  if (!user || stage === 'DONE') return null;
  async function advance(saveTopics = false) {
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      if (saveTopics)
        await api('/profile/interests', {
          method: 'PUT',
          body: JSON.stringify({ topicIds: selected }),
        });
      const next = stage === 'TOPICS' ? 'PEOPLE' : 'DONE';
      await api('/profile/onboarding', { method: 'PUT', body: JSON.stringify({ stage: next }) });
      await session.refresh();
      window.dispatchEvent(new Event('feed-updated'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function follow(person: User) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const active = followed.has(person.id);
      await api('/social/users/' + person.id + '/follow', { method: active ? 'DELETE' : 'PUT' });
      setFollowed((old) => {
        const next = new Set(old);
        if (active) next.delete(person.id);
        else next.add(person.id);
        return next;
      });
      window.dispatchEvent(
        new CustomEvent('follow-updated', {
          detail: { userId: user!.id, accountId: person.id, following: !active },
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding-card" aria-label="Welcome to FpiUpdates">
      <div className="onboarding-card-title">
        {stage === 'TOPICS' ? <Sparkles size={22} /> : <Users size={22} />}
        <div>
          <small>WELCOME TO FPIUPDATES</small>
          <h2>{stage === 'TOPICS' ? 'Make this feed yours' : 'Find your people'}</h2>
        </div>
      </div>
      <p>
        {stage === 'TOPICS'
          ? 'Choose topics you enjoy. This is optional, and your feed already includes public conversations.'
          : 'Follow a few people to personalise Following. Try five, or continue with any number—including none.'}
      </p>
      {loading ? (
        <p role="status">Finding {stage === 'TOPICS' ? 'topics' : 'people'}…</p>
      ) : stage === 'TOPICS' ? (
        <InterestChoices topics={topics} selected={selected} onChange={setSelected} />
      ) : (
        <>
          <div className="onboarding-people">
            {people.map((person) => (
              <div className="suggested-person" key={person.id}>
                <Link className="suggested-identity" to={'/u/' + person.username}>
                  <Avatar user={person} />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>@{person.username}</small>
                  </span>
                </Link>
                <button
                  className="button secondary small"
                  disabled={busy}
                  aria-pressed={followed.has(person.id)}
                  onClick={() => void follow(person)}
                >
                  {followed.has(person.id) ? (
                    <>
                      <Check size={15} />
                      Following
                    </>
                  ) : (
                    'Follow'
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="field-hint">
            Five follows are suggested, never required.{' '}
            {!user.emailVerified && (
              <>
                If following requires verification,{' '}
                <Link to="/settings#account">verify your email in Settings</Link> or skip for now.
              </>
            )}
          </p>
          {!people.length && <p>More people will appear here as the community grows.</p>}
        </>
      )}
      {error && (
        <p className="form-feedback error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding-actions">
        <button
          className="button primary small"
          disabled={busy}
          onClick={() => void advance(stage === 'TOPICS')}
        >
          {busy ? 'Saving…' : stage === 'TOPICS' ? 'Continue' : 'Start exploring'}
        </button>
        <button className="text-button" disabled={busy} onClick={() => void advance(false)}>
          {stage === 'TOPICS' ? 'Skip topics' : 'Skip for now'}
        </button>
        <Link to="/settings">Edit later in Settings</Link>
      </div>
    </section>
  );
}
