import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, type Community } from './api';
import { useSession } from './session';
import { PageHeading } from './FeaturePages';
import { ErrorBox } from './components';
import { toast } from './toast';
type Campaign = {
  id: string;
  name: string;
  body: string;
  link: string | null;
  sourcePostId: string | null;
  placement: string;
  communityId: string | null;
  budgetKobo: number;
  startAt: string;
  endAt: string;
  status: string;
  reviewNote: string | null;
  owner?: { username: string };
};
export function AdsPage({ review = false }: { review?: boolean }) {
  const { user } = useSession();
  const [rows, setRows] = useState<Campaign[]>([]),
    [communities, setCommunities] = useState<Community[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Campaign | null>(null);
  const [placement, setPlacement] = useState('FEED');
  const canReview = user?.permissions?.includes('discovery.manage');
  async function load() {
    try {
      const result = await api<Campaign[] | { data: Campaign[] }>(review ? '/admin/ads' : '/ads');
      setRows(Array.isArray(result) ? result : result.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    if (user && (!review || canReview)) void load();
    if (!review)
      api<Community[]>('/catalog/communities')
        .then(setCommunities)
        .catch(() => {});
  }, [user?.id, review]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      const data = {
        name: f.get('name'),
        body: f.get('body'),
        ...(f.get('link') ? { link: f.get('link') } : {}),
        ...(f.get('sourcePostId') ? { sourcePostId: f.get('sourcePostId') } : {}),
        placement,
        ...(placement === 'COMMUNITY' ? { communityId: f.get('communityId') } : {}),
        budgetKobo: Math.round(Number(f.get('budget')) * 100),
        startAt: new Date(String(f.get('startAt'))).toISOString(),
        endAt: new Date(String(f.get('endAt'))).toISOString(),
      };
      await api('/ads' + (editing ? '/' + editing.id : ''), {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(data),
      });
      setEditing(null);
      form.reset();
      setPlacement('FEED');
      await load();
      toast('Campaign draft saved. No charge was made.', 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, kind: string) {
    setBusy(true);
    try {
      await api('/ads/' + id + '/' + kind, { method: 'POST' });
      await load();
      toast(
        kind === 'submit'
          ? 'Submitted for review. Payments and delivery are not open yet.'
          : 'Campaign cancelled.',
        'success',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api('/admin/ads/' + id + '/review', {
        method: 'PUT',
        body: JSON.stringify({ status: f.get('status'), note: f.get('note') }),
      });
      await load();
      toast('Review recorded. No ad will run or charge a user.', 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <p className="page-panel">
        <Link to="/login">Sign in to manage campaign drafts</Link>
      </p>
    );
  if (review && !canReview)
    return <p className="page-panel">Campaign review permission is required.</p>;
  return (
    <>
      <PageHeading
        title={review ? 'Campaign review' : 'Advertising drafts'}
        subtitle="Beta preparation · No checkout, charges or sponsored delivery"
      />
      <div className="public-info">
        <p className="form-note">
          Budgets and dates are draft requests. Approval does not activate an ad. Impressions,
          clicks and spending are not recorded until a delivery system is released.
        </p>
        {canReview && (
          <p>
            <Link to={review ? '/ads' : '/admin/ads'}>
              {review ? 'My campaign drafts' : 'Staff review queue'} →
            </Link>
          </p>
        )}
        {!review && (
          <form key={editing?.id ?? 'new'} className="feature-form" onSubmit={save}>
            <h2>{editing ? 'Edit draft' : 'Create a campaign draft'}</h2>
            <label>
              Campaign name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editing?.name}
              />
            </label>
            <label>
              Message
              <textarea
                name="body"
                required
                maxLength={280}
                rows={4}
                defaultValue={editing?.body}
              />
            </label>
            <label>
              HTTPS link (optional)
              <input
                name="link"
                type="url"
                maxLength={1000}
                placeholder="https://example.com"
                defaultValue={editing?.link ?? ''}
              />
            </label>
            <label>
              Boost your existing post (optional post ID)
              <input
                name="sourcePostId"
                placeholder="Post ID from its link"
                defaultValue={editing?.sourcePostId ?? ''}
              />
            </label>
            <label>
              Placement
              <select value={placement} onChange={(e) => setPlacement(e.target.value)}>
                <option value="FEED">Feed</option>
                <option value="COMMUNITY">Community</option>
              </select>
            </label>
            {placement === 'COMMUNITY' && (
              <label>
                Community
                <select name="communityId" required defaultValue={editing?.communityId ?? ''}>
                  <option value="">Choose a community</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Maximum budget request (₦)
              <input
                name="budget"
                type="number"
                min={100}
                max={1000000}
                step="0.01"
                required
                defaultValue={editing ? editing.budgetKobo / 100 : 1000}
              />
            </label>
            <label>
              Proposed start
              <input
                name="startAt"
                type="datetime-local"
                required
                defaultValue={editing ? localDate(editing.startAt) : ''}
              />
            </label>
            <label>
              Proposed end (up to 30 days)
              <input
                name="endAt"
                type="datetime-local"
                required
                defaultValue={editing ? localDate(editing.endAt) : ''}
              />
            </label>
            <p className="form-note">
              No payment will be taken. New ad-image uploads are not enabled.
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save draft'}
            </button>
            {editing && (
              <button type="button" className="text-button" onClick={() => setEditing(null)}>
                Cancel editing
              </button>
            )}
          </form>
        )}
        {error && <ErrorBox message={error} />}
        <h2>{review ? 'Latest campaigns' : 'Your campaigns'}</h2>
        {!rows.length && <p>No campaign drafts yet.</p>}
        {rows.map((c) => (
          <section className="settings-card" key={c.id}>
            <strong>{c.name}</strong>
            <p>
              {c.owner ? '@' + c.owner.username + ' · ' : ''}
              {c.status.toLowerCase()} · ₦{(c.budgetKobo / 100).toLocaleString()} maximum requested
              budget
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p>
            {c.link && (
              <a href={c.link} target="_blank" rel="noopener noreferrer">
                {c.link}
              </a>
            )}
            <p>
              {new Date(c.startAt).toLocaleString()} → {new Date(c.endAt).toLocaleString()}
            </p>
            {c.reviewNote && <p>Review: {c.reviewNote}</p>}
            {review ? (
              c.status === 'SUBMITTED' &&
              c.owner?.username !== user.username && (
                <form className="feature-form" onSubmit={(e) => void decide(e, c.id)}>
                  <label>
                    Decision
                    <select name="status">
                      <option value="APPROVED">Approve for preparation</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                  </label>
                  <label>
                    Review note
                    <textarea name="note" required minLength={3} maxLength={500} />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Save review
                  </button>
                </form>
              )
            ) : (
              <div className="push-actions">
                {['DRAFT', 'REJECTED'].includes(c.status) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setEditing(c);
                      setPlacement(c.placement);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Edit
                  </button>
                )}
                {c.status === 'DRAFT' && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void action(c.id, 'submit')}
                  >
                    Submit for review
                  </button>
                )}
                {c.status !== 'CANCELLED' && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void action(c.id, 'cancel')}
                  >
                    Cancel campaign
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function InstallStats() {
  const [data, setData] = useState<{
    platforms: { platform: string; _count: { _all: number }; _sum: { launches: number | null } }[];
    activeObserved30d: number;
    pushDevices: number;
    notice: string;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>('/installation/summary')
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <section className="settings-card">
      <h2>Observed app installations</h2>
      {data ? (
        <>
          <p>
            {data.activeObserved30d} observed browser installations active in 30 days ·{' '}
            {data.pushDevices} registered push subscriptions
          </p>
          <ul>
            {data.platforms.map((p) => (
              <li key={p.platform}>
                {p.platform}: {p._count._all} observations · {p._sum.launches ?? 0} observed active
                days
              </li>
            ))}
          </ul>
          <p className="form-note">{data.notice}</p>
        </>
      ) : (
        <p>Installation measurements are unavailable or still loading.</p>
      )}
    </section>
  );
}
