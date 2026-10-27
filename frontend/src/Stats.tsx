import { InstallStats } from './Ads';
import { BackButton } from './Navigation';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from './api';
import { ErrorBox } from './components';
import { useSession } from './session';
import { excludeMeasurement, measurementExcluded } from './analytics-tracker';
import { toast } from './toast';
type Summary = {
  generatedAt: string;
  timezone: string;
  trackingSince: string;
  period: string;
  partial: boolean;
  publicRankingsEnabled: boolean;
  metrics: Record<string, number | null>;
  series: {
    day: string;
    pageViews: number;
    visitors: number;
    activeMembers: number;
    newMembers: number;
    measured: boolean;
  }[];
};
type Rank = { label: string; href: string; count: number };
type Rankings = {
  scope?: string;
  enabled?: boolean;
  message?: string;
  followers?: Rank[];
  likedPosts?: Rank[];
  discussedPosts?: Rank[];
  viewedPosts?: Rank[];
  repostedPosts?: Rank[];
  communities?: Rank[];
};
type Admin = Summary & {
  admin: Record<string, number | null> & { mediaProvider: string };
  pages: { page: string; views: number }[];
  sources: { source: string; visitors: number }[];
  modules: { key: string; title: string; status: string; message: string }[];
};
type Report = {
  weekStart: string;
  weekEnd: string;
  capturedAt: string;
  partial: boolean;
  publicData: Summary;
  adminData?: { metrics: Record<string, number | null>; scope: string };
};
const number = (v: number | null | undefined) =>
  v == null ? 'Not available' : v.toLocaleString('en-NG');
const bytes = (v: number | null | undefined) =>
  v == null
    ? 'Not available'
    : v >= 1073741824
      ? (v / 1073741824).toFixed(2) + ' GiB'
      : (v / 1048576).toFixed(2) + ' MiB';
const date = (s: string) =>
  new Date(s).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null | undefined | string;
  note?: string;
}) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{typeof value === 'string' ? value : number(value)}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function exportCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) =>
      r.map((v) => '"' + String(v ?? 'Not available').replace(/"/g, '""') + '"').join(','),
    )
    .join('\r\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function ActivityChart({ data }: { data: Summary }) {
  const [metric, setMetric] = useState<'pageViews' | 'visitors' | 'activeMembers' | 'newMembers'>(
    'pageViews',
  );
  const actualMax = Math.max(0, ...data.series.map((d) => d[metric]));
  const max = Math.max(1, actualMax);
  const width = 700,
    slot = width / Math.max(1, data.series.length);
  return (
    <section className="stats-section">
      <h2>Daily measured activity</h2>
      <div className="feature-tabs">
        {(['pageViews', 'visitors', 'activeMembers', 'newMembers'] as const).map((k) => (
          <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>
            {k === 'pageViews'
              ? 'Page views'
              : k === 'visitors'
                ? 'Visitor-days'
                : k === 'newMembers'
                  ? 'Registrations'
                  : 'Active members'}
          </button>
        ))}
      </div>
      <svg
        className="stats-chart"
        viewBox="0 0 740 210"
        role="img"
        aria-label={'Daily ' + metric + '; values available in the table below'}
      >
        <line x1="20" y1="180" x2="720" y2="180" stroke="#bbcbbf" />
        {data.series.map((d, i) => (
          <rect
            key={d.day}
            x={20 + i * slot + 1}
            y={180 - (d[metric] / max) * 145}
            width={Math.max(1, slot - 2)}
            height={d.measured || metric === 'newMembers' ? (d[metric] / max) * 145 : 0}
            rx="2"
            fill="#2d7655"
          >
            <title>
              {d.day}: {d.measured || metric === 'newMembers' ? number(d[metric]) : 'Not measured'}
            </title>
          </rect>
        ))}
        <text x="20" y="202" fontSize="12">
          {data.series[0]?.day}
        </text>
        <text x="720" y="202" fontSize="12" textAnchor="end">
          {data.series.at(-1)?.day}
        </text>
        <text x="20" y="20" fontSize="12">
          Daily maximum: {number(actualMax)}
        </text>
      </svg>
      <p className="form-note">
        All-time charts show the last 90 days. Dates use Nigeria time; visitors are deduplicated per
        browser per day. Registrations count currently active accounts; daily audience aggregates
        retain measured activity at the time.
      </p>
      <details>
        <summary>View daily figures</summary>
        <div className="stats-table-wrap">
          <table className="stats-daily-table">
            <thead>
              <tr>
                <th>Date (WAT)</th>
                <th>Page views</th>
                <th>Visitor-days</th>
                <th>Active members</th>
                <th>Registrations</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  {(['pageViews', 'visitors', 'activeMembers', 'newMembers'] as const).map((k) => (
                    <td key={k}>
                      {d.measured || k === 'newMembers' ? number(d[k]) : 'Not measured'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
function RankingLists({ data }: { data: Rankings }) {
  const lists: [keyof Rankings, string][] = [
    ['followers', 'Most followed members'],
    ['likedPosts', 'Most liked posts / articles'],
    ['discussedPosts', 'Most discussed posts / articles'],
    ['viewedPosts', 'Most viewed (signed-in view-days)'],
    ['repostedPosts', 'Most reposted posts / articles'],
    ['communities', 'Communities by membership'],
  ];
  return (
    <section className="stats-section">
      <h2>Rankings</h2>
      {data.enabled === false ? (
        <p>
          {data.message} An administrator can enable public discovery rankings when the community is
          ready.
        </p>
      ) : (
        <>
          <p className="form-note">
            {data.scope} Replies are direct replies; views count signed-in member/post/UTC-day
            records. Popularity is not verification or an endorsement.
          </p>
          <div className="stats-rankings">
            {lists.map(([key, title]) => (
              <section key={key}>
                <h3>{title}</h3>
                {!(data[key] as Rank[] | undefined)?.length ? (
                  <p className="muted">No eligible activity yet.</p>
                ) : (
                  <ol>
                    {(data[key] as Rank[]).map((r, i) => (
                      <li key={r.href + '-' + i}>
                        <Link to={r.href}>{r.label}</Link>
                        <strong>{number(r.count)}</strong>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function Reports({
  reports,
  admin = false,
  hasMore = false,
  moreBusy = false,
  onMore,
}: {
  reports: Report[];
  admin?: boolean;
  hasMore?: boolean;
  moreBusy?: boolean;
  onMore: () => void;
}) {
  return (
    <section className="stats-section">
      <h2>Weekly reports</h2>
      <p className="form-note">
        Monday–Sunday in Nigeria time. Saved snapshots show the figures as observed when captured,
        and do not change when live totals change.
      </p>
      {!reports.length ? (
        <p>
          No completed weekly report yet. The first report is saved after the next Monday boundary
          while the API is running.
        </p>
      ) : (
        reports.map((r) => (
          <details key={r.weekStart} className="stats-report">
            <summary>
              Week of {r.weekStart.slice(0, 10)} {r.partial ? '· Partial measurement' : ''}
            </summary>
            <p>Captured {date(r.capturedAt)} WAT</p>
            <div className="stat-grid">
              {[
                'newMembers',
                'posts',
                'replies',
                'articles',
                'activeMembers',
                'pageViews',
                'visitorDays',
              ].map((k) => (
                <Metric
                  key={k}
                  label={k.replace(/([A-Z])/g, ' $1')}
                  value={r.publicData.metrics[k]}
                />
              ))}
            </div>
            {admin && r.adminData && (
              <>
                <p>{r.adminData.scope}</p>
                <div className="stats-table-wrap">
                  <table>
                    <tbody>
                      {Object.entries(r.adminData.metrics).map(([k, v]) => (
                        <tr key={k}>
                          <th>{k}</th>
                          <td>{number(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <button
              className="button secondary small"
              onClick={() =>
                exportCsv('fpiupdates-week-' + r.weekStart.slice(0, 10) + '.csv', [
                  ['metric', 'value'],
                  ['weekStart', r.weekStart],
                  ['weekEnd', r.weekEnd],
                  ['capturedAt', r.capturedAt],
                  ['partial', r.partial ? 'yes' : 'no'],
                  ...Object.entries(r.publicData.metrics),
                  ...(admin && r.adminData ? Object.entries(r.adminData.metrics) : []),
                ])
              }
            >
              Download report CSV
            </button>
          </details>
        ))
      )}
      {hasMore && (
        <button className="button secondary small" disabled={moreBusy} onClick={onMore}>
          {moreBusy ? 'Loading…' : 'Older weekly reports'}
        </button>
      )}
    </section>
  );
}
function MeasurementPreferences() {
  const { user } = useSession();
  const [excluded, setExcluded] = useState(measurementExcluded());
  const [ranking, setRanking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefLoading, setPrefLoading] = useState(!!user);
  useEffect(() => {
    setRanking(false);
    if (!user) {
      setPrefLoading(false);
      return;
    }
    const c = new AbortController();
    setPrefLoading(true);
    api<{ excludeFromPublicRankings: boolean }>('/stats/preferences', { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setRanking(r.excludeFromPublicRankings);
      })
      .catch(() => {})
      .finally(() => {
        if (!c.signal.aborted) setPrefLoading(false);
      });
    return () => c.abort();
  }, [user?.id]);
  return (
    <section className="stats-section" id="stats-privacy">
      <h2>Your privacy choices</h2>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => {
            excludeMeasurement(e.target.checked);
            setExcluded(measurementExcluded());
          }}
        />
        Exclude this browser from audience measurement
      </label>
      <p className="form-note">
        We also honour Do Not Track / Global Privacy Control. Browser exclusion stops future
        audience beacons; it does not erase previously aggregated figures. Operational API counters
        are separate.
      </p>
      {user && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ranking}
            disabled={busy || prefLoading}
            onChange={async (e) => {
              const value = e.target.checked;
              setRanking(value);
              setBusy(true);
              try {
                await api('/stats/preferences', {
                  method: 'PUT',
                  body: JSON.stringify({ excludeFromPublicRankings: value }),
                });
                setRanking(value);
                window.dispatchEvent(new Event('rankings-updated'));
                toast('Ranking preference saved.', 'success');
              } catch (e) {
                setRanking(!value);
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          />
          Exclude my account and posts from public rankings
        </label>
      )}
    </section>
  );
}
export function StatsPage({ admin = false }: { admin?: boolean }) {
  const { user, loading: sessionLoading } = useSession();
  const canView = !!user?.permissions?.includes('analytics.view');
  const canManage = !!user?.permissions?.includes('analytics.manage');
  const [period, setPeriod] = useState('7d');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Summary | Admin | null>(null);
  const [ranks, setRanks] = useState<Rankings | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const scope = (admin ? 'admin:' : 'public:') + (user?.id ?? 'anon') + ':' + period;
  const [loadedScope, setLoadedScope] = useState('');
  const privacyScrolled = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [moreReportsBusy, setMoreReportsBusy] = useState(false);
  useEffect(() => {
    if (sessionLoading || (admin && !canView)) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    if (loadedScope !== scope) {
      setLoading(true);
      setData(null);
      setRanks(null);
    }
    setError('');
    const base = admin ? '/admin/analytics' : '/stats';
    Promise.all([
      api<Summary | Admin>(base + '?period=' + period, { signal: c.signal }),
      api<Rankings>(base + '/rankings', { signal: c.signal }),
      api<Report[]>(base + '/reports', { signal: c.signal }),
    ])
      .then(([s, r, w]) => {
        if (c.signal.aborted) return;
        setData(s);
        setRanks(r);
        setReports(w);
        setHasMoreReports(w.length === 12);
        setLoadedScope(scope);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [admin, canView, sessionLoading, period, refresh, user?.id]);
  useEffect(() => {
    const refreshPage = () => setRefresh((n) => n + 1);
    const timer = setInterval(() => {
      if (!document.hidden) refreshPage();
    }, 60000);
    window.addEventListener('rankings-updated', refreshPage);
    return () => {
      clearInterval(timer);
      window.removeEventListener('rankings-updated', refreshPage);
    };
  }, []);
  async function olderReports() {
    const last = reports.at(-1);
    if (!last || moreReportsBusy) return;
    const owner = scope;
    setMoreReportsBusy(true);
    try {
      const rows = await api<Report[]>(
        (admin ? '/admin/analytics' : '/stats') +
          '/reports?' +
          new URLSearchParams({ before: last.weekStart.slice(0, 10) }),
      );
      if (scopeRef.current !== owner) return;
      setReports((current) => [
        ...current,
        ...rows.filter((r) => !current.some((c) => c.weekStart === r.weekStart)),
      ]);
      setHasMoreReports(rows.length === 12);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setMoreReportsBusy(false);
    }
  }
  async function toggleRankings() {
    if (!data) return;
    setSaving(true);
    try {
      await api('/admin/analytics/settings', {
        method: 'PUT',
        body: JSON.stringify({ publicRankings: !data.publicRankingsEnabled }),
      });
      toast('Public ranking setting saved.', 'success');
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    if (location.hash !== '#stats-privacy') {
      privacyScrolled.current = false;
      return;
    }
    if (!admin && data && loadedScope === scope && !privacyScrolled.current)
      requestAnimationFrame(() => {
        const el = document.getElementById('stats-privacy');
        if (el) {
          el.scrollIntoView();
          privacyScrolled.current = true;
        }
      });
  }, [admin, data, loadedScope, scope]);
  const details = admin && data ? ('admin' in data ? data : null) : null;
  const m = data?.metrics;
  return (
    <>
      <div className="page-heading">
        <BackButton />
        <div>
          <h1>{admin ? 'Admin analytics' : 'Platform stats'}</h1>
          <p>
            {admin
              ? 'Growth, engagement, operations and future business reporting.'
              : 'An open view of the community we are building.'}
          </p>
        </div>
      </div>
      {admin && !canView ? (
        <section className="page-panel">
          <ErrorBox
            message={sessionLoading ? 'Checking access…' : 'Analytics permission required.'}
          />
        </section>
      ) : (
        <div className={'stats-page' + (admin ? ' admin-stats-page' : '')}>
          <div className="stats-controls">
            <label>
              Period
              <select
                aria-label="Statistics period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </label>
            <button className="button secondary small" onClick={() => setRefresh((n) => n + 1)}>
              Refresh stats
            </button>
            {data && (
              <button
                className="text-button"
                onClick={() =>
                  exportCsv('fpiupdates-stats-' + period + '.csv', [
                    ['metric', 'value'],
                    ['generatedAt', data.generatedAt],
                    ['period', period],
                    ['timezone', 'Africa/Lagos'],
                    ['trackingSince', data.trackingSince],
                    ...Object.entries(data.metrics),
                    ...(details ? Object.entries(details.admin) : []),
                  ])
                }
              >
                Download CSV
              </button>
            )}
            {!admin && canView && <Link to="/admin/analytics">Admin dashboard →</Link>}
          </div>
          {admin && (
            <div className="feature-tabs stats-tabs">
              {[
                'overview',
                'growth',
                'engagement',
                'rankings',
                'safety',
                'operations',
                'reports',
                'future',
                'settings',
              ].map((t) => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}
          {error && <ErrorBox message={error} />}
          {loading || (loadedScope !== scope && !error) ? (
            <p role="status">Loading statistics…</p>
          ) : (
            data &&
            m && (
              <>
                <p className="stats-meta">
                  Updated {date(data.generatedAt)} WAT · audience measurement started{' '}
                  {date(data.trackingSince)} WAT. Public snapshots may be cached for 30 seconds;
                  this page refreshes every minute while visible.
                </p>
                {data.partial && (
                  <p className="stats-notice">
                    Audience figures cover only the measured part of this period. Historical
                    visitors cannot be reconstructed. Content totals count records currently
                    eligible to be public.
                  </p>
                )}
                {(!admin || tab === 'overview') && (
                  <>
                    <div className="stat-grid">
                      <Metric
                        label="Community members"
                        value={m.members}
                        note="Current active-status accounts"
                      />
                      <Metric
                        label="New members"
                        value={m.newMembers}
                        note="Registered during this period"
                      />
                      <Metric
                        label="Active members"
                        value={m.activeMembers}
                        note="Distinct measured signed-in accounts"
                      />
                      <Metric
                        label="Online now (estimate)"
                        value={m.onlineNow}
                        note="Measured signed-in activity in the last 5 minutes"
                      />
                      <Metric
                        label="Posts"
                        value={m.posts}
                        note="Public social posts created in this period"
                      />
                      <Metric label="Replies / comments" value={m.replies} />
                      <Metric label="Articles published" value={m.articles} />
                      <Metric label="Active communities" value={m.communities} />
                      <Metric label="Likes" value={m.likes} />
                      <Metric label="Reposts" value={m.reposts} />
                      <Metric
                        label="Quotes"
                        value={m.quotes}
                        note="Also included within posts/replies"
                      />
                      <Metric label="Measured page views" value={m.pageViews} />
                      <Metric
                        label={period === 'today' ? 'Estimated daily visitors' : 'Visitor-days'}
                        value={m.visitorDays}
                        note="One browser on two days counts twice"
                      />
                      <Metric
                        label="Signed-in post view-days"
                        value={m.postViewDays}
                        note="One member per post per UTC day; separate from page views"
                      />
                    </div>
                    <ActivityChart data={data} />
                  </>
                )}
                {details && tab === 'growth' && (
                  <>
                    <div className="stat-grid">
                      <Metric
                        label="All accounts"
                        value={details.admin.accounts}
                        note="Currently stored, including suspended accounts"
                      />
                      <Metric label="Verified email" value={details.admin.verified} />
                      <Metric label="Unverified email" value={details.admin.unverified} />
                      <Metric label="Suspended accounts" value={details.admin.suspended} />
                      <Metric
                        label="Members active on 2+ days"
                        value={details.admin.returningMembers}
                        note="Observed on 2+ days in the selected period"
                      />
                      <Metric
                        label="Mature cohort members"
                        value={details.admin.cohortMembers}
                        note="Registered after tracking began, at least 14 days ago; rolling 90-day window"
                      />
                      <Metric
                        label="Week-two returning members"
                        value={details.admin.cohortReturned}
                        note="Measured return on registration days 7–13"
                      />
                      <Metric
                        label="Week-two return rate"
                        value={
                          details.admin.weekTwoReturnRate == null
                            ? 'Waiting for mature cohort'
                            : details.admin.weekTwoReturnRate + '%'
                        }
                      />
                      <Metric
                        label="Unexpired sessions"
                        value={details.admin.unexpiredSessions}
                        note="Sessions are not people online"
                      />
                    </div>
                    <ActivityChart data={data} />
                    <section className="stats-section">
                      <h2>Entry sources</h2>
                      <p>
                        Estimated daily browsers by their first measured entry source. No full
                        referrer URLs or search terms are stored.
                      </p>
                      {details.sources.length ? (
                        <ul>
                          {details.sources.map((s) => (
                            <li key={s.source}>
                              {s.source}: {number(s.visitors)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No measured entry sources yet.</p>
                      )}
                    </section>
                  </>
                )}
                {details && tab === 'engagement' && (
                  <>
                    <div className="stat-grid">
                      {(
                        [
                          'allPostsCreated',
                          'draftArticles',
                          'workingCopies',
                          'scheduledArticles',
                          'bookmarks',
                          'notifications',
                        ] as const
                      ).map((k) => (
                        <Metric
                          key={k}
                          label={
                            (
                              {
                                allPostsCreated: 'All posts created in period',
                                draftArticles: 'Current draft articles',
                                workingCopies: 'Saved working copies',
                                scheduledArticles: 'Scheduled articles',
                                bookmarks: 'Bookmarks created in period',
                                notifications: 'Retained notifications from period',
                              } as Record<string, string>
                            )[k]
                          }
                          value={details.admin[k]}
                        />
                      ))}
                    </div>
                    <section className="stats-section">
                      <h2>Measured page categories</h2>
                      <p>
                        Aggregate categories only; individual browsing histories and private URL
                        paths are not collected.
                      </p>
                      <ul>
                        {details.pages.map((p) => (
                          <li key={p.page}>
                            {p.page}: {number(p.views)} page views
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}
                {ranks && (!admin || tab === 'rankings') && <RankingLists data={ranks} />}
                {details && tab === 'safety' && (
                  <div className="stat-grid">
                    <Metric label="Open reports" value={details.admin.openReports} />
                    <Metric label="Resolved in period" value={details.admin.resolvedReports} />
                    <Metric
                      label="Median review time (hours)"
                      value={details.admin.medianReviewHours}
                    />
                    <Metric label="Hidden posts (current)" value={details.admin.hiddenPosts} />
                    <Metric
                      label="Soft-deleted posts (current)"
                      value={details.admin.softDeletedPosts}
                    />
                    <Metric label="Suspended accounts" value={details.admin.suspended} />
                  </div>
                )}
                {details && tab === 'operations' && (
                  <>
                    <div className="stat-grid">
                      <Metric
                        label="Storage provider"
                        value={String(details.admin.mediaProvider ?? 'Not available')}
                      />
                      <Metric
                        label="Recorded media"
                        value={bytes(details.admin.mediaBytes as number | null)}
                        note="Application records; may differ from provider usage"
                      />
                      <Metric label="Media files" value={details.admin.mediaFiles} />
                      <Metric
                        label="Application media limit"
                        value={bytes(details.admin.mediaCapacityBytes as number | null)}
                      />
                      <Metric
                        label="Remaining application allowance"
                        value={bytes(
                          Math.max(
                            0,
                            Number(details.admin.mediaCapacityBytes ?? 0) -
                              Number(details.admin.mediaBytes ?? 0),
                          ),
                        )}
                        note="Not the provider's remaining quota"
                      />
                      <Metric
                        label="Uploaded in period"
                        value={bytes(details.admin.uploadedBytes)}
                      />
                      <Metric label="Database size" value={bytes(details.admin.databaseBytes)} />
                      <Metric label="Recorded API requests" value={details.admin.apiRequests} />
                      <Metric
                        label="Recorded server errors (5xx)"
                        value={details.admin.apiErrors}
                      />
                      <Metric
                        label="Mean response time (ms)"
                        value={details.admin.meanResponseMs}
                      />
                      <Metric label="Responses ≥1 second" value={details.admin.slowRequests} />
                      <Metric
                        label="Current API process uptime (seconds)"
                        value={details.admin.processUptimeSeconds}
                      />
                      <Metric
                        label="Current process memory (RSS)"
                        value={bytes(details.admin.processRssBytes)}
                      />
                      <Metric
                        label="Current process JS heap"
                        value={bytes(details.admin.processHeapBytes)}
                      />
                    </div>
                    <p className="form-note">
                      Media usage above is calculated from application records and does not include
                      objects outside FpiUpdates or other Neon branches. Check the{' '}
                      <a href="https://console.neon.tech/" target="_blank" rel="noreferrer">
                        Neon console
                      </a>{' '}
                      for your provider quota and network usage.
                    </p>
                    <p className="form-note">
                      API aggregates flush about every minute and can lose an unflushed buffer on a
                      crash. Health checks and collection beacons are excluded. Process uptime is
                      not a site-availability percentage.
                    </p>
                  </>
                )}
                {(!admin || tab === 'reports') && (
                  <Reports
                    reports={reports}
                    admin={admin}
                    hasMore={hasMoreReports}
                    moreBusy={moreReportsBusy}
                    onMore={() => void olderReports()}
                  />
                )}
                {details && tab === 'future' && (
                  <section className="stats-section">
                    <h2>Business reporting and future modules</h2>
                    <p>
                      Availability is shown explicitly. Unconnected sales, revenue and ticketing
                      features have no financial figures; cohort reports become available when
                      enough measured history exists.
                    </p>
                    <div className="stats-rankings">
                      {details.modules.map((mod) => (
                        <section key={mod.key}>
                          <span className="pill">
                            {mod.status === 'available'
                              ? 'Available'
                              : mod.status === 'waiting_for_data'
                                ? 'Waiting for data'
                                : 'Not configured'}
                          </span>
                          <h3>{mod.title}</h3>
                          <p>{mod.message}</p>
                          {mod.key === 'payments' && (
                            <ul>
                              {[
                                'Gross payments',
                                'Refunds',
                                'Payment fees',
                                'Net receipts',
                                'Outstanding payments',
                                'Expenses',
                                'Profit',
                              ].map((label) => (
                                <li key={label}>{label}: Not configured</li>
                              ))}
                            </ul>
                          )}
                        </section>
                      ))}
                    </div>
                  </section>
                )}
                {details && tab === 'overview' && <InstallStats />}
                {details && tab === 'settings' && (
                  <section className="stats-section">
                    <h2>Public rankings</h2>
                    <p>
                      Admin rankings are available now. Public rankings are{' '}
                      {data.publicRankingsEnabled ? 'enabled' : 'disabled'}. Review community
                      activity before enabling them. Members can exclude their account and posts
                      from public rankings.
                    </p>
                    {canManage ? (
                      <button
                        className="button secondary"
                        disabled={saving}
                        onClick={() => void toggleRankings()}
                      >
                        {saving
                          ? 'Saving…'
                          : data.publicRankingsEnabled
                            ? 'Disable public rankings'
                            : 'Enable public rankings'}
                      </button>
                    ) : (
                      <p>analytics.manage permission is required to change this setting.</p>
                    )}
                  </section>
                )}
                {!admin && (
                  <>
                    <section className="stats-section">
                      <h2>How to read these figures</h2>
                      <p>
                        Member/community totals and online estimates describe the current platform.
                        Posts, replies, publication and interactions use the selected period and
                        exclude unavailable content. Likes/reposts are net retained interactions,
                        rather than a permanent log of every click. Article discussion roots are
                        excluded from social-post totals.
                      </p>
                      <p>
                        Visitors are approximate daily browser identifiers, not verified people.
                        Multiple devices, cleared storage, privacy exclusions and undetected
                        automation affect the figures. Identifiers rotate daily; we do not store IP
                        addresses, user-agent strings, full page URLs or referrer URLs in audience
                        measurement.
                      </p>
                      <p>
                        Public stats never expose private profile fields, bookmark owners, report
                        identities, revenue or individual browsing histories. Live totals can fall
                        after deletion, suspension or moderation.
                      </p>
                    </section>
                    <MeasurementPreferences />
                  </>
                )}
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
