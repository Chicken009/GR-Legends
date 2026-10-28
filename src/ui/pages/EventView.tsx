import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { driverInsight, planFromText, planVisible, todayIso } from '../../domain/event/insights'
import { eventProgress, placePoints, sectionFactor, waitFor } from '../../domain/event/progress'
import { FORMAT_LABEL, heatLength } from '../../domain/event/types'
import { Avatar, PageHead, Segment, useData, useMyName } from '../components'
import type { EventState, Heat } from '../../domain/event/engine'
import { formatDate } from '../format'
import { useMe } from '../me'
import { StrokeIcon, TOOL_ICONS } from '../icons'
import { PointsLadder, RuleChip } from '../PointsLadder'
import { useStored } from '../useStored'
import {
  BONUS_ICON,
  CarChips,
  dateRange,
  EVENT_ACCENT,
  fmtPts,
  fmtWait,
  HeatCard,
  NextHeatPanel,
  PhasePill,
  phaseOf,
  finishedOf,
  Ceremony,
  TeamCard,
  EventCharts,
  placeDetail,
  placeMode,
  Pts,
  RecapBanner,
  rulesText,
  StandingsList,
  teamColor,
  TeamList,
  uncertainty,
  useEventHistory,
  useEventState,
  useLapMs,
} from '../event/shared'

type Tab = 'stand' | 'team' | 'ablauf' | 'punkte'

export function EventView() {
  const { id = '' } = useParams()
  const data = useData()
  const folder = data.events.find((e) => e.id === id)
  const state = useEventState(folder)
  const steps = useEventHistory(folder)
  const lapMs = useLapMs(folder)
  const { me: picked } = useMe()
  const known = useMyName()
  const me = picked && state?.drivers.includes(picked) ? picked : known
  const [stored, setTab] = useStored<Tab>('event:tab', 'stand')
  if (!folder || !state) {
    return (
      <div className="page">
        <p className="muted">Diesen Wettkampf gibt es nicht (mehr).</p>
        <Link to="/wettkampf" className="btn" style={{ alignSelf: 'flex-start' }}>
          Alle Wettkämpfe
        </Link>
      </div>
    )
  }
  const def = folder.def
  const phase = phaseOf(def, state)
  const finished = finishedOf(def, state)
  const today = todayIso()
  const showPlan = planVisible(def, today)
  const inEvent = !!me && state.drivers.includes(me)
  const progress = eventProgress(state, lapMs)
  const hasTeams = state.teams.length > 0
  const tab: Tab = stored === 'ablauf' || stored === 'punkte' || (stored === 'team' && hasTeams) ? stored : 'stand'
  return (
    <div className="page" style={{ ['--accent' as string]: EVENT_ACCENT }}>
      <PageHead title={def.name} kicker={`Wettkampf · ${dateRange(def)}`} color={EVENT_ACCENT} back={{ to: '/wettkampf', label: 'Alle Wettkämpfe' }}>
        <Link to={`/wettkampf/${id}/bearbeiten`} className="icon-btn" aria-label="Bearbeiten (Rennleitung)" title="Bearbeiten (Rennleitung)">
          <StrokeIcon d={TOOL_ICONS.pencil} size={18} color="var(--muted)" />
        </Link>
      </PageHead>
      <div className="filters">
        <PhasePill phase={phase} />
        <span className="pill">{folder.tracks.join(', ')}</span>
        <span className="pill">{state.drivers.length} Fahrer</span>
        {state.teams.length > 0 && (
          <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} aria-label={`${state.teams.length} Teams`} title={state.teams.map((t) => t.name).join(', ')}>
            {state.teams.map((t) => (
              <span key={t.id} style={{ width: 9, height: 9, borderRadius: '50%', background: teamColor(t.id, t.name) }} />
            ))}
            <span style={{ marginLeft: 2 }}>{state.teams.length} Teams</span>
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/wettkampf/${id}/leinwand`} className="btn round">
            Leinwand
          </Link>
        </span>
      </div>
      {showPlan && progress.total > 0 && !finished && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="ev-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Gefahrene Läufe">
            <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {progress.done} von {progress.total} Läufen gefahren
            {progress.done < progress.total && progress.minutesLeft > 0 ? ` · fertig ${fmtWait(progress.minutesLeft)}` : ''}
          </span>
        </div>
      )}
      {folder.problem && (
        <p className="inner" style={{ margin: 0, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
          {folder.problem}
        </p>
      )}
      {state.warnings.map((w) => (
        <p key={w} className="inner" style={{ margin: 0, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
          {w}
        </p>
      ))}

      {phase === 'done' && !finished && state.started && (
        <p className="inner" style={{ margin: 0, padding: '10px 12px', fontSize: 13, color: 'var(--text-2)' }}>
          Es fehlen noch Ergebnisse ({progress.done} von {progress.total} Läufen). Die Siegerehrung erscheint, sobald alle Dateien da sind.
        </p>
      )}

      {finished && (
        <>
          <section className="card" style={{ gap: 14 }}>
            <span className="card-title">Siegerehrung</span>
            <Ceremony state={state} me={me} />
          </section>
          <RecapBanner id={id} state={state} me={me} done />
        </>
      )}

      {inEvent && !finished && <MyEvent state={state} me={me!} showPlan={showPlan} lapMs={lapMs} />}

      {showPlan && state.next && !finished && <NextUp state={state} me={me} shownAbove={inEvent && state.next.entrants.some((e) => e.name === me)} />}

      <Segment
        value={tab}
        onChange={setTab}
        label="Ansicht"
        options={[['stand', 'Stand'], ...(hasTeams ? [['team', 'Teams'] as [Tab, string]] : []), ['ablauf', 'Ablauf'], ['punkte', placeMode(state) ? 'Wertung' : 'Punkte']]}
      />

      {tab === 'stand' &&
        (state.started ? (
          <>
            <section className="card" style={{ gap: 2 }}>
              <div className="card-head">
                <span className="card-title">{state.separate ? 'Einzelwertung' : 'Gesamtwertung'}</span>
                <span className="hint">{placeMode(state) ? 'nach Platzierung' : state.separate ? 'nur Einzelrennen' : 'Punkte · Verlauf'}</span>
              </div>
              <StandingsList state={state} me={me} steps={steps} />
            </section>
            <EventCharts state={state} steps={steps} me={me} />
            {!finished && <RecapBanner id={id} state={state} me={me} done={false} />}
          </>
        ) : (
          <>
            <TeamList state={state} />
            <Entrants state={state} me={me} />
          </>
        ))}

      {tab === 'team' &&
        (state.started ? (
          <>
            {state.teamStandings.map((t) => (
              <TeamCard key={t.id} state={state} team={t} me={me} />
            ))}
            <EventCharts state={state} steps={steps} me={me} teamsFirst />
          </>
        ) : (
          <TeamList state={state} />
        ))}

      {tab === 'ablauf' &&
        (showPlan ? (
          state.sections.map((sec) => <SectionCard key={sec.def.id} sec={sec} state={state} me={me} />)
        ) : (
          <section className="card">
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Der Ablauf wird {planFromText(def)} sichtbar.</span>
          </section>
        ))}

      {tab === 'punkte' && <PointsRules state={state} note={state.complete ? null : uncertainty(data, def)} />}
      {tab === 'punkte' && <CarsCard def={def} />}
    </div>
  )
}

/** Eigene Karte in zwei Abschnitten: dein nächster Lauf und dein Stand – Team als Rand */
function MyEvent({ state, me, showPlan, lapMs }: { state: EventState; me: string; showPlan: boolean; lapMs: number }) {
  const insight = driverInsight(state, me)
  const s = insight.standing
  const team = s?.teamId ? state.teamStandings.find((t) => t.id === s.teamId) : null
  const color = team ? teamColor(team.id, team.name) : undefined
  const teamStarted = state.teamStandings.some((t) => t.points !== 0)
  const wait = showPlan ? waitFor(state, me, lapMs) : null
  const future = state.def.start > todayIso() && !state.started
  // Ausschnitt der Wertung: der direkt vor dir, du, der direkt hinter dir
  const slice = s && state.started ? [insight.above, s, insight.below].filter((x): x is NonNullable<typeof x> => x != null) : []
  return (
    <section className="card me-row" style={{ gap: 12, ...(color ? { borderLeft: `4px solid ${color}` } : null) }}>
      <span className="card-title">Dein Wettkampf</span>
      {(wait || (showPlan && state.started)) && (
        <div className="card-part">
          <span className="part-label">Dein nächster Lauf</span>
          {wait ? (
            <NextHeatPanel state={state} heat={wait.heat} me={me} ahead={wait.ahead} minutes={wait.minutes} day={future ? formatDate(state.def.start) : null} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Gerade ist kein Lauf mehr für dich eingeplant.</span>
          )}
        </div>
      )}
      {slice.length > 0 && (
        <div className="card-part">
          <span className="part-label">
            <span>Dein Stand</span>
            {team && teamStarted && <span style={{ color }}>Team-Platz {team.rank}</span>}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {slice.map((r) => {
              const gap = Math.round((r.total - s!.total) * 10) / 10
              return (
                <div key={r.name} className="row" style={{ padding: '4px 8px', minHeight: 36, ...(r.name === me ? { background: 'rgba(59, 188, 74, 0.16)' } : null) }}>
                  <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ minWidth: 22, fontSize: 15 }}>
                    {r.rank}
                  </span>
                  <span className="grow">
                    <span className="name" style={r.name === me ? { color: 'var(--me)' } : undefined}>
                      {r.name === me ? 'Du' : r.name}
                    </span>
                  </span>
                  {placeMode(state) ? (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{placeDetail(state, r.name)}</span>
                  ) : (
                    <>
                      {r.name !== me && (
                        <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                          {gap > 0 ? `${fmtPts(gap)} vor dir` : gap < 0 ? `${fmtPts(-gap)} hinter dir` : 'gleich'}
                        </span>
                      )}
                      <Pts value={r.total} size={15} />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

/** Nächster Lauf für alle, darunter der Lauf danach */
function NextUp({ state, me, shownAbove }: { state: EventState; me: string | null; shownAbove: boolean }) {
  const next = state.next!
  const after = state.heats.slice(state.heats.indexOf(next) + 1).filter((h) => h.status !== 'done').slice(0, 1)
  // Ist der nächste Lauf dein eigener, steht er schon in „Dein Wettkampf“ – hier nur noch, was danach kommt
  if (shownAbove) {
    if (!after.length) return null
    return (
      <section className="card" style={{ gap: 6 }}>
        <span className="card-title">Danach</span>
        {after.map((h) => (
          <AfterRow key={h.id} heat={h} me={me} />
        ))}
      </section>
    )
  }
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="card-title">Als Nächstes</span>
        <span className="hint">{[state.sections.find((s) => s.def.id === next.sectionId)?.def.name, heatLength(next)].filter(Boolean).join(' · ')}</span>
      </div>
      <HeatCard heat={next} state={state} me={me} />
      {after.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Danach</span>
          {after.map((h) => (
            <AfterRow key={h.id} heat={h} me={me} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Kommender Lauf in einer Zeile – nur der eigene Name grün */
function AfterRow({ heat, me }: { heat: Heat; me: string | null }) {
  return (
    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
      <b>{heat.label}</b>:{' '}
      {heat.entrants.map((e, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {e.name === me ? <b style={{ color: 'var(--me)' }}>Du</b> : e.label}
        </span>
      ))}
    </span>
  )
}

/** Abschnitt im Ablauf: alle Läufe als Karten, der nächste hervorgehoben */
function SectionCard({ sec, state, me }: { sec: EventState['sections'][number]; state: EventState; me: string | null }) {
  const done = sec.heats.filter((h) => h.status === 'done')
  return (
    <section className="card" style={{ gap: 8 }}>
      <div className="card-head">
        <span className="card-title">{sec.def.name}</span>
        <span className="hint">
          {FORMAT_LABEL[sec.def.format]}
          {heatLength(sec.def) ? ` · ${heatLength(sec.def)}` : ''}
          {sec.heats.length ? ` · ${done.length}/${sec.heats.length}` : ''}
        </span>
      </div>
      {sec.heats.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Läufe.</span>}
      {sec.heats.map((h) => (
        <HeatCard key={h.id} heat={h} state={state} me={me} />
      ))}
      {sec.started && (sec.def.format === 'team' ? (sec.teamRanking?.length ?? 0) > 0 : sec.ranking.length > 0) && <SectionResult sec={sec} state={state} me={me} />}
    </section>
  )
}

/**
 * Ergebnis eines Abschnitts am Ende seiner Karte: „Endstand“ oder „Zwischenstand“, was es bewirkt
 * (Startplätze, ×2 …) und die Rangliste im Stil der Wertung. Lange Listen zeigen erst die besten drei
 * und dich, der Rest auf Knopfdruck.
 */
function SectionResult({ sec, state, me }: { sec: EventState['sections'][number]; state: EventState; me: string | null }) {
  const [all, setAll] = useState(false)
  const team = sec.def.format === 'team'
  const f = sectionFactor(state, sec.def.id)
  const lastPlaced = [...state.sections].reverse().find((s) => s.def.weight > 0 && s.def.format !== 'free')
  const effect = placeMode(state)
    ? lastPlaced?.def.id === sec.def.id
      ? 'entscheidet den Endstand'
      : f === 0
        ? 'bestimmt die Startplätze'
        : 'bei Gleichstand entscheidend'
    : team
      ? state.separate
        ? 'zählt für die Teamwertung'
        : 'Teampunkte für alle Mitglieder'
      : f === 0
        ? 'bestimmt die Startplätze'
        : f !== 1
          ? `zählt ×${fmtPts(f)}`
          : 'zählt für die Gesamtwertung'
  const rows = team
    ? (sec.teamRanking ?? []).map((r) => {
        const t = state.teams.find((x) => x.id === r.name)
        return { key: r.name, rank: r.rank, label: t?.name ?? r.name, color: t ? teamColor(t.id, t.name) : undefined, mine: !!me && !!t?.drivers.includes(me), detail: t?.drivers.join(', ') ?? '', points: placeMode(state) ? null : (r.points as number | null) }
      })
    : sec.ranking.map((r) => {
        const t = state.teams.find((x) => x.drivers.includes(r.name))
        return { key: r.name, rank: r.rank, label: r.name === me ? `Du · ${r.name}` : r.name, color: t ? teamColor(t.id, t.name) : undefined, mine: r.name === me, detail: r.detail, points: f === 0 || placeMode(state) ? null : r.points }
      })
  const short = rows.length > 5 && !all
  const shown = short ? rows.filter((r, i) => i < 3 || r.mine) : rows
  return (
    <div className="card-part" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, marginTop: 4 }}>
      <span className="part-label">
        <span>{sec.complete ? 'Endstand' : 'Zwischenstand'}</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{effect}</span>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {shown.map((r) => (
          <div key={r.key} className={`row${r.mine && !team ? ' me-row' : ''}`} style={{ padding: '4px 8px', minHeight: 38, ...(r.color ? { borderLeft: `4px solid ${r.color}` } : null) }}>
            <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ minWidth: 22, fontSize: 15 }}>
              {r.rank}
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="name" style={{ ...(team ? { color: r.color } : r.mine ? { color: 'var(--me)' } : null) }}>
                {r.label}
              </span>
              {r.detail && <span className="sub">{r.detail}</span>}
            </span>
            {r.points != null && <Pts value={r.points} size={15} color={team ? r.color : undefined} />}
          </div>
        ))}
      </div>
      {rows.length > 5 && (
        <button className="btn ghost" style={{ alignSelf: 'flex-start', minHeight: 32, fontSize: 13 }} onClick={() => setAll(!all)}>
          {all ? 'Weniger zeigen' : `Alle ${rows.length} zeigen`}
        </button>
      )}
    </div>
  )
}

/** Wertung nach Platzierung: keine Punkte – was zählt, in welcher Reihenfolge */
function PlaceRules({ state, note }: { state: EventState; note: string | null }) {
  const sections = state.sections.filter((s) => s.def.weight > 0 && s.def.format !== 'free')
  const last = sections[sections.length - 1]
  const before = sections.slice(0, -1).reverse()
  const grid = state.sections.filter((s) => s.def.weight === 0 && s.def.format !== 'free')
  return (
    <>
      <section className="card" style={{ gap: 12 }}>
        <div className="card-head">
          <span className="card-title">Wertung nach Platzierung</span>
          <span className="hint">keine Punkte</span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>Es zählt, wie weit du kommst – nicht, wie viele Punkte du sammelst.</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {last && <RuleChip value="1." label={`${last.def.name} entscheidet`} color={EVENT_ACCENT} />}
          {before.map((s, i) => (
            <RuleChip key={s.def.id} value={`${i + 2}.`} label={`bei Gleichstand: ${s.def.name}`} />
          ))}
          {grid.map((s) => (
            <RuleChip key={s.def.id} value="→" label={`${s.def.name}: nur Startplätze`} />
          ))}
        </div>
        {state.teams.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Teams: Durchschnittsplatz der Mitglieder – kleiner ist besser.</span>}
      </section>
      <details className="card" style={{ gap: 8 }}>
        <summary className="card-title" style={{ cursor: 'pointer' }}>
          Alle Regeln im Detail
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {rulesText(state.def, state).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {note && <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{note}</span>}
      </details>
    </>
  )
}

const BONUS_TEXT = {
  fastestLap: 'Schnellste Runde',
  pole: 'Pole',
  driverOfDay: 'Fahrer des Tages',
  personalBest: 'Neue Bestzeit',
  clean: 'Je Rennen ohne Abflug',
} as const

/** Wofür gibt es Punkte? Als Treppe und Chips, die Regeln im Detail eingeklappt */
function PointsRules({ state, note }: { state: EventState; note: string | null }) {
  if (placeMode(state)) return <PlaceRules state={state} note={note} />
  const def = state.def
  const sc = def.scoring
  const raceSizes = state.heats.filter((h) => h.kind === 'race').map((h) => h.entrants.length)
  const n = Math.max(2, Math.min(raceSizes.length ? Math.max(...raceSizes) : def.maxPerHeat, state.drivers.length || def.maxPerHeat))
  const sections = state.sections.filter((s) => s.def.format !== 'free')
  const bonuses = (Object.keys(BONUS_TEXT) as (keyof typeof BONUS_TEXT)[]).filter((k) => sc[k] > 0)
  return (
    <>
      <section className="card" style={{ gap: 14 }}>
        <div className="card-head">
          <span className="card-title">Punkte je Lauf</span>
          <span className="hint">Lauf mit {n} Fahrern</span>
        </div>
        <PointsLadder points={placePoints(def, n)} color={EVENT_ACCENT} label={`Punkte je Platz bei ${n} Fahrern`} />
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {sc.method === 'fair' ? `Je Gegner hinter dir ${fmtPts(sc.perBeaten)} Pkt. – gegen Stärkere bis ${fmtPts(sc.perBeaten * 2)}` : `Je Gegner hinter dir ${fmtPts(sc.perBeaten)} Pkt.`}, Sieg +{fmtPts(sc.win)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>So zählen die Abschnitte</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sections.map((sec) => {
              const f = sectionFactor(state, sec.def.id)
              const team = sec.def.format === 'team' && state.separate
              const value = team ? `×${fmtPts(sec.def.weight)}` : f === 0 ? '0×' : `×${fmtPts(f)}`
              const label = team ? `${sec.def.name} · nur Teamwertung` : f === 0 ? `${sec.def.name} · nur Startplatz` : sec.def.name
              return <RuleChip key={sec.def.id} value={value} label={label} color={f > 1 ? EVENT_ACCENT : undefined} />
            })}
          </div>
        </div>
        {bonuses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Bonus</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {bonuses.map((k) => (
                <RuleChip key={k} value={`${BONUS_ICON[k]} +${fmtPts(sc[k])}`} label={BONUS_TEXT[k]} color="var(--gold)" />
              ))}
            </div>
          </div>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Im Ablauf einen Fahrer antippen – dann stehen Auto, Zeit und die Rechnung da.</span>
      </section>

      <details className="card" style={{ gap: 8 }}>
        <summary className="card-title" style={{ cursor: 'pointer' }}>
          Alle Regeln im Detail
        </summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {rulesText(def, state).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {note && <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{note}</span>}
      </details>
    </>
  )
}

/** Fahrzeuge des Wettkampfs mit Bild: Auswahlliste oder feste Autos je Fahrer */
function CarsCard({ def }: { def: EventState['def'] }) {
  const rules = [{ name: 'Alle Läufe', rule: def.cars }, ...def.sections.filter((s) => s.cars).map((s) => ({ name: s.name, rule: s.cars! }))]
  const shown = rules.filter((r) => (r.rule.mode === 'fixed' ? Object.keys(r.rule.fixed).length : r.rule.mode !== 'free' && r.rule.pool.length))
  if (!shown.length) return null
  const modeText = { list: 'Freie Wahl aus', skill: 'Nach Können zugeteilt aus', random: 'Zufällig verteilt aus', fixed: 'Festes Auto je Fahrer', free: '' }
  return (
    <section className="card" style={{ gap: 10 }}>
      <span className="card-title">Fahrzeuge</span>
      {shown.map(({ name, rule }) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {shown.length > 1 || name !== 'Alle Läufe' ? `${name} · ` : ''}
            {modeText[rule.mode]}
          </span>
          {rule.mode === 'fixed' ? (
            <CarChips cars={[...new Set(Object.values(rule.fixed))]} label={(c) => `${c} · ${Object.entries(rule.fixed).filter(([, x]) => x === c).map(([d]) => d).join(', ')}`} />
          ) : (
            <CarChips cars={rule.pool} />
          )}
        </div>
      ))}
    </section>
  )
}

/** Vor dem ersten Lauf: Teilnehmer nach Teams (Rand in Teamfarbe) statt einer leeren Wertung */
function Entrants({ state, me }: { state: EventState; me: string | null }) {
  const team = new Map(state.teams.flatMap((t) => t.drivers.map((d) => [d, t] as const)))
  // Nach Teams sortiert (Reihenfolge wie in der Teamliste), Fahrer ohne Team zum Schluss
  const teamOrder = [...state.teams].sort((a, b) => b.elo - a.elo).map((t) => t.id)
  const rank = (n: string) => (team.has(n) ? teamOrder.indexOf(team.get(n)!.id) : teamOrder.length)
  const drivers = [...state.drivers].sort((a, b) => rank(a) - rank(b))
  return (
    <section className="card" style={{ gap: 2 }}>
      <div className="card-head">
        <span className="card-title">Teilnehmer</span>
        <span className="hint">{state.drivers.length} Fahrer</span>
      </div>
      {drivers.map((n) => (
        <div key={n} className={`row${n === me ? ' me-row' : ''}`} style={{ padding: 8, ...(team.get(n) ? { borderLeft: `4px solid ${teamColor(team.get(n)!.id, team.get(n)!.name)}` } : null) }}>
          <Avatar name={n} ring={n === me ? 'var(--me)' : undefined} />
          <span className="grow">
            <span className="name">{n === me ? `Du · ${n}` : n}</span>
          </span>
        </div>
      ))}
    </section>
  )
}
