import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CarStats } from '../../domain/model'
import { carScale } from '../../data/settings'
import { quantile } from '../../domain/laps'
import { AREA } from '../colors'
import { carPath, PageHead, PeriodTabs, Rank, Tile, useData, useMyName } from '../components'
import { CarSilhouette, Chevrons, ChevronLeft, RecordFlame } from '../icons'
import { fmtNum, fmtPct, formatTime } from '../format'
import { useStored } from '../useStored'
import { isGuest } from '../../domain/drivers'

const ACCENT = AREA.cars

/** Autos sortiert nach Autowertung (ab 3 Rennen), danach die übrigen nach Rennen */
function rankedCars(cars: Map<string, CarStats>) {
  const list = [...cars.values()].filter((c) => c.races > 0)
  const rated = list.filter((c) => c.races >= 3).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const rest = list.filter((c) => c.races < 3).sort((a, b) => b.races - a.races)
  return { rated, rest }
}

export function UnderdogBonus({ bonus, compact }: { bonus: number; compact?: boolean }) {
  if (bonus <= 0) return null
  const label = `Underdog-Bonus ${bonus} von 3: Siege mit diesem Auto bringen mehr Elo`
  return (
    <span role="img" aria-label={label} title={label} style={{ display: 'inline-flex', gap: compact ? 0 : 2 }}>
      {[1, 2, 3].map((i) => (
        <Chevrons key={i} value={2} size={compact ? 14 : 20} color={i <= bonus ? ACCENT : '#3A404A'} className={i <= bonus ? 'pulse' : undefined} />
      ))}
    </span>
  )
}

export function Cars() {
  const { model } = useData()
  const navigate = useNavigate()
  const [period, setPeriod] = useStored('cars:period', 'all')
  const p = period === 'all' || model.years.includes(period) ? period : 'all'
  const cars = model.stats(p).cars
  const { rated, rest } = rankedCars(cars)
  const row = (c: CarStats, rank: number | null) => (
    <tr key={c.name} onClick={() => navigate(carPath(c.name))}>
      <td>{rank != null ? <Rank rank={rank} /> : <span className="rank">–</span>}</td>
      <td className="left" style={{ color: 'var(--text)' }}>
        <Link to={carPath(c.name)} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <UnderdogBonus bonus={c.bonus} compact />
        </Link>
      </td>
      <td>{c.races}</td>
      <td>{fmtPct(c.winRate)}</td>
      <td className="hide-mobile">{fmtPct(c.beatShare)}</td>
      <td style={{ color: 'var(--text)' }}>{formatTime(c.bestLapMs)}</td>
      <td className="hide-mobile">{c.bestBy && !isGuest(c.bestBy) ? c.bestBy : c.bestBy ? `${c.bestBy}` : '–'}</td>
      <td className="hide-mobile">{fmtNum(c.km)}</td>
    </tr>
  )
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT }}>
      <PageHead title="Fahrzeuge" kicker="Autowertung" color={ACCENT} />
      <PeriodTabs value={p} onChange={setPeriod} years={model.years} />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th className="left">Fahrzeug</th>
                <th>Rennen</th>
                <th>Siege</th>
                <th className="hide-mobile">Geschlagen</th>
                <th>Best</th>
                <th className="hide-mobile">von</th>
                <th className="hide-mobile">km</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((c, i) => row(c, i + 1))}
              {rest.map((c) => row(c, null))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="legend">
        <span>Rang nach Autowertung: wie stark das Auto die Ergebnisse beeinflusst (ab 3 Rennen)</span>
        <span>
          <UnderdogBonus bonus={1} compact /> Underdog-Bonus: schwaches Auto, Siege zählen mehr
        </span>
      </div>
    </div>
  )
}

export function CarProfile() {
  const { name = '' } = useParams()
  const { model, settings, photos } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const car = decodeURIComponent(name)
  const cars = model.stats('all').cars
  const c = cars.get(car)
  if (!c) return <div className="page"><p className="muted">Fahrzeug „{car}“ nicht gefunden.</p></div>
  const { rated } = rankedCars(cars)
  const rank = rated.findIndex((x) => x.name === car) + 1
  const photo = photos[car] ?? Object.entries(settings.cars).map(([orig, e]) => (e.displayName === car ? photos[orig] : undefined)).find(Boolean)
  const scale = carScale(settings, car)
  const drivers = [...c.drivers]
    .filter(([n, v]) => v.bestLapMs != null && !isGuest(n))
    .sort((a, b) => a[1].bestLapMs! - b[1].bestLapMs!)
    .slice(0, 8)
  const lo = drivers[0]?.[1].bestLapMs ?? 0
  const hi = drivers[drivers.length - 1]?.[1].bestLapMs ?? lo + 1
  const records = model.tracks.map((t) => ({ t, rec: model.carRecords.get(`${t}\u0000${car}`) })).filter((x) => x.rec)
  const runnerUp = (track: string) => {
    const rec = model.carRecords.get(`${track}\u0000${car}`)
    return drivers.find(([n]) => n !== rec?.driver)
  }
  return (
    <div style={{ ['--accent' as string]: ACCENT }}>
      <div style={{ position: 'relative', height: 250, background: '#171A1F', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--line)', boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
        {photo ? <img src={photo} alt={car} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CarSilhouette />}
        <button className="icon-btn" aria-label="Zurück" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/autos'))} style={{ position: 'absolute', top: 14, left: 10, background: 'var(--bg)' }}>
          <ChevronLeft color={ACCENT} />
        </button>
        <span style={{ position: 'absolute', bottom: 14, right: 14, fontSize: 11, fontWeight: 700, letterSpacing: 1, background: 'var(--bg)', borderRadius: 999, padding: '5px 10px', color: 'var(--text-2)' }}>1:{scale}</span>
      </div>
      <div className="page" style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span className="kicker" style={{ color: ACCENT, letterSpacing: 2 }}>
              Fahrzeug{rank ? ` · Rang ${rank}` : ''}
            </span>
            <h1 style={{ fontSize: 28, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{car}</h1>
          </div>
          {c.bonus > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'var(--inner-2)', borderRadius: 16, padding: '10px 12px', border: '1px solid var(--line-2)', boxShadow: 'var(--sh2)', flexShrink: 0 }}>
              <UnderdogBonus bonus={c.bonus} />
              <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>Underdog-Bonus</span>
            </div>
          )}
        </div>
        {c.bonus > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>Gilt als eher schwaches Auto: Wer damit gewinnt, bekommt mehr Elo-Punkte.</p>}

        <div className="tiles">
          <Tile value={c.races} label="Rennen" />
          <Tile value={fmtPct(c.winRate)} label="Siege" />
          <Tile value={fmtNum(c.km)} label="km" />
          <Tile value={fmtNum(c.laps, 0)} label="Runden" />
        </div>

        <section className="inner" style={{ padding: 14, gap: 10 }}>
          <div className="card-head">
            <span className="card-title">Schnellste Fahrer</span>
            <span className="hint">Bestzeit · Ø saubere Runde</span>
          </div>
          {drivers.map(([n, v], i) => {
            const avg = v.normal.length ? quantile([...v.normal].sort((a, b) => a - b), 0.5) : null
            const w = hi > lo ? 1 - ((v.bestLapMs! - lo) / (hi - lo)) * 0.8 : 1
            const isMe = n === me
            return (
              <div key={n} className={isMe ? 'me-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '4px 6px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#262B33', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${w * 100}%`, borderRadius: 4, background: isMe ? 'var(--me)' : '#4A515C' }} />
                </div>
                <span className="num" style={{ fontSize: 13, fontWeight: 700, width: 50, textAlign: 'right', color: i === 0 ? '#C9D4DE' : undefined }}>
                  {formatTime(v.bestLapMs)}
                </span>
                <span className="num" style={{ fontSize: 11, color: 'var(--muted)', width: 40, textAlign: 'right' }}>
                  {avg ? (avg / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}
                </span>
              </div>
            )
          })}
        </section>

        {records.map(({ t, rec }) => {
          const second = runnerUp(t)
          return (
            <div key={t} className="inner" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
              <RecordFlame metal="silver" size={30} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  Fahrzeugrekord {formatTime(rec!.ms)}
                  {model.tracks.length > 1 ? ` · ${t}` : ''}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {rec!.driver}
                  {rec!.guest ? ' (Gast)' : ''}
                  {second ? ` · vor ${second[0]} (${formatTime(second[1].bestLapMs)})` : ''}
                </span>
              </div>
            </div>
          )
        })}
        {!photo && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            Foto fehlt: Bild mit dem Namen „{car}“ in den Drive-Unterordner „Fotos“ legen.
          </p>
        )}
      </div>
    </div>
  )
}
