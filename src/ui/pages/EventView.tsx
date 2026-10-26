import { Link, useParams } from 'react-router-dom'
import { driverInsight, planFromText, planVisible, storylines, todayIso } from '../../domain/event/insights'
import { eventProgress, placePoints, sectionFactor, waitFor } from '../../domain/event/progress'
import { FORMAT_LABEL, heatLength } from '../../domain/event/types'
import { teamSplit } from '../../domain/event/engine'
import { Avatar, PageHead, Segment, Tile, useData, useMyName } from '../components'
import type { EventState, Heat } from '../../domain/event/engine'
import { useMe } from '../me'
import { StrokeIcon, TOOL_ICONS } from '../icons'
import { useStored } from '../useStored'
import { CarThumb } from '../CarPhoto'
import { Recap } from '../event/Recap'
import {
  BONUS_ICON,
  CarChips,
  dateRange,
  EVENT_ACCENT,
  fmtPts,
  HeatCard,
  PhasePill,
  phaseOf,
  Podium,
  ProgressChart,
  rulesText,
  StandingsList,
  uncertainty,
  Stories,
  teamColor,
  TeamList,
  TeamStandings,
  TeamTag,
  useEventHistory,
  useEventState,
  useLapMs,
} from '../event/shared'

type Tab = 'stand' | 'ablauf' | 'punkte' | 'rueckblick'

/** „ca. 8 Min.“, „ca. 25 Min.“ bzw. „ca. 1 Std. 10 Min.“ – unter 15 Minuten minutengenau, sonst auf 5 gerundet */
const fmtMinutes = (m: number) => {
  const r = m < 15 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5
  return r < 60 ? `ca. ${r} Min.` : `ca. ${Math.floor(r / 60)} Std.${r % 60 ? ` ${r % 60} Min.` : ''}`
}

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
  const insight = me && state.drivers.includes(me) ? driverInsight(state, me) : null
  const stories = storylines(state)
  const progress = eventProgress(state, lapMs)
  const tabs: [Tab, string][] = [
    ['stand', 'Stand'],
    ['ablauf', 'Ablauf'],
    ['punkte', 'Punkte'],
    ...(state.started ? [['rueckblick', 'Rückblick'] as [Tab, string]] : []),
  ]
  const tab = tabs.some(([t]) => t === stored) ? stored : 'stand'
  const openRecap = () => {
    setTab('rueckblick')
    requestAnimationFrame(() => document.getElementById('event-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
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
        {state.teams.length > 0 && <span className="pill">Teams {teamSplit(state.teams)}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/wettkampf/${id}/leinwand`} className="btn round">
            Leinwand
          </Link>
        </span>
      </div>
      {showPlan && progress.total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="ev-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Gefahrene Läufe">
            <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {progress.done} von {progress.total} Läufen gefahren
            {progress.done < progress.total && progress.minutesLeft > 0 ? ` · noch ${fmtMinutes(progress.minutesLeft)}` : ''}
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
        <section className="card" style={{ gap: 14 }}>
          <span className="card-title">Siegerehrung</span>
          <Podium state={state} />
          {state.teamStandings[0] && (
            <span style={{ fontSize: 14, textAlign: 'center' }}>
              Bestes Team: <b style={{ color: teamColor(state.teamStandings[0].id, state.teamStandings[0].name) }}>{state.teamStandings[0].name}</b> ({state.teamStandings[0].drivers.join(', ')})
            </span>
          )}
          <button className="btn round" style={{ alignSelf: 'center' }} onClick={openRecap}>
            Rückblick ansehen
          </button>
        </section>
      )}

      {insight && <MyEvent state={state} me={me!} insight={insight} showPlan={showPlan} lapMs={lapMs} />}

      {showPlan && state.next && phase !== 'done' && <NextUp state={state} me={me} />}

      {phase !== 'done' && <Stories list={stories} />}

      <div id="event-tabs" style={{ scrollMarginTop: 12 }}>
        <Segment value={tab} onChange={setTab} label="Ansicht" options={tabs} />
      </div>

      {tab === 'stand' &&
        (state.started ? (
          <>
            <section className="card" style={{ gap: 2 }}>
              <div className="card-head">
                <span className="card-title">{state.separate ? 'Einzelwertung' : 'Gesamtwertung'}</span>
                <span className="hint">{state.separate ? 'Punkte aus den Einzelrennen' : 'Punkte · Abstand zur Spitze'}</span>
              </div>
              <StandingsList state={state} me={me} />
            </section>
            <TeamStandings state={state} me={me} />
            <ProgressChart state={state} steps={steps} me={me} />
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

      {tab === 'rueckblick' && <Recap state={state} steps={steps} me={me} />}
    </div>
  )
}

/** Eigene Karte: Platz, Punkte, Team, wann man dran ist und was drin ist */
function MyEvent({ state, me, insight, showPlan, lapMs }: { state: EventState; me: string; insight: ReturnType<typeof driverInsight>; showPlan: boolean; lapMs: number }) {
  const s = insight.standing
  const team = s?.teamId ? state.teamStandings.find((t) => t.id === s.teamId) : null
  const color = team ? teamColor(team.id, team.name) : undefined
  const wait = showPlan ? waitFor(state, me, lapMs) : null
  const heat = insight.nextHeat
  return (
    <section className="card me-row" style={{ gap: 10 }}>
      <div className="card-head">
        <span className="card-title">Dein Wettkampf</span>
        {team && <TeamTag id={team.id} name={team.name} size={12} />}
      </div>
      {s && state.started && (
        <div className="tiles">
          <Tile value={`${s.rank}.`} label={`Platz von ${state.standings.length}`} color="var(--me)" />
          <Tile value={fmtPts(s.total)} label="Punkte" color={color} />
          {team ? (
            <>
              <Tile value={`${team.rank}.`} label="Team-Platz" color={color} />
              <Tile value={fmtPts(team.points)} label="Team-Punkte" color={color} />
            </>
          ) : (
            <>
              <Tile value={insight.above ? `−${fmtPts(Math.round((insight.above.total - s.total) * 10) / 10)}` : '–'} label={insight.above ? `auf Platz ${insight.above.rank}` : 'du führst'} />
              <Tile value={String(s.wins)} label={s.wins === 1 ? 'Sieg' : 'Siege'} />
            </>
          )}
        </div>
      )}
      {showPlan && heat && wait && (
        <div className={`heat-wait${wait.ahead === 0 ? ' now' : ''}`}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 18, color: wait.ahead === 0 ? EVENT_ACCENT : 'var(--text)' }}>
              {wait.ahead === 0 ? (heat.status === 'next' ? 'Du bist jetzt dran' : 'Du bist als Nächstes dran') : `Du bist in ${wait.ahead} ${wait.ahead === 1 ? 'Lauf' : 'Läufen'} dran`}
            </b>
            {wait.ahead > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtMinutes(wait.minutes)} mit Wechseln</span>}
          </span>
          <span style={{ fontSize: 14 }}>
            <b>{heat.label}</b>
            {heat.entrants.length > 1 && ` gegen ${heat.entrants.filter((e) => e.name !== me).map((e) => e.label).join(', ')}`}
          </span>
          {heat.cars[me] && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <CarThumb car={heat.cars[me]} size={40} />
              <span>
                Dein Auto: <b>{heat.cars[me]}</b>
              </span>
            </span>
          )}
          {heat.grid && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Startplatz {heat.grid.findIndex((e) => e.name === me) + 1}</span>}
        </div>
      )}
      {showPlan && !heat && state.started && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{state.complete ? 'Alle deine Läufe sind gefahren.' : 'Gerade ist kein Lauf mehr für dich eingeplant.'}</span>}
      {[...(showPlan ? insight.needs : []), ...insight.tips].map((t) => (
        <span key={t} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
          • {t}
        </span>
      ))}
    </section>
  )
}

/** Nächster Lauf und die zwei danach */
function NextUp({ state, me }: { state: EventState; me: string | null }) {
  const next = state.next!
  const after = state.heats.slice(state.heats.indexOf(next) + 1).filter((h) => h.status !== 'done').slice(0, 2)
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

function AfterRow({ heat, me }: { heat: Heat; me: string | null }) {
  const mine = !!me && heat.entrants.some((e) => e.name === me)
  return (
    <span style={{ fontSize: 13, color: 'var(--text-2)', ...(mine ? { color: 'var(--me)', fontWeight: 600 } : null) }}>
      <b>{heat.label}</b>: {heat.entrants.map((e) => (e.name === me ? 'du' : e.label)).join(', ')}
    </span>
  )
}

/** Abschnitt im Ablauf: gefahrene Läufe eingeklappt, offene sichtbar */
function SectionCard({ sec, state, me }: { sec: EventState['sections'][number]; state: EventState; me: string | null }) {
  const done = sec.heats.filter((h) => h.status === 'done')
  const open = sec.heats.filter((h) => h.status !== 'done')
  const fold = done.length > 0 && open.length > 0 ? done : sec.complete && sec.heats.length > 3 ? done : []
  const shown = sec.heats.filter((h) => !fold.includes(h))
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
      {fold.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            {fold.length} {fold.length === 1 ? 'gefahrener Lauf' : 'gefahrene Läufe'}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {fold.map((h) => (
              <HeatCard key={h.id} heat={h} state={state} me={me} />
            ))}
          </div>
        </details>
      )}
      {shown.map((h) => (
        <HeatCard key={h.id} heat={h} state={state} me={me} />
      ))}
      {sec.started && sec.ranking.length > 0 && sec.def.format !== 'team' && (
        <details open={sec.complete}>
          <summary style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Wertung {sec.def.name}</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {sec.ranking.map((r) => (
              <div key={r.name} className="entrant">
                <span className="num" style={{ minWidth: 22, color: 'var(--muted)' }}>
                  {r.rank}.
                </span>
                <span style={r.name === me ? { color: 'var(--me)', fontWeight: 600 } : undefined}>{r.name}</span>
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

const BONUS_TEXT = {
  fastestLap: 'Schnellste Runde aller Rennen',
  pole: 'Pole im Qualifying',
  driverOfDay: 'Fahrer des Tages (am meisten über der Erwartung)',
  personalBest: 'Neue persönliche Bestzeit auf der Strecke',
  clean: 'Je Rennen ohne Abflug',
} as const

/** Wofür gibt es Punkte? Kurz und mit Beispiel, darunter alle Regeln */
function PointsRules({ state, note }: { state: EventState; note: string | null }) {
  const def = state.def
  const sc = def.scoring
  const raceSizes = state.heats.filter((h) => h.kind === 'race').map((h) => h.entrants.length)
  const n = Math.max(2, Math.min(raceSizes.length ? Math.max(...raceSizes) : def.maxPerHeat, state.drivers.length || def.maxPerHeat))
  const places = placePoints(def, n)
  const sections = state.sections.filter((s) => s.def.format !== 'free')
  const bonuses = (Object.keys(BONUS_TEXT) as (keyof typeof BONUS_TEXT)[]).filter((k) => sc[k] > 0)
  return (
    <>
      <section className="card" style={{ gap: 12 }}>
        <span className="card-title">So gibt es Punkte</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Für jeden Gegner, der im Lauf hinter dir landet, gibt es {sc.method === 'fair' ? <>bis zu <b>{fmtPts(sc.perBeaten * 2)}</b> Punkte – je stärker der Gegner laut Elo, desto mehr (gegen Gleichstarke {fmtPts(sc.perBeaten)})</> : <><b>{fmtPts(sc.perBeaten)}</b> {sc.perBeaten === 1 ? 'Punkt' : 'Punkte'}</>}. Der Sieger bekommt <b>+{fmtPts(sc.win)}</b> extra{sc.method === 'fair' && sc.fairWin ? ', ebenfalls nach Stärke gewichtet' : ''}.
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Beispiel: Lauf mit {n} Fahrern{sc.method === 'fair' ? ', alle gleich stark' : ''}
          </span>
          <div className="place-pts">
            {places.map((p, i) => (
              <span key={i}>
                <b>{fmtPts(p)}</b>Platz {i + 1}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Läufe mit weniger Fahrern werden hochgerechnet. Tipp: Im Ablauf die Punkte eines Laufs antippen – dann steht da, wie sie zustande kommen.</span>
        </div>
      </section>

      <section className="card" style={{ gap: 6 }}>
        <span className="card-title">Was wie viel zählt</span>
        {sections.map((sec) => {
          const f = sectionFactor(state, sec.def.id)
          const value = sec.def.format === 'team' ? (state.separate ? 'nur Team' : `×${fmtPts(f)}`) : f === 0 ? 'Startplatz' : `×${fmtPts(f)}`
          return (
            <div key={sec.def.id} className="entrant">
              <span>{sec.def.name}</span>
              <span className="car">{FORMAT_LABEL[sec.def.format]}</span>
              <span className="num" style={{ minWidth: 70, textAlign: 'right', fontWeight: 700, color: f > 1 ? EVENT_ACCENT : undefined }}>
                {value}
              </span>
            </div>
          )
        })}
        {bonuses.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Bonuspunkte</span>
            {bonuses.map((k) => (
              <div key={k} className="entrant">
                <span className="day-chip" style={{ color: 'var(--gold)' }}>
                  {BONUS_ICON[k]}
                </span>
                <span>{BONUS_TEXT[k]}</span>
                <span className="num" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--gold)' }}>
                  +{fmtPts(sc[k])}
                </span>
              </div>
            ))}
          </>
        )}
        {state.teams.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
            {state.separate ? 'Teamwertung: nur aus den Teamrennen – Einzelrennen zählen für die eigenen Punkte.' : 'Teamwertung: Schnitt der Punkte aller Mitglieder – unterschiedlich große Teams bleiben fair.'}
          </span>
        )}
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

/** Vor dem ersten Lauf: Teilnehmer (und Teams) statt einer leeren Wertung */
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
        <span className="hint">{state.drivers.length} Fahrer · noch keine Läufe</span>
      </div>
      {drivers.map((n) => (
        <div key={n} className={`row${n === me ? ' me-row' : ''}`} style={{ padding: 8, ...(team.get(n) ? { borderLeft: `4px solid ${teamColor(team.get(n)!.id, team.get(n)!.name)}` } : null) }}>
          <Avatar name={n} ring={n === me ? 'var(--me)' : undefined} />
          <span className="grow">
            <span className="name">{n === me ? `Du · ${n}` : n}</span>
            {team.get(n) && <TeamTag id={team.get(n)!.id} name={team.get(n)!.name} />}
          </span>
        </div>
      ))}
    </section>
  )
}
