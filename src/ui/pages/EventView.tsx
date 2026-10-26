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
  Podium,
  ProgressChart,
  Pts,
  RankChart,
  RecapBanner,
  rulesText,
  StandingsList,
  teamColor,
  TeamList,
  TeamStandings,
  uncertainty,
  useEventHistory,
  useEventState,
  useLapMs,
} from '../event/shared'

type Tab = 'stand' | 'ablauf' | 'punkte'

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
  const today = todayIso()
  const showPlan = planVisible(def, today)
  const inEvent = !!me && state.drivers.includes(me)
  const progress = eventProgress(state, lapMs)
  const tab: Tab = stored === 'ablauf' || stored === 'punkte' ? stored : 'stand'
  return (
    <div className="page" style={{ ['--accent' as string]: EVENT_ACCENT }}>
      <PageHead title={def.name} kicker={`Wettkampf · ${dateRange(def)}`} color={EVENT_ACCENT}>
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
      {showPlan && progress.total > 0 && phase !== 'done' && (
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

      {phase === 'done' && state.started && (
        <>
          <section className="card" style={{ gap: 14 }}>
            <span className="card-title">Siegerehrung</span>
            <Podium state={state} />
          </section>
          <RecapBanner id={id} state={state} me={me} done />
        </>
      )}

      {inEvent && phase !== 'done' && <MyEvent state={state} me={me!} showPlan={showPlan} lapMs={lapMs} />}

      {showPlan && state.next && phase !== 'done' && <NextUp state={state} me={me} shownAbove={inEvent && state.next.entrants.some((e) => e.name === me)} />}

      <Segment
        value={tab}
        onChange={setTab}
        label="Ansicht"
        options={[
          ['stand', 'Stand'],
          ['ablauf', 'Ablauf'],
          ['punkte', 'Punkte'],
        ]}
      />

      {tab === 'stand' &&
        (state.started ? (
          <>
            <section className="card" style={{ gap: 2 }}>
              <div className="card-head">
                <span className="card-title">{state.separate ? 'Einzelwertung' : 'Gesamtwertung'}</span>
                <span className="hint">{state.separate ? 'nur Einzelrennen' : 'Punkte · Verlauf'}</span>
              </div>
              <StandingsList state={state} me={me} steps={steps} />
            </section>
            <TeamStandings state={state} me={me} />
            <ProgressChart state={state} steps={steps} me={me} />
            <RankChart state={state} steps={steps} me={me} />
            {phase !== 'done' && <RecapBanner id={id} state={state} me={me} done={false} />}
          </>
        ) : (
          <>
            <TeamList state={state} />
            <Entrants state={state} me={me} />
          </>
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
                  {r.name !== me && (
                    <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                      {gap > 0 ? `${fmtPts(gap)} vor dir` : gap < 0 ? `${fmtPts(-gap)} hinter dir` : 'gleich'}
                    </span>
                  )}
                  <Pts value={r.total} size={15} />
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

/** Abschnitt im Ablauf als Zeitleiste: gefahrene Läufe einzeilig, der nächste hervorgehoben */
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
      {sec.heats.map((h) => (h.status === 'done' ? <DoneRow key={h.id} heat={h} state={state} me={me} /> : <HeatCard key={h.id} heat={h} state={state} me={me} />))}
      {sec.started && sec.ranking.length > 0 && sec.def.format !== 'team' && (
        <details open={sec.complete}>
          <summary style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Wertung {sec.def.name}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {sec.ranking.map((r) => (
              <div key={r.name} className="entrant">
                <span className="num" style={{ minWidth: 22, color: 'var(--muted)' }}>
                  {r.rank}.
                </span>
                <span style={r.name === me ? { color: 'var(--me)', fontWeight: 700 } : undefined}>{r.name === me ? `Du · ${r.name}` : r.name}</span>
                <span className="car">{r.detail}</span>
                <span className="num" style={{ minWidth: 34, textAlign: 'right', fontWeight: 700 }}>
                  {sec.def.weight > 0 ? fmtPts(r.points) : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

/** Gefahrener Lauf: Sieger und eigener Platz in einer Zeile, aufklappbar zum ganzen Ergebnis */
function DoneRow({ heat, state, me }: { heat: Heat; state: EventState; me: string | null }) {
  const winner = heat.order[0]
  const mine = me ? heat.order.indexOf(me) + 1 : 0
  return (
    <details className="heat-row">
      <summary>
        <span style={{ color: 'var(--drivers)', fontWeight: 700 }} aria-hidden="true">
          ✓
        </span>
        <b>{heat.label}</b>
        {winner && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', minWidth: 0 }}>
            <Avatar name={winner} size={22} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(winner === me ? { color: 'var(--me)', fontWeight: 700 } : null) }}>{winner === me ? 'Du' : winner}</span>
          </span>
        )}
        {mine > 1 && (
          <span className="num" style={{ color: 'var(--me)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Du: {mine}.
          </span>
        )}
      </summary>
      <HeatCard heat={heat} state={state} me={me} />
    </details>
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
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Im Ablauf die Punkte eines Laufs antippen – dann steht da die Rechnung.</span>
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
