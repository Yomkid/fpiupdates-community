import { useFeatures } from './Features';
import { TeamBadge, TeamRoster, GoalLog, type SportsTeam } from './SportsPeople';
import { ImageUpload } from './ImageUpload';
import { useDevice } from './useDevice';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trophy, ArrowLeft } from 'lucide-react';
import { api, ApiError, errorMessage, type User } from './api';
import { Composer, ErrorBox, PostList } from './components';
import { PageHeading } from './FeaturePages';
import { useSession } from './session';
import { toast } from './toast';
type Team = SportsTeam;
export type SportsMatch = {
  id: string;
  competitionId: string;
  homeId: string;
  awayId: string;
  home: Team;
  away: Team;
  stage: string;
  kickoffAt: string;
  venue: string;
  status: string;
  homeScore: number;
  awayScore: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  minute: number | null;
  confirmed: boolean;
  revision: number;
  lastUpdateAt: string | null;
  featured: boolean;
  featuredSidebar?: boolean;
  featuredFeed?: boolean;
  featuredDesktop?: boolean;
  featuredMobile?: boolean;
  competition: { id: string; name: string; season: string; format: string; published: boolean };
  canReport?: boolean;
  canManage?: boolean;
};
type Standing = Team & {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  rank: number;
  tied: boolean;
};
type Competition = {
  id: string;
  name: string;
  season: string;
  description: string;
  format: string;
  published: boolean;
  revision: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  teams: Team[];
  matches: SportsMatch[];
  standings: { group: string; rows: Standing[] }[];
  rulesLabel: string;
};
const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (x) => x.toUpperCase());
const wat = (s: string) =>
  new Date(s).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' WAT';
const localInput = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const stages = [
  'GROUP',
  'LEAGUE',
  'ROUND_OF_16',
  'QUARTER_FINAL',
  'SEMI_FINAL',
  'FINAL',
  'THIRD_PLACE',
];
const staff = (u: User | null) =>
  u?.permissions?.some((p) => ['sports.manage', 'sports.report'].includes(p));
export function MatchCard({ match, compact = false }: { match: SportsMatch; compact?: boolean }) {
  const m = match;
  const score = ['LIVE', 'HALF_TIME', 'FULL_TIME'].includes(m.status);
  const delayed =
    ['LIVE', 'HALF_TIME'].includes(m.status) &&
    (!m.lastUpdateAt || Date.now() - Date.parse(m.lastUpdateAt) > 600000);
  return (
    <Link
      className={`match-card ${compact ? 'match-card-compact' : ''}`}
      to={'/sports/matches/' + m.id}
    >
      <div className="match-card-heading">
        <span>{label(m.stage)}</span>
        <strong className={m.status === 'LIVE' ? 'score-live' : ''}>
          {label(m.status)}
          {m.minute != null && score ? ` · ${m.minute}′` : ''}
        </strong>
      </div>
      <div className="score-teams">
        <span className="score-team">
          <TeamBadge team={m.home} />
          <span>{m.home.name}</span>
        </span>
        <strong>{score ? `${m.homeScore} – ${m.awayScore}` : 'vs'}</strong>
        <span className="score-team">
          <span>{m.away.name}</span>
          <TeamBadge team={m.away} />
        </span>
      </div>
      {m.homePenalties != null && (
        <p>
          Penalties {m.homePenalties}–{m.awayPenalties}
        </p>
      )}
      <small>
        {wat(m.kickoffAt)}
        {m.venue ? ' · ' + m.venue : ''}
      </small>
      {!compact && (
        <small>
          {m.status === 'FULL_TIME'
            ? m.confirmed
              ? 'Result confirmed'
              : 'Awaiting organiser confirmation'
            : 'Manual score updates'}
          {delayed ? ' · Update delayed' : ''}
        </small>
      )}
      {!compact && m.lastUpdateAt && <small>Updated {wat(m.lastUpdateAt)}</small>}
    </Link>
  );
}
export function FeaturedSports({ placement = 'sidebar' }: { placement?: 'sidebar' | 'feed' }) {
  const { flags } = useFeatures();
  const device = useDevice();
  const [match, setMatch] = useState<SportsMatch | null>(null);
  useEffect(() => {
    if (!flags.sports) {
      setMatch(null);
      return;
    }
    const c = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const m = await api<SportsMatch | null>(
          '/sports/featured?' + new URLSearchParams({ placement, device }),
          { signal: c.signal },
        );
        if (!c.signal.aborted) setMatch(m);
      } catch {
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [placement, device, flags.sports]);
  if (!match || !flags.sports) return null;
  return (
    <section className="discovery-panel featured-sports" aria-label="Featured campus match">
      <div className="section-title">
        <h2>
          <Trophy size={18} />
          Campus sports
        </h2>
      </div>
      <Link className="text-button" to={'/sports/' + match.competitionId}>
        {match.competition.name}
      </Link>
      <MatchCard compact match={match} />
      <Link className="text-button" to={'/sports/' + match.competitionId}>
        Fixtures & standings →
      </Link>
    </section>
  );
}
export function SportsPage() {
  const { id } = useParams();
  const { user } = useSession();
  const [data, setData] = useState<Competition | null>(null);
  const [rows, setRows] = useState<
    { id: string; name: string; season: string; description: string; format: string }[]
  >([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setError('');
    setLoading(true);
    setData(null);
    setRows([]);
    setTab('overview');
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        if (id) {
          const comp = await api<Competition>('/sports/competitions/' + id, { signal: c.signal });
          if (!c.signal.aborted) setData(comp);
        } else {
          const page = await api<{ data: typeof rows; nextCursor: string | null }>('/sports', {
            signal: c.signal,
          });
          if (!c.signal.aborted) {
            setRows(page.data);
            setCursor(page.nextCursor);
          }
        }
      } catch (e) {
        if (!c.signal.aborted) setError(errorMessage(e));
      } finally {
        if (!c.signal.aborted) setLoading(false);
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (id && document.visibilityState === 'visible') void load();
    }, 15000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [id]);
  async function more() {
    if (!cursor) return;
    try {
      const page = await api<{ data: typeof rows; nextCursor: string | null }>(
        '/sports?cursor=' + cursor,
      );
      setRows((x) => [...x, ...page.data.filter((r) => !x.some((y) => y.id === r.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading
        title={data?.name ?? 'Campus sports'}
        subtitle={data ? data.season : 'Local competitions, fixtures and manual match updates.'}
      />
      {staff(user) && (
        <div className="sports-desk-link">
          <Link className="button secondary small" to="/sports/desk">
            Open sports desk →
          </Link>
        </div>
      )}
      {error && <ErrorBox message={error} />}{' '}
      {loading ? (
        <p className="page-panel">Loading competitions…</p>
      ) : !id ? (
        <div className="page-panel sports-competition-list">
          {rows.length ? (
            rows.map((c) => (
              <Link key={c.id} className="competition-card" to={'/sports/' + c.id}>
                <Trophy size={24} />
                <h2>{c.name}</h2>
                <span>
                  {c.season} · {label(c.format)}
                </span>
                <p>{c.description}</p>
              </Link>
            ))
          ) : (
            <div className="empty-state">
              <Trophy size={32} />
              <h2>No competitions published yet</h2>
              <p>
                Campus fixtures and results will appear here when organisers publish a competition.
              </p>
            </div>
          )}
          {cursor && (
            <button className="button secondary" onClick={() => void more()}>
              More competitions
            </button>
          )}
        </div>
      ) : (
        data && (
          <>
            <div className="feature-tabs sports-tabs">
              {['overview', 'fixtures', 'standings', 'knockout', 'players', 'discussion']
                .filter((t) => t !== 'standings' || data.format !== 'KNOCKOUT')
                .filter((t) => t !== 'knockout' || data.format !== 'LEAGUE')
                .map((t) => (
                  <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                    {label(t)}
                  </button>
                ))}
            </div>
            {tab === 'overview' && (
              <section className="page-panel">
                <p className="sports-description">
                  {data.description || 'Follow this competition and join the conversation.'}
                </p>
                <p className="muted">
                  Football · {label(data.format)} · {data.teams.length} teams
                </p>
                <h2>Matches to follow</h2>
                {data.matches
                  .filter((m) => ['LIVE', 'HALF_TIME'].includes(m.status))
                  .map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                {data.matches
                  .filter((m) => m.status === 'SCHEDULED')
                  .slice(0, 3)
                  .map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                {!data.matches.length && <p>Fixtures will appear when scheduled.</p>}
                <h2>Teams</h2>
                <div className="sports-team-chips">
                  {data.teams.map((t) => (
                    <span key={t.id}>
                      <TeamBadge team={t} />
                      {t.name}
                      {t.groupName ? ' · Group ' + t.groupName : ''}
                    </span>
                  ))}
                </div>
                <p className="sports-note">
                  Scores are entered by authorised scorekeepers. They may be delayed. This is
                  independent community coverage.
                </p>
              </section>
            )}
            {tab === 'players' && (
              <section className="page-panel">
                <TeamRoster teams={data.teams} />
              </section>
            )}
            {tab === 'fixtures' && (
              <section className="page-panel">
                {data.matches.length ? (
                  data.matches.map((m) => <MatchCard key={m.id} match={m} />)
                ) : (
                  <p>No fixtures yet.</p>
                )}
              </section>
            )}
            {tab === 'standings' && (
              <section className="page-panel">
                <h2>Standings</h2>
                <p className="sports-note">
                  Confirmed full-time group/league results only. Win {data.winPoints} · Draw{' '}
                  {data.drawPoints} · Loss {data.lossPoints}. {data.rulesLabel}
                </p>
                {data.standings.map((g) => (
                  <section className="standings-group" key={g.group}>
                    <h3>{data.format === 'GROUP_KNOCKOUT' ? 'Group ' + g.group : g.group}</h3>
                    <div className="sports-table-wrap">
                      <table>
                        <caption className="sr-only">{g.group} standings</caption>
                        <thead>
                          <tr>
                            {['Pos', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map(
                              (x) => (
                                <th scope="col" key={x}>
                                  {x}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((t) => (
                            <tr key={t.id}>
                              <td>
                                {t.rank}
                                {t.tied ? '=' : ''}
                              </td>
                              <th scope="row">{t.name}</th>
                              {[t.played, t.won, t.drawn, t.lost, t.gf, t.ga, t.gd, t.points].map(
                                (n, i) => (
                                  <td key={i}>{n}</td>
                                ),
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
                {!data.teams.length && <p>No teams added yet.</p>}
              </section>
            )}
            {tab === 'knockout' && (
              <section className="page-panel">
                <h2>Knockout stages</h2>
                <p className="sports-note">
                  Organisers schedule each round after confirming the qualifiers. Future pairings
                  are not generated automatically.
                </p>
                {stages
                  .filter((s) => !['GROUP', 'LEAGUE'].includes(s))
                  .map((stage) => {
                    const matches = data.matches.filter((m) => m.stage === stage);
                    return matches.length ? (
                      <section key={stage}>
                        <h3>{label(stage)}</h3>
                        {matches.map((m) => (
                          <MatchCard key={m.id} match={m} />
                        ))}
                      </section>
                    ) : null;
                  })}
                {!data.matches.some((m) => !['GROUP', 'LEAGUE'].includes(m.stage)) && (
                  <p>Knockout fixtures have not been scheduled yet.</p>
                )}
              </section>
            )}
            {tab === 'discussion' && (
              <>
                <div className="page-panel">
                  <h2>Competition discussion</h2>
                  <p>
                    Posts shared here are linked to {data.name} and also appear in the community
                    feed.
                  </p>
                </div>
                <Composer
                  sportsCompetitionId={data.id}
                  onPublished={() => setRefresh((n) => n + 1)}
                />
                <PostList endpoint={'/posts?sportsCompetitionId=' + data.id} refreshKey={refresh} />
              </>
            )}
          </>
        )
      )}
    </>
  );
}
type Update = {
  id: string;
  revision: number;
  kind: string;
  note: string;
  current: {
    status: string;
    homeScore: number;
    awayScore: number;
    minute: number | null;
    homePenalties: number | null;
    awayPenalties: number | null;
    confirmed: boolean;
  };
  createdAt: string;
  reporter: { username: string; displayName: string } | null;
};
export function MatchPage() {
  const { id } = useParams();
  const { user } = useSession();
  const [match, setMatch] = useState<SportsMatch | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [older, setOlder] = useState<Update[]>([]);
  const [olderBefore, setOlderBefore] = useState<number | null | undefined>(undefined);
  const effectiveBefore = olderBefore === undefined ? before : olderBefore;
  async function load() {
    try {
      const [m, h] = await Promise.all([
        api<SportsMatch>('/sports/matches/' + id),
        api<{ data: Update[]; nextBefore: number | null }>('/sports/matches/' + id + '/updates'),
      ]);
      setMatch((old) =>
        old?.id === m.id && old.revision > m.revision
          ? { ...old, canReport: m.canReport, canManage: m.canManage }
          : m,
      );
      setUpdates(h.data);
      setBefore(h.nextBefore);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMatch(null);
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    let active = true;
    let running = false;
    setMatch(null);
    setUpdates([]);
    setOlder([]);
    setOlderBefore(undefined);
    setError('');
    const poll = async () => {
      if (!active || running) return;
      running = true;
      try {
        const [m, h] = await Promise.all([
          api<SportsMatch>('/sports/matches/' + id),
          api<{ data: Update[]; nextBefore: number | null }>('/sports/matches/' + id + '/updates'),
        ]);
        if (active) {
          setMatch((old) =>
            old?.id === m.id && old.revision > m.revision
              ? { ...old, canReport: m.canReport, canManage: m.canManage }
              : m,
          );
          setUpdates(h.data);
          setBefore(h.nextBefore);
          setError('');
        }
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && e.status === 404) setMatch(null);
          setError(errorMessage(e));
        }
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, user?.id]);
  async function more() {
    if (!effectiveBefore) return;
    try {
      const h = await api<{ data: Update[]; nextBefore: number | null }>(
        `/sports/matches/${id}/updates?before=${effectiveBefore}`,
      );
      setOlder((old) => [...old, ...h.data.filter((x) => !old.some((y) => y.id === x.id))]);
      setOlderBefore(h.nextBefore);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeading
        title="Match centre"
        subtitle="Manual updates · Refreshes every 15 seconds while visible."
      />
      {error && <ErrorBox message={error} retry={() => void load()} />}{' '}
      {!match && !error && <p className="page-panel">Loading match…</p>}
      {match && (
        <>
          <section className="page-panel">
            <Link className="text-button" to={'/sports/' + match.competitionId}>
              <ArrowLeft size={16} />
              {match.competition.name}
            </Link>
            <MatchCard match={match} />
            {match.canReport && (!match.confirmed || match.canManage) && (
              <ScoreForm key={match.id} match={match} onSaved={() => void load()} />
            )}{' '}
            {match.confirmed && !match.canManage && match.canReport && (
              <p className="sports-note">
                Result confirmed. An organiser must make any further correction.
              </p>
            )}
            <GoalLog match={match} onUpdated={() => void load()} />
            <h2>Match updates</h2>
            <p className="sports-note">
              Updates and corrections are recorded below. Reporter identity is shown when available.
            </p>
            <ol className="match-updates">
              {[...updates, ...older.filter((x) => !updates.some((u) => u.id === x.id))].map(
                (u) => (
                  <li key={u.id}>
                    <div>
                      <strong>{label(u.kind)}</strong>
                      <time dateTime={u.createdAt}>{wat(u.createdAt)}</time>
                    </div>
                    <p>{u.note}</p>
                    {u.kind !== 'FIXTURE' && (
                      <p>
                        {label(u.current.status)} · {u.current.homeScore}–{u.current.awayScore}
                        {u.current.homePenalties != null
                          ? ` (penalties ${u.current.homePenalties}–${u.current.awayPenalties})`
                          : ''}
                        {u.current.confirmed ? ' · Confirmed' : ''}
                      </p>
                    )}
                    <small>
                      {u.reporter ? (
                        <Link to={'/u/' + u.reporter.username}>By {u.reporter.displayName}</Link>
                      ) : (
                        'Authorised scorekeeper'
                      )}{' '}
                      · Update {u.revision}
                    </small>
                  </li>
                ),
              )}
            </ol>
            {effectiveBefore && (
              <button className="button secondary" onClick={() => void more()}>
                Earlier updates
              </button>
            )}
          </section>
          <div className="feed-intro">
            <h2>Match discussion</h2>
          </div>
          <Composer
            sportsMatchId={match.id}
            sportsCompetitionId={match.competitionId}
            onPublished={() => setRefresh((n) => n + 1)}
          />
          <PostList
            endpoint={'/posts?sportsMatchId=' + match.id}
            refreshKey={refresh}
            emptyTitle="Talk about this match"
            emptyText="Share your support or discuss the action. Your post will link back to this match."
          />
        </>
      )}
    </>
  );
}
function ScoreForm({ match, onSaved }: { match: SportsMatch; onSaved: () => void }) {
  const [draft, setDraft] = useState(match);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stale = draft.revision !== match.revision;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (stale || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/sports/matches/' + match.id + '/score', {
        method: 'PUT',
        body: JSON.stringify({
          revision: draft.revision,
          status: draft.status,
          homeScore: draft.homeScore,
          awayScore: draft.awayScore,
          homePenalties: draft.homePenalties,
          awayPenalties: draft.awayPenalties,
          minute: draft.minute,
          confirmed: draft.confirmed,
          note,
        }),
      });
      const fresh = await api<SportsMatch>('/sports/matches/' + match.id);
      setDraft(fresh);
      setNote('');
      onSaved();
      toast('Match update saved.', 'success');
    } catch (e) {
      setError(errorMessage(e));
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="feature-form score-form" onSubmit={save}>
      <h2>Update match</h2>
      <p className="sports-note">
        Enter the latest totals; do not add them to the existing score. Notes are public. The minute
        is reported manually, not a running clock.
      </p>
      {stale && (
        <div className="sports-warning">
          A newer update is available. Your draft has been kept.
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setDraft(match);
              setError('');
            }}
          >
            Load latest score
          </button>
        </div>
      )}
      <fieldset disabled={busy || stale}>
        <label>
          Match status
          <select
            aria-label="Match status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value, confirmed: false })}
          >
            {(match.canManage
              ? ['SCHEDULED', 'LIVE', 'HALF_TIME', 'FULL_TIME', 'POSTPONED', 'CANCELLED']
              : ['SCHEDULED', 'LIVE', 'HALF_TIME', 'FULL_TIME']
            ).map((s) => (
              <option disabled={!match.canManage && s === 'SCHEDULED'} key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <div className="sports-form-row">
          <label>
            {match.home.name} score
            <input
              aria-label="Home score"
              type="number"
              required
              min={0}
              max={99}
              value={draft.homeScore}
              onChange={(e) =>
                setDraft({ ...draft, homeScore: Number(e.target.value), confirmed: false })
              }
            />
          </label>
          <label>
            {match.away.name} score
            <input
              aria-label="Away score"
              type="number"
              required
              min={0}
              max={99}
              value={draft.awayScore}
              onChange={(e) =>
                setDraft({ ...draft, awayScore: Number(e.target.value), confirmed: false })
              }
            />
          </label>
        </div>
        <label>
          Reported minute (optional)
          <input
            type="number"
            min={0}
            max={150}
            value={draft.minute ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, minute: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        {!['GROUP', 'LEAGUE'].includes(match.stage) && (
          <div className="sports-form-row">
            <label>
              Home penalties
              <input
                type="number"
                min={0}
                max={99}
                value={draft.homePenalties ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    homePenalties: e.target.value === '' ? null : Number(e.target.value),
                    confirmed: false,
                  })
                }
              />
            </label>
            <label>
              Away penalties
              <input
                type="number"
                min={0}
                max={99}
                value={draft.awayPenalties ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    awayPenalties: e.target.value === '' ? null : Number(e.target.value),
                    confirmed: false,
                  })
                }
              />
            </label>
          </div>
        )}
        {match.canManage && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.confirmed}
              onChange={(e) => setDraft({ ...draft, confirmed: e.target.checked })}
            />
            Confirm full-time result for standings
          </label>
        )}
        <label>
          Public update note
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Goal for Computer Engineering, or explain a correction"
          />
        </label>
      </fieldset>
      {error && <ErrorBox message={error} />}
      <button className="button primary" disabled={busy || stale}>
        {busy ? 'Saving…' : 'Save match update'}
      </button>
    </form>
  );
}

export function SportsDesk() {
  const { user } = useSession();
  const manager = !!user?.permissions?.includes('sports.manage');
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [comp, setComp] = useState<Competition | null>(null);
  const [reporters, setReporters] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<{ id: string; reporterId: string | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [fixture, setFixture] = useState<SportsMatch | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [teamUploading, setTeamUploading] = useState(false);
  const [teamForm, setTeamForm] = useState(0);
  useEffect(() => {
    if (!staff(user)) return;
    let active = true;
    api<any[]>('/sports-desk')
      .then((x) => {
        if (active) setRows(x);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    if (manager)
      api<User[]>('/sports-desk/reporters')
        .then((x) => {
          if (active) setReporters(x);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [user?.id, manager, refresh]);
  useEffect(() => {
    setComp((old) => (old?.id === selected ? old : null));
    setFixture(null);
    setTeam(null);
    if (!selected || !manager) return;
    const c = new AbortController();
    Promise.all([
      api<Competition>('/sports-desk/competitions/' + selected, { signal: c.signal }),
      api<typeof assignments>('/sports-desk/competitions/' + selected + '/assignments', {
        signal: c.signal,
      }),
    ])
      .then(([c, a]) => {
        setComp(c);
        setAssignments(a);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      });
    return () => c.abort();
  }, [selected, refresh, manager]);
  async function mutate(path: string, method: string, data: unknown) {
    if (busy) return null;
    setBusy(true);
    setError('');
    try {
      const result = await api<any>(path, { method, body: JSON.stringify(data) });
      setRefresh((n) => n + 1);
      toast('Sports details saved.', 'success');
      return result;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function saveCompetition(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await mutate(
      '/sports-desk/competitions' + (comp ? '/' + comp.id : ''),
      comp ? 'PUT' : 'POST',
      {
        name: f.get('name'),
        season: f.get('season'),
        description: f.get('description'),
        format: f.get('format'),
        published: f.has('published'),
        winPoints: Number(f.get('winPoints')),
        drawPoints: Number(f.get('drawPoints')),
        lossPoints: Number(f.get('lossPoints')),
        ...(comp ? { revision: comp.revision } : {}),
      },
    );
    if (result) {
      setSelected(result.id);
      setEditing(false);
    }
  }
  async function saveTeam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!comp) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const result = await mutate(
      `/sports-desk/competitions/${comp.id}/teams` + (team ? '/' + team.id : ''),
      team ? 'PUT' : 'POST',
      {
        name: f.get('name'),
        groupName: String(f.get('groupName') ?? '').trim(),
        logoMediaId: f.get('logoMediaId') || null,
      },
    );
    if (result) {
      setTeam(null);
      setTeamForm((v) => v + 1);
      form.reset();
    }
  }
  async function saveFixture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!comp) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const result = await mutate(
      `/sports-desk/competitions/${comp.id}/matches` + (fixture ? '/' + fixture.id : ''),
      fixture ? 'PUT' : 'POST',
      {
        homeId: f.get('homeId'),
        awayId: f.get('awayId'),
        stage: f.get('stage'),
        kickoffAt: new Date(String(f.get('kickoffAt'))).toISOString(),
        venue: f.get('venue'),
        reporterId: f.get('reporterId') || null,
        featured: f.has('featured'),
        featuredSidebar: f.has('featuredSidebar'),
        featuredFeed: f.has('featuredFeed'),
        featuredDesktop: f.has('featuredDesktop'),
        featuredMobile: f.has('featuredMobile'),
        note: f.get('note'),
        ...(fixture ? { revision: fixture.revision } : {}),
      },
    );
    if (result) {
      setFixture(null);
      form.reset();
    }
  }
  if (!staff(user))
    return (
      <>
        <PageHeading title="Sports desk" />
        <p className="page-panel">Sign in with sports.report or sports.manage permission.</p>
      </>
    );
  return (
    <>
      <PageHeading
        title="Sports desk"
        subtitle={
          manager
            ? 'Manage football competitions and confirm results.'
            : 'Update matches assigned to you.'
        }
      />
      <section className="page-panel">
        <Link className="text-button" to="/sports">
          Public competitions →
        </Link>
        {error && <ErrorBox message={error} />}{' '}
        {!manager ? (
          <>
            {rows.length ? (
              rows.map((m) => <MatchCard key={m.id} match={m} />)
            ) : (
              <p>No published matches assigned to you. Ask an organiser to assign your account.</p>
            )}
          </>
        ) : (
          <>
            <div className="sports-desk-controls">
              <label>
                Competition
                <select
                  aria-label="Competition"
                  value={selected ?? ''}
                  onChange={(e) => {
                    setSelected(e.target.value || null);
                    setEditing(false);
                    setError('');
                  }}
                >
                  <option value="">Choose a competition</option>
                  {rows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.season}
                      {c.published ? '' : ' (draft)'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                onClick={() => {
                  setSelected(null);
                  setComp(null);
                  setEditing(true);
                }}
              >
                New competition
              </button>
            </div>
            {comp && (
              <div className="sports-desk-controls">
                <button className="button secondary" onClick={() => setEditing(!editing)}>
                  Edit competition
                </button>
                {comp.published && (
                  <Link className="text-button" to={'/sports/' + comp.id}>
                    View public competition →
                  </Link>
                )}
                <span className="pill">{comp.published ? 'Published' : 'Private draft'}</span>
              </div>
            )}
            {editing && (
              <form
                className="feature-form sports-editor"
                key={comp?.id ?? 'new'}
                onSubmit={saveCompetition}
              >
                <h2>{comp ? 'Edit' : 'New'} competition</h2>
                <label>
                  Competition name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={comp?.name}
                  />
                </label>
                <label>
                  Season
                  <input
                    name="season"
                    required
                    maxLength={60}
                    defaultValue={comp?.season ?? '2026/2027'}
                  />
                </label>
                <label>
                  Description
                  <textarea name="description" maxLength={1500} defaultValue={comp?.description} />
                </label>
                <label>
                  Format
                  <select
                    aria-label="Format"
                    name="format"
                    defaultValue={comp?.format ?? 'GROUP_KNOCKOUT'}
                  >
                    <option value="GROUP_KNOCKOUT">Groups then knockout</option>
                    <option value="LEAGUE">League</option>
                    <option value="KNOCKOUT">Knockout</option>
                  </select>
                </label>
                <div className="sports-form-row">
                  {(['winPoints', 'drawPoints', 'lossPoints'] as const).map((key, i) => (
                    <label key={key}>
                      {['Win points', 'Draw points', 'Loss points'][i]}
                      <input
                        type="number"
                        name={key}
                        required
                        min={0}
                        max={10}
                        defaultValue={comp?.[key] ?? [3, 1, 0][i]}
                      />
                    </label>
                  ))}
                </div>
                <p className="sports-note">
                  Tie order: points, goal difference, goals scored. Exact ties remain shared. Format
                  locks after fixtures; points lock once play starts.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={comp?.published ?? false}
                  />
                  Publish competition and its fixtures
                </label>
                <button className="button primary" disabled={busy}>
                  Save competition
                </button>
              </form>
            )}
            {comp && (
              <>
                <h2>Teams</h2>
                <div className="sports-team-chips">
                  {comp.teams.map((t) => (
                    <button
                      className="button secondary small"
                      key={t.id}
                      onClick={() => setTeam(t)}
                    >
                      {t.name}
                      {t.groupName ? ' · ' + t.groupName : ''} · Edit
                    </button>
                  ))}
                </div>
                <form
                  className="feature-form sports-editor"
                  key={(team?.id ?? 'new-team') + teamForm}
                  onSubmit={saveTeam}
                >
                  <h3>{team ? 'Edit team' : 'Add team'}</h3>
                  <label>
                    Team name
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={100}
                      defaultValue={team?.name}
                    />
                  </label>
                  {comp.format === 'GROUP_KNOCKOUT' && (
                    <label>
                      Group name
                      <input
                        name="groupName"
                        required
                        maxLength={20}
                        placeholder="A"
                        defaultValue={team?.groupName}
                      />
                    </label>
                  )}
                  <ImageUpload
                    kind="sport"
                    label="Team logo"
                    name="logoMediaId"
                    initialId={team?.logoMediaId}
                    onBusyChange={setTeamUploading}
                  />
                  <button className="button secondary" disabled={busy || teamUploading}>
                    Save team
                  </button>
                  {team && (
                    <button type="button" className="text-button" onClick={() => setTeam(null)}>
                      Cancel team edit
                    </button>
                  )}
                </form>
                <TeamRoster manage teams={comp.teams} />
                <h2>Fixtures</h2>
                <p className="sports-note">
                  Assign an account with the Sports scorekeeper role. Featured cards show published
                  live/recent/upcoming fixtures. No sports API is required.
                </p>
                {comp.matches.map((m) => (
                  <div className="sports-admin-fixture" key={m.id}>
                    <strong>
                      {m.home.name} vs {m.away.name}
                    </strong>
                    <p>
                      {label(m.stage)} · {label(m.status)} · {wat(m.kickoffAt)}
                    </p>
                    <div>
                      <button className="text-button" onClick={() => setFixture(m)}>
                        Edit fixture
                      </button>
                      {comp.published && (
                        <Link className="text-button" to={'/sports/matches/' + m.id}>
                          Update score →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
                <form
                  className="feature-form sports-editor"
                  key={fixture?.id ?? 'new-fixture'}
                  onSubmit={saveFixture}
                >
                  <h3>{fixture ? 'Edit fixture' : 'Add fixture'}</h3>
                  <div className="sports-form-row">
                    <label>
                      Home team
                      <select
                        aria-label="Home team"
                        name="homeId"
                        required
                        defaultValue={fixture?.homeId ?? ''}
                      >
                        <option value="">Choose team</option>
                        {comp.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Away team
                      <select
                        aria-label="Away team"
                        name="awayId"
                        required
                        defaultValue={fixture?.awayId ?? ''}
                      >
                        <option value="">Choose team</option>
                        {comp.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Stage
                    <select
                      aria-label="Stage"
                      name="stage"
                      defaultValue={
                        fixture?.stage ??
                        (comp.format === 'LEAGUE'
                          ? 'LEAGUE'
                          : comp.format === 'KNOCKOUT'
                            ? 'QUARTER_FINAL'
                            : 'GROUP')
                      }
                    >
                      {stages
                        .filter((s) =>
                          comp.format === 'LEAGUE'
                            ? s === 'LEAGUE'
                            : comp.format === 'KNOCKOUT'
                              ? !['GROUP', 'LEAGUE'].includes(s)
                              : s !== 'LEAGUE',
                        )
                        .map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Kickoff time
                    <input
                      type="datetime-local"
                      name="kickoffAt"
                      required
                      defaultValue={fixture ? localInput(fixture.kickoffAt) : ''}
                    />
                  </label>
                  <p className="form-note">
                    Enter in your device timezone:{' '}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}. Public fixtures display WAT.
                  </p>
                  <label>
                    Venue
                    <input name="venue" maxLength={120} defaultValue={fixture?.venue} />
                  </label>
                  <label>
                    Assigned scorekeeper
                    <select
                      aria-label="Assigned scorekeeper"
                      name="reporterId"
                      defaultValue={
                        fixture
                          ? (assignments.find((a) => a.id === fixture.id)?.reporterId ?? '')
                          : ''
                      }
                    >
                      <option value="">Organisers only</option>
                      {reporters.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.displayName} (@{r.username})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      name="featured"
                      type="checkbox"
                      defaultChecked={fixture?.featured ?? false}
                    />
                    Feature this match
                  </label>
                  <fieldset className="display-controls">
                    <legend>Featured match visibility</legend>
                    {[
                      ['featuredSidebar', 'Sidebar'],
                      ['featuredFeed', 'Home feed'],
                      ['featuredMobile', 'Mobile'],
                      ['featuredDesktop', 'Desktop / tablet'],
                    ].map(([key, label]) => (
                      <label className="checkbox-label" key={key}>
                        <input
                          type="checkbox"
                          name={key}
                          defaultChecked={(fixture as any)?.[key] ?? true}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <p className="form-note">
                    The sidebar appears on wide screens. Choose Home feed to reach mobile readers.
                  </p>
                  <label>
                    Public fixture note
                    <textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={500}
                      defaultValue={fixture ? 'Fixture details updated' : 'Fixture scheduled'}
                    />
                  </label>
                  <button className="button primary" disabled={busy || comp.teams.length < 2}>
                    Save fixture
                  </button>
                  {fixture && (
                    <button className="text-button" type="button" onClick={() => setFixture(null)}>
                      Cancel fixture edit
                    </button>
                  )}
                </form>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
