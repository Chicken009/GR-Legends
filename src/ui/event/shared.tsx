import { useMemo, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { AppData } from '../../data/useRaceDays'
import { eventSessions } from '../../data/useRaceDays'
import type { EventFolder } from '../../data/events'
import { carScale } from '../../data/settings'
import { eventContext } from '../../domain/event/context'
import { computeEvent, type EventState, type Heat, type Standing } from '../../domain/event/engine'
import { eventPhase, lastDay, todayIso, type EventPhase, type Story } from '../../domain/event/insights'
import { FORMAT_LABEL, type EventDef } from '../../domain/event/types'
import { AREA, SERIES } from '../colors'
import { Avatar, driverPath, useData } from '../components'
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

export function TeamTag({ id, name, size }: { id: string | null | undefined; name: string; size?: number | string }) {
  return (
    <span className="team-tag" style={{ color: teamColor(id, name), fontSize: size }}>
      {name}
    </span>
  )
}

export function computeFor(data: AppData, def: EventDef, folderId: string | null): EventState {
  const sessions = folderId ? eventSessions(data.allSessions, folderId) : []
  return computeEvent(def, eventContext(def, data.model.rating, data.allSessions, sessions, def.track ?? null, (c) => carScale(data.settings, c)))
}

export function useEventState(folder: EventFolder | undefined, def?: EventDef) {
  const data = useData()
  const d = def ?? folder?.def
  return useMemo(() => (d ? computeFor(data, d, folder?.id ?? null) : null), [data, d, folder?.id])
}

export const PHASE_LABEL: Record<EventPhase, string> = { planned: 'geplant', running: 'läuft', done: 'beendet' }

export function phaseOf(def: EventDef, state: EventState) {
  return eventPhase(def, state, todayIso())
}

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

export function Stories({ list }: { list: Story[] }) {
  if (!list.length) return null
  return (
    <section className="card" style={{ gap: 10 }}>
      <span className="card-title">Was gerade spannend ist</span>
      {list.map((s, i) => (
        <div key={i} className="story">
          <span style={{ flexShrink: 0, paddingTop: 1 }}>
            <StoryIcon icon={s.icon} />
          </span>
          <span>{s.text}</span>
        </div>
      ))}
    </section>
  )
}

const BONUS_ICON = { fastestLap: '⚡', pole: 'P', driverOfDay: '★', personalBest: 'PB', clean: '✓' } as const

export function StandingsList({ state, me, compact }: { state: EventState; me: string | null; compact?: boolean }) {
  const location = useLocation()
  const { model } = useData()
  const scoring = state.sections.filter((s) => s.def.weight > 0 && s.def.format !== 'free')
  return (
    <>
      {state.standings.map((r) => {
        const known = model.drivers.includes(r.name)
        const body = (
          <>
            <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ minWidth: 22, fontSize: 16, paddingTop: 4 }}>
              {r.rank}
            </span>
            <Avatar name={r.name} ring={r.name === me ? 'var(--me)' : undefined} />
            <span className="grow" style={{ gap: 3 }}>
              <span className="name">{r.name === me ? `Du · ${r.name}` : r.name}</span>
              {!compact && (
                <span className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', alignItems: 'center' }}>
                  {r.team && <TeamTag id={r.teamId} name={r.team} />}
                  {r.races} {r.races === 1 ? 'Rennen' : 'Rennen'}
                  {r.wins ? ` · ${r.wins} ${r.wins === 1 ? 'Sieg' : 'Siege'}` : ''}
                  {r.bestLapMs ? ` · ${formatTime(r.bestLapMs)}` : ''}
                </span>
              )}
              {!compact && (scoring.length > 1 || r.bonuses.length > 0) && (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {scoring.length > 1 &&
                    state.sections.map((s, i) =>
                      s.def.weight > 0 && s.def.format !== 'free' ? (
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
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: 2 }}>
              <span className="num" style={{ fontSize: 20, fontWeight: 800 }}>
                {fmtPts(r.total)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>Punkte</span>
            </span>
          </>
        )
        const style = { padding: '8px', alignItems: 'flex-start' } as const
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

export function TeamStandings({ state }: { state: EventState }) {
  if (!state.teamStandings.length) return null
  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="card-head">
        <span className="card-title">Teamwertung</span>
        <span className="hint">{state.separate ? 'nur Teamrennen' : 'Schnitt der Mitglieder'}</span>
      </div>
      {state.teamStandings.map((t) => (
        <div key={t.id} className="row" style={{ padding: 8, borderLeft: `4px solid ${teamColor(t.id, t.name)}` }}>
          <span className={`rank${t.rank <= 3 ? ` r${t.rank}` : ''}`} style={{ minWidth: 22, fontSize: 16 }}>
            {t.rank}
          </span>
          <span className="grow">
            <span className="name" style={{ color: teamColor(t.id, t.name) }}>{t.name}</span>
            <span className="sub">
              {t.drivers.join(', ')} · {teamEloText(t, state.teamStandings)}
            </span>
          </span>
          <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>
            {fmtPts(t.points)}
          </span>
        </div>
      ))}
    </section>
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

export function HeatCard({ heat, state, me, children }: { heat: Heat; state: EventState; me: string | null; children?: ReactNode }) {
  const { model } = useData()
  const teamTag = (n: string) => {
    const id = heat.teamOf?.[n] ?? state.teams.find((t) => t.drivers.includes(n))?.id
    const team = id ? state.teams.find((t) => t.id === id) : undefined
    return team ? <TeamTag id={team.id} name={team.name} /> : null
  }
  const inModel = heat.session && model.sessions.some((s) => s.fileId === heat.session!.fileId)
  const results = heat.session ? new Map(heat.session.results.map((r) => [r.driver, r])) : null
  const mine = !!me && (heat.status === 'done' ? heat.order.includes(me) : heat.entrants.some((e) => e.name === me))
  return (
    <div className={`heat${heat.status === 'next' ? ' next' : ''}${mine ? ' mine' : ''}`}>
      <div className="heat-head">
        <b>{heat.label}</b>
        <span className={`status-chip ${heat.status}`}>{STATUS_TEXT[heat.status]}</span>
        {heat.manual && <span className="status-chip">per Hand zugeordnet</span>}
        {heat.note && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{heat.note}</span>}
        {heat.status !== 'done' && heat.grid && <span style={{ fontSize: 11, color: EVENT_ACCENT }}>Startaufstellung nach {heat.gridFrom}</span>}
        {inModel && (
          <Link to={`/lauf/${heat.session!.fileId}`} style={{ marginLeft: 'auto', fontSize: 12, color: EVENT_ACCENT }}>
            Details ›
          </Link>
        )}
      </div>
      {heat.status === 'done'
        ? heat.order.map((n, i) => {
            const r = results?.get(n)
            return (
              <div key={n} className="entrant" style={n === me ? { color: 'var(--me)', fontWeight: 600 } : undefined}>
                <span className="num" style={{ minWidth: 18, color: 'var(--muted)' }}>
                  {i + 1}.
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>{n}</span>
                {teamTag(n)}
                <span className="car">
                  {r?.car}
                  {r?.validBestLapMs ? ` · ${formatTime(r.validBestLapMs)}` : ''}
                </span>
                {r?.car && <CarThumb car={r.car} size={26} />}
                <span className="num" style={{ minWidth: 34, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: heat.advancing?.includes(n) ? EVENT_ACCENT : undefined }}>
                  {heat.advancing?.includes(n) ? '↑ weiter' : heat.kind === 'race' && heat.points.has(n) ? `+${fmtPts(heat.points.get(n)!)}` : ''}
                </span>
              </div>
            )
          })
        : (heat.grid ?? heat.entrants).map((e, i) => (
            <div key={i} className={`entrant${e.name ? '' : ' placeholder'}`} style={e.name && e.name === me ? { color: 'var(--me)', fontWeight: 600 } : undefined}>
              {heat.grid && (
                <span className="num" title={`Startplatz ${i + 1}`} style={{ minWidth: 18, color: EVENT_ACCENT, fontWeight: 700 }}>
                  {i + 1}.
                </span>
              )}
              <span style={{ whiteSpace: 'nowrap' }}>{e.label}</span>
              {e.name && teamTag(e.name)}
              <span className="car">{e.name ? heat.cars[e.name] ?? '' : ''}</span>
              {e.name && heat.cars[e.name] && <CarThumb car={heat.cars[e.name]} size={26} />}
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
        <span className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>
          {fmtPts(s.total)} Punkte
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
  const bonus = [
    sc.fastestLap && `schnellste Runde +${fmtPts(sc.fastestLap)}`,
    sc.pole && `Pole +${fmtPts(sc.pole)}`,
    sc.driverOfDay && `Fahrer des Tages (größte Leistung über der Erwartung) +${fmtPts(sc.driverOfDay)}`,
    sc.personalBest && `neue persönliche Bestzeit +${fmtPts(sc.personalBest)}`,
    sc.clean && `je Rennen ohne Abflug +${fmtPts(sc.clean)}`,
  ].filter(Boolean)
  if (bonus.length) out.push(`Bonus: ${bonus.join(', ')}.`)
  if (state.separate) out.push('Einzel- und Teamwertung sind getrennt: Einzelrennen zählen für die eigenen Punkte, Teamrennen nur für die Teamwertung (Teampunkte je Lauf: Schnitt der Mitglieder, hochgerechnet).')
  else if (def.teams) out.push('Teamwertung: Schnitt der Gesamtpunkte der Mitglieder – unterschiedlich große Teams bleiben fair.')
  out.push(def.countInStats ? 'Die Läufe zählen auch für Elo und Saison.' : 'Die Läufe zählen nicht für Elo und Saison.')
  return out
}
