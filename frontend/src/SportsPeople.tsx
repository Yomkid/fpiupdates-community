import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, mediaUrl, type User } from './api';
import type { SportsMatch } from './Sports';
import { Avatar, Modal } from './components';
import { ImageUpload } from './ImageUpload';
import { toast } from './toast';
export type SportsTeam = {
  id: string;
  name: string;
  groupName: string;
  logoMediaId?: string | null;
};
type Player = {
  id: string;
  name: string;
  shirtNumber: number | null;
  photoMediaId: string | null;
  user: User | null;
};
export function TeamBadge({ team }: { team: Pick<SportsTeam, 'name' | 'logoMediaId'> }) {
  return team.logoMediaId ? (
    <img className="team-badge" src={mediaUrl(team.logoMediaId)} alt="" loading="lazy" />
  ) : (
    <span className="team-badge team-badge-fallback" aria-hidden="true">
      {team.name
        .split(/\s+/)
        .slice(0, 2)
        .map((x) => x[0])
        .join('')}
    </span>
  );
}
function PlayerPhoto({ player }: { player: { photoMediaId?: string | null; user?: User | null } }) {
  return player.photoMediaId ? (
    <img className="player-photo" src={mediaUrl(player.photoMediaId)} alt="" loading="lazy" />
  ) : player.user ? (
    <Avatar user={player.user} />
  ) : (
    <span className="player-photo player-photo-fallback" aria-hidden="true">
      ⚽
    </span>
  );
}
export function TeamRoster({ teams, manage = false }: { teams: SportsTeam[]; manage?: boolean }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [players, setPlayers] = useState<Player[]>([]),
    [editing, setEditing] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!teams.some((t) => t.id === teamId)) setTeamId(teams[0]?.id ?? '');
  }, [teams, teamId]);
  useEffect(() => {
    const c = new AbortController();
    setPlayers([]);
    setEditing(null);
    setError('');
    if (teamId)
      api<Player[]>((manage ? '/sports-desk' : '/sports') + '/teams/' + teamId + '/players', {
        signal: c.signal,
      })
        .then(setPlayers)
        .catch((e) => {
          if (!c.signal.aborted) setError(errorMessage(e));
        });
    return () => c.abort();
  }, [teamId, manage, revision]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api('/sports-desk/teams/' + teamId + '/players' + (editing ? '/' + editing.id : ''), {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          shirtNumber: f.get('shirtNumber') === '' ? null : Number(f.get('shirtNumber')),
          username: f.get('username') || null,
          photoMediaId: f.get('photoMediaId') || null,
        }),
      });
      setEditing(null);
      setRevision((v) => v + 1);
      toast('Player saved to the sports roster.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sports-roster">
      <h2>Players</h2>
      <p className="sports-note">
        Football names belong to this roster. Linking an existing profile is optional; a roster
        entry does not create an account.
      </p>
      <label>
        Team roster
        <select aria-label="Team roster" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="player-list">
        {players.map((p) => (
          <div key={p.id} className="player-row">
            <PlayerPhoto player={p} />
            <div>
              <strong>{p.name}</strong>
              <small>
                {p.shirtNumber != null ? '#' + p.shirtNumber : 'Squad player'}
                {p.user && (
                  <>
                    {' '}
                    · <Link to={'/u/' + p.user.username}>@{p.user.username}</Link>
                  </>
                )}
              </small>
            </div>
            {manage && (
              <button className="text-button" onClick={() => setEditing(p)}>
                Edit {p.name}
              </button>
            )}
          </div>
        ))}
        {!players.length && <p className="muted">No players entered for this team yet.</p>}
      </div>
      {manage && teamId && (
        <form
          className="feature-form sports-editor"
          key={(editing?.id ?? 'new') + teamId + revision}
          onSubmit={save}
        >
          <h3>{editing ? 'Edit player' : 'Add player'}</h3>
          <label>
            Football / display name
            <input name="name" required maxLength={80} defaultValue={editing?.name ?? ''} />
          </label>
          <label>
            Shirt number (optional)
            <input
              name="shirtNumber"
              type="number"
              min={0}
              max={99}
              defaultValue={editing?.shirtNumber ?? ''}
            />
          </label>
          <label>
            Link existing username (optional)
            <input
              name="username"
              maxLength={30}
              pattern="[a-z0-9_]{3,30}"
              placeholder="username without @"
              defaultValue={editing?.user?.username ?? ''}
            />
          </label>
          <ImageUpload
            kind="sport"
            label="Player photo"
            name="photoMediaId"
            initialId={editing?.photoMediaId}
            onBusyChange={setUploading}
          />
          <button className="button primary" disabled={busy || uploading}>
            {busy ? 'Saving…' : 'Save player'}
          </button>
          {editing && (
            <button type="button" className="text-button" onClick={() => setEditing(null)}>
              Cancel player edit
            </button>
          )}
        </form>
      )}
    </section>
  );
}
type Goal = {
  id: string;
  teamId: string;
  scorerName: string | null;
  minute: number;
  kind: string;
  note: string;
  player: { photoMediaId: string | null; user: User | null } | null;
};
export function GoalLog({ match, onUpdated }: { match: SportsMatch; onUpdated: () => void }) {
  const [rows, setRows] = useState<Goal[]>([]),
    [rosters, setRosters] = useState<Record<string, Player[]>>({});
  const [teamId, setTeamId] = useState(match.homeId),
    [kind, setKind] = useState('GOAL'),
    [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const allowed = match.canReport && (!match.confirmed || match.canManage);
  const scorerTeam =
    kind === 'OWN_GOAL' ? (teamId === match.homeId ? match.awayId : match.homeId) : teamId;
  useEffect(() => {
    const c = new AbortController();
    api<Goal[]>('/sports/matches/' + match.id + '/goals', { signal: c.signal })
      .then(setRows)
      .catch(() => {});
    return () => c.abort();
  }, [match.id, match.revision]);
  useEffect(() => {
    if (!allowed) return;
    const c = new AbortController();
    Promise.all([
      api<Player[]>('/sports/teams/' + match.homeId + '/players', { signal: c.signal }),
      api<Player[]>('/sports/teams/' + match.awayId + '/players', { signal: c.signal }),
    ])
      .then(([h, a]) => setRosters({ [match.homeId]: h, [match.awayId]: a }))
      .catch(() => {});
    return () => c.abort();
  }, [match.id, allowed]);
  async function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      await api('/sports/matches/' + match.id + '/goals', {
        method: 'POST',
        body: JSON.stringify({
          revision: match.revision,
          requestId: requestId.current,
          teamId,
          kind,
          playerId: f.get('playerId') || null,
          minute: Number(f.get('minute')),
          note: f.get('note'),
        }),
      });
      requestId.current = crypto.randomUUID();
      form.reset();
      onUpdated();
      toast('Goal recorded in the match log.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
      onUpdated();
    } finally {
      setBusy(false);
    }
  }
  async function voidGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/sports/matches/' + match.id + '/goals/' + voiding + '/void', {
        method: 'PUT',
        body: JSON.stringify({
          revision: match.revision,
          note: new FormData(e.currentTarget).get('note'),
        }),
      });
      setVoiding(null);
      onUpdated();
      toast('Goal log corrected. Check the scoreboard totals separately.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
      onUpdated();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="goal-log">
      <h2>Goals</h2>
      <p className="sports-note">
        The scorer log may be incomplete. The scoreboard totals are authoritative.
      </p>
      {rows.map((g) => (
        <div className="goal-row" key={g.id}>
          <strong>{g.minute}′</strong>
          <PlayerPhoto player={g.player ?? {}} />
          <div>
            <strong>
              {g.scorerName ?? 'Scorer not recorded'}
              {g.kind === 'PENALTY' ? ' (pen.)' : g.kind === 'OWN_GOAL' ? ' (own goal)' : ''}
            </strong>
            <small>{g.teamId === match.homeId ? match.home.name : match.away.name}</small>
            {g.player?.user && (
              <Link to={'/u/' + g.player.user.username}>@{g.player.user.username}</Link>
            )}
          </div>
          {allowed && (
            <button className="text-button" onClick={() => setVoiding(g.id)}>
              Correct log
            </button>
          )}
        </div>
      ))}
      {!rows.length && <p className="muted">No scorers recorded yet.</p>}
      {allowed && (
        <details className="goal-entry">
          <summary>Record a scorer</summary>
          <form className="feature-form" onSubmit={record}>
            <p className="sports-note">
              Enter scoreboard totals using Update match above. Adding or correcting this log does
              not change those totals.
            </p>
            <label>
              Scoring team
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value={match.homeId}>{match.home.name}</option>
                <option value={match.awayId}>{match.away.name}</option>
              </select>
            </label>
            <label>
              Goal type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="GOAL">Goal</option>
                <option value="PENALTY">Penalty</option>
                <option value="OWN_GOAL">Own goal</option>
              </select>
            </label>
            <label>
              Scorer (optional)
              <select aria-label="Scorer (optional)" key={scorerTeam} name="playerId">
                <option value="">Not recorded</option>
                {(rosters[scorerTeam] ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.shirtNumber != null ? ' #' + p.shirtNumber : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Goal minute
              <input name="minute" required type="number" min={0} max={150} />
            </label>
            <label>
              Public goal note
              <textarea name="note" required minLength={3} maxLength={500} />
            </label>
            <button className="button secondary" disabled={busy}>
              Save scorer
            </button>
          </form>
        </details>
      )}
      {voiding && (
        <Modal
          title="Correct goal log"
          onClose={() => {
            if (!busy) setVoiding(null);
          }}
        >
          <form onSubmit={voidGoal}>
            <p>This removes the scorer entry. Correct scoreboard totals separately if needed.</p>
            <label>
              Public correction note
              <textarea name="note" required minLength={3} maxLength={500} />
            </label>
            <button className="button primary" disabled={busy}>
              Remove scorer entry
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
