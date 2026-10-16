import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { SeasonStanding } from '../../domain/model'
import { SEASON_POINTS } from '../../domain/season'
import { CHALLENGE_XP } from '../../domain/challenges'
import { CarThumb } from '../CarPhoto'
import { PointsChart } from '../charts/PointsChart'
import { Sparkline } from '../charts/Sparkline'
import { BumpChart } from '../charts/StatsCharts'
import { AREA, ME, seriesColors } from '../colors'
import { Avatar, carPath, driverPath, PageHead, Segment, useData, useMyName } from '../components'
import { formatDate } from '../format'
import { MedalBadge } from '../Medal'
import { useStored } from '../useStored'
import { byProgress, ChallengeItem } from '../ChallengeItem'

const ACCENT = AREA.season
const CURRENT_YEAR = String(new Date().getFullYear())

type Tab = 'fahrer' | 'autos' | 'awards' | 'challenges'

export function Season() {
  const { year: yearParam = '' } = useParams()
  const { model } = useData()
  const navigate = useNavigate()
  const year = model.years.includes(yearParam) ? yearParam : model.years[0]
  const location = useLocation()
  const [storedTab, setStoredTab] = useStored<Tab>('season:tab', 'fahrer')
  // Link mit state { tab } (z. B. von der Startseite) öffnet direkt diesen Reiter
  const stateTab = (location.state as { tab?: Tab } | null)?.tab
  const tab = stateTab ?? storedTab
  const setTab = (t: Tab) => {
    setStoredTab(t)
    if (stateTab) navigate(location.pathname, { replace: true, state: null })
  }
  if (!year) return <div className="page"><p className="muted">Noch keine Rennen.</p></div>
  const running = year >= CURRENT_YEAR
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT }}>
      <PageHead title={`Saison ${year}`} kicker={running ? 'Meisterschaft · läuft' : 'Meisterschaft'} color={ACCENT} />
      <div className="filters">
        <Segment value={year} onChange={(y) => navigate(`/saison/${y}`, { replace: true })} label="Jahr" small options={model.years.map((y) => [y, y] as [string, string])} />
      </div>
      <Segment value={tab} onChange={setTab} label="Ansicht" options={[['fahrer', 'Fahrer'], ['autos', 'Autos'], ['awards', 'Awards'], ['challenges', 'Challenges']]} />
      {tab === 'fahrer' && <DriverStandings year={year} />}
      {tab === 'autos' && <Constructors year={year} />}
      {tab === 'awards' && <Awards year={year} running={running} />}
      {tab === 'challenges' && <Challenges year={year} />}
    </div>
  )
}

function DriverStandings({ year }: { year: string }) {
  const { model } = useData()
  const me = useMyName()
  const location = useLocation()
  const rows = model.season(year)
  const dates = [...new Set(model.sessions.filter((s) => s.date.startsWith(year)).map((s) => s.date))].sort()
  const mine = me ? rows.find((r) => r.name === me) : undefined
  // Rangverlauf: Platz nach jedem Renntag (nach Punkten mit Streichresultaten)
  const ranksAt = (i: number) => {
    const order = rows.filter((r) => r.progress[i] != null).sort((a, b) => b.progress[i]! - a.progress[i]!)
    return new Map(order.map((r, k) => [r.name, k + 1]))
  }
  const perDay = dates.map((_, i) => ranksAt(i))
  const shown = [...new Set([...rows.slice(0, 5).map((r) => r.name), ...(mine ? [mine.name] : [])])]
  const colors = seriesColors(shown, me)
  return (
    <>
      {mine && (
        <Link to={`/wrapped/${year}/${encodeURIComponent(mine.name)}`} className="card me-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }} aria-hidden="true">✦</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Dein Jahr {year}</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Platz {mine.rank} · {mine.points} Punkte – zum Rückblick</span>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
      <section className="card" style={{ gap: 2 }}>
        <div className="card-head">
          <span className="card-title">Fahrerwertung</span>
          <span className="hint">Punkte · Renntage</span>
        </div>
        {rows.map((r) => (
          <StandingRow key={r.name} row={r} me={me} bg={location} />
        ))}
        <div className="legend" style={{ marginTop: 6 }}>
          <span>
            <span className="day-chip">8</span> gewertet
          </span>
          <span>
            <span className="day-chip dropped">3</span> gestrichen
          </span>
          <span>
            <span className="day-chip">
              8<sup>F</sup>
            </span>{' '}
            schnellste Runde
          </span>
          <span>
            <span className="day-chip">
              8<sup>P</sup>
            </span>{' '}
            Pole
          </span>
          <span>
            <span className="day-chip finale">16</span> Finale ×2
          </span>
        </div>
      </section>
      {dates.length >= 2 && (
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Punkteverlauf</span>
            <span className="hint">Punkte antippen</span>
          </div>
          <PointsChart dates={dates} series={shown.map((n) => ({ name: n, color: colors.get(n) ?? '#9AA3AD', values: rows.find((r) => r.name === n)?.progress ?? [] }))} label={`Punkteverlauf der Saison ${year}`} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Punktestand nach jedem Renntag, mit Streichresultaten.</span>
        </section>
      )}
      {dates.length >= 2 && (
        <section className="card" style={{ gap: 8 }}>
          <span className="card-title">Rangverlauf</span>
          <BumpChart dates={dates} series={shown.map((n) => ({ name: n, ranks: perDay.map((m) => m.get(n) ?? null) }))} colors={colors} me={me} />
        </section>
      )}
      <section className="inner" style={{ padding: 14, gap: 6 }}>
        <span className="card-title">So wird gewertet</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <li>Pro Rennen {SEASON_POINTS.perBeaten} Punkt je geschlagenem Gegner, Sieg +{SEASON_POINTS.win}</li>
          <li>Pro Renntag zählen die besten {SEASON_POINTS.racesPerDay} Rennen</li>
          <li>Schnellste Runde des Renntags +{SEASON_POINTS.fastestLap}, Pole (Schnellster im Qualifying) +{SEASON_POINTS.pole}</li>
          <li>Der letzte Renntag im Dezember ist das Saisonfinale und zählt doppelt</li>
          <li>Es zählen die besten {SEASON_POINTS.countedDays} Renntage – wer mal nicht kann, verliert nichts</li>
        </ul>
      </section>
    </>
  )
}

function StandingRow({ row: r, me, bg }: { row: SeasonStanding; me: string | null; bg: ReturnType<typeof useLocation> }) {
  return (
    <Link to={driverPath(r.name)} state={{ bg }} className={`row${r.name === me ? ' me-row' : ''}`} style={{ padding: '8px', alignItems: 'flex-start' }}>
      <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ minWidth: 22, fontSize: 16, paddingTop: 6 }}>
        {r.rank}
      </span>
      <Avatar name={r.name} ring={r.name === me ? 'var(--me)' : undefined} />
      <span className="grow" style={{ gap: 4 }}>
        <span className="name">{r.name === me ? `Du · ${r.name}` : r.name}</span>
        <span className="sub">
          {r.wins} {r.wins === 1 ? 'Sieg' : 'Siege'} · {r.races} Rennen
          {r.poles ? ` · ${r.poles} Pole` : ''}
          {r.fastestLaps ? ` · ${r.fastestLaps}× schnellste Runde` : ''}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {r.days.map((d) => (
            <span
              key={d.date}
              className={`day-chip${d.counted ? '' : ' dropped'}${d.finale ? ' finale' : ''}`}
              title={`${formatDate(d.date)}: ${d.points} Punkte (${d.races} Rennen${d.fastestLap ? ', schnellste Runde' : ''}${d.pole ? ', Pole' : ''}${d.finale ? ', Finale ×2' : ''})${d.counted ? '' : ' – gestrichen'}`}
            >
              {d.points}
              {d.fastestLap && <sup>F</sup>}
              {d.pole && <sup>P</sup>}
            </span>
          ))}
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: 4 }}>
        <span className="num" style={{ fontSize: 20, fontWeight: 800 }}>{r.points}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Punkte</span>
      </span>
      <span style={{ paddingTop: 8 }}>
        <Sparkline values={r.progress} color={r.name === me ? ME : '#8A94A0'} label={`Punkteverlauf ${r.name}`} />
      </span>
    </Link>
  )
}

function Constructors({ year }: { year: string }) {
  const { model } = useData()
  const rows = model.constructors(year)
  const max = Math.max(1, ...rows.map((r) => r.points))
  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="card-head">
        <span className="card-title">Konstrukteurswertung</span>
        <span className="hint">Punkte aller Fahrer</span>
      </div>
      {rows.map((r, i) => (
        <Link key={r.car} to={carPath(r.car)} className="row" style={{ padding: '8px' }}>
          <span className={`rank${i < 3 ? ` r${i + 1}` : ''}`} style={{ minWidth: 22, fontSize: 16 }}>
            {i + 1}
          </span>
          <CarThumb car={r.car} size={40} />
          <span className="grow" style={{ gap: 4 }}>
            <span className="name">{r.car}</span>
            <span className="bar" style={{ width: '100%', height: 5 }}>
              <span style={{ width: `${(r.points / max) * 100}%`, borderRadius: 3, background: AREA.cars }} />
            </span>
            <span className="sub">
              {r.races} Rennen · {r.wins} {r.wins === 1 ? 'Sieg' : 'Siege'} · {r.drivers} {r.drivers === 1 ? 'Fahrer' : 'Fahrer'}
            </span>
          </span>
          <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>{r.points}</span>
        </Link>
      ))}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        Die Autos sammeln die Rennpunkte aller ihrer Fahrer (ohne Streichresultate und Bonus). Viel gefahrene Autos haben es leichter – Siege zeigen die Stärke.
      </p>
    </section>
  )
}

const AWARDS: { kind: string; name: string; text: string }[] = [
  { kind: 'saisonsieger', name: 'Saisonsieger', text: 'Die meisten Punkte der Saison' },
  { kind: 'rookie-jahr', name: 'Rookie des Jahres', text: 'Bester Neuling der Saison' },
  { kind: 'aufsteiger', name: 'Aufsteiger', text: 'Die meisten Plätze in der Elo-Wertung gewonnen' },
  { kind: 'jahresschnellster', name: 'Jahresschnellster', text: 'Schnellste Runde des Jahres' },
  { kind: 'saubermann-jahr', name: 'Saubermann', text: 'Die wenigsten Abflüge pro 100 Runden (ab 40 Runden)' },
  { kind: 'aussenseiter-jahr', name: 'Außenseiter', text: 'Die meisten Siege gegen klar stärkere Fahrer und Autos' },
]

function Awards({ year, running }: { year: string; running: boolean }) {
  const { model } = useData()
  const location = useLocation()
  const winners = [...model.medals].flatMap(([name, list]) => list.filter((m) => m.id.endsWith(year) && AWARDS.some((a) => a.kind === m.kind)).map((m) => ({ name, m })))
  const leader = model.season(year)[0]
  return (
    <section className="card" style={{ gap: 6 }}>
      <div className="card-head">
        <span className="card-title">Saison-Awards</span>
        <span className="hint">{running ? 'werden nach Saisonende vergeben' : 'vergeben'}</span>
      </div>
      {AWARDS.map((a) => {
        const got = winners.filter((w) => w.m.kind === a.kind)
        return (
          <div key={a.kind} className="row" style={{ padding: '8px', alignItems: 'center' }}>
            {got[0] ? <MedalBadge medal={got[0].m} size={40} /> : <span style={{ width: 40, height: 40, borderRadius: 20, border: '1px dashed #3A404A', flexShrink: 0 }} />}
            <span className="grow">
              <span className="name">{a.name}</span>
              <span className="sub">{got[0] ? got[0].m.description : a.text}</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              {got.length ? (
                got.map((w) => (
                  <Link key={w.name} to={driverPath(w.name)} state={{ bg: location }} style={{ fontSize: 13, fontWeight: 700 }}>
                    {w.name}
                  </Link>
                ))
              ) : a.kind === 'saisonsieger' && running && leader ? (
                <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                  führt: <b style={{ color: 'var(--text)' }}>{leader.name}</b>
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>{running ? 'offen' : '–'}</span>
              )}
            </span>
          </div>
        )
      })}
    </section>
  )
}

function Challenges({ year }: { year: string }) {
  const { model } = useData()
  const me = useMyName()
  const location = useLocation()
  const drivers = model.season(year).map((r) => r.name)
  const mine = me && drivers.includes(me) ? model.challenges(me, year) : null
  const all = drivers.map((n) => ({ n, list: model.challenges(n, year) }))
  const doneBy = (id: string) => all.filter((x) => x.list.find((c) => c.id === id)?.done).map((x) => x.n)
  // mit Namen: nach eigenem Fortschritt, sonst danach, wie viele es geschafft haben
  const list = mine ? [...mine].sort(byProgress) : [...(all[0]?.list ?? [])].sort((a, b) => doneBy(b.id).length - doneBy(a.id).length)
  const doneCount = mine?.filter((c) => c.done).length ?? 0
  return (
    <section className="card" style={{ gap: 10 }}>
      <div className="card-head">
        <span className="card-title">{mine ? 'Deine Challenges' : 'Challenges'}</span>
        <span className="hint">{mine ? `${doneCount} von ${mine.length} geschafft · ${doneCount * CHALLENGE_XP} XP` : `je +${CHALLENGE_XP} XP`}</span>
      </div>
      {!me && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Oben rechts auswählen, wer du bist – dann siehst du deinen Fortschritt.</p>}
      {list.map((c) => {
        const names = doneBy(c.id)
        return (
          <ChallengeItem
            key={c.id}
            c={mine ? c : { ...c, done: false }}
            accent={ACCENT}
            showProgress={!!mine}
            footer={
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>
                {names.length ? (
                  <>
                    Geschafft:{' '}
                    {names.map((n, k) => (
                      <span key={n}>
                        {k > 0 && ', '}
                        <Link to={driverPath(n)} state={{ bg: location }} style={{ color: n === me ? 'var(--me)' : 'var(--text-2)' }}>
                          {n}
                        </Link>
                      </span>
                    ))}
                  </>
                ) : (
                  'Noch niemand geschafft'
                )}
              </span>
            }
          />
        )
      })}
    </section>
  )
}
