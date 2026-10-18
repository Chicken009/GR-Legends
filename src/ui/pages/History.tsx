import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isGuest } from '../../domain/drivers'
import { isQuali } from '../../domain/rating'
import type { RaceDay, Result, Session } from '../../types'
import { AREA, seriesColors } from '../colors'
import { carPath, driverPath, PageHead, Placement, Rank, Segment, useData, useMyName } from '../components'
import { LAP_HEAT_RAMP, LapHeatmap } from '../charts/LapHeatmap'
import { LapChart, PositionChart } from '../charts/RaceCharts'
import { ChevronLeft, ChevronRight, Trophy } from '../icons'
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
  const tracks = [...new Set(days.map((d) => d.track))]
  const shown = days.filter(
    (d) =>
      (year === 'all' || d.date.startsWith(year)) &&
      (track === 'all' || d.track === track) &&
      (!mine || !me || d.sessions.some((s) => s.results.some((r) => r.driver === me))),
  )
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
      </div>
      <div className="cols" style={{ gap: 10 }}>
        {shown.map((d) => (
          <DayCard key={d.key} day={d} me={me} />
        ))}
      </div>
      {shown.length === 0 && <p className="muted">Keine Renntage für diese Auswahl.</p>}
    </div>
  )
}

function DayCard({ day, me }: { day: RaceDay; me: string | null }) {
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
        {day.sessions.map((s) => {
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
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className="num" style={{ fontSize: 13 }}>
                  {isQuali(session) ? formatTime(r.validBestLapMs) : gapOf(session, r)}
                </span>
                <span className="num" style={{ fontSize: 11, fontWeight: 600, color: d != null && d > 0.5 ? '#7BDB8A' : 'var(--muted)' }}>
                  {placing != null ? <Placement n={placing} size={11} /> : d != null ? `${fmtDelta(d)} Elo` : guest ? 'Gast' : ''}
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
