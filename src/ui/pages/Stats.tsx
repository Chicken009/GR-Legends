import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { quantile } from '../../domain/laps'
import { isQuali } from '../../domain/rating'
import { AREA, seriesColors } from '../colors'
import { driverPath, PageHead, PeriodTabs, Segment, Tile, useData, useMyName } from '../components'
import { BarList, BumpChart, DuelMatrix, TrendChart } from '../charts/StatsCharts'
import { fmtNum, fmtPct, formatTime, shortName } from '../format'
import { useStored } from '../useStored'

const ACCENT = AREA.stats

export function Stats() {
  const { tab = 'ueberblick' } = useParams()
  const navigate = useNavigate()
  const { model } = useData()
  const [period, setPeriod] = useStored('stats:period', 'all')
  const p = period === 'all' || model.years.includes(period) ? period : 'all'
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT }}>
      <PageHead title="Statistiken" color={ACCENT} />
      <Segment
        label="Bereich"
        value={tab === 'duelle' ? 'duelle' : 'ueberblick'}
        onChange={(v) => navigate(v === 'duelle' ? '/statistik/duelle' : '/statistik', { replace: true })}
        options={[
          ['ueberblick', 'Überblick'],
          ['duelle', 'Verlauf & Duelle'],
        ]}
      />
      <PeriodTabs value={p} onChange={setPeriod} years={model.years} />
      {tab === 'duelle' ? <Duels period={p} /> : <Overview period={p} />}
    </div>
  )
}

function Overview({ period }: { period: string }) {
  const { model, days } = useData()
  const me = useMyName()
  const location = useLocation()
  const inP = (date: string) => period === 'all' || date.startsWith(period)
  const pDays = days.filter((d) => inP(d.date))
  const sessions = pDays.flatMap((d) => d.sessions)
  const races = sessions.filter((s) => !isQuali(s))
  const laps = sessions.reduce((a, s) => a + s.results.reduce((b, r) => b + r.laps, 0), 0)
  const km = sessions.reduce((a, s) => a + (s.trackLengthCm ? s.results.reduce((b, r) => b + (r.laps * s.trackLengthCm!) / 100000, 0) : 0), 0)
  // Hauptstrecke: die mit den meisten Läufen
  const trackCount = new Map<string, number>()
  for (const s of sessions) trackCount.set(s.track, (trackCount.get(s.track) ?? 0) + 1)
  const mainTrack = [...trackCount].sort((a, b) => b[1] - a[1])[0]?.[0]
  const trend = [...pDays]
    .filter((d) => d.track === mainTrack)
    .reverse()
    .map((d) => {
      const results = d.sessions.flatMap((s) => s.results).filter((r) => r.validBestLapMs != null)
      const bestR = results.sort((a, b) => a.validBestLapMs! - b.validBestLapMs!)[0]
      const normal = d.sessions.flatMap((s) => s.results.flatMap((r) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms))).sort((a, b) => a - b)
      return bestR ? { date: d.date, best: bestR.validBestLapMs!, bestBy: bestR.driver, typical: normal.length ? quantile(normal, 0.5) : null } : null
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  const st = model.stats(period)
  const cars = [...st.cars.values()].filter((c) => c.races > 0).sort((a, b) => b.races - a.races).slice(0, 6)
  const myFav = me ? st.drivers.get(me)?.favoriteCar : null
  const drivers = [...st.drivers.values()]
  const best = <T,>(list: T[], get: (x: T) => number | null, asc = false) =>
    list.filter((x) => get(x) != null).sort((a, b) => (asc ? get(a)! - get(b)! : get(b)! - get(a)!))[0]
  const rec = mainTrack ? model.trackRecords.get(mainTrack) : undefined
  const mostWins = best(drivers, (d) => (d.wins > 0 ? d.wins : null))
  const mostKm = best(drivers, (d) => d.km)
  const streak = best(drivers, (d) => (d.maxStreak >= 2 ? d.maxStreak : null))
  const precise = best(drivers, (d) => (d.races >= 5 ? d.precision : null), true)
  const clean = best(drivers, (d) => (d.crashBaseLaps >= 50 ? d.crashRate : null), true)
  const records: { label: string; who?: string; value: string; gold?: boolean; guest?: boolean }[] = [
    { label: 'Bahnrekord', who: rec?.driver, value: formatTime(rec?.ms), gold: true, guest: rec?.guest },
    { label: 'Meiste Siege', who: mostWins?.name, value: String(mostWins?.wins ?? '–') },
    { label: 'Meiste km', who: mostKm?.name, value: mostKm?.km != null ? `${fmtNum(mostKm.km)} km` : '–' },
    { label: 'Längste Serie', who: streak?.name, value: streak ? `${streak.maxStreak} Siege` : '–' },
    { label: 'Präzisester', who: precise?.name, value: precise?.precision != null ? `${fmtPct(precise.precision, 1)} Streuung` : '–' },
    { label: 'Wenigste Abflüge', who: clean?.name, value: clean?.crashRate != null ? `${fmtNum(clean.crashRate)}/100` : '–' },
  ]
  return (
    <>
      <div className="tiles">
        <Tile value={fmtNum(km)} label="km" color={ACCENT} />
        <Tile value={fmtNum(laps, 0)} label="Runden" />
        <Tile value={races.length} label="Rennen" />
        <Tile value={pDays.length} label="Renntage" />
      </div>
      <div className="cols">
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Werden wir schneller?</span>
            <span className="hint">{mainTrack} · pro Renntag</span>
          </div>
          <TrendChart days={trend} color={ACCENT} />
          <div className="legend">
            <span>
              <span style={{ width: 14, height: 4, borderRadius: 2, background: ACCENT }} />
              Bestzeit
            </span>
            <span>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed #6B7480' }} />
              typische Runde
            </span>
          </div>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section className="card" style={{ gap: 9 }}>
            <div className="card-head">
              <span className="card-title">Beliebteste Autos</span>
              <span className="hint">Starts in Rennen{myFav ? ' · grün = dein Lieblingsauto' : ''}</span>
            </div>
            <BarList rows={cars.map((c) => ({ label: c.name, value: c.races }))} highlight={myFav} />
          </section>
          <section className="card" style={{ padding: '6px 14px', gap: 0 }}>
            {records.map((r, i) => (
              <Link
                key={r.label}
                to={r.who && !r.guest ? driverPath(r.who) : '#'}
                state={{ bg: location }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < records.length - 1 ? '1px solid var(--grid)' : undefined }}
              >
                <span style={{ fontSize: 11, color: 'var(--muted)', width: 96, flexShrink: 0 }}>{r.label}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: r.who === me ? 'var(--me)' : undefined, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.who ?? '–'}
                  {r.guest ? ' (Gast)' : ''}
                </span>
                <span className="num" style={{ fontSize: 14, fontWeight: 700, color: r.gold ? '#F2C94C' : undefined }}>
                  {r.value}
                </span>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </>
  )
}

function Duels({ period }: { period: string }) {
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const ranking = model.ranking(period)
  const [extra, setExtra] = useState<string[]>([])
  const base = ranking.slice(0, 4).map((r) => r.name)
  const shown = [...new Set([...base, ...(me && ranking.some((r) => r.name === me) ? [me] : []), ...extra])]
  const { dates, ranks } = model.rankTimeline()
  const from = period === 'all' ? 0 : Math.max(0, dates.findIndex((d) => d.startsWith(period)) - 1)
  const to = period === 'all' ? dates.length : dates.filter((d) => d.slice(0, 4) <= period).length
  const pDates = dates.slice(from, to)
  const colors = seriesColors(shown, me)
  const matrixNames = [...new Set([...ranking.slice(0, me && ranking.slice(0, 6).every((r) => r.name !== me) ? 5 : 6).map((r) => r.name), ...(me && ranking.some((r) => r.name === me) ? [me] : [])])]
  const h2h = model.stats(period).drivers
  return (
    <div className="cols">
      <section className="card" style={{ gap: 8 }}>
        <div className="card-head">
          <span className="card-title">Rangverlauf</span>
          <span className="hint">Top 4{me ? ' + du' : ''} · pro Renntag</span>
        </div>
        <BumpChart dates={pDates} series={shown.map((n) => ({ name: n, ranks: (ranks.get(n) ?? []).slice(from, to) }))} colors={colors} me={me} />
        <div className="chips">
          {ranking.slice(4, 14).filter((r) => r.name !== me).map((r) => {
            const on = extra.includes(r.name)
            return (
              <button key={r.name} className="pill" aria-pressed={on} onClick={() => setExtra(on ? extra.filter((x) => x !== r.name) : [...extra, r.name])} style={{ border: on ? `1px solid ${colors.get(r.name)}` : '1px solid transparent', color: on ? colors.get(r.name) : 'var(--muted)' }}>
                {on ? '− ' : '+ '}
                {shortName(r.name)}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Weitere Fahrer antippen, um sie einzublenden.</span>
      </section>
      <section className="card" style={{ gap: 10 }}>
        <div className="card-head">
          <span className="card-title">Wer schlägt wen?</span>
          <span className="hint">Siege : Niederlagen der Zeile</span>
        </div>
        <DuelMatrix
          names={matrixNames}
          me={me}
          h2h={(a, b) => h2h.get(a)?.h2h.get(b) ?? [0, 0]}
          onPick={(a, b) => navigate(`/vergleich?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)}
        />
        <div className="legend">
          <span>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(59,188,74,.55)' }} />
            meist gewonnen
          </span>
          <span>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#262B33' }} />
            ausgeglichen / verloren
          </span>
          <span>Feld antippen: Vergleich</span>
        </div>
      </section>
    </div>
  )
}
