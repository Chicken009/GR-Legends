import type { EventState } from '../../domain/event/engine'
import { eventNumbers, myRecap, recapMoments, type ProgressStep } from '../../domain/event/progress'
import { Tile } from '../components'
import { fmtNum, formatTime } from '../format'
import { fmtPts, ProgressChart, StoryIcon, teamColor } from './shared'

/**
 * Rückblick auf den Wettkampf: Zahlen, Punkteverlauf, besondere Momente und – wenn man selbst
 * mitgefahren ist – der eigene Weg durch den Wettkampf. Läuft er noch, heißt es „bisher“.
 */
export function Recap({ state, steps, me }: { state: EventState; steps: ProgressStep[]; me: string | null }) {
  const nums = eventNumbers(state)
  const moments = recapMoments(state, steps)
  const so = state.complete ? '' : ' bisher'
  return (
    <>
      <section className="card" style={{ gap: 10 }}>
        <div className="card-head">
          <span className="card-title">Das Event in Zahlen</span>
          {!state.complete && <span className="hint">bisher</span>}
        </div>
        <div className="tiles">
          <Tile value={fmtNum(nums.heats, 0)} label="Läufe" />
          <Tile value={fmtNum(nums.laps, 0)} label="Runden" />
          <Tile value={fmtNum(nums.crashes, 0)} label="Abflüge" color={nums.crashes ? 'var(--crash)' : undefined} />
          <Tile value={state.fastestLap ? formatTime(state.fastestLap.ms) : '–'} label="Schnellste Runde" color="var(--best)" />
        </div>
      </section>
      {me && state.standings.some((s) => s.name === me) && <MyRecap state={state} steps={steps} me={me} />}
      {moments.length > 0 && (
        <section className="card" style={{ gap: 10 }}>
          <span className="card-title">Besondere Momente{so}</span>
          {moments.map((m) => (
            <div key={m.text} className="story">
              <span style={{ flexShrink: 0, paddingTop: 1 }}>
                <StoryIcon icon={m.icon} />
              </span>
              <span>{m.text}</span>
            </div>
          ))}
        </section>
      )}
      <ProgressChart state={state} steps={steps} me={me} />
    </>
  )
}

function MyRecap({ state, steps, me }: { state: EventState; steps: ProgressStep[]; me: string }) {
  const s = state.standings.find((x) => x.name === me)!
  const mine = myRecap(state, steps, me)
  const team = s.teamId ? state.teamStandings.find((t) => t.id === s.teamId) : null
  const ranks = mine.ranks.filter((r): r is number => r != null)
  return (
    <section className="card me-row" style={{ gap: 10 }}>
      <span className="card-title">Dein Rückblick</span>
      <div className="tiles">
        <Tile value={`${s.rank}.`} label={`von ${state.standings.length}`} color="var(--me)" />
        <Tile value={fmtPts(s.total)} label="Punkte" />
        <Tile value={fmtNum(s.wins, 0)} label={s.wins === 1 ? 'Sieg' : 'Siege'} />
        {team ? <Tile value={`${team.rank}.`} label={team.name} color={teamColor(team.id, team.name)} /> : <Tile value={s.bestLapMs ? formatTime(s.bestLapMs) : '–'} label="Beste Runde" />}
      </div>
      {ranks.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Dein Platz nach jedem Lauf</span>
          <span className="num" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {ranks.map((r, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: 'var(--faint)' }}> › </span>}
                <b style={{ color: r === 1 ? 'var(--gold)' : r < (ranks[i - 1] ?? r) ? 'var(--me)' : undefined }}>{r}</b>
              </span>
            ))}
          </span>
        </div>
      )}
      {mine.best && (
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Bester Lauf: <b>{mine.best.heat.label}</b> – Platz {mine.best.place} von {mine.best.of}
          {mine.best.points != null ? ` (+${fmtPts(mine.best.points)})` : ''}
        </span>
      )}
      {mine.heats.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Alle deine Läufe ({mine.heats.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {mine.heats.map((h) => (
              <div key={h.heat.id} className="entrant">
                <span>{h.heat.label}</span>
                <span className="car">
                  Platz {h.place} von {h.of}
                </span>
                <span className="num" style={{ minWidth: 40, textAlign: 'right', fontWeight: 700 }}>
                  {h.heat.advancing?.includes(me) ? '↑ weiter' : h.points != null && h.heat.kind === 'race' ? `+${fmtPts(h.points)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
