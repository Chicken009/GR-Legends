import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isGuest } from '../../domain/drivers'
import { SPLIT_LAPS, splitTime } from '../../domain/laps'
import { isQuali } from '../../domain/rating'
import type { RaceDay, Result, Session } from '../../types'
import { AREA, seriesColors } from '../colors'
import { carPath, driverPath, PageHead, Placement, Rank, Segment, Sheet, useData, useMyName } from '../components'
import { LAP_HEAT_RAMP, LapHeatmap } from '../charts/LapHeatmap'
import { LapChart, PositionChart } from '../charts/RaceCharts'
import { ChevronLeft, ChevronRight, SearchIcon, StrokeIcon, Trophy } from '../icons'
import { fmtDelta, formatDate, formatGap, formatTime, formatTrack, plural, sessionTitle, shortName } from '../format'
import { useStored } from '../useStored'

const ACCENT = AREA.history

/** Umschalter im Tab „Historie“: Renntage und Statistik */
export function RacesSwitch({ value }: { value: 'renntage' | 'statistik' }) {
  const navigate = useNavigate()
  return (
    <Segment
      label="Historie"
      value={value}
      onChange={(v) => navigate(v === 'statistik' ? '/statistik' : '/historie', { replace: true })}
      options={[
        ['renntage', 'Renntage'],
        ['statistik', 'Statistik'],
      ]}
    />
  )
}

export function History() {
  const { days, model } = useData()
  const me = useMyName()
  const [year, setYear] = useStored('history:year', 'all')
  const [track, setTrack] = useStored('history:track', 'all')
  const [mine, setMine] = useStored('history:mine', false)
  const [pickDrivers, setPickDrivers] = useStored<string[]>('history:drivers', [])
  const [pickCars, setPickCars] = useStored<string[]>('history:cars', [])
  const [filterOpen, setFilterOpen] = useState(false)
  const tracks = [...new Set(days.map((d) => d.track))]
  // Gewählte Fahrer müssen alle im Lauf sein, von den gewählten Autos mindestens eines
  const allDrivers = [...new Set(days.flatMap((d) => d.sessions.flatMap((s) => s.results.map((r) => r.driver))))]
  const allCars = [...new Set(days.flatMap((d) => d.sessions.flatMap((s) => s.results.map((r) => r.car))))]
  const drivers = pickDrivers.filter((n) => allDrivers.includes(n))
  const cars = pickCars.filter((c) => allCars.includes(c))
  const need = [...new Set([...drivers, ...(mine && me ? [me] : [])])]
  const matches = (s: Session) => need.every((n) => s.results.some((r) => r.driver === n)) && (!cars.length || s.results.some((r) => cars.includes(r.car)))
  const filtering = need.length > 0 || cars.length > 0
  const shown = days
    .filter((d) => (year === 'all' || d.date.startsWith(year)) && (track === 'all' || d.track === track))
    .map((d) => (filtering ? { day: d, sessions: d.sessions.filter(matches) } : { day: d, sessions: d.sessions }))
    .filter((x) => x.sessions.length > 0)
  const active = drivers.length + cars.length
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT }}>
      <PageHead title="Historie" kicker="Alle Renntage" color={ACCENT} />
      <RacesSwitch value="renntage" />
      <div className="filters">
        <div role="tablist" aria-label="Jahr" className="tabs">
          {['all', ...model.years].map((y) => (
            <button key={y} role="tab" aria-selected={year === y} onClick={() => setYear(y)}>
              {y === 'all' ? 'Alle' : y}
            </button>
          ))}
        </div>
        {tracks.length > 1 && (
          <select className="select" aria-label="Strecke" value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="all">Alle Strecken</option>
            {tracks.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        {me && (
          <label className="check">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            nur mit mir
          </label>
        )}
        <button className={`pill${active ? ' active' : ''}`} onClick={() => setFilterOpen(true)} aria-haspopup="dialog" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(active ? { borderColor: ACCENT, color: 'var(--text)' } : null) }}>
          <FilterIcon />
          Filter{active ? ` · ${active}` : ''}
        </button>
      </div>
      {active > 0 && (
        <div className="chips" style={{ marginTop: -6 }}>
          {[...drivers.map((n) => ({ key: `d:${n}`, label: n, remove: () => setPickDrivers(drivers.filter((x) => x !== n)) })), ...cars.map((c) => ({ key: `c:${c}`, label: c, remove: () => setPickCars(cars.filter((x) => x !== c)) }))].map((x) => (
            <button key={x.key} className="pill" onClick={x.remove} aria-label={`Filter ${x.label} entfernen`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {x.label} <span aria-hidden="true" style={{ color: 'var(--muted)' }}>✕</span>
            </button>
          ))}
          <button className="pill" onClick={() => { setPickDrivers([]); setPickCars([]) }} style={{ color: 'var(--muted)' }}>
            Alle Filter löschen
          </button>
        </div>
      )}
      <div className="cols" style={{ gap: 10 }}>
        {shown.map(({ day, sessions }) => (
          <DayCard key={day.key} day={day} sessions={sessions} me={me} />
        ))}
      </div>
      {filterOpen && (
        <FilterSheet
          drivers={allDrivers.filter((n) => !isGuest(n)).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))}
          cars={allCars.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))}
          pickedDrivers={drivers}
          pickedCars={cars}
          me={me}
          onApply={(d, c) => { setPickDrivers(d); setPickCars(c); setFilterOpen(false) }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {shown.length === 0 && <p className="muted">Keine Renntage für diese Auswahl.</p>}
    </div>
  )
}

const FilterIcon = () => <StrokeIcon d="M4 5h16l-6 7.5V19l-4 1.5v-8z" size={15} />

/** Auswahl der Fahrer und Autos für die Historie (wird erst mit „Anwenden“ übernommen) */
function FilterSheet({ drivers, cars, pickedDrivers, pickedCars, me, onApply, onClose }: { drivers: string[]; cars: string[]; pickedDrivers: string[]; pickedCars: string[]; me: string | null; onApply: (drivers: string[], cars: string[]) => void; onClose: () => void }) {
  const [d, setD] = useState(pickedDrivers)
  const [c, setC] = useState(pickedCars)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const group = (title: string, hint: string, items: string[], picked: string[], set: (v: string[]) => void) => {
    const visible = items.filter((x) => x.toLowerCase().includes(q))
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>
        </div>
        <div className="chips">
          {visible.map((x) => {
            const on = picked.includes(x)
            return (
              <button key={x} className="pill" role="checkbox" aria-checked={on} onClick={() => toggle(picked, set, x)} style={on ? { background: ACCENT, borderColor: ACCENT, color: '#0E1013', fontWeight: 700 } : x === me ? { borderColor: 'var(--me)' } : undefined}>
                {x}
              </button>
            )
          })}
          {!visible.length && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Kein Treffer</span>}
        </div>
      </section>
    )
  }
  return (
    <Sheet
      onClose={onClose}
      label="Filter"
      actions={
        <button className="btn round" onClick={() => { setD([]); setC([]) }}>
          Zurücksetzen
        </button>
      }
    >
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Filter</h1>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--inner-2)', borderRadius: 14, padding: '0 14px', minHeight: 48, border: '1px solid var(--line-2)' }}>
        <SearchIcon />
        <input
          type="search"
          placeholder="Fahrer oder Auto suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Fahrer oder Auto suchen"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 15, font: 'inherit' }}
        />
      </label>
      {group('Fahrer', 'alle gewählten im selben Lauf', drivers, d, setD)}
      {group('Autos', 'mindestens eines im Lauf', cars, c, setC)}
      <div style={{ position: 'sticky', bottom: -20, background: 'var(--sheet)', paddingTop: 8 }}>
        <button className="btn primary" style={{ width: '100%', minHeight: 50, ['--accent' as string]: ACCENT }} onClick={() => onApply(d, c)}>
          {d.length + c.length ? `Anwenden (${d.length + c.length})` : 'Ohne Filter anzeigen'}
        </button>
      </div>
    </Sheet>
  )
}

function DayCard({ day, sessions = day.sessions, me }: { day: RaceDay; sessions?: Session[]; me: string | null }) {
  const races = day.sessions.filter((s) => !isQuali(s))
  const wins = new Map<string, number>()
  for (const s of races) if (s.results[0]) wins.set(s.results[0].driver, (wins.get(s.results[0].driver) ?? 0) + 1)
  const top = [...wins].sort((a, b) => b[1] - a[1])[0]
  const best = day.sessions.flatMap((s) => s.results).filter((r) => r.validBestLapMs != null).sort((a, b) => a.validBestLapMs! - b.validBestLapMs!)[0]
  const drivers = new Set(day.sessions.flatMap((s) => s.results.map((r) => r.driver)))
  return (
    <section className="card" style={{ gap: 10 }}>
      <div className="card-head">
        <span style={{ fontSize: 16, fontWeight: 700 }}>{formatDate(day.date)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {formatTrack(day.track, null)} · {plural(drivers.size, 'Fahrer', 'Fahrer')}
        </span>
      </div>
      {top && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-2)' }}>
          <Trophy size={18} />
          <span>
            <b style={{ color: top[0] === me ? 'var(--me)' : 'var(--text)' }}>{top[0]}</b> gewinnt {top[1]} von {races.length}
            {best && ` · Bestzeit ${formatTime(best.validBestLapMs)} (${shortName(best.driver)})`}
          </span>
        </div>
      )}
      <div className="row-list">
        {sessions.length < day.sessions.length && <span style={{ fontSize: 12, color: 'var(--muted)', padding: '0 4px' }}>{sessions.length} von {day.sessions.length} Läufen passen zum Filter</span>}
        {sessions.map((s) => {
          const count = day.sessions.filter((o) => o.type === s.type).length
          const mine = me ? s.results.find((r) => r.driver === me) : null
          return (
            <Link key={s.fileId} to={`/lauf/${s.fileId}`} className="row" style={{ padding: '8px 4px' }}>
              <span className="grow">
                <span className="name">{sessionTitle(s, count)}</span>
                <span className="sub">
                  {s.results[0]?.driver ?? '–'} · {plural(s.results[0]?.laps ?? 0, 'Runde', 'Runden')}
                  {s.tank ? ' · Tank' : ''}
                </span>
              </span>
              {mine && (
                <span className={`rank${mine.position <= 3 ? ` r${mine.position}` : ''}`} style={{ fontSize: 13, color: mine.position > 3 ? 'var(--me)' : undefined }}>
                  Du P{mine.position}
                </span>
              )}
              <ChevronRight />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const total = (r: Result) => r.lapTimes.reduce((a, l) => a + l.ms, 0)

/** Abstand laut Smartrace; fehlt er, wird er aus Runden und Gesamtzeit berechnet. */
function gapOf(s: Session, r: Result): string {
  if (r.gap.kind !== 'none' || r.position === 1) return formatGap(r.gap, r.position)
  const leader = s.results[0]
  if (!leader) return '–'
  if (leader.laps > r.laps) return formatGap({ kind: 'laps', laps: leader.laps - r.laps })
  const diff = total(r) - total(leader)
  return diff > 0 ? formatGap({ kind: 'time', ms: diff }) : '–'
}

/** „10 Rd. 2:08.412 · 20 Rd. 4:16.903 PB“ unter dem Auto */
function SplitLine({ splits }: { splits: { n: number; ms: number; pb: boolean }[] }) {
  if (!splits.length) return null
  return (
    <span className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
      {splits.map((x) => (
        <span key={x.n} title={`Gesamtzeit der ersten ${x.n} Runden${x.pb ? ' – persönliche Bestmarke auf dieser Strecke' : ''}`}>
          {x.n} Rd. <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{formatTime(x.ms)}</span>
          {x.pb && <b style={{ color: 'var(--best)', marginLeft: 4, fontSize: 9, letterSpacing: 0.4 }}>PB</b>}
        </span>
      ))}
    </span>
  )
}

export function RaceView() {
  const { fileId = '' } = useParams()
  const { days, model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const day = days.find((d) => d.sessions.some((s) => s.fileId === fileId))
  const session = day?.sessions.find((s) => s.fileId === fileId)
  const [pick, setPick] = useState<string | null>(null)
  if (!day || !session) return <div className="page"><p className="muted">Lauf nicht gefunden.</p></div>
  const count = day.sessions.filter((o) => o.type === session.type).length
  const colors = seriesColors(session.results.map((r) => r.driver), me)
  const elo = new Map(model.rating.events.filter((e) => e.fileId === session.fileId).map((e) => [e.driver, e.delta]))
  const lapDriver = (pick && session.results.find((r) => r.driver + '#' + r.position === pick)) || session.results.find((r) => r.driver === me) || session.results[0]
  const laps = session.results[0]?.laps ?? 0
  const best = Math.min(...session.results.map((r) => r.validBestLapMs ?? Infinity))
  const idx = day.sessions.indexOf(session)
  const stats = model.stats('all').drivers
  // Gesamtzeit der ersten 10/20 Runden und ob das die persönliche Bestmarke auf der Strecke ist
  // (Bestmarken nur ohne Tankfunktion, Boxenzeiten verzerren die Summe)
  const splits = (r: Result) => {
    if (isQuali(session) || isGuest(r.driver)) return []
    const mine = (stats.get(r.driver)?.raceResults ?? []).filter((x) => x.session.track === session.track && !x.session.tank)
    return SPLIT_LAPS.flatMap((n) => {
      const ms = splitTime(r, n)
      if (ms == null) return []
      const pb = Math.min(...mine.map((x) => splitTime(x.result, n) ?? Infinity))
      return [{ n, ms, pb: !session.tank && ms <= pb }]
    })
  }
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT, maxWidth: 820 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="icon-btn" aria-label="Zurück zur Historie" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/historie'))}>
          <ChevronLeft color={ACCENT} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: ACCENT, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            {formatDate(session.date)} · {count > 1 ? `Lauf ${session.heat}` : session.track}
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>
            {session.type} · {plural(laps, 'Runde', 'Runden')}
          </h1>
        </div>
      </header>
      {day.sessions.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Läufe des Tages">
          {day.sessions.map((s) => (
            <button key={s.fileId} role="tab" aria-selected={s.fileId === session.fileId} onClick={() => navigate(`/lauf/${s.fileId}`, { replace: true })}>
              {sessionTitle(s, day.sessions.filter((o) => o.type === s.type).length)}
            </button>
          ))}
        </div>
      )}

      <section className="card" style={{ padding: 8, gap: 0 }}>
        {session.results.map((r) => {
          const guest = isGuest(r.driver)
          const placing = model.placement(r.driver, session.fileId)
          const d = placing != null ? null : elo.get(r.driver)
          const isMe = r.driver === me
          return (
            <div key={r.driver + r.position} className={`row${isMe ? ' me-row' : ''}`}>
              <Rank rank={r.position} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors.get(r.driver), flexShrink: 0 }} />
              <div className="grow">
                {guest ? <span className="name">{r.driver}</span> : <Link to={driverPath(r.driver)} className="name">{r.driver}</Link>}
                <Link to={carPath(r.car)} className="sub">
                  {r.car}
                  {session.tank && r.pitStops > 0 ? ` · ${plural(r.pitStops, 'Box', 'Boxenstopps')}` : ''}
                </Link>
                <SplitLine splits={splits(r)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className="num" style={{ fontSize: 13 }}>
                  {isQuali(session) ? formatTime(r.validBestLapMs) : gapOf(session, r)}
                </span>
                <span className="num" style={{ fontSize: 11, fontWeight: 600, color: d != null && d > 0.5 ? '#7BDB8A' : 'var(--muted)' }}>
                  {placing != null ? <Placement n={placing} driver={r.driver} size={11} /> : d != null ? `${fmtDelta(d)} Elo` : guest ? 'Gast' : ''}
                  {!isQuali(session) && r.validBestLapMs === best ? (d != null || placing != null ? ' · ' : '') : ''}
                  {!isQuali(session) && r.validBestLapMs === best && <span style={{ color: 'var(--best)' }}>Bestzeit</span>}
                </span>
              </div>
            </div>
          )
        })}
      </section>

      {session.results.length > 1 && !isQuali(session) && (
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Positionsverlauf</span>
            <span className="hint">Punkte antippen</span>
          </div>
          <PositionChart session={session} colors={colors} me={me} />
          <div className="legend">
            <span>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9AA3AD' }} />
              Überholt
            </span>
            <span>
              <span style={{ width: 8, height: 8, background: '#FF6B5A', transform: 'rotate(45deg)' }} />
              Abflug
            </span>
            <span>
              <span style={{ width: 8, height: 8, borderRadius: 2, border: '2px solid #9AA3AD' }} />
              Box
            </span>
          </div>
        </section>
      )}

      {session.results.some((r) => r.lapTimes.length > 1) && (
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Rundenzeiten-Heatmap</span>
            <span className="hint">Runden antippen</span>
          </div>
          <LapHeatmap session={session} me={me} />
          <div className="legend">
            <span>
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {LAP_HEAT_RAMP.map((c) => (
                  <span key={c} style={{ width: 12, height: 10, borderRadius: 2, background: c }} />
                ))}
              </span>
              normal → langsamer als die eigene typische Runde
            </span>
            <span>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg,#D95926 0 3px,#3A1B12 3px 6px)' }} />
              Abflug
            </span>
            <span>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#EE9E10' }} />
              Box
            </span>
          </div>
        </section>
      )}

      {lapDriver && (
        <section className="card" style={{ gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="card-title">Rundenzeiten</span>
            <label className="pill" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.get(lapDriver.driver) }} />
              <span className="sr-only">Fahrer wählen</span>
              <select
                value={lapDriver.driver + '#' + lapDriver.position}
                onChange={(e) => setPick(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', fontSize: 12 }}
              >
                {session.results.map((r) => (
                  <option key={r.driver + r.position} value={r.driver + '#' + r.position}>
                    {r.driver}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <LapChart result={lapDriver} color={colors.get(lapDriver.driver) ?? '#9AA3AD'} />
          <div className="legend">
            <span>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--best)' }} />
              Bestzeit
            </span>
            <span>
              <span style={{ width: 8, height: 8, background: '#FF6B5A', transform: 'rotate(45deg)' }} />
              Abflug
            </span>
            <span>
              <span style={{ width: 8, height: 8, borderRadius: 2, border: '2px solid #9AA3AD' }} />
              Box
            </span>
            <span style={{ color: '#FF8A7A' }}>oben langsamer</span>
            <span style={{ color: '#7BDB8A' }}>unten schneller</span>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {idx > 0 ? (
          <Link className="btn" to={`/lauf/${day.sessions[idx - 1].fileId}`} replace>
            ‹ {sessionTitle(day.sessions[idx - 1], day.sessions.filter((o) => o.type === day.sessions[idx - 1].type).length)}
          </Link>
        ) : (
          <span />
        )}
        {idx < day.sessions.length - 1 && (
          <Link className="btn" to={`/lauf/${day.sessions[idx + 1].fileId}`} replace>
            {sessionTitle(day.sessions[idx + 1], day.sessions.filter((o) => o.type === day.sessions[idx + 1].type).length)} ›
          </Link>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--faint)' }}>
        {session.fileName}
        {session.tank ? ' · mit Tankfunktion' : ''}
      </p>
    </div>
  )
}
