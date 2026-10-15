import { useState, type ReactNode } from 'react'
import { Rank } from './components'

/**
 * Grüner Verlauf der eigenen Zeile über die Zellen hinweg (wie vorher als Zeilenhintergrund):
 * kräftig an den festen Spalten, nach rechts auslaufend. Pro Zelle ein Stück des Verlaufs, damit
 * er in allen Browsern durchgehend aussieht.
 */
const FADE_CELLS = 3
const alphaAt = (i: number) => (i >= FADE_CELLS ? 0.04 : 0.24 - (0.2 * i) / FADE_CELLS)
const meCell = (i: number) => ({
  background: `linear-gradient(90deg, rgba(59,188,74,${alphaAt(i).toFixed(3)}), rgba(59,188,74,${alphaAt(i + 1).toFixed(3)}))`,
})

export interface Column<T> {
  key: string
  label: string
  /** Erklärung beim Darüberfahren */
  title?: string
  /** Wert zum Sortieren (und zur Anzeige, wenn `render` fehlt) */
  value: (row: T) => number | string | null
  render?: (row: T) => ReactNode
  /** Kleiner ist besser (z. B. Pace, Abflüge) – erste Sortierung aufsteigend */
  asc?: boolean
  left?: boolean
  /** Hervorgehobene Spalte (z. B. Elo) */
  strong?: boolean
}

/**
 * Tabelle, die seitlich scrollt. Platz (#) und Bild bleiben links stehen, ein Tipp auf eine
 * Spaltenüberschrift sortiert danach (nochmal tippen dreht die Reihenfolge).
 */
export function DataTable<T>({
  rows,
  columns,
  rank,
  picture,
  rowKey,
  onRowClick,
  highlight,
  label,
}: {
  rows: T[]
  columns: Column<T>[]
  rank: (row: T) => number | null
  picture: (row: T) => ReactNode
  rowKey: (row: T) => string
  onRowClick: (row: T) => void
  highlight?: (row: T) => boolean
  label: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: '#', dir: 1 })
  const [scrolled, setScrolled] = useState(false)
  const col = columns.find((c) => c.key === sort.key)
  const sorted = [...rows].sort((a, b) => {
    const va = col ? col.value(a) : rank(a)
    const vb = col ? col.value(b) : rank(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de')
    return d * sort.dir
  })
  const pick = (key: string, asc?: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === '#' || asc ? 1 : -1 }))
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? ' ▴' : ' ▾') : '')
  const ariaSort = (key: string) => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined)

  return (
    <div className="card dt-card">
      <div className={`dt-scroll${scrolled ? ' scrolled' : ''}`} onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 2)}>
        <table className="dt" aria-label={label}>
          <thead>
            <tr>
              <th className="st0" aria-sort={ariaSort('#')}>
                <button onClick={() => pick('#')}>#{arrow('#')}</button>
              </th>
              <th className="st1">
                <span className="sr-only">Bild</span>
              </th>
              {columns.map((c) => (
                <th key={c.key} className={`${c.left ? 'left' : ''}${sort.key === c.key ? ' sorted' : ''}`} title={c.title} aria-sort={ariaSort(c.key)}>
                  <button onClick={() => pick(c.key, c.asc)}>
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const rk = rank(r)
              const me = highlight?.(r) ?? false
              return (
                <tr key={rowKey(r)} className={me ? 'me-row' : undefined} onClick={() => onRowClick(r)}>
                  <td className="st0">{rk != null ? <Rank rank={rk} /> : <span className="rank">–</span>}</td>
                  <td className="st1">{picture(r)}</td>
                  {columns.map((c, i) => (
                    <td key={c.key} className={`${c.left ? 'left' : ''}${c.strong ? ' strong' : ''}`} style={me ? meCell(i) : undefined}>
                      {c.render ? c.render(r) : (c.value(r) ?? '–')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
