import { useState } from 'react'
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
import { useMedalPopup } from '../MedalPopup'
import { useStored } from '../useStored'
import { ChallengeBadge, ChallengeItem, RarityLine, XpChip } from '../ChallengeItem'
import { byProgress, rarity, useMarkChallengesSeen } from '../challengeUtils'
import { Amount } from '../currency'

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
  // Vom Fahrerprofil aus: dessen Challenges zeigen
  const stateDriver = (location.state as { driver?: string } | null)?.driver
  const tab = stateTab ?? storedTab
  const setTab = (t: Tab) => {
    setStoredTab(t)
    if (stateTab) navigate(location.pathname, { replace: true, state: null })
  }
  if (!year)
    return (
      <div className="page" style={{ ['--accent' as string]: ACCENT }}>
        <PageHead title="Saison" kicker="Meisterschaft" color={ACCENT} />
        <p className="muted">Noch keine Rennen.</p>
      </div>
    )
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
      {tab === 'challenges' && <Challenges year={year} driver={stateDriver} />}
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
        <Amount kind="pts" value={r.points} size={18} />
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
          <Amount kind="pts" value={r.points} size={16} />
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
  const openMedal = useMedalPopup()
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
            {got[0] ? (
              <button onClick={() => openMedal(got[0].m, got[0].name)} aria-label={`Medaille ${got[0].m.name} anzeigen`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%' }}>
                <MedalBadge medal={got[0].m} size={40} />
              </button>
            ) : <span style={{ width: 40, height: 40, borderRadius: 20, border: '1px dashed #3A404A', flexShrink: 0 }} />}
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

function Challenges({ year, driver }: { year: string; driver?: string }) {
  const { model } = useData()
  const myName = useMyName()
  const me = driver ?? myName
  const own = me === myName
  const [picked, setPicked] = useState<string | null>(null)
  const drivers = model.season(year).map((r) => r.name)
  const mine = me && drivers.includes(me) ? model.challenges(me, year) : null
  const fresh = useMarkChallengesSeen(own && mine ? me : null, year, mine)
  const all = drivers.map((n) => ({ n, list: model.challenges(n, year) }))
  const doneBy = (id: string) => all.filter((x) => x.list.find((c) => c.id === id)?.done).map((x) => x.n)
  const total = drivers.length
  if (!mine) {
    // Ohne Namen: alle Challenges mit Seltenheit, die am häufigsten geschafften zuerst
    const list = [...(all[0]?.list ?? [])].sort((a, b) => doneBy(b.id).length - doneBy(a.id).length)
    return (
      <section className="card" style={{ gap: 10 }}>
        <div className="card-head">
          <span className="card-title">Challenges</span>
          <span className="hint">je +{CHALLENGE_XP} XP</span>
        </div>
        {!myName && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Oben rechts auswählen, wer du bist – dann siehst du deinen Fortschritt.</p>}
        {list.map((c) => (
          <ChallengeItem key={c.id} c={c} accent={ACCENT} showProgress={false} footer={<RarityLine doneBy={doneBy(c.id)} total={total} me={myName} title={c.label} />} />
        ))}
      </section>
    )
  }
  const done = mine.filter((c) => c.done)
  const open = mine.filter((c) => !c.done).sort(byProgress)
  const counts = all.map((x) => x.list.filter((c) => c.done).length)
  const rank = 1 + counts.filter((d) => d > done.length).length
  const sel = done.find((c) => c.id === picked)
  return (
    <>
      <section className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing value={done.length} total={mine.length} color={ACCENT} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="card-title">{own ? 'Deine Challenges' : `Challenges von ${me}`}</span>
          <Amount kind="xp" value={done.length * CHALLENGE_XP} size={15} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Platz {rank} von {total} bei den Challenges
            {fresh.size > 0 && <b style={{ color: ACCENT }}> · {fresh.size} neu geschafft</b>}
          </span>
        </span>
      </section>
      {open.length > 0 && (
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Offen</span>
            <span className="hint">{open.length} übrig · nächste zuerst</span>
          </div>
          {open.map((c) => (
            <ChallengeItem key={c.id} c={c} accent={ACCENT} footer={<RarityLine doneBy={doneBy(c.id)} total={total} me={me} title={c.label} />} />
          ))}
        </section>
      )}
      {done.length > 0 && (
        <section className="card" style={{ gap: 10 }}>
          <div className="card-head">
            <span className="card-title">Geschafft</span>
            <span className="hint">Abzeichen antippen</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            {done.map((c) => {
              const r = rarity(doneBy(c.id).length, total)
              return (
                <button
                  key={c.id}
                  className="inner"
                  aria-pressed={picked === c.id}
                  onClick={() => setPicked(picked === c.id ? null : c.id)}
                  style={{ alignItems: 'center', gap: 6, padding: '12px 6px', border: picked === c.id ? `1.5px solid ${ACCENT}` : '1.5px solid transparent', textAlign: 'center' }}
                >
                  <ChallengeBadge c={c} accent={ACCENT} size={56} fresh={fresh.has(c.id)} />
                  <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{c.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: fresh.has(c.id) ? ACCENT : r.color }}>{fresh.has(c.id) ? 'Neu' : r.label.split(' ·')[0]}</span>
                </button>
              )
            })}
          </div>
          {sel && (
            <div className="inner" style={{ gap: 6, padding: '10px 12px' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <b style={{ fontSize: 14 }}>{sel.label}</b>
                <XpChip done />
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sel.detail}</span>
              <RarityLine doneBy={doneBy(sel.id)} total={total} me={me} title={sel.label} />
            </div>
          )}
        </section>
      )}
    </>
  )
}

/** Großer Ring „5/7“ */
function ProgressRing({ value, total, color, size = 84 }: { value: number; total: number; color: string; size?: number }) {
  const stroke = 8
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0 }} role="img" aria-label={`${value} von ${total} geschafft`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A3038" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len * (total ? value / total : 0)} ${len}`} />
      </svg>
      <span className="num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>
        {value}
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>/{total}</span>
      </span>
    </span>
  )
}
