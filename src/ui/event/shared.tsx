import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { AppData } from '../../data/useRaceDays'
import { eventSessions } from '../../data/useRaceDays'
import type { EventFolder } from '../../data/events'
import { carScale } from '../../data/settings'
import { eventCars, eventContext, typicalLapMs } from '../../domain/event/context'
import { computeEvent, type EventState, type Heat, type Standing, type TeamStanding } from '../../domain/event/engine'
import { eventFinished, eventPhase, lastDay, todayIso, withoutTeams, type EventPhase, type Story } from '../../domain/event/insights'
import { eventKind, heatPointsExplained, pointsHistory, teamContributions, type ProgressStep } from '../../domain/event/progress'
import { FORMAT_LABEL, type EventDef } from '../../domain/event/types'
import { RATING } from '../../domain/rating'
import { AREA, ME, SERIES, seriesColors, shade } from '../colors'
import { PointsChart } from '../charts/PointsChart'
import { DonutChart } from '../charts/DonutChart'
import { Sparkline } from '../charts/Sparkline'
import { BumpChart } from '../charts/StatsCharts'
import { Avatar, driverPath, Segment, useData } from '../components'
import { RecapLink } from '../story'
import { fmtElo, fmtNum, formatDate, formatTime } from '../format'
import { Bolt, Crown, PoleFlag, Rocket, Sword, Trophy } from '../icons'
import { CarThumb } from '../CarPhoto'

export const EVENT_ACCENT = AREA.events

// Steckt eine Farbe im Teamnamen („Team Rot“), gilt sie – sonst feste Farbe nach Teamnummer
const NAMED_COLORS: [string[], string][] = [
  [['rot', 'red'], '#E5484D'],
  [['blau', 'blue'], '#3987E5'],
  [['grün', 'gruen', 'green'], '#5FB84A'],
  [['gelb', 'yellow', 'gold'], '#E2B93B'],
  [['orange'], '#EE8A2B'],
  [['lila', 'violett', 'purple'], '#8E7CF0'],
  [['pink', 'rosa'], '#D55181'],
  [['türkis', 'cyan'], '#2BA8A0'],
  [['weiß', 'weiss', 'white', 'silber'], '#E3EAF0'],
  [['schwarz', 'black', 'grau'], '#9AA3AD'],
]

/** Farbe eines Teams: aus dem Namen, sonst nach Teamnummer (Team 1, 2, …) */
export function teamColor(teamId: string | null | undefined, name?: string | null): string {
  const words = name ? name.toLocaleLowerCase('de-DE').split(/[^\p{L}]+/u) : []
  const named = NAMED_COLORS.find(([list]) => list.some((w) => words.includes(w)))?.[1]
  if (named) return named
  const i = teamId ? Number(teamId.replace(/\D/g, '')) - 1 : 0
  return SERIES[(Number.isFinite(i) && i >= 0 ? i : 0) % SERIES.length]
}

const contextFor = (data: AppData, def: EventDef, folderId: string | null) =>
  eventContext(def, data.model.rating, data.allSessions, folderId ? eventSessions(data.allSessions, folderId) : [], def.track ?? null, (c) => carScale(data.settings, c))

export function computeFor(data: AppData, def: EventDef, folderId: string | null): EventState {
  return computeEvent(def, contextFor(data, def, folderId))
}

export function useEventState(folder: EventFolder | undefined, def?: EventDef) {
  const data = useData()
  const d = def ?? folder?.def
  return useMemo(() => (d ? computeFor(data, d, folder?.id ?? null) : null), [data, d, folder?.id])
}

/** Stand nach jedem gefahrenen Lauf (für Punkteverlauf und Rückblick) */
export function useEventHistory(folder: EventFolder | undefined): ProgressStep[] {
  const data = useData()
  const def = folder?.def
  return useMemo(() => (def && folder ? pointsHistory(def, contextFor(data, def, folder.id)) : []), [data, def, folder])
}

/** Typische Rundenzeit auf der Strecke des Wettkampfs (für die Zeitschätzung) */
export function useLapMs(folder: EventFolder | undefined): number {
  const data = useData()
  const def = folder?.def
  const track = def?.track ?? folder?.tracks[0] ?? null
  return useMemo(() => typicalLapMs(data.allSessions, track, def ? eventCars(def) : []), [data, track, def])
}

export const PHASE_LABEL: Record<EventPhase, string> = { planned: 'geplant', running: 'läuft', done: 'beendet' }

export function phaseOf(def: EventDef, state: EventState) {
  return eventPhase(def, state, todayIso())
}

/** Ergebnis steht fest (alle geplanten Läufe gefahren) – erst dann Siegerehrung und „Sieger“ */
export const finishedOf = (def: EventDef, state: EventState) => eventFinished(def, state, todayIso())

export function dateRange(def: EventDef) {
  return def.end ? `${formatDate(def.start)} – ${formatDate(lastDay(def))}` : formatDate(def.start)
}

export const fmtPts = (v: number) => fmtNum(v, Number.isInteger(v) ? 0 : 1)

export function PhasePill({ phase }: { phase: EventPhase }) {
  const color = phase === 'running' ? EVENT_ACCENT : phase === 'done' ? 'var(--muted)' : 'var(--text-2)'
  return (
    <span className="pill" style={{ color, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {phase === 'running' && <span className="pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_ACCENT }} />}
      {PHASE_LABEL[phase]}
    </span>
  )
}

export function StoryIcon({ icon, size = 18 }: { icon: Story['icon']; size?: number }) {
  switch (icon) {
    case 'crown':
      return <Crown size={size} />
    case 'sword':
      return <Sword size={size} />
    case 'bolt':
      return <Bolt size={size} />
    case 'rocket':
      return <Rocket size={size} />
    case 'flag':
      return <PoleFlag size={size} />
    case 'star':
      return <Trophy size={size} />
  }
}

/** Hinweis zu einem Lauf ohne „Team Rot gegen Team Blau“ – die Teams zeigen die Farbstriche */
export const heatNote = (heat: Heat, state: EventState) => (heat.note ? withoutTeams(heat.note, state.teams.map((t) => t.name)) : null)

export const BONUS_ICON = { fastestLap: '⚡', pole: 'P', driverOfDay: '★', personalBest: 'PB', clean: '✓' } as const

/** Punkte wie überall in der App: große Zahl, dahinter klein „Pkt.“ */
export function Pts({ value, color, size = 18 }: { value: number; color?: string; size?: number }) {
  return (
    <span className="num" style={{ fontSize: size, fontWeight: 800, color, whiteSpace: 'nowrap' }}>
      {fmtPts(value)}
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.6)), fontWeight: 700, marginLeft: 3, opacity: 0.85 }}>Pkt.</span>
    </span>
  )
}

/**
 * Gesamtwertung im Stil der Saison-Fahrerwertung: Platz, Avatar, Name, Siege und Rennen,
 * Punkte je Abschnitt und Bonus als Chips, Punkte und Verlauf rechts. Team = farbiger Rand links.
 */
export function StandingsList({ state, me, steps }: { state: EventState; me: string | null; steps?: ProgressStep[] }) {
  const location = useLocation()
  const { model } = useData()
  // Abschnitte, die für die Einzelwertung zählen (bei getrennter Wertung ohne Teamrennen)
  const counts = (s: EventState['sections'][number]) => s.def.weight > 0 && s.def.format !== 'free' && !(state.separate && s.def.format === 'team')
  const scoring = state.sections.filter(counts)
  return (
    <>
      {state.standings.map((r) => {
        const known = model.drivers.includes(r.name)
        const color = r.team ? teamColor(r.teamId, r.team) : undefined
        const body = (
          <>
            <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ minWidth: 22, fontSize: 16, paddingTop: 6 }}>
              {r.rank}
            </span>
            <Avatar name={r.name} ring={r.name === me ? 'var(--me)' : undefined} />
            <span className="grow" style={{ gap: 4 }}>
              <span className="name">{r.name === me ? `Du · ${r.name}` : r.name}</span>
              <span className="sub">
                {r.wins} {r.wins === 1 ? 'Sieg' : 'Siege'} · {r.races} Rennen
              </span>
              {(scoring.length > 1 || r.bonuses.length > 0) && (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {scoring.length > 1 &&
                    state.sections.map((s, i) =>
                      counts(s) ? (
                        <span key={s.def.id} className="day-chip" title={`${s.def.name}: ${fmtPts(r.sections[i])} Punkte`}>
                          {fmtPts(r.sections[i])}
                        </span>
                      ) : null,
                    )}
                  {r.bonuses.map((b, i) => (
                    <span key={i} className="day-chip" title={`${b.label}: +${fmtPts(b.points)}`} style={{ color: 'var(--gold)' }}>
                      {BONUS_ICON[b.kind]} +{fmtPts(b.points)}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span style={{ paddingTop: 4 }}>
              <Pts value={r.total} color={color} />
            </span>
            {steps && steps.length > 2 && (
              <span style={{ paddingTop: 8 }}>
                <Sparkline values={steps.map((s) => s.totals.get(r.name) ?? 0)} color={r.name === me ? ME : '#8A94A0'} label={`Punkteverlauf ${r.name}`} />
              </span>
            )}
          </>
        )
        const style = { padding: '8px', alignItems: 'flex-start', ...(color ? { borderLeft: `4px solid ${color}` } : null) } as const
        return known ? (
          <Link key={r.name} to={driverPath(r.name)} state={{ bg: location }} className={`row${r.name === me ? ' me-row' : ''}`} style={style}>
            {body}
          </Link>
        ) : (
          <div key={r.name} className={`row${r.name === me ? ' me-row' : ''}`} style={style}>
            {body}
          </div>
        )
      })}
    </>
  )
}

/** „Elo 1.250“, bei ungleich großen Teams mit Schnitt („Elo 1.250 · Ø 417“) */
export function teamEloText(team: { elo: number; drivers: string[] }, all: { drivers: string[] }[]): string {
  const uneven = new Set(all.map((t) => t.drivers.length)).size > 1
  return `Elo ${fmtElo(team.elo)}${uneven && team.drivers.length ? ` · Ø ${fmtElo(team.elo / team.drivers.length)}` : ''}`
}

/** Teams vor dem ersten Lauf: Mitglieder und Gesamt-Elo */
export function TeamList({ state }: { state: EventState }) {
  if (!state.teams.length) return null
  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="card-head">
        <span className="card-title">Teams</span>
        <span className="hint">Gesamt-Elo zu Beginn</span>
      </div>
      {[...state.teams]
        .sort((a, b) => b.elo - a.elo)
        .map((t) => (
          <div key={t.id} className="row" style={{ padding: 8, borderLeft: `4px solid ${teamColor(t.id, t.name)}` }}>
            <span className="grow">
              <span className="name" style={{ color: teamColor(t.id, t.name) }}>{t.name}</span>
              <span className="sub">{t.drivers.join(', ')}</span>
            </span>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', textAlign: 'right' }}>
              {teamEloText(t, state.teams)}
            </span>
          </div>
        ))}
    </section>
  )
}

/** Punkteverlauf: Stand nach jedem Lauf – alle Fahrer (du in Grün) oder Teams in Teamfarben */
export function ProgressChart({ state, steps, me }: { state: EventState; steps: ProgressStep[]; me: string | null }) {
  const [view, setView] = useState<'fahrer' | 'teams'>('fahrer')
  if (steps.length < 3) return null
  const teams = state.teamStandings.length > 0
  const shown = view === 'teams' && teams ? 'teams' : 'fahrer'
  const names = state.standings.map((s) => s.name)
  let i = 0
  const series =
    shown === 'teams'
      ? state.teamStandings.map((t) => ({ name: t.name, color: teamColor(t.id, t.name), values: steps.map((s) => s.teams.get(t.id) ?? 0) }))
      : names.map((n) => ({ name: n, color: n === me ? ME : SERIES[i++ % SERIES.length], values: steps.map((s) => s.totals.get(n) ?? 0) }))
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="card-title">Punkteverlauf</span>
        <span className="hint">{shown === 'teams' ? 'Teams' : 'alle Fahrer'} · nach jedem Lauf</span>
      </div>
      {teams && (
        <Segment
          small
          value={shown}
          onChange={setView}
          label="Verlauf für"
          options={[
            ['fahrer', 'Fahrer'],
            ['teams', 'Teams'],
          ]}
        />
      )}
      <PointsChart
        dates={steps.map((s, k) => s.heatId ?? `start-${k}`)}
        axis={steps.map((_, k) => (k === 0 ? 'Start' : String(k)))}
        tips={steps.map((s) => (s.heatId ? `nach ${s.label}` : 'zu Beginn'))}
        series={series}
        label={`Punkteverlauf ${state.def.name}`}
      />
    </section>
  )
}

/** Rangverlauf: Platz nach jedem Lauf, alle Fahrer (wie in der Saison) */
export function RankChart({ state, steps, me }: { state: EventState; steps: ProgressStep[]; me: string | null }) {
  if (steps.length < 3) return null
  const names = state.standings.map((s) => s.name)
  const played = steps.slice(1)
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="card-title">Rangverlauf</span>
        <span className="hint">Platz nach jedem Lauf</span>
      </div>
      <BumpChart
        dates={played.map((s, k) => s.heatId ?? String(k))}
        axis={played.map((_, k) => String(k + 1))}
        series={names.map((n) => ({ name: n, ranks: played.map((s) => s.ranks.get(n) ?? null) }))}
        colors={seriesColors(names, me)}
        me={me}
      />
    </section>
  )
}

/** „in ca. 8 Min.“ – unter 15 Minuten minutengenau, sonst auf 5 gerundet, ab einer Stunde mit Std. */
export function fmtWait(m: number): string {
  const r = m < 15 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5
  return `in ca. ${r < 60 ? `${r} Min.` : `${Math.floor(r / 60)} Std.${r % 60 ? ` ${r % 60} Min.` : ''}`}`
}

/** „Du bist als Nächstes dran“ bzw. „Noch 2 Läufe, dann bist du dran“ */
export const waitHeadline = (ahead: number) => (ahead === 0 ? 'Du bist als Nächstes dran' : `Noch ${ahead} ${ahead === 1 ? 'Lauf' : 'Läufe'}, dann bist du dran`)

/**
 * Der eigene nächste Lauf: ein kurzer Satz, wann es losgeht, darunter der Lauf selbst – mit allen
 * Fahrern einschließlich dir („Du“), Teams als Strich. Gleich auf der Startseite und der Wettkampf-Seite.
 */
export function NextHeatPanel({ state, heat, me, ahead, minutes, day }: { state: EventState; heat: Heat; me: string; ahead: number; minutes: number | null; day?: string | null }) {
  return (
    <div className="next-heat">
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <b style={{ fontSize: 18, lineHeight: 1.25, color: !day && ahead === 0 ? EVENT_ACCENT : undefined }}>{day ? `Am ${day} geht’s los` : waitHeadline(ahead)}</b>
        {!day && ahead > 0 && minutes != null && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtWait(minutes)}</span>}
      </span>
      <HeatCard heat={heat} state={state} me={me} plain />
    </div>
  )
}

/** Link zum Rückblick als Story (wie „Dein Jahr“ in der Saison) */
export function RecapBanner({ id, state, me, done }: { id: string; state: EventState; me: string | null; done: boolean }) {
  const mine = me ? state.standings.find((s) => s.name === me) : null
  const sub = mine ? `Platz ${mine.rank} · ${fmtPts(mine.total)} Pkt.` : state.standings[0] ? `${done ? 'Sieger' : 'Vorn'}: ${state.standings[0].name}` : ''
  return (
    <RecapLink
      to={`/wettkampf/${id}/rueckblick`}
      mine={!!mine}
      title={`${mine ? 'Dein ' : ''}${state.def.name}${done ? '' : ' bisher'}`}
      sub={`${sub} – zum Rückblick`}
    />
  )
}

const STATUS_TEXT = { done: 'gefahren', next: 'als Nächstes', ready: 'geplant', waiting: 'wartet' } as const

/** Autos als kleine Bilder mit Namen */
export function CarChips({ cars, size = 32, label }: { cars: string[]; size?: number; label?: (car: string) => ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {cars.map((c) => (
        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', background: 'var(--inner)', borderRadius: 10, padding: '3px 8px 3px 3px', maxWidth: '100%' }}>
          <CarThumb car={c} size={size} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label ? label(c) : c}</span>
        </span>
      ))}
    </div>
  )
}

export function HeatCard({ heat, state, me, children, plain, headless }: { heat: Heat; state: EventState; me: string | null; children?: ReactNode; plain?: boolean; headless?: boolean }) {
  const { model } = useData()
  // Team als farbiger Strich am Zeilenanfang (wie der Rand in den Ranglisten)
  const teamBar = (n: string | null) => {
    const id = n ? (heat.teamOf?.[n] ?? state.teams.find((t) => t.drivers.includes(n))?.id) : undefined
    const team = id ? state.teams.find((t) => t.id === id) : undefined
    return team ? { boxShadow: `inset 3px 0 0 ${teamColor(team.id, team.name)}`, paddingLeft: 9 } : undefined
  }
  // Nur der eigene Name grün, nicht die ganze Zeile
  const nameStyle = (n: string | null) => ({ whiteSpace: 'nowrap', ...(n && n === me ? { color: 'var(--me)', fontWeight: 700 } : null) }) as const
  const inModel = heat.session && model.sessions.some((s) => s.fileId === heat.session!.fileId)
  const results = heat.session ? new Map(heat.session.results.map((r) => [r.driver, r])) : null
  const mine = !!me && (heat.status === 'done' ? heat.order.includes(me) : heat.entrants.some((e) => e.name === me))
  const [why, setWhy] = useState<string | null>(null)
  return (
    <div className={`heat${heat.status === 'next' ? ' next' : ''}${mine && !plain ? ' mine' : ''}`}>
      <div className="heat-head">
        {!headless && <b>{heat.label}</b>}
        {!headless && <span className={`status-chip ${heat.status}`}>{STATUS_TEXT[heat.status]}</span>}
        {heat.manual && <span className="status-chip">per Hand zugeordnet</span>}
        {heatNote(heat, state) && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{heatNote(heat, state)}</span>}
        {heat.status !== 'done' && heat.gridFrom && <span style={{ fontSize: 11, color: heat.grid ? EVENT_ACCENT : 'var(--muted)' }}>Startaufstellung nach {heat.gridFrom}{heat.grid ? '' : ' folgt'}</span>}
        {inModel && (
          <Link to={`/lauf/${heat.session!.fileId}`} style={{ marginLeft: 'auto', fontSize: 12, color: EVENT_ACCENT }}>
            Details ›
          </Link>
        )}
      </div>
      {heat.status === 'done'
        ? heat.order.map((n, i) => {
            const r = results?.get(n)
            const pts = heat.advancing?.includes(n) ? '↑ weiter' : heat.kind === 'race' && heat.points.has(n) ? `+${fmtPts(heat.points.get(n)!)}` : ''
            const lines = why === n ? heatPointsExplained(state, heat, n) : []
            return (
              <Fragment key={n}>
                <button className="entrant entrant-btn" style={teamBar(n)} aria-expanded={why === n} onClick={() => setWhy(why === n ? null : n)}>
                  <span className="num" style={{ minWidth: 18, color: 'var(--muted)' }}>
                    {i + 1}.
                  </span>
                  <span style={{ ...nameStyle(n), flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{n === me ? `Du · ${n}` : n}</span>
                  <span className="num" style={{ fontWeight: 700, color: heat.advancing?.includes(n) ? EVENT_ACCENT : undefined }}>
                    {pts}
                  </span>
                </button>
                {why === n && (
                  <div className="pts-why">
                    {r?.car && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
                        <CarThumb car={r.car} size={32} />
                        <span style={{ flex: 1, minWidth: 0 }}>{r.car}</span>
                      </span>
                    )}
                    {r?.validBestLapMs && <span>Beste Runde: {formatTime(r.validBestLapMs)}</span>}
                    {lines.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                )}
              </Fragment>
            )
          })
        : (heat.grid ?? heat.entrants).map((e, i) => (
            <div key={i} className={`entrant${e.name ? '' : ' placeholder'}`} style={teamBar(e.name)}>
              {heat.grid && (
                <span className="num" title={`Startplatz ${i + 1}`} style={{ minWidth: 18, color: EVENT_ACCENT, fontWeight: 700 }}>
                  {i + 1}.
                </span>
              )}
              <span className="entrant-text">
                <span style={nameStyle(e.name)}>{e.name && e.name === me ? `Du · ${e.label}` : e.label}</span>
                {e.name && heat.cars[e.name] && <span className="entrant-sub">{heat.cars[e.name]}</span>}
              </span>
              {e.name && heat.cars[e.name] && <CarThumb car={heat.cars[e.name]} size={30} />}
            </div>
          ))}
      {heat.status !== 'done' && heat.carChoice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Freie Wahl aus:</span>
          <CarChips cars={heat.carChoice} size={26} />
        </div>
      ) : (
        heat.status !== 'done' && heat.carHint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{heat.carHint}</span>
      )}
      {heat.teamPoints && (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {[...heat.teamPoints].map(([id, p], i) => (
            <span key={id}>
              {i > 0 && ' · '}
              <span style={{ color: teamColor(id, state.teams.find((t) => t.id === id)?.name), fontWeight: 600 }}>{state.teams.find((t) => t.id === id)?.name ?? id}</span> {fmtPts(p)}
            </span>
          ))}
        </span>
      )}
      {children}
    </div>
  )
}

export function Podium({ state }: { state: EventState }) {
  const [a, b, c] = state.standings
  if (!a) return null
  const step = (s: Standing | undefined, place: number, height: number, color: string) =>
    s ? (
      <div className="step" style={{ minHeight: height, borderTop: `3px solid ${color}` }}>
        <Avatar name={s.name} size={place === 1 ? 52 : 40} ring={color} />
        <span style={{ fontWeight: 700, fontSize: place === 1 ? 16 : 14 }}>{s.name}</span>
        <span style={{ color: 'var(--muted)' }}>
          <Pts value={s.total} size={13} />
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{place}</span>
      </div>
    ) : (
      <div />
    )
  return (
    <div className="podium">
      {step(b, 2, 130, 'var(--silver)')}
      {step(a, 1, 160, 'var(--gold)')}
      {step(c, 3, 110, 'var(--bronze)')}
    </div>
  )
}

/** Podest der Teams: Teamname in Teamfarbe, alle Mitglieder mit Avatar und Namen, Teampunkte */
export function TeamPodium({ state, me }: { state: EventState; me?: string | null }) {
  const [a, b, c] = state.teamStandings
  if (!a) return null
  const step = (t: TeamStanding | undefined, place: number, height: number, medal: string) =>
    t ? (
      <div className="step" style={{ minHeight: height, borderTop: `3px solid ${medal}`, boxShadow: `inset 0 -4px 0 ${teamColor(t.id, t.name)}, var(--sh2)` }}>
        <span style={{ fontWeight: 800, fontSize: place === 1 ? 15 : 13, color: teamColor(t.id, t.name) }}>{t.name}</span>
        <span style={{ display: 'flex', justifyContent: 'center' }}>
          {t.drivers.map((n, i) => (
            <span key={n} style={{ marginLeft: i ? -8 : 0 }}>
              <Avatar name={n} size={place === 1 ? 34 : 28} ring={n === me ? 'var(--me)' : undefined} />
            </span>
          ))}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.3 }}>
          {t.drivers.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <span style={n === me ? { color: 'var(--me)', fontWeight: 700 } : undefined}>{n === me ? 'Du' : n}</span>
            </span>
          ))}
        </span>
        <span style={{ color: 'var(--muted)' }}>
          <Pts value={t.points} size={13} />
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color: medal }}>{place}</span>
      </div>
    ) : (
      <div />
    )
  return (
    <div className="podium">
      {step(b, 2, 150, 'var(--silver)')}
      {step(a, 1, 180, 'var(--gold)')}
      {step(c, 3, 130, 'var(--bronze)')}
    </div>
  )
}

/** Siegerehrung je nach Art: Einzel = Fahrerpodest, Team = Teampodest, gemischt = beide */
export function Ceremony({ state, me }: { state: EventState; me: string | null }) {
  const kind = eventKind(state)
  if (kind === 'single') return <Podium state={state} />
  if (kind === 'team') return <TeamPodium state={state} me={me} />
  return (
    <>
      <div className="card-part">
        <span className="part-label">Teamwertung</span>
        <TeamPodium state={state} me={me} />
      </div>
      <div className="card-part">
        <span className="part-label">Einzelwertung</span>
        <Podium state={state} />
      </div>
    </>
  )
}

/** Alles zu einem Team: Platz, Punkte und wer wie viel beigetragen hat (Ringdiagramm) */
export function TeamCard({ state, team, me }: { state: EventState; team: TeamStanding; me: string | null }) {
  const color = teamColor(team.id, team.name)
  const parts = teamContributions(state, team.id)
  const total = parts.reduce((a, p) => a + p.points, 0)
  const byTotal = eventKind(state) === 'mixed' && !state.separate
  return (
    <section className={`card${me && team.drivers.includes(me) ? ' me-row' : ''}`} style={{ gap: 10, borderLeft: `4px solid ${color}` }}>
      <div className="card-head">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span className="card-title" style={{ color }}>
            {team.rank}. {team.name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{teamEloText(team, state.teamStandings)}</span>
        </span>
        <Pts value={team.points} color={color} size={20} />
      </div>
      {total > 0 ? (
        <>
          <span className="part-label" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            {byTotal ? 'Punkte der Mitglieder' : 'Punkte in den Teamrennen'}
          </span>
          <DonutChart
            parts={parts.map((p, i) => ({ label: p.name === me ? 'Du' : p.name, value: p.points, color: shade(color, i) }))}
            center={fmtPts(Math.round(total * 10) / 10)}
            sub="Pkt. gesamt"
            label={`Beiträge im ${team.name}`}
            size={130}
            format={fmtPts}
          />
        </>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{team.drivers.map((n) => (n === me ? 'Du' : n)).join(', ')} – noch keine Punkte.</span>
      )}
    </section>
  )
}

/**
 * Hinweis, wenn Siegchancen und faire Gewichtung noch unsicher sind: Fahrer in der Einstufung oder ohne
 * Rennen, Autos mit vorläufiger Wertung. null = alles eingependelt.
 */
export function uncertainty(data: AppData, def: EventDef): string | null {
  const { model } = data
  const placing = def.drivers.filter((n) => !model.rating.history.has(n) || model.placement(n) != null)
  const cars = eventCars(def).filter((c) => model.stats('all').cars.get(c)?.provisional ?? true)
  const parts: string[] = []
  if (placing.length) parts.push(`${placing.length === 1 ? `${placing[0]} ist` : `${placing.join(', ')} sind`} noch in der Einstufung`)
  if (cars.length) parts.push(`vorläufige Autowertung für ${cars.join(', ')}`)
  return parts.length ? `Siegchancen unsicher: ${parts.join('; ')}. Die Elo-Werte und Autowertungen pendeln sich erst mit mehr Rennen ein.` : null
}

/** Regeln als Text */
export function rulesText(def: EventDef, state: EventState): string[] {
  const sc = def.scoring
  const out: string[] = []
  out.push(
    sc.method === 'fair'
      ? `Wertung „Fair“: Für jeden geschlagenen Gegner gibt es bis zu ${fmtPts(sc.perBeaten * 2)} Punkte – je stärker der Gegner laut Elo (mit Auto), desto mehr. Gegen einen Gleichstarken ${fmtPts(sc.perBeaten)}. Sieg +${fmtPts(sc.win)}${sc.fairWin ? ', ebenfalls nach Stärke gewichtet (bis doppelt)' : ''}.`
      : `Pro Rennen ${fmtPts(sc.perBeaten)} ${sc.perBeaten === 1 ? 'Punkt' : 'Punkte'} je geschlagenem Gegner, Sieg +${fmtPts(sc.win)}.`,
  )
  for (const s of state.sections) {
    const d = s.def
    const what =
      d.format === 'quali'
        ? 'Reihenfolge nach schnellster Runde'
        : d.format === 'ladder'
          ? `die Langsamsten fahren zuerst, die besten ${d.advance ?? 2} steigen jeweils auf`
          : d.format === 'ko'
            ? `die besten ${d.advance ?? 1} je Lauf kommen weiter; in jeder Gruppe scheiden gleich viele aus, in größeren Gruppen kommt also einer mehr weiter`
            : d.format === 'team'
              ? `${s.teamPlan?.mode === 'pairs' || s.teamPlan?.mode === 'split' ? (d.half && (d.rounds ?? 1) === 1 ? 'ein halber Durchgang, Gegner nach Elo ausgeglichen; ' : `jedes Team ${d.rounds && d.rounds > 1 ? `${d.rounds}× ` : ''}gegen jedes; `) : ''}${s.teamPlan?.mode === 'split' ? `je ${s.teamPlan.perTeam} Fahrer pro Team und Rennen, die Aufstellung wechselt reihum; ` : ''}${s.teamPlan?.mode === 'slots' ? 'die Nr. 1 jedes Teams gegeneinander, dann die Nr. 2 usw.; ' : ''}jedes Team bekommt den Schnitt seiner Fahrer, alle Mitglieder die Teampunkte. Läufe mit weniger Fahrern und Pausen werden hochgerechnet`
              : d.format === 'races'
                ? `${d.rounds ?? 1} ${d.rounds === 1 ? 'Durchgang' : 'Durchgänge'}, Punkte addiert; Läufe mit weniger Fahrern werden hochgerechnet`
                : d.format === 'custom'
                  ? 'Punkte addiert; Läufe mit weniger Fahrern werden hochgerechnet'
                  : 'Punkte addiert'
    out.push(`${d.name} (${FORMAT_LABEL[d.format]}): ${what}${d.weight === 0 ? ' – zählt nur für die Startreihenfolge' : d.weight !== 1 ? ` – zählt ×${fmtPts(d.weight)}` : ''}.`)
  }
  if (sc.finaleFactor > 1) {
    const last = [...state.sections].reverse().find((s) => s.def.weight > 0 && s.def.format !== 'free')
    if (last) out.push(`Finalbonus: ${last.def.name} zählt ×${fmtPts(sc.finaleFactor)}.`)
  }
  const newRules = def.start >= RATING.v2From
  const byCar = newRules && sc.method === 'fair' ? ' (gemessen an der typischen Runde des eigenen Autos)' : ''
  const bonus = [
    sc.fastestLap && `schnellste Runde${byCar} +${fmtPts(sc.fastestLap)}`,
    sc.pole && `Pole${byCar} +${fmtPts(sc.pole)}`,
    sc.driverOfDay && (newRules
      ? `Fahrer des Tages (größte Leistung über der Erwartung je Gegner; fast gleichauf = geteilt) +${fmtPts(sc.driverOfDay)}`
      : `Fahrer des Tages (größte Leistung über der Erwartung) +${fmtPts(sc.driverOfDay)}`),
    sc.personalBest && `neue persönliche Bestzeit${newRules ? ' (im selben Maßstab)' : ''} +${fmtPts(sc.personalBest)}`,
    sc.clean && `je Rennen ohne Abflug +${fmtPts(sc.clean)}`,
  ].filter(Boolean)
  if (bonus.length) out.push(`Bonus: ${bonus.join(', ')}.`)
  if (newRules && (sc.method === 'fair' || sc.driverOfDay)) out.push('Wer noch in der Einstufung ist, zählt mit seiner Elo vor dem jeweiligen Rennen – so zählen die Ergebnisse statt des Startwerts. Die Autowertung gilt so, wie sie vor dem jeweiligen Rennen feststand.')
  if (state.separate) out.push('Einzel- und Teamwertung sind getrennt: Einzelrennen zählen für die eigenen Punkte, Teamrennen nur für die Teamwertung (Teampunkte je Lauf: Schnitt der Mitglieder, hochgerechnet).')
  else if (def.teams) out.push('Teamwertung: Schnitt der Gesamtpunkte der Mitglieder – unterschiedlich große Teams bleiben fair.')
  out.push(def.countInStats ? 'Die Läufe zählen auch für Elo und Saison.' : 'Die Läufe zählen nicht für Elo und Saison.')
  return out
}
