import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { DriverStats, RankRow } from '../../domain/model'
import { AREA } from '../colors'
import { Avatar, driverPath, PageHead, PeriodTabs, Rank, useData, useMyName } from '../components'
import { StatusIcons } from '../icons'
import { fmtElo, fmtNum, fmtPct } from '../format'
import { useStored } from '../useStored'

type SortKey = 'elo' | 'races' | 'wins' | 'podiums' | 'beat' | 'pace' | 'precision' | 'crash' | 'km'

const COLS: { key: SortKey; label: string; title?: string; mobile?: boolean; asc?: boolean; get: (d: DriverStats | undefined, r: RankRow) => number | null }[] = [
  { key: 'elo', label: 'Elo', mobile: true, get: (_, r) => r.elo },
  { key: 'races', label: 'Rennen', mobile: true, get: (d) => d?.races ?? 0 },
  { key: 'wins', label: 'Siege', mobile: true, get: (d) => d?.wins ?? 0 },
  { key: 'podiums', label: 'Podien', get: (d) => d?.podiums ?? 0 },
  { key: 'beat', label: 'Geschlagen', title: 'Anteil geschlagener Gegner', get: (d) => d?.beatShare ?? null },
  { key: 'pace', label: 'Pace', title: 'Ø saubere Runde in % der typischen Streckenbestzeit', asc: true, get: (d) => d?.pace ?? null },
  { key: 'precision', label: 'Streuung', title: 'Schwankung sauberer Runden (kleiner = präziser)', asc: true, get: (d) => d?.precision ?? null },
  { key: 'crash', label: 'Abflüge/100', title: 'Abflüge pro 100 Runden, nur Rennen ohne Tankfunktion', asc: true, get: (d) => d?.crashRate ?? null },
  { key: 'km', label: 'km', get: (d) => d?.km ?? null },
]

export function Drivers() {
  const { model } = useData()
  const me = useMyName()
  const location = useLocation()
  const navigate = useNavigate()
  const [period, setPeriod] = useStored('drivers:period', 'all')
  const [view, setView] = useStored<'table' | 'cards'>('drivers:view', window.matchMedia?.('(min-width: 900px)').matches ? 'table' : 'cards')
  const [minRaces, setMinRaces] = useStored('drivers:min3', true)
  const [sort, setSort] = useState<SortKey>('elo')
  const p = period === 'all' || model.years.includes(period) ? period : 'all'
  const stats = model.stats(p).drivers
  const statuses = model.statuses(p)
  const col = COLS.find((c) => c.key === sort)!
  const rows = model
    .ranking(p)
    .filter((r) => !minRaces || r.races >= 3 || r.name === me)
    .sort((a, b) => {
      if (sort === 'elo') return a.rank - b.rank
      const va = col.get(stats.get(a.name), a)
      const vb = col.get(stats.get(b.name), b)
      if (va == null) return 1
      if (vb == null) return -1
      return col.asc ? va - vb : vb - va
    })
  const open = (name: string) => navigate(driverPath(name), { state: { bg: location } })

  return (
    <div className="page" style={{ ['--accent' as string]: AREA.drivers }}>
      <PageHead title="Fahrer" kicker="Rangliste" color={AREA.drivers}>
        <div role="group" aria-label="Ansicht" className="segment" style={{ padding: 3 }}>
          <button aria-pressed={view === 'table'} aria-label="Tabelle" onClick={() => setView('table')} style={{ width: 40, height: 32, padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button aria-pressed={view === 'cards'} aria-label="Karten" onClick={() => setView('cards')} style={{ width: 40, height: 32, padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </PageHead>
      <div className="filters">
        <PeriodTabs value={p} onChange={setPeriod} years={model.years} />
        <label className="check">
          <input type="checkbox" checked={minRaces} onChange={(e) => setMinRaces(e.target.checked)} />
          ab 3 Rennen
        </label>
      </div>

      {rows.length === 0 && <p className="muted">Keine Fahrer in diesem Zeitraum.</p>}

      {view === 'table' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th className="left">Fahrer</th>
                  {COLS.map((c) => (
                    <th key={c.key} className={`${c.mobile ? '' : 'hide-mobile'}${sort === c.key ? ' sorted' : ''}`} title={c.title} aria-sort={sort === c.key ? (c.asc ? 'ascending' : 'descending') : undefined}>
                      <button onClick={() => setSort(c.key)}>
                        {c.label}
                        {sort === c.key ? ' ▾' : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = stats.get(r.name)
                  return (
                    <tr key={r.name} className={r.name === me ? 'me-row' : undefined} onClick={() => open(r.name)}>
                      <td>
                        <Rank rank={r.rank} />
                      </td>
                      <td className="left" style={{ color: 'var(--text)' }}>
                        <Link to={driverPath(r.name)} state={{ bg: location }} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.name} />
                          <span style={{ fontWeight: 600, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                          <StatusIcons list={statuses.get(r.name)} />
                        </Link>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtElo(r.elo)}</td>
                      <td>{d?.races ?? 0}</td>
                      <td>{d?.wins ?? 0}</td>
                      <td className="hide-mobile">{d?.podiums ?? 0}</td>
                      <td className="hide-mobile">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div className="bar" style={{ width: 56, height: 5 }}>
                            <div style={{ width: `${(d?.beatShare ?? 0) * 100}%` }} />
                          </div>
                          <span style={{ width: 38 }}>{fmtPct(d?.beatShare)}</span>
                        </div>
                      </td>
                      <td className="hide-mobile">{d?.pace != null ? `${fmtNum(d.pace)} %` : '–'}</td>
                      <td className="hide-mobile">{d?.precision != null ? fmtPct(d.precision, 1) : '–'}</td>
                      <td className="hide-mobile">{fmtNum(d?.crashRate)}</td>
                      <td className="hide-mobile">{fmtNum(d?.km)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {rows.map((r) => {
            const d = stats.get(r.name)
            const isMe = r.name === me
            return (
              <Link key={r.name} to={driverPath(r.name)} state={{ bg: location }} className={`dcard${isMe ? ' me' : ''}`} aria-label={`Profil ${r.name}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                    <Rank rank={r.rank} size={30} />
                    <span style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)', marginTop: 4 }}>RANG</span>
                  </div>
                  <Avatar name={r.name} size={52} style={isMe ? { background: 'rgba(0,0,0,.28)' } : undefined} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d?.favoriteCar ?? '–'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="num" style={{ fontSize: 26, fontWeight: 800 }}>
                    {fmtElo(r.elo)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Elo</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <StatusIcons list={statuses.get(r.name)} size={16} max={2} />
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, borderTop: `1px solid ${isMe ? 'rgba(255,255,255,.12)' : '#262B33'}`, paddingTop: 8 }}>
                  <Mini v={d?.races ?? 0} l="Rennen" />
                  <Mini v={d?.wins ?? 0} l="Siege" />
                  <Mini v={fmtPct(d?.beatShare)} l="geschl." />
                </div>
                {isMe && <span className="du">DU</span>}
              </Link>
            )
          })}
        </div>
      )}
      {view === 'table' && (
        <div className="legend hide-mobile" style={{ gap: 18 }}>
          <span>Pace = Ø saubere Runde in % der typischen Streckenbestzeit</span>
          <span>Streuung = Schwankung sauberer Runden (kleiner = präziser)</span>
          <span>Abflüge nur aus Rennen ohne Tankfunktion</span>
        </div>
      )}
    </div>
  )
}

function Mini({ v, l }: { v: string | number; l: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{v}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
}
