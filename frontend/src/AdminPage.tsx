import { IdentityDesk } from './Identity';
import { LaunchAdmin } from './LaunchAdmin';
import { ContentDesk } from './ContentPages';
import { FeatureSettings } from './Features';
import { useToastNotice } from './toast';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from './api';
import { ErrorBox } from './components';
import { PageHeading } from './FeaturePages';
import { useSession } from './session';
type Role = { id: string; key: string; name: string; permissions: string[] };
type Menu = {
  key: string;
  label: string;
  path: string;
  permission: string | null;
  membersOnly: boolean;
  enabled: boolean;
  position: number;
};
type Report = {
  id: string;
  status: string;
  reason: string;
  details: string | null;
  snapshot: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  post: { id: string; body: string; status: string; author: { username: string } };
  reporter: { username: string };
};
type Member = {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roles: { role: Role }[];
};
export default function AdminPage() {
  const session = useSession();
  const permissions = session.user?.permissions ?? [];
  const tabs = [
    ['usernames', 'Username reservations', 'usernames.manage'],
    ['verification', 'Verification & claims', 'verification.manage'],
    ['content', 'Pages & Help', 'pages.edit'],
    ['features', 'Feature releases', 'features.manage'],
    ['launch', 'Launch & maintenance', 'features.manage'],
    ['sports', 'Sports', 'sports.manage'],
    ['discovery', 'Discovery', 'discovery.manage'],
    ['analytics', 'Analytics', 'analytics.view'],
    ['reports', 'Reports', 'moderation.manage'],
    ['users', 'Accounts', 'users.manage'],
    ['roles', 'Roles', 'roles.manage'],
    ['menus', 'Menus', 'menus.manage'],
    ['communities', 'Communities', 'communities.manage'],
    ['topics', 'Topics', 'topics.manage'],
    ['audit', 'Audit history', 'moderation.manage'],
  ].filter((x) => permissions.includes(x[2]));
  const [reportStatus, setReportStatus] = useState('OPEN');
  const [reportReason, setReportReason] = useState('');
  const [reportBefore, setReportBefore] = useState('');
  const [reportHistory, setReportHistory] = useState<string[]>([]);
  const [tab, setTab] = useState('analytics');
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionList, setPermissionList] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useToastNotice(notice);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<any | null>(null);
  const active = tabs.some((x) => x[0] === tab) ? tab : tabs[0]?.[0];
  useEffect(() => {
    if (!active) return;
    if (
      active === 'usernames' ||
      active === 'verification' ||
      active === 'content' ||
      active === 'features' ||
      active === 'launch' ||
      active === 'sports' ||
      active === 'analytics' ||
      active === 'discovery'
    ) {
      setRows([]);
      setEditing(null);
      setError('');
      return;
    }
    let alive = true;
    setError('');
    setRows([]);
    setEditing(null);
    const path =
      active === 'communities'
        ? '/admin/communities'
        : active === 'topics'
          ? '/catalog/topics'
          : `/admin/${active}` +
            (active === 'reports'
              ? '?' +
                new URLSearchParams({
                  status: reportStatus,
                  ...(reportReason ? { reason: reportReason } : {}),
                  ...(reportBefore ? { before: reportBefore } : {}),
                })
              : '');
    api<any>(path)
      .then((data) => {
        if (!alive) return;
        if (active === 'roles') {
          setRows(data.roles);
          setPermissionList(data.permissions);
        } else setRows(data);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    if (active === 'users')
      api<{ roles: Role[]; permissions: string[] }>('/admin/roles')
        .then((x) => {
          if (alive) setRoles(x.roles);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, refresh, session.user?.id, reportStatus, reportReason, reportBefore]);
  async function mutate(path: string, data: any = {}) {
    setError('');
    setNotice('');
    try {
      await api(path, { method: 'PUT', body: JSON.stringify(data) });
      setNotice('Saved successfully.');
      setRefresh((n) => n + 1);
      window.dispatchEvent(new Event('navigation-updated'));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const key = String(form.get('key') ?? '');
    if (active === 'roles')
      await mutate(`/admin/roles/${key}`, {
        name: form.get('name'),
        permissions: form.getAll('permissions'),
      });
    if (active === 'menus')
      await mutate(`/admin/menus/${key}`, {
        label: form.get('label'),
        path: form.get('path'),
        ...(form.get('permission') ? { permission: form.get('permission') } : {}),
        membersOnly: form.has('membersOnly'),
        enabled: form.has('enabled'),
        position: Number(form.get('position')),
      });
    if (active === 'communities') {
      let logoMediaId = editing?.logoMediaId ?? null;
      const logo = form.get('communityLogo');
      if (form.has('removeCommunityLogo')) {
        logoMediaId = null;
      } else if (logo instanceof File && logo.size > 0) {
        try {
          const body = new FormData();
          body.append('file', logo);
          logoMediaId = (await api<{ id: string }>('/media/community', { method: 'POST', body }))
            .id;
        } catch (e) {
          setError(errorMessage(e));
          return;
        }
      }
      await mutate(`/admin/communities/${editing?.id ?? crypto.randomUUID()}`, {
        slug: form.get('slug'),
        name: form.get('name'),
        description: form.get('description'),
        kind: form.get('kind'),
        active: form.has('active'),
        logoMediaId,
      });
    }
    if (active === 'topics')
      await mutate(`/admin/topics/${editing?.id ?? crypto.randomUUID()}`, {
        slug: form.get('slug'),
        name: form.get('name'),
      });
  }
  return (
    <>
      <PageHeading
        title="Administration"
        subtitle="Permissions, community safety and publishing controls."
      />
      {session.loading ? (
        <p className="page-panel">Checking access…</p>
      ) : !tabs.length ? (
        <div className="page-panel">
          <ErrorBox message="Administrator or moderator permission required." />
          <p className="muted">
            The first administrator is granted through a trusted local command. Registration does
            not grant staff access.
          </p>
        </div>
      ) : (
        <>
          <div className="feature-tabs">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={active === key ? 'active' : ''}
                onClick={() => {
                  setTab(key);
                  setNotice('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="page-panel">
            {error && <ErrorBox message={error} />}
            {active === 'features' && <FeatureSettings />}
            {active === 'launch' && <LaunchAdmin />}
            {active === 'usernames' && <IdentityDesk mode="usernames" />}
            {active === 'verification' && <IdentityDesk mode="verification" />}
            {active === 'content' && <ContentDesk />}
            {active === 'sports' && (
              <p>
                <Link className="button primary" to="/sports/desk">
                  Manage campus competitions →
                </Link>
              </p>
            )}
            {active === 'discovery' && (
              <p>
                <Link className="button primary" to="/admin/discovery">
                  Manage announcements, topics & sponsors →
                </Link>
              </p>
            )}
            {active === 'analytics' && (
              <p>
                <Link className="button primary" to="/admin/analytics">
                  Open full analytics dashboard →
                </Link>
              </p>
            )}
            {active === 'reports' && (
              <div className="admin-list">
                <div className="report-filters">
                  <label>
                    Report status
                    <select
                      aria-label="Report status"
                      value={reportStatus}
                      onChange={(e) => {
                        setReportStatus(e.target.value);
                        setReportBefore('');
                        setReportHistory([]);
                      }}
                    >
                      <option value="OPEN">Open</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="ALL">All</option>
                    </select>
                  </label>
                  <label>
                    Report reason
                    <select
                      aria-label="Report reason"
                      value={reportReason}
                      onChange={(e) => {
                        setReportReason(e.target.value);
                        setReportBefore('');
                        setReportHistory([]);
                      }}
                    >
                      <option value="">All reasons</option>
                      {['SCAM', 'IMPERSONATION', 'THREAT', 'HARASSMENT', 'OTHER'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {!rows.length && <p className="muted">No reports to review.</p>}
                {(rows as Report[]).map((report) => (
                  <section key={report.id} className="admin-card">
                    <div>
                      <strong>{report.reason}</strong>
                      <span className="pill">{report.status}</span>
                    </div>
                    <p>
                      Post by @{report.post.author.username} · reported by @
                      {report.reporter.username}
                    </p>
                    <p className="report-body">{report.snapshot ?? report.post.body}</p>
                    {report.details && <p>{report.details}</p>}
                    {report.reviewNote && (
                      <p className="review-note">
                        Review: {report.reviewNote}{' '}
                        {report.reviewedAt && (
                          <small> · {new Date(report.reviewedAt).toLocaleString()}</small>
                        )}
                      </p>
                    )}
                    <form
                      className="feature-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void mutate(`/admin/posts/${report.post.id}/moderation`, {
                          status: report.post.status === 'HIDDEN' ? 'PUBLISHED' : 'HIDDEN',
                          reason: form.get('reason'),
                        });
                      }}
                    >
                      <label>
                        Moderation reason
                        <input name="reason" minLength={5} maxLength={500} required />
                      </label>
                      <button className="button secondary small">
                        {report.post.status === 'HIDDEN' ? 'Restore post' : 'Hide post'}
                      </button>
                    </form>
                    <form
                      className="feature-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mutate(
                          `/admin/reports/${report.id}/${report.status === 'OPEN' ? 'resolve' : 'reopen'}`,
                          { note: new FormData(e.currentTarget).get('note') },
                        );
                      }}
                    >
                      <label>
                        Review note
                        <input
                          name="note"
                          required
                          minLength={5}
                          maxLength={500}
                          placeholder="Record the outcome or why more review is needed"
                        />
                      </label>
                      <button className="button secondary small">
                        {report.status === 'OPEN' ? 'Resolve report' : 'Reopen report'}
                      </button>
                    </form>
                  </section>
                ))}
                <div className="modal-actions">
                  {reportHistory.length > 0 && (
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setReportBefore(reportHistory.at(-1) ?? '');
                        setReportHistory((x) => x.slice(0, -1));
                      }}
                    >
                      Previous reports
                    </button>
                  )}
                  {rows.length === 100 && (
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setReportHistory((x) => [...x, reportBefore]);
                        setReportBefore(rows.at(-1).id);
                      }}
                    >
                      Older reports
                    </button>
                  )}
                </div>
              </div>
            )}
            {active === 'users' &&
              (rows as Member[]).map((member) => (
                <section key={member.id} className="admin-card">
                  <h3>
                    {member.displayName} <small>@{member.username}</small>
                  </h3>
                  <p>
                    <small>Account UUID: {member.id}</small>
                    <br />
                    {member.status} · {member.roles.map((x) => x.role.name).join(', ') || 'Member'}
                  </p>
                  {permissions.includes('roles.manage') && (
                    <form
                      className="feature-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void mutate(`/admin/users/${member.id}/roles`, {
                          roleIds: new FormData(e.currentTarget).getAll('roleIds'),
                        });
                      }}
                    >
                      <fieldset>
                        <legend>Roles</legend>
                        {roles.map((role) => (
                          <label className="checkbox-label" key={role.id}>
                            <input
                              type="checkbox"
                              name="roleIds"
                              value={role.id}
                              defaultChecked={member.roles.some((x) => x.role.id === role.id)}
                            />
                            {role.name}
                          </label>
                        ))}
                      </fieldset>
                      <button className="button secondary small">Save roles</button>
                    </form>
                  )}
                  <form
                    className="feature-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutate(`/admin/users/${member.id}/status`, {
                        status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        reason: new FormData(e.currentTarget).get('reason'),
                      });
                    }}
                  >
                    <label>
                      Reason
                      <input name="reason" minLength={5} maxLength={500} required />
                    </label>
                    <button
                      className="button secondary small"
                      disabled={member.id === session.user?.id}
                    >
                      {member.status === 'ACTIVE' ? 'Suspend account' : 'Reactivate account'}
                    </button>
                  </form>
                </section>
              ))}
            {['roles', 'menus', 'communities', 'topics'].includes(active) && (
              <>
                <button className="button primary small" onClick={() => setEditing({})}>
                  Add{' '}
                  {active === 'roles'
                    ? 'role'
                    : active === 'menus'
                      ? 'menu'
                      : active === 'topics'
                        ? 'topic'
                        : 'community'}
                </button>
                {editing && (
                  <form
                    className="feature-form admin-editor"
                    key={editing.id ?? editing.key ?? 'new'}
                    onSubmit={save}
                  >
                    {['roles', 'menus'].includes(active) ? (
                      <label>
                        Key
                        <input
                          name="key"
                          defaultValue={editing.key}
                          required
                          pattern="[a-z0-9-]{2,50}"
                          readOnly={!!editing.key}
                        />
                      </label>
                    ) : (
                      <label>
                        Slug
                        <input
                          name="slug"
                          defaultValue={editing.slug}
                          required
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          maxLength={active === 'topics' ? 60 : 80}
                        />
                      </label>
                    )}
                    {active !== 'menus' && (
                      <label>
                        Name
                        <input
                          name="name"
                          defaultValue={editing.name}
                          required
                          maxLength={active === 'communities' ? 100 : 80}
                        />
                      </label>
                    )}
                    {active === 'roles' && (
                      <fieldset>
                        <legend>Permissions</legend>
                        {permissionList.map((permission) => (
                          <label className="checkbox-label" key={permission}>
                            <input
                              type="checkbox"
                              name="permissions"
                              value={permission}
                              defaultChecked={editing.permissions?.includes(permission)}
                            />
                            {permission}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    {active === 'menus' && (
                      <>
                        <label>
                          Label
                          <input
                            name="label"
                            defaultValue={editing.label}
                            maxLength={80}
                            required
                          />
                        </label>
                        <label>
                          Destination
                          <select
                            aria-label="Destination"
                            name="path"
                            defaultValue={editing.path ?? '/'}
                          >
                            {[
                              '/sports',
                              '/sports/desk',
                              '/',
                              '/notifications',
                              '/search',
                              '/articles',
                              '/communities',
                              '/bookmarks',
                              '/settings',
                              '/me',
                              '/admin',
                              '/editorial',
                            ].map((path) => (
                              <option key={path}>{path}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Permission
                          <select
                            aria-label="Permission"
                            name="permission"
                            defaultValue={editing.permission ?? ''}
                          >
                            <option value="">No extra permission</option>
                            {[
                              'sports.report',
                              'sports.manage',
                              'moderation.manage',
                              'users.manage',
                              'roles.manage',
                              'menus.manage',
                              'articles.write',
                              'articles.publish',
                              'communities.manage',
                              'topics.manage',
                            ].map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Position
                          <input
                            name="position"
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={editing.position ?? 0}
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            name="membersOnly"
                            defaultChecked={editing.membersOnly}
                          />
                          Members only
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            name="enabled"
                            defaultChecked={editing.enabled ?? true}
                          />
                          Enabled
                        </label>
                      </>
                    )}
                    {active === 'communities' && (
                      <>
                        <label>
                          Community logo{' '}
                          <input
                            name="communityLogo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                          />
                        </label>
                        {editing.logoMediaId && (
                          <label className="checkbox-label">
                            <input type="checkbox" name="removeCommunityLogo" /> Remove existing
                            logo
                          </label>
                        )}
                        <label>
                          Description
                          <textarea
                            name="description"
                            defaultValue={editing.description}
                            maxLength={1000}
                          />
                        </label>
                        <label>
                          Type
                          <select
                            aria-label="Type"
                            name="kind"
                            defaultValue={editing.kind ?? 'INTEREST'}
                          >
                            {['DEPARTMENT', 'INTEREST', 'ASPIRANTS', 'ALUMNI'].map((kind) => (
                              <option key={kind}>{kind}</option>
                            ))}
                          </select>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            name="active"
                            defaultChecked={editing.active ?? true}
                          />
                          Active
                        </label>
                      </>
                    )}
                    <button className="button primary small">Save</button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </form>
                )}
                <div className="admin-list">
                  {rows.map((row) => (
                    <div key={row.id ?? row.key}>
                      <strong>{row.name ?? row.label}</strong>
                      <span>{row.key ?? row.slug}</span>
                      <button
                        className="text-button"
                        disabled={active === 'roles' && row.key === 'administrator'}
                        onClick={() => setEditing(row)}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {active === 'audit' && (
              <div className="admin-list">
                {rows.map((row) => (
                  <section className="admin-card" key={row.id}>
                    <strong>{row.action}</strong>
                    <p>{row.reason}</p>
                    <small>
                      {new Date(row.createdAt).toLocaleString()} · {row.targetId}
                    </small>
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
