import { useFeatures } from './Features';
import { Avatar } from './Avatar';
import { createPortal } from 'react-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, type User } from './api';
import { useSession } from './session';
import { PageHeading } from './FeaturePages';
import { Modal } from './components';
import { toast } from './toast';
export const identityCategories = [
  'INDIVIDUAL',
  'BUSINESS',
  'INSTITUTION',
  'GOVERNMENT',
  'MEDIA',
  'CREATOR',
];
type BadgeTone = 'green' | 'gold' | 'grey';
export function badgeTone(category: string | null | undefined, coloursEnabled: boolean): BadgeTone {
  if (!coloursEnabled) return 'green';
  if (category === 'BUSINESS' || category === 'INSTITUTION') return 'gold';
  if (category === 'GOVERNMENT') return 'grey';
  return 'green';
}
export function BadgeSymbol({ size = 18, category }: { size?: number; category?: string | null }) {
  const { flags } = useFeatures();
  const tone = badgeTone(category, flags.identityBadgeColours);
  return (
    <svg
      className={`badge-symbol badge-tone-${tone}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="m12 1 3 2 3.6.4.9 3.5L22 10l-1.1 3.4.3 3.6-3.1 1.8L15.8 22 12 21l-3.8 1-2.3-3.2L2.8 17l.3-3.6L2 10l2.5-3.1.9-3.5L9 3z"
      />
      <path
        className="badge-check"
        d="m7.5 12 3 3 6-6"
        fill="none"
        stroke="white"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const categoryNames: Record<string, string> = {
  INDIVIDUAL: 'Individual',
  BUSINESS: 'Business',
  INSTITUTION: 'Institution',
  GOVERNMENT: 'Government',
  MEDIA: 'Media',
  CREATOR: 'Creator',
};
export function CategoryPicker({
  initial = 'INDIVIDUAL',
  onCategoryChange,
}: {
  initial?: string;
  onCategoryChange?: (category: string) => void;
}) {
  const { flags } = useFeatures();
  return (
    <fieldset className="badge-category-picker">
      <legend>Account category</legend>
      <p>
        {flags.identityBadgeColours
          ? 'Green: individuals, creators and media. Gold: businesses and institutions. Grey: government.'
          : 'Approved accounts currently use the green badge.'}{' '}
        Selecting a category does not grant verification.
      </p>
      <div>
        {identityCategories.map((category) => (
          <label key={category} className="badge-category-option">
            <input
              type="radio"
              name="category"
              value={category}
              defaultChecked={category === initial}
              onChange={() => onCategoryChange?.(category)}
              required
            />
            <BadgeSymbol size={22} category={category} />
            <span>{categoryNames[category]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function VerifiedBadge({
  user,
}: {
  user: Pick<User, 'identityStatus' | 'identityCategory'>;
}) {
  const [open, setOpen] = useState(false);
  const { flags } = useFeatures();
  const tone = badgeTone(user.identityCategory, flags.identityBadgeColours);
  if (user.identityStatus !== 'VERIFIED') return null;
  return (
    <>
      <svg
        className={`identity-badge badge-tone-${tone}`}
        data-badge-tone={tone}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        role="button"
        tabIndex={0}
        aria-label="About this verified account"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <title>Verified account</title>
        <path
          fill="currentColor"
          d="m12 1 3 2 3.6.4.9 3.5L22 10l-1.1 3.4.3 3.6-3.1 1.8L15.8 22 12 21l-3.8 1-2.3-3.2L2.8 17l.3-3.6L2 10l2.5-3.1.9-3.5L9 3z"
        />
        <path
          className="badge-check"
          d="m7.5 12 3 3 6-6"
          fill="none"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {open &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Modal title="Verified identity" onClose={() => setOpen(false)}>
              <div className="verification-explanation">
                <BadgeSymbol size={32} category={user.identityCategory} />
                <h3>Identity reviewed</h3>
              </div>
              <p>
                FpiUpdates reviewed this account’s identity or authority to represent its
                organisation.
              </p>
              <p>
                Category: {categoryNames[user.identityCategory ?? 'INDIVIDUAL'] ?? 'Individual'}.
                Verification does not endorse posts or guarantee safe transactions.
              </p>
              <Link className="content-link" to="/help/verification" onClick={() => setOpen(false)}>
                How verification works →
              </Link>
            </Modal>
          </div>,
          document.body,
        )}
    </>
  );
}
type RequestRow = {
  id: string;
  kind: string;
  status: string;
  evidence: string;
  category: string;
  username?: string;
  decision?: string;
  user?: User;
};
export function IdentitySettings() {
  const { user } = useSession();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [supplement, setSupplement] = useState<RequestRow | null>(null);
  const [category, setCategory] = useState('INDIVIDUAL');
  const [requestKind, setRequestKind] = useState('VERIFICATION');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (user)
      api<RequestRow[]>('/identity/requests')
        .then(setRows)
        .catch((e) => setError(errorMessage(e)));
  }, [user?.id, refresh]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError('');
    try {
      await api('/identity/requests' + (supplement ? '/' + supplement.id : ''), {
        method: supplement ? 'PUT' : 'POST',
        body: JSON.stringify({
          kind: supplement?.kind ?? f.get('kind'),
          category: supplement?.category ?? f.get('category'),
          ...(f.get('username') ? { username: f.get('username') } : {}),
          evidence: f.get('evidence'),
        }),
      });
      toast('Request submitted. You can track its status here.', 'success');
      setSupplement(null);
      setRefresh((n) => n + 1);
      form.reset();
      setCategory('INDIVIDUAL');
      setRequestKind('VERIFICATION');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Identity & username requests" />
      <section className="page-panel verification-settings">
        {!user ? (
          <Link to="/login">Sign in to submit a request</Link>
        ) : (
          <>
            <div className="verification-intro">
              <BadgeSymbol size={30} />
              <h2>Confirm your public identity</h2>
              <p>
                Choose the category that represents you. Verification confirms identity; it does not
                happen automatically when you create an account.
              </p>
            </div>
            <p>
              Your verification status:{' '}
              <strong>{user.identityStatus?.toLowerCase() ?? 'none'}</strong>. Email confirmation
              and identity verification are separate.
            </p>
            <Link to="/help-verification">Read the criteria and evidence guidance</Link>
            <p>
              No follower minimum or payment is required. We review authenticity, community
              relevance and genuine activity. Do not submit passwords, identity document scans or
              sensitive personal information here.
            </p>
            <form className="feature-form" onSubmit={submit} key={supplement?.id ?? 'new'}>
              {supplement ? (
                <h2>Add information to your request</h2>
              ) : (
                <>
                  <label>
                    Request type
                    <select name="kind" onChange={(e) => setRequestKind(e.target.value)}>
                      <option value="VERIFICATION">Identity verification</option>
                      <option value="USERNAME">Username claim</option>
                      <option value="IMPERSONATION">Report impersonation</option>
                      <option value="APPEAL">Appeal a decision</option>
                    </select>
                  </label>
                  <CategoryPicker onCategoryChange={setCategory} />
                  {requestKind === 'VERIFICATION' &&
                    ['BUSINESS', 'INSTITUTION', 'GOVERNMENT'].includes(category) && (
                      <aside className="organisation-evidence">
                        <strong>Applying for an organisation?</strong>
                        <p>
                          Create or use the account managed by the organisation. Share its official
                          website, a public reference to this account if available, and explain how
                          you are authorised to represent it. A reviewer will independently check
                          these details. Do not include passwords, one-time codes or identity
                          document scans.
                        </p>
                      </aside>
                    )}
                  <label>
                    Requested or reported username (if applicable)
                    <input name="username" pattern="[a-z0-9_]{3,30}" maxLength={30} />
                  </label>
                </>
              )}
              <label>
                Evidence and explanation
                <textarea
                  name="evidence"
                  required
                  minLength={20}
                  maxLength={4000}
                  defaultValue={supplement?.evidence}
                  placeholder="Official website, public references, authority to represent the organisation, or details of the reported account. For an appeal, include the request ID and your explanation."
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit for review'}
              </button>
              {supplement && (
                <button type="button" className="text-button" onClick={() => setSupplement(null)}>
                  Cancel
                </button>
              )}
            </form>
            {rows.map((row) => (
              <article className="identity-row" key={row.id}>
                <strong>
                  {row.kind} · {row.status}
                </strong>
                <p>{row.decision ?? 'Awaiting review.'}</p>
                <small>Reference: {row.id}</small>
                {row.status === 'NEEDS_INFO' && (
                  <button className="text-button" onClick={() => setSupplement(row)}>
                    Add requested information
                  </button>
                )}
              </article>
            ))}
          </>
        )}
        {error && (
          <p className="form-feedback error" role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
export function AccountNotices() {
  const { user } = useSession();
  const [items, setItems] = useState<{ id: string; message: string }[]>([]);
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let live = true;
    const load = () => {
      if (document.visibilityState === 'visible')
        api<{ id: string; message: string; readAt: string | null }[]>('/identity/notices')
          .then((rows) => {
            if (live) setItems(rows.filter((x) => !x.readAt));
          })
          .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [user?.id]);
  if (!items.length) return null;
  return (
    <section className="account-notices" aria-label="Account updates">
      {items.map((item) => (
        <div key={item.id}>
          <p>{item.message}</p>
          <Link to="/settings/verification">View requests</Link>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void api('/identity/notices/' + item.id + '/read', { method: 'PUT' })
                .then(() => setItems((old) => old.filter((x) => x.id !== item.id)))
                .catch((e) => toast(errorMessage(e), 'error'))
            }
          >
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
export function IdentityDesk({ mode }: { mode: 'usernames' | 'verification' }) {
  const [assignmentQuery, setAssignmentQuery] = useState('');
  const [assignmentResults, setAssignmentResults] = useState<User[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<User | null>(null);
  const [rows, setRows] = useState<any[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<any[]>('/admin/identity/' + (mode === 'usernames' ? 'holds' : 'requests'))
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
  }, [mode, refresh]);
  useEffect(() => {
    if (mode !== 'verification') return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      api<User[]>('/admin/identity/users?q=' + encodeURIComponent(query), { signal: c.signal })
        .then(setUsers)
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [mode, query, refresh]);
  useEffect(() => {
    if (mode !== 'usernames' || selectedAccount || assignmentQuery.trim().length < 2) {
      setAssignmentResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<User[]>(
        '/admin/identity/assignment-users?q=' + encodeURIComponent(assignmentQuery.trim()),
        { signal: controller.signal },
      )
        .then(setAssignmentResults)
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, assignmentQuery, selectedAccount]);
  async function save(path: string, data: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/identity/' + path, { method: 'PUT', body: JSON.stringify(data) });
      toast('Saved successfully.', 'success');
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function form(e: FormEvent<HTMLFormElement>, path: string, build: (f: FormData) => unknown) {
    e.preventDefault();
    void save(path, build(new FormData(e.currentTarget)));
  }
  return (
    <div className="identity-desk">
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {mode === 'usernames' ? (
        <>
          <h2>Username reservations</h2>
          <p>
            System names remain protected. Reserving a name never removes it from its current owner.
          </p>
          <form
            className="feature-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save('holds/' + f.get('username'), {
                reason: f.get('reason'),
                release: f.get('action') === 'release',
              });
            }}
          >
            <label>
              Username
              <input name="username" required pattern="[a-z0-9_]{3,30}" maxLength={30} />
            </label>
            <label>
              Action
              <select name="action">
                <option value="reserve">Reserve</option>
                <option value="release">Release unassigned reservation</option>
              </select>
            </label>
            <label>
              Internal reason
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button primary" disabled={busy}>
              Save reservation
            </button>
          </form>
          <h2>Assign a username</h2>
          <p>
            Choose the target account below. This changes its handle, preserves its content and
            protects its former name. Existing ownership conflicts are blocked.
          </p>
          <form
            className="feature-form"
            onSubmit={(e) => form(e, 'assign', (f) => Object.fromEntries(f))}
          >
            <label>
              Find an account
              <input
                value={assignmentQuery}
                onChange={(e) => {
                  setAssignmentQuery(e.target.value);
                  setSelectedAccount(null);
                }}
                placeholder="Search by username or name"
              />
            </label>
            {assignmentResults.map((account) => (
              <button
                type="button"
                className="assignment-account"
                key={account.id}
                onClick={() => {
                  setSelectedAccount(account);
                  setAssignmentQuery(account.displayName + ' @' + account.username);
                }}
              >
                <Avatar user={account} />
                <span>
                  <strong>{account.displayName}</strong> @{account.username}
                </span>
              </button>
            ))}
            {selectedAccount && (
              <p>
                Selected: {selectedAccount.displayName} (@{selectedAccount.username})
              </p>
            )}
            {!selectedAccount && assignmentQuery.trim().length >= 2 && assignmentResults.length === 0 && (
              <p className="form-note">Searching for matching accounts, or no matches found.</p>
            )}
            <input type="hidden" name="userId" value={selectedAccount?.id ?? ''} />
            <label>
              New username
              <input name="username" required pattern="[a-z0-9_]{3,30}" />
            </label>
            <label>
              Reason
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" required />I checked the account and authority to receive this
              name.
            </label>
            <button className="button primary" disabled={busy || !selectedAccount}>
              Assign username
            </button>
          </form>
          <h2>Reserved usernames</h2>
          {rows.length === 0 && <p className="form-note">No reservations found.</p>}
          {rows.map((row) => (
            <article className="identity-row" key={row.username}>
              <strong>@{row.username}</strong>
              <p>{row.reason}</p>
              <small>
                {row.ownerId
                  ? row.owner
                    ? 'Account protection · @' + row.owner.username
                    : 'Account protection'
                  : 'Unassigned'}{' '}
                · {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : 'No expiry'}
              </small>
            </article>
          ))}
        </>
      ) : (
        <>
          <h2>Verification and claims</h2>
          <p>
            Review evidence independently. Approving a username claim does not assign it; a staff
            member with username permission must do that separately. Impersonation reports and
            appeals require the relevant moderation action after review.
          </p>
          {rows.map((row) => (
            <article className="identity-row" key={row.id}>
              <h3>
                @{row.user?.username} · {row.kind}
              </h3>
              <p>
                {row.category} · {row.status} {row.username && '· @' + row.username}
              </p>
              <p className="preserve-lines">{row.evidence}</p>
              <small>Reference: {row.id}</small>
              <p>{row.decision}</p>
              {['PENDING', 'NEEDS_INFO'].includes(row.status) && (
                <form
                  className="feature-form"
                  onSubmit={(e) => form(e, 'requests/' + row.id, (f) => Object.fromEntries(f))}
                >
                  <label>
                    Decision
                    <select name="status">
                      <option value="NEEDS_INFO">Request more information</option>
                      <option value="APPROVED">Approve</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                  </label>
                  <label>
                    Explanation sent to user
                    <textarea name="decision" required minLength={5} maxLength={1000} />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Send decision
                  </button>
                </form>
              )}
            </article>
          ))}
          <h2>Grant or manage a badge</h2>
          <label className="account-search-field">
            Find an account
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Username or display name"
              maxLength={80}
            />
          </label>
          {users.map((user) => (
            <details className="identity-row verification-account" key={user.id}>
              <summary>
                <Avatar user={user} />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>
                    @{user.username} ·{' '}
                    {user.identityStatus === 'VERIFIED'
                      ? 'Verified'
                      : user.identityStatus === 'REVIEW'
                        ? 'Under review'
                        : 'Not verified'}
                  </small>
                </span>
                {user.identityStatus === 'VERIFIED' && (
                  <BadgeSymbol category={user.identityCategory} />
                )}
              </summary>
              <form
                className="feature-form"
                onSubmit={(e) => form(e, 'users/' + user.id, (f) => Object.fromEntries(f))}
              >
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={user.identityStatus === 'VERIFIED' ? 'REVIEW' : 'VERIFIED'}
                  >
                    <option>VERIFIED</option>
                    <option>REVIEW</option>
                    <option>SUSPENDED</option>
                    <option>REVOKED</option>
                  </select>
                </label>
                <CategoryPicker initial={user.identityCategory ?? 'INDIVIDUAL'} />
                <label>
                  Reason
                  <input name="reason" required minLength={5} maxLength={500} />
                </label>
                <button className="button secondary" disabled={busy}>
                  Update verification
                </button>
              </form>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
