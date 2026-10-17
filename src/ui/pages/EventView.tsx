import { Link, useParams } from 'react-router-dom'
import { driverInsight, planFromText, planVisible, storylines, todayIso } from '../../domain/event/insights'
import { FORMAT_LABEL } from '../../domain/event/types'
import { teamSplit } from '../../domain/event/engine'
import { Avatar, PageHead, Segment, useData, useMyName } from '../components'
import type { EventState } from '../../domain/event/engine'
import { useMe } from '../me'
import { StrokeIcon, TOOL_ICONS } from '../icons'
import { useStored } from '../useStored'
import { CarThumb } from '../CarPhoto'
import { CarChips, dateRange, EVENT_ACCENT, fmtPts, HeatCard, PhasePill, phaseOf, Podium, rulesText, StandingsList, Stories, teamColor, TeamList, TeamStandings, TeamTag, useEventState } from '../event/shared'

type Tab = 'stand' | 'ablauf' | 'regeln'

export function EventView() {
  const { id = '' } = useParams()
  const data = useData()
  const folder = data.events.find((e) => e.id === id)
  const state = useEventState(folder)
  const { me: picked } = useMe()
  const known = useMyName()
  const me = picked && state?.drivers.includes(picked) ? picked : known
  const [tab, setTab] = useStored<Tab>('event:tab', 'stand')
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
        <span className="pill">{def.scoring.method === 'fair' ? 'Wertung fair' : 'Wertung absolut'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to={`/wettkampf/${id}/leinwand`} className="btn round">
            Leinwand
          </Link>
        </span>
      </div>
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
        </section>
      )}

      {insight && (
        <section className="card me-row" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Dein Wettkampf</span>
            {insight.standing && state.started && (
              <span className="num" style={{ fontWeight: 800 }}>
                Platz {insight.standing.rank} · {fmtPts(insight.standing.total)} Punkte
              </span>
            )}
          </div>
          {showPlan && insight.nextHeat && (
            <span style={{ fontSize: 14 }}>
              Als Nächstes: <b>{insight.nextHeat.label}</b>
              {insight.nextHeat.entrants.length > 1 && ` gegen ${insight.nextHeat.entrants.filter((e) => e.name !== me).map((e) => e.label).join(', ')}`}
            </span>
          )}
          {showPlan && insight.nextHeat && me && insight.nextHeat.cars[me] && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <CarThumb car={insight.nextHeat.cars[me]} size={44} />
              <span>
                Dein Auto: <b>{insight.nextHeat.cars[me]}</b>
              </span>
            </span>
          )}
          {showPlan && !insight.nextHeat && state.started && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Läufe mehr für dich geplant.</span>}
          {[...(showPlan ? insight.needs : []), ...insight.tips].map((t) => (
            <span key={t} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              • {t}
            </span>
          ))}
        </section>
      )}

      {showPlan && state.next && phase !== 'done' && (
        <section className="card" style={{ gap: 8 }}>
          <span className="card-title">Als Nächstes</span>
          <HeatCard heat={state.next} state={state} me={me} />
        </section>
      )}

      <Stories list={stories} />

      <Segment
        value={tab}
        onChange={setTab}
        label="Ansicht"
        options={[
          ['stand', 'Stand'],
          ['ablauf', 'Ablauf'],
          ['regeln', 'Regeln'],
        ]}
      />

      {tab === 'stand' &&
        (state.started ? (
          <>
            <section className="card" style={{ gap: 2 }}>
              <div className="card-head">
                <span className="card-title">Gesamtwertung</span>
                <span className="hint">Punkte</span>
              </div>
              <StandingsList state={state} me={me} />
            </section>
            <TeamStandings state={state} />
          </>
        ) : (
          <>
            <TeamList state={state} />
            <Entrants state={state} me={me} />
          </>
        ))}

      {tab === 'ablauf' &&
        (showPlan ? (
          state.sections.map((sec) => (
            <section key={sec.def.id} className="card" style={{ gap: 8 }}>
              <div className="card-head">
                <span className="card-title">{sec.def.name}</span>
                <span className="hint">
                  {FORMAT_LABEL[sec.def.format]}
                  {sec.def.laps ? ` · ${sec.def.laps} Runden` : ''}
                </span>
              </div>
              {sec.heats.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Läufe.</span>}
              {sec.heats.map((h) => (
                <HeatCard key={h.id} heat={h} state={state} me={me} />
              ))}
              {sec.started && sec.ranking.length > 0 && sec.def.format !== 'team' && (
                <details>
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
          ))
        ) : (
          <section className="card">
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Der Ablauf wird {planFromText(def)} sichtbar.</span>
          </section>
        ))}

      {tab === 'regeln' && (
        <section className="card" style={{ gap: 8 }}>
          <span className="card-title">So wird gewertet</span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {rulesText(def, state).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      {tab === 'regeln' && <CarsCard def={def} />}
    </div>
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
  return (
    <section className="card" style={{ gap: 2 }}>
      <div className="card-head">
        <span className="card-title">Teilnehmer</span>
        <span className="hint">{state.drivers.length} Fahrer · noch keine Läufe</span>
      </div>
      {state.drivers.map((n) => (
        <div key={n} className={`row${n === me ? ' me-row' : ''}`} style={{ padding: 8 }}>
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
