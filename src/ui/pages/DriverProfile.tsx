import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMe } from '../me'
import { useStored } from '../useStored'
import { NewcomerProfile } from './NewcomerProfile'
import { CAREER_XP, type Medal } from '../../domain/model'
import { AREA, SERIES } from '../colors'
import { Avatar, carPath, driverPath, PeriodTabs, Placement, Segment, Sheet, Tile, useData, useMyName } from '../components'
import { isQuali } from '../../domain/rating'
import { CarThumb } from '../CarPhoto'
import { DonutChart, type DonutPart } from '../charts/DonutChart'
import { LineChart, type LinePoint } from '../charts/LineChart'
import { PointsChart } from '../charts/PointsChart'
import { RadarChart } from '../charts/RadarChart'
import { TimeTrendChart } from '../charts/TimeTrendChart'
import { ShareIcon, StatusIcons } from '../icons'
import { TipCarousel } from '../TipCarousel'
import { MedalBadge, TIERS } from '../Medal'
import { useMedalPopup } from '../MedalPopup'
import { fmtDelta, fmtElo, fmtGapSec, fmtNum, fmtPct, formatDate, formatMonth, formatTime } from '../format'
import { quantile, SPLIT_LAPS, splitTime } from '../../domain/laps'
import { Amount, XP_COLOR, XP_GRADIENT } from '../currency'

const ACCENT = AREA.drivers

export function DriverProfile({ onClose }: { onClose: () => void }) {
  const { name = '' } = useParams()
  const { model, newcomers } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const [chart, setChart] = useState<ChartKind>('elo')
  const [period, setPeriod] = useState('all')
  const [showOpponents, setShowOpponents] = useState(false)
  const [showRaces, setShowRaces] = useState(false)
  const driver = decodeURIComponent(name)
  const { openPicker } = useMe()
  const location = useLocation()
  // Im eigenen Profil einen anderen Fahrer gewählt: gleich dessen Profil zeigen
  const prevMe = useRef(me)
  useEffect(() => {
    if (prevMe.current === driver && me && me !== driver) navigate(driverPath(me), { replace: true, state: location.state })
    prevMe.current = me
  }, [me, driver, navigate, location.state])
  const d = model.stats('all').drivers.get(driver)
  const history = model.rating.history.get(driver) ?? []
  if ((!d || history.length === 0) && newcomers.includes(driver)) return <NewcomerProfile driver={driver} onClose={onClose} />
  if (!d || history.length === 0) {
    return (
      <Sheet onClose={onClose} label="Fahrer nicht gefunden">
        <p className="muted">„{driver}“ wurde nicht gefunden. Gäste haben kein Profil.</p>
      </Sheet>
    )
  }
  const rows = model.ranking('all')
  const row = rows.find((r) => r.name === driver)
  const statuses = model.statuses('all').get(driver)
  const medals = model.medals.get(driver) ?? []
  const current = medals.filter((m) => !m.former)
  const rival = model.rival(driver)
  const rivalElo = rival ? model.rating.drivers.get(rival.name) : null
  const placing = model.placement(driver)
  // Jahresrückblicke, neueste zuerst (höchstens drei)
  const wrappedYears = model.years.filter((y) => model.season(y).some((r) => r.name === driver)).slice(0, 3)
  const goals = model.goals(driver)
  // Challenges der letzten Saison, in der der Fahrer gefahren ist
  const challengeYear = wrappedYears[0] as string | undefined
  const challengeList = challengeYear ? model.challenges(driver, challengeYear) : []
  const challengesDone = challengeList.filter((c) => c.done).length
  const tips = model.tips(driver)
  const fav = d.favoriteCar ? d.cars.get(d.favoriteCar) : null
  const isMe = driver === me
  const driverYears = [...new Set(history.map((e) => e.date.slice(0, 4)))].sort().reverse()

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${driver} · GR Legends`, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // abgebrochen
    }
  }
  const compareWith = me && me !== driver ? me : rows.find((r) => r.name !== driver)?.name

  return (
    <Sheet
      onClose={onClose}
      label={`Profil ${driver}`}
      actions={
        <>
          {compareWith && (
            <Link className="btn round" to={`/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(compareWith)}`}>
              Vergleichen
            </Link>
          )}
          <button className="btn round" aria-label="Link teilen" onClick={share} style={{ width: 44, padding: 0 }}>
            <ShareIcon />
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={driver} size={64} ring={isMe ? ACCENT : '#3A404A'} style={{ background: 'var(--inner)', fontSize: 22, fontWeight: 800, boxShadow: 'var(--sh2)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{driver}</h1>
            <StatusIcons list={statuses} size={22} animate />
          </div>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            {row && row.inactive ? (
              'inaktiv (über 12 Monate kein Rennen), ohne Rang'
            ) : row && row.placing ? (
              'noch in der Einstufung, ohne Rang'
            ) : row ? (
              <>
                Gesamtrang <b style={{ color: ACCENT }}>#{row.rank}</b> von {rows.filter((r) => !r.placing && !r.inactive).length}
              </>
            ) : (
              'noch ohne Rang'
            )}
            {isMe && ' · Das bist du'}
          </span>
          {isMe && (
            <button className="btn ghost" onClick={openPicker} style={{ alignSelf: 'flex-start', minHeight: 30, padding: '0 10px', fontSize: 12, marginTop: 2 }}>
              Anderen Fahrer wählen
            </button>
          )}
        </div>
      </div>

      <div className="tiles">
        {placing != null ? <Tile value={`${placing}/${model.placementRuns(driver)}`} label="Einstufung" color={ACCENT} /> : <Tile value={<Amount kind="elo" value={model.rating.drivers.get(driver) ?? 0} size={20} unit={false} />} label="Elo" />}
        <Tile value={d.races} label="Rennen" />
        <Tile value={d.wins} label="Siege" />
        <Tile value={fmtPct(d.beatShare)} label="Ø geschlagen" />
      </div>

      <CareerCard driver={driver} />
      {challengeYear && challengeList.length > 0 && (
        <Link to={`/saison/${challengeYear}`} state={{ tab: 'challenges', driver }} className="inner" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Saisonchallenges{challengeYear === model.years[0] ? '' : ` ${challengeYear}`}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              <b className="num" style={{ color: 'var(--text)' }}>
                {challengesDone}/{challengeList.length}
              </b>{' '}
              geschafft ›
            </span>
          </div>
          <div className="bar" style={{ ['--accent' as string]: AREA.season }}>
            <div style={{ width: `${Math.round((challengesDone / challengeList.length) * 100)}%` }} />
          </div>
        </Link>
      )}
      {wrappedYears.length > 0 && (
        <div className="chips" style={{ marginTop: -4 }}>
          {wrappedYears.map((y) => (
            <Link key={y} to={`/wrapped/${y}/${encodeURIComponent(driver)}`} className="pill">
              ✦ Rückblick {y}
            </Link>
          ))}
        </div>
      )}

      {current.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {current.slice(0, 2).map((m) => (
            <MedalChip key={m.id} medal={m} driver={driver} />
          ))}
          <Link to={`${driverPath(driver)}/medaillen`} replace className="tile" aria-label="Alle Medaillen anzeigen" style={{ width: 56, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{medals.length > 2 ? `+${medals.length - 2}` : '›'}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>alle</span>
          </Link>
        </div>
      )}

      <section className="inner" style={{ padding: '14px 14px 10px', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Entwicklung</span>
          <Segment small label="Diagramm wählen" value={chart} onChange={setChart} options={[['elo', 'Elo'], ['lap', 'Runden'], ['splits', '10/20'], ['season', 'Saison']]} />
        </div>
        {driverYears.length > 1 && (
          <div style={{ ['--accent' as string]: ACCENT }}>
            <PeriodTabs value={period} onChange={setPeriod} years={driverYears} />
          </div>
        )}
        <DriverChart driver={driver} kind={chart} period={period} />
      </section>

      <DriverStyle driver={driver} />

      <div className="grid-2">
        <Link className="inner" to={d.favoriteCar ? carPath(d.favoriteCar) : '#'}>
          <span className="l">Lieblingsauto</span>
          <span className="v" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.favoriteCar ?? '–'}</span>
          {fav && <span className="s">{fav.races} Rennen · Best {formatTime(fav.bestLapMs)}</span>}
        </Link>
        <Link className="inner" to={rival ? `/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(rival.name)}` : '#'}>
          <span className="l">Rivale</span>
          <span className="v">{rival?.name ?? '–'}</span>
          {rival && (
            <span className="s">
              {rival.wins} : {rival.losses}
              {rivalElo != null && placing == null && ` · ${rivalText(rivalElo - (model.rating.drivers.get(driver) ?? 0))}`}
            </span>
          )}
        </Link>
        <button className="inner" onClick={() => setShowOpponents(!showOpponents)} aria-expanded={showOpponents} style={{ border: 'none', textAlign: 'left' }}>
          <span className="l">Gegner schon besiegt ›</span>
          <span className="v">
            {d.opponentsBeaten.size} von {d.opponentsMet.size}
          </span>
          <div className="bar" style={{ ['--accent' as string]: ACCENT, width: '100%' }}>
            <div style={{ width: `${d.opponentsMet.size ? (d.opponentsBeaten.size / d.opponentsMet.size) * 100 : 0}%` }} />
          </div>
        </button>
        <div className="inner">
          <span className="l">Gefahren</span>
          <span className="v">{d.km != null ? `${fmtNum(d.km)} km` : '–'}</span>
          <span className="s">{fmtNum(d.laps, 0)} Runden</span>
        </div>
        <div className="inner">
          <span className="l">Pace</span>
          <span className="v">{fmtGapSec(d.paceGap)}</span>
          <span className="s">{d.paceGap != null && d.paceGap < 0 ? 'pro Runde schneller' : 'pro Runde langsamer'} als die typische Bestzeit</span>
        </div>
        <div className="inner">
          <span className="l">Abflüge</span>
          <span className="v">{d.crashRate != null ? `${fmtNum(d.crashRate)} / 100 Runden` : '–'}</span>
          <span className="s">{d.crashRate != null ? `${d.crashes} insgesamt · Ø ${fmtNum(d.crashes ? d.crashLossMs / d.crashes / 1000 : 0)} s Verlust` : 'zu wenige Rennen ohne Tank'}</span>
        </div>
      </div>
      <p style={{ margin: '-4px 2px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        <b>Ø geschlagen</b>: Anteil des Feldes, den du im Schnitt hinter dir lässt (Platz 2 von 5 = 75 %). <b>Gegner schon besiegt</b>: wie viele verschiedene Gegner du mindestens einmal geschlagen hast – antippen für die Übersicht.
      </p>

      {showOpponents && (
        <Sheet onClose={() => setShowOpponents(false)} label={`Gegner von ${driver}`}>
          <OpponentList driver={driver} />
        </Sheet>
      )}

      <CarBests driver={driver} />

      {goals.length > 0 && (
        <section className="inner" style={{ gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Nächstes Ziel</span>
          {goals.map((g) => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{g.label}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'right' }}>{g.detail}</span>
              </div>
              <div className="bar" style={{ ['--accent' as string]: ACCENT }}>
                <div style={{ width: `${Math.round(g.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <TipCarousel tips={tips} accent={ACCENT} />

      <section className="inner" style={{ gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Letzte Rennen</span>
          <button className="btn" style={{ minHeight: 32, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }} onClick={() => setShowRaces(true)}>
            Alle Rennen ›
          </button>
        </div>
        {d.raceResults
          .slice(-6)
          .reverse()
          .map(({ session, result }) => (
            <button key={`${session.fileId}-${result.position}`} className="row" style={{ border: 'none', background: 'none', textAlign: 'left', padding: '6px 0' }} onClick={() => navigate(`/lauf/${session.fileId}`)}>
              <span className={`rank${result.position <= 3 ? ` r${result.position}` : ''}`} style={{ minWidth: 26 }}>
                P{result.position}
              </span>
              <span className="grow">
                <span className="name" style={{ fontWeight: 500 }}>
                  {formatDate(session.date)} · {session.type} {session.heat}
                </span>
                <span className="sub">
                  {result.car} · {session.results.length} Fahrer
                </span>
              </span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {formatTime(result.validBestLapMs)}
              </span>
            </button>
          ))}
      </section>

      {showRaces && (
        <Sheet onClose={() => setShowRaces(false)} label={`Alle Rennen von ${driver}`}>
          <AllRaces driver={driver} />
        </Sheet>
      )}
    </Sheet>
  )
}

/** Alle Läufe eines Fahrers, nach Renntag gruppiert, neueste zuerst */
function AllRaces({ driver }: { driver: string }) {
  const { model } = useData()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'all' | 'race' | 'quali'>('all')
  const delta = new Map((model.rating.history.get(driver) ?? []).map((e) => [`${e.fileId}|${e.car}`, e.delta]))
  const runs = model.sessions
    .flatMap((session) => session.results.filter((r) => r.driver === driver).map((result) => ({ session, result, quali: isQuali(session) })))
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.createdTime.localeCompare(a.session.createdTime))
  const shown = runs.filter((r) => kind === 'all' || (kind === 'quali') === r.quali)
  const races = runs.filter((r) => !r.quali)
  const days = new Map<string, typeof shown>()
  for (const r of shown) days.set(r.session.date, [...(days.get(r.session.date) ?? []), r])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Alle Rennen</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {driver} · {races.length} Rennen · {runs.length - races.length} Qualis · {races.filter((r) => r.result.position === 1).length} Siege
        </span>
      </div>
      <Segment value={kind} onChange={setKind} label="Laufart" small options={[['all', 'Alle'], ['race', 'Rennen'], ['quali', 'Qualis']]} />
      {shown.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Keine Läufe.</p>}
      {[...days].map(([date, list]) => (
        <section key={date} className="inner" style={{ gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 2 }}>{formatDate(date)}</span>
          {list.map(({ session, result }) => {
            const placing = model.placement(driver, session.fileId)
            const dl = delta.get(`${session.fileId}|${result.car}`)
            return (
              <button key={`${session.fileId}-${result.position}`} className="row" style={{ border: 'none', background: 'none', textAlign: 'left', padding: '6px 0' }} onClick={() => navigate(`/lauf/${session.fileId}`)}>
                <span className={`rank${result.position <= 3 ? ` r${result.position}` : ''}`} style={{ minWidth: 26 }}>
                  P{result.position}
                </span>
                <span className="grow">
                  <span className="name" style={{ fontWeight: 500 }}>
                    {session.type} {session.heat}
                  </span>
                  <span className="sub">
                    {result.car} · {session.results.length} Fahrer
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {formatTime(result.validBestLapMs)}
                  </span>
                  {placing != null ? (
                    <Placement n={placing} driver={driver} size={11} short />
                  ) : dl != null ? (
                    <span className="num" style={{ fontSize: 11, fontWeight: 600, color: dl > 0.5 ? ACCENT : 'var(--muted)' }}>
                      {fmtDelta(dl)} Elo
                    </span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

/** Fahrstil (Netzdiagramm) und Verteilungen (Ringe) */
function DriverStyle({ driver }: { driver: string }) {
  const { model } = useData()
  const d = model.stats('all').drivers.get(driver)
  const axes = model.driverRadar(driver)
  if (!d || d.races === 0) return null
  const places = [0, 0, 0, 0]
  for (const { session, result } of d.raceResults) if (session.results.length > 1) places[Math.min(result.position, 4) - 1]++
  const total = places.reduce((a, b) => a + b, 0)
  const cars = [...d.cars].map(([name, u]) => ({ name, races: u.races })).filter((c) => c.races > 0).sort((a, b) => b.races - a.races)
  const carParts: DonutPart[] = [
    ...cars.slice(0, 4).map((c, i) => ({ label: c.name, value: c.races, color: SERIES[i] })),
    ...(cars.length > 4 ? [{ label: 'Andere', value: cars.slice(4).reduce((a, c) => a + c.races, 0), color: '#4A515C' }] : []),
  ]
  return (
    <>
      {d.races >= 3 && (
        <section className="inner" style={{ padding: 14, gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Fahrstil</span>
            <span className="hint">im Vergleich zu allen Stammfahrern</span>
          </div>
          <RadarChart series={[{ name: driver, color: ACCENT, axes }]} label={`Fahrstil ${driver}: ${axes.map((a) => `${a.label} ${Math.round(a.score * 100)}`).join(', ')}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {axes.map((a) => (
              <div key={a.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700, width: 84, flexShrink: 0 }}>{a.label}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{a.text}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>Außen = besser als die meisten Stammfahrer (ab 5 Rennen), gestrichelter Ring = Durchschnitt. Achse antippen für den Wert.</p>
        </section>
      )}
      <section className="inner" style={{ padding: 14, gap: 14 }}>
        <div className="card-head">
          <span className="card-title">Platzierungen und Autos</span>
          <span className="hint">alle Rennen</span>
        </div>
        <DonutChart
          label="Platzierungen"
          center={total ? `${Math.round((places[0] / total) * 100)} %` : '–'}
          sub="Siege"
          parts={[
            { label: 'Siege', value: places[0], color: '#E5A51A' },
            { label: 'Platz 2', value: places[1], color: '#B9C6D2' },
            { label: 'Platz 3', value: places[2], color: '#C87846' },
            { label: 'Platz 4 und dahinter', value: places[3], color: '#4A515C' },
          ]}
        />
        <DonutChart label="Autos" center={String(d.races)} sub="Rennen" parts={carParts} />
      </section>
    </>
  )
}

function rivalText(diff: number) {
  const r = Math.round(diff)
  if (r === 0) return 'gleiche Wertung'
  return r > 0 ? `${r} Elo vor dir` : `${-r} Elo hinter dir`
}

function MedalChip({ medal, driver }: { medal: Medal; driver: string }) {
  const openMedal = useMedalPopup()
  return (
    <button className="tile" onClick={() => openMedal(medal, driver)} aria-label={`Medaille ${medal.name} anzeigen`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, border: 'none', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
      <MedalBadge medal={medal} size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{medal.name}</span>
        <span style={{ fontSize: 10, color: TIERS[medal.tier].text }}>
          {TIERS[medal.tier].label} · {medal.title ? 'Titel' : `${['bahnrekord', 'fahrzeugrekord'].includes(medal.kind) ? 'seit ' : ''}${formatMonth(medal.date)}`}
        </span>
      </div>
    </button>
  )
}

type ChartKind = 'elo' | 'lap' | 'splits' | 'season'

/**
 * Punkteverlauf in der gewählten Saison (bei „Gesamt“ die letzte Saison des Fahrers), mit dem
 * Spitzenreiter zum Vergleich – oder dem Verfolger, wenn der Fahrer selbst vorne liegt.
 */
function SeasonChart({ driver, period }: { driver: string; period: string }) {
  const { model } = useData()
  const year = period !== 'all' ? period : model.years.find((y) => model.season(y).some((r) => r.name === driver))
  const rows = year ? model.season(year) : []
  const mine = rows.find((r) => r.name === driver)
  if (!year || !mine) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>In dieser Saison keine Rennen.</p>
  const dates = [...new Set(model.sessions.filter((s) => s.date.startsWith(year)).map((s) => s.date))].sort()
  if (dates.length < 2) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Renntage in der Saison {year}.</p>
  // Vergleich mit dem Nächstbesseren (bzw. dem Verfolger, wenn man vorne liegt) – nicht mit der Spitze
  const idx = rows.indexOf(mine)
  const other = idx === 0 ? rows[1] : rows[idx - 1]
  const series = [
    ...(other ? [{ name: other.name, color: '#7D8691', values: other.progress }] : []),
    { name: driver, color: ACCENT, values: mine.progress },
  ]
  return (
    <>
      <PointsChart dates={dates} series={series} label={`Punkteverlauf von ${driver} in der Saison ${year}`} />
      <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        Saison {year}: Platz {mine.rank} von {rows.length} · {mine.points.toLocaleString('de-DE')} Punkte. Punktestand nach jedem Renntag (beste Rennen bis dahin)
        {other ? `; grau: ${other.name} (${idx === 0 ? 'Verfolger' : `Platz ${other.rank}, direkt vor dir`})` : ''}.
      </span>
    </>
  )
}

/**
 * Gesamtzeit der ersten 10 bzw. 20 Runden je Rennen (nur wenn so viele Runden gefahren wurden)
 * und die persönliche Bestmarke – je Strecke, weil Zeiten nur dort vergleichbar sind. Rennen
 * mit Tankfunktion zählen nicht: Boxenzeiten und nicht gezählte Runden verzerren die Summe.
 */
function SplitChart({ driver, period }: { driver: string; period: string }) {
  const { model } = useData()
  const [n, setN] = useState<number>(SPLIT_LAPS[0])
  const races = (model.stats('all').drivers.get(driver)?.raceResults ?? []).filter((x) => !x.session.tank)
  const tracks = [...new Set(races.filter((x) => splitTime(x.result, SPLIT_LAPS[0]) != null).map((x) => x.session.track))]
  const [pickTrack, setTrack] = useState<string | null>(null)
  const track = pickTrack && tracks.includes(pickTrack) ? pickTrack : (races.findLast((x) => tracks.includes(x.session.track))?.session.track ?? null)
  if (!track) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch kein Rennen mit {SPLIT_LAPS[0]} Runden.</p>
  let pb = Infinity
  const rows = races
    .filter((x) => x.session.track === track)
    .flatMap((x) => {
      const ms = splitTime(x.result, n)
      if (ms == null) return []
      pb = Math.min(pb, ms)
      return [{ ...x, ms, pb }]
    })
    .filter((x) => period === 'all' || x.session.date.startsWith(period))
  const s2 = (ms: number) => formatTime(ms)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Segment small label="Rundenzahl" value={String(n)} onChange={(v) => setN(Number(v))} options={SPLIT_LAPS.map((k) => [String(k), `${k} Runden`] as [string, string])} />
        {tracks.length > 1 && (
          <Segment small label="Strecke" value={track} onChange={setTrack} options={tracks.map((t) => [t, t] as [string, string])} />
        )}
      </div>
      {rows.length < 2 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{rows.length ? `Erst ein Rennen mit ${n} Runden.` : `In diesem Zeitraum kein Rennen mit ${n} Runden.`}</p>
      ) : (
        <>
          <TimeTrendChart
            label={`Gesamtzeit der ersten ${n} Runden je Rennen und persönliche Bestmarke`}
            tickFormat={(sec) => `${Math.floor(sec / 60)}:${(sec % 60).toLocaleString('de-DE', { minimumIntegerDigits: 2, maximumFractionDigits: 1 })}`}
            series={[
              { name: 'Zeit', color: ACCENT, values: rows.map((r) => r.ms) },
              { name: 'Bestmarke', color: '#B98CFF', values: rows.map((r) => r.pb), dashed: true, step: true },
            ]}
            tips={rows.map((r) => ({
              title: `${formatDate(r.session.date)} · ${r.session.type} ${r.session.heat}`,
              text: (
                <>
                  <span style={{ color: ACCENT }}>{n} Runden in {s2(r.ms)}</span>
                  <br />
                  <span style={{ color: '#B98CFF' }}>Bestmarke bis dahin {s2(r.pb)}</span>
                  {r.ms === r.pb && <> · neue Bestmarke!</>}
                </>
              ),
              sub: `${r.result.car} · P${r.result.position}`,
            }))}
            xLabels={[{ index: 0, text: formatDate(rows[0].session.date) }, { index: rows.length - 1, text: formatDate(rows[rows.length - 1].session.date) }]}
          />
          <div className="legend">
            <span>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: ACCENT }} />
              Zeit für {n} Runden
            </span>
            <span>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed #B98CFF' }} />
              Bestmarke
            </span>
            <span>↑ schneller</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ohne Rennen mit Tankfunktion.</span>
        </>
      )}
    </>
  )
}

function DriverChart({ driver, kind, period }: { driver: string; kind: ChartKind; period: string }) {
  const { model } = useData()
  if (kind === 'season') return <SeasonChart driver={driver} period={period} />
  if (kind === 'splits') return <SplitChart driver={driver} period={period} />
  const inP = (date: string) => period === 'all' || date.startsWith(period)
  const history = (model.rating.history.get(driver) ?? []).filter((e) => inP(e.date))
  if (history.length === 0) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Keine Läufe in diesem Zeitraum.</p>
  if (kind === 'elo') {
    const all = model.rating.history.get(driver) ?? []
    const runs = model.placementRuns(driver)
    const placingNow = all.length < runs
    const placingRun = (e: (typeof history)[number]) => all.indexOf(e) < runs
    const ups = [...history.keys()].filter((i) => !placingRun(history[i]) && history[i].delta > 0).sort((a, b) => history[b].delta - history[a].delta).slice(0, 2)
    const downs = [...history.keys()].filter((i) => !placingRun(history[i]) && history[i].delta < 0).sort((a, b) => history[a].delta - history[b].delta).slice(0, 2)
    const turning = new Set([...ups, ...downs, history.length - 1])
    const points: LinePoint[] = history.map((e, i) => ({
      y: e.after,
      // Einstufung: grau gestrichelt – der Wert nach dem letzten Einstufungslauf ist schon die Elo
      muted: placingNow || all.indexOf(e) < runs - 1,
      tip: placingRun(e)
        ? { title: `Einstufungslauf ${all.indexOf(e) + 1}/${runs}`, text: 'Die ersten Läufe pendeln die Wertung ein.', sub: `${formatDate(e.date)} · ${e.type} · ${e.position}. von ${e.field}`, color: '#C5CCD3' }
        : turning.has(i) ? { title: `${fmtDelta(e.delta)} Elo`, text: e.reason, sub: `${formatDate(e.date)} · ${e.type} · ${e.position}. von ${e.field}`, color: e.delta >= 0 ? ACCENT : '#C5CCD3' } : undefined,
    }))
    const mid = Math.floor(history.length / 2)
    // Sinkt die Elo zuletzt, obwohl man selbst schneller geworden ist: das zeigen, statt nur die fallende Kurve
    const recent = all.slice(-8)
    const falling = recent.length >= 4 && recent[recent.length - 1].after < recent[0].before
    const prog = model.progress(driver)
    // Gesamtrang nach dem jeweiligen Renntag als graue Linie im Hintergrund
    const { dates, ranks } = model.rankTimeline()
    const myRanks = ranks.get(driver) ?? []
    const rankAt = history.map((e) => myRanks[dates.indexOf(e.date)] ?? null)
    for (const [i, p] of points.entries()) if (p.tip && rankAt[i] != null) p.tip = { ...p.tip, sub: `${p.tip.sub} · Rang ${rankAt[i]}.` }
    // Noch in der Einstufung: Linie beim Startwert beginnen lassen (auch nach dem ersten Lauf eine Linie)
    const lead = placingNow && history[0] === all[0] ? 1 : 0
    const shownPoints: LinePoint[] = lead ? [{ y: all[0].before, muted: true }, ...points] : points
    const shownRanks = lead ? [null, ...rankAt] : rankAt
    return (
      <>
        <LineChart
          points={shownPoints}
          minSpan={20}
          back={{ values: shownRanks, invert: true, format: (v) => `Rang ${v}.` }}
          color={ACCENT}
          label={`Elo-Verlauf von ${fmtElo(history[0]?.before)} auf ${fmtElo(history[history.length - 1]?.after)} über ${history.length} Läufe`}
          xLabels={history.length > 1 ? [{ index: lead, text: formatDate(history[0].date) }, ...(history.length > 6 ? [{ index: mid + lead, text: formatDate(history[mid].date) }] : []), { index: history.length - 1 + lead, text: formatDate(history[history.length - 1].date) }] : lead ? [{ index: 0, text: 'Start' }, { index: 1, text: formatDate(history[0].date) }] : []}
        />
        <div className="legend">
          {!placingNow && (
            <span>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: ACCENT }} />
              Elo
            </span>
          )}
          {points.some((p) => p.muted) && (
            <span>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed #8A929C' }} />
              Einstufung
            </span>
          )}
          {rankAt.some((r) => r != null) && (
            <span>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed #5B636E' }} />
              Gesamtrang (oben = besser)
            </span>
          )}
        </div>
        {placingNow && (
          <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
            Noch in der Einstufung ({all.length}/{runs} Läufe): Die ersten Läufe pendeln die Wertung ein, deshalb ist die Linie grau gestrichelt und es gibt noch keinen Rang.
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Weiße Punkte antippen: Warum ging es hoch oder runter?</span>
        {falling && prog && prog.pct >= 1 && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
            <b style={{ color: ACCENT }}>Du wirst schneller:</b> Deine sauberen Runden sind {prog.pct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % schneller als in deinen ersten Rennen (gemessen am jeweils gefahrenen Auto). Die Elo vergleicht nur mit den anderen – werden die auch besser, sinkt sie trotzdem. Deinen eigenen Fortschritt zeigt das Diagramm „Runden“.
          </p>
        )}
      </>
    )
  }
  // Rundenzeiten: gleitender Median der letzten Rennen und persönliche Bestzeit
  const WINDOW = 5
  const st = model.stats('all').drivers.get(driver)
  const races = st?.raceResults ?? []
  const normal = races.map(({ result }) => result.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms))
  const rows = races.map(({ session, result }, i) => {
    const pool = normal.slice(Math.max(0, i - WINDOW + 1), i + 1).flat().sort((a, b) => a - b)
    const pb = Math.min(...races.slice(0, i + 1).map((r) => r.result.validBestLapMs ?? Infinity))
    const enough = pool.length >= 5
    return {
      session, result, pb: isFinite(pb) ? pb : null,
      median: enough ? quantile(pool, 0.5) : null,
      // eigene Spanne: schnellste 10 % bis langsamste 10 % der sauberen Runden
      fast: enough ? quantile(pool, 0.1) : null,
      slow: enough ? quantile(pool, 0.9) : null,
    }
  })
  const shown = rows.filter((r) => inP(r.session.date))
  if (shown.length < 2) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Rennen.</p>
  const s2 = (ms: number | null) => (ms == null ? '–' : (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return (
    <>
      <TimeTrendChart
        label={`Rundenzeiten: Median der letzten ${WINDOW} Rennen und persönliche Bestzeit`}
        series={[
          { name: 'Median', color: ACCENT, values: shown.map((r) => r.median) },
          { name: 'Bestzeit', color: '#B98CFF', values: shown.map((r) => r.pb), dashed: true, step: true },
        ]}
        band={{ lo: shown.map((r) => r.fast), hi: shown.map((r) => r.slow), color: ACCENT }}
        tips={shown.map((r) => ({
          title: `${formatDate(r.session.date)} · ${r.session.type} ${r.session.heat}`,
          text: (
            <>
              <span style={{ color: ACCENT }}>Median {s2(r.median)} s</span> · <span style={{ color: '#B98CFF' }}>Bestzeit {s2(r.pb)} s</span>
              <br />
              Spanne {s2(r.fast)}–{s2(r.slow)} s
              <br />
              In diesem Rennen: P{r.result.position}, Best {s2(r.result.validBestLapMs)} s
            </>
          ),
          sub: r.result.car,
        }))}
        xLabels={[{ index: 0, text: formatDate(shown[0].session.date) }, { index: shown.length - 1, text: formatDate(shown[shown.length - 1].session.date) }]}
      />
      <div className="legend">
        <span>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: ACCENT }} />
          Median der letzten {WINDOW} Rennen
        </span>
        <span>
          <span style={{ width: 14, height: 0, borderTop: '2px dashed #B98CFF' }} />
          persönliche Bestzeit
        </span>
        <span>
          <span style={{ width: 14, height: 10, borderRadius: 3, background: 'linear-gradient(180deg, rgba(59,188,74,0), rgba(59,188,74,.45), rgba(59,188,74,0))' }} />
          deine Spanne (80 % der Runden)
        </span>
        <span>↑ schneller</span>
      </div>
    </>
  )
}

/** Karriere-Level: Erfahrungspunkte aus allem, was man fährt – sie gehen nie verloren */
function CareerCard({ driver }: { driver: string }) {
  const { model } = useData()
  const [open, setOpen] = useState(false)
  const c = model.career(driver)
  if (!c) return null
  const progress = (c.xp - c.levelXp) / Math.max(1, c.nextXp - c.levelXp)
  return (
    <button className="inner" onClick={() => setOpen(!open)} aria-expanded={open} style={{ border: 'none', textAlign: 'left', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#1A1205', background: XP_GRADIENT, boxShadow: 'var(--sh2)' }}
          aria-hidden="true"
        >
          {c.level}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            Level {c.level} · {c.title}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <Amount kind="xp" value={c.xp} size={12} /> · noch {(c.nextXp - c.xp).toLocaleString('de-DE')} bis Level {c.level + 1}
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▴' : '▾'}</span>
      </div>
      <div className="bar" style={{ ['--accent' as string]: XP_COLOR, width: '100%', height: 7 }}>
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {c.breakdown
            .filter((b) => b.count > 0)
            .map((b) => (
              <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>
                  {b.count.toLocaleString('de-DE')} {b.label}
                </span>
                <Amount kind="xp" value={b.xp} signed size={13} />
              </div>
            ))}
          <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45, marginTop: 4 }}>
            Jedes Mitfahren bringt Erfahrung: Rennen {CAREER_XP.race}, Renntag {CAREER_XP.raceDay}, Qualifying {CAREER_XP.quali}, Sieg +{CAREER_XP.win}, Podium +{CAREER_XP.podium}, je km {CAREER_XP.km}, neue Bestzeit {CAREER_XP.personalBest}. Punkte gehen nie verloren.
          </span>
        </div>
      )}
    </button>
  )
}

/** Wen man schon geschlagen hat und wen noch nicht (Rennen, direkte Duelle) */
function OpponentList({ driver }: { driver: string }) {
  const { model } = useData()
  const navigate = useNavigate()
  const d = model.stats('all').drivers.get(driver)
  if (!d) return null
  const list = [...d.h2h].map(([name, [w, l]]) => ({ name, w, l }))
  const open = list.filter((o) => o.w === 0).sort((a, b) => b.l - a.l)
  const done = list.filter((o) => o.w > 0).sort((a, b) => b.w - b.l - (a.w - a.l) || b.w - a.w)
  const row = (o: { name: string; w: number; l: number }) => (
    <button
      key={o.name}
      className="row"
      onClick={() => navigate(`/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(o.name)}`)}
      style={{ border: 'none', background: 'none', textAlign: 'left', padding: '5px 0', minHeight: 40 }}
    >
      <Avatar name={o.name} size={28} />
      <span className="grow">
        <span className="name" style={{ fontWeight: 500 }}>{o.name}</span>
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: o.w > o.l ? '#7BDB8A' : o.w === 0 ? 'var(--muted)' : 'var(--text-2)' }}>
        {o.w} : {o.l}
      </span>
    </button>
  )
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Gegner von {driver}</h1>
      <span style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Siege : Niederlagen in gemeinsamen Rennen · antippen zum Vergleichen</span>
      {open.length > 0 && (
        <>
          <span className="kicker" style={{ fontSize: 11, marginTop: 4 }}>Noch nie geschlagen ({open.length})</span>
          {open.map(row)}
        </>
      )}
      {done.length > 0 && (
        <>
          <span className="kicker" style={{ fontSize: 11, marginTop: 8 }}>Schon geschlagen ({done.length})</span>
          {done.map(row)}
        </>
      )}
    </section>
  )
}

/** Autos, mit denen man gefahren ist – nach Bestzeit */
/** Siegquote erst ab so vielen Rennen mit dem Auto (sonst wären 1 von 1 gleich 100 %) */
const MIN_RACES_WINRATE = 3

/** Autos des Fahrers: schnellste, höchste Siegquote, meiste km */
function CarBests({ driver }: { driver: string }) {
  const { model } = useData()
  const [kind, setKind] = useStored<'fast' | 'wins' | 'km'>('driver:cars', 'fast')
  const d = model.stats('all').drivers.get(driver)
  if (!d || d.cars.size === 0) return null
  const all = [...d.cars]
  const cars =
    kind === 'fast'
      ? all.filter(([, u]) => u.bestLapMs != null).sort((a, b) => a[1].bestLapMs! - b[1].bestLapMs!)
      : kind === 'wins'
        ? all.filter(([, u]) => u.races >= MIN_RACES_WINRATE).sort((a, b) => b[1].wins / b[1].races - a[1].wins / a[1].races || b[1].wins - a[1].wins)
        : all.filter(([, u]) => u.km > 0).sort((a, b) => b[1].km - a[1].km)
  const hint = kind === 'fast' ? 'Best · Ø saubere Runde' : kind === 'wins' ? `Siege · ab ${MIN_RACES_WINRATE} Rennen` : 'Rennen und Qualifyings'
  const maxKm = Math.max(0, ...cars.map(([, u]) => u.km))
  return (
    <section className="inner" style={{ gap: 2 }}>
      <div className="card-head" style={{ marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <span className="card-title">Autos</span>
        <Segment small label="Autoliste" value={kind} onChange={setKind} options={[['fast', 'Schnellste'], ['wins', 'Siegquote'], ['km', 'Meiste km']]} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{hint}</span>
      {cars.map(([car, u], i) => {
        const avg = kind === 'fast' && u.normal.length ? quantile([...u.normal].sort((a, b) => a - b), 0.5) : null
        const bar = kind === 'wins' ? u.wins / u.races : kind === 'km' && maxKm > 0 ? u.km / maxKm : null
        return (
          <Link key={car} to={carPath(car)} className="row" style={{ padding: '5px 0' }}>
            <CarThumb car={car} size={36} />
            <span className="grow">
              <span className="name">{car}</span>
              {bar != null ? (
                <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#262B33', marginTop: 5, position: 'relative', maxWidth: 160 }}>
                  <span style={{ position: 'absolute', inset: 0, width: `${Math.max(0.04, bar) * 100}%`, borderRadius: 3, background: i === 0 ? ACCENT : '#4A515C' }} />
                </span>
              ) : (
                <span className="sub">
                  {u.races} Rennen{u.wins ? ` · ${u.wins} ${u.wins === 1 ? 'Sieg' : 'Siege'}` : ''}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="num" style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? (kind === 'fast' ? 'var(--best)' : 'var(--text)') : undefined }}>
                {kind === 'fast' ? formatTime(u.bestLapMs) : kind === 'wins' ? fmtPct(u.wins / u.races) : `${fmtNum(u.km)} km`}
              </span>
              <span className="num" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {kind === 'fast'
                  ? avg
                    ? (avg / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '–'
                  : kind === 'wins'
                    ? `${u.wins}/${u.races}`
                    : `${u.races} Rennen`}
              </span>
            </span>
          </Link>
        )
      })}
      {!cars.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{kind === 'wins' ? `Noch kein Auto mit mindestens ${MIN_RACES_WINRATE} Rennen.` : 'Noch keine Daten.'}</p>}
    </section>
  )
}

/** Alle Medaillen eines Fahrers */
export function MedalsSheet({ onClose }: { onClose: () => void }) {
  const { name = '' } = useParams()
  const { model } = useData()
  const driver = decodeURIComponent(name)
  const medals = model.medals.get(driver) ?? []
  const current = medals.filter((m) => !m.former)
  const former = medals.filter((m) => m.former)
  return (
    <Sheet
      onClose={onClose}
      label={`Medaillen von ${driver}`}
      actions={
        <Link className="btn round" to={driverPath(driver)} replace>
          Zum Profil
        </Link>
      }
    >
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Alle Medaillen</h1>
      <span style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        {driver} · {current.length} aktuell{former.length ? ` · ${former.length} ehemalig` : ''}
      </span>
      <div className="row-list" style={{ gap: 8 }}>
        {current.map((m) => (
          <MedalRow key={m.id} medal={m} driver={driver} />
        ))}
      </div>
      {former.length > 0 && (
        <>
          <span className="kicker" style={{ marginTop: 8 }}>
            Ehemalige Titel
          </span>
          <div className="row-list" style={{ gap: 8 }}>
            {former.map((m) => (
              <MedalRow key={m.id} medal={m} driver={driver} />
            ))}
          </div>
        </>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Je seltener, desto edler: Bronze, Silber, Gold, Platin, Diamant. Rekorde und Titel wandern – wer sie verliert, behält eine gedämpfte „Ehemals“-Version.
      </p>
    </Sheet>
  )
}

function MedalRow({ medal, driver }: { medal: Medal; driver: string }) {
  const t = TIERS[medal.tier]
  const openMedal = useMedalPopup()
  return (
    <button className="inner" onClick={() => openMedal(medal, driver)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, border: 'none', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%' }}>
      <MedalBadge medal={medal} size={46} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{medal.former ? `Ehemals: ${medal.name}` : medal.name}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{medal.description}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: medal.former ? 'var(--muted)' : t.text }}>{t.label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{medal.former ? `${formatMonth(medal.former.from)} – ${formatMonth(medal.former.to)}` : medal.title ? 'aktueller Titel' : formatDate(medal.date)}</span>
      </div>
    </button>
  )
}
