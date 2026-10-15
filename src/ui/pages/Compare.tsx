import { useSearchParams } from 'react-router-dom'
import { carKey, winChances } from '../../domain/rating'
import { AREA, ME, SERIES } from '../colors'
import { PageHead, Segment, useData, useMyName } from '../components'
import { fmtElo, fmtNum, fmtPct, formatTime } from '../format'

type Kind = 'fahrer' | 'auto'

interface Metric {
  label: string
  a: number | null
  b: number | null
  format: (v: number | null) => string
  /** kleiner ist besser */
  lower?: boolean
}

export function Compare() {
  const { model } = useData()
  const me = useMyName()
  const [params, setParams] = useSearchParams()
  const kind: Kind = params.get('typ') === 'auto' ? 'auto' : 'fahrer'
  const all = model.stats('all')
  const ranking = model.ranking('all')
  const driverNames = ranking.map((r) => r.name)
  const carNames = [...all.cars.values()].filter((c) => c.races > 0).sort((x, y) => y.races - x.races).map((c) => c.name)
  const names = kind === 'fahrer' ? driverNames : carNames
  const a = names.includes(params.get('a') ?? '') ? params.get('a')! : (kind === 'fahrer' ? me ?? names[0] : names[0])
  const b = names.includes(params.get('b') ?? '') && params.get('b') !== a ? params.get('b')! : names.find((n) => n !== a) ?? ''
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }
  const colorA = a === me ? ME : SERIES[0]
  const colorB = b === me ? ME : SERIES[1]
  const track = model.tracks[0]

  let metrics: Metric[] = []
  let chance: { a: number; b: number; note: string } | null = null
  let h2h: [number, number] | null = null
  let carPick: { carA: string; carB: string; options: string[] } | null = null

  if (kind === 'fahrer') {
    const da = all.drivers.get(a)
    const db = all.drivers.get(b)
    const carA = params.get('autoA') ?? da?.favoriteCar ?? carNames[0]
    const carB = params.get('autoB') ?? db?.favoriteCar ?? carNames[0]
    carPick = { carA, carB, options: carNames }
    const strength = (driver: string, car: string) => (model.rating.drivers.get(driver) ?? 0) + (model.rating.cars.get(carKey(track, car)) ?? 0)
    const wc = winChances([
      { name: 'a', strength: strength(a, carA) },
      { name: 'b', strength: strength(b, carB) },
    ])
    chance = { a: wc.get('a')!, b: wc.get('b')!, note: `${a} im ${carA} gegen ${b} im ${carB}` }
    h2h = da?.h2h.get(b) ?? [0, 0]
    metrics = [
      { label: 'Elo', a: model.rating.drivers.get(a) ?? null, b: model.rating.drivers.get(b) ?? null, format: fmtElo },
      { label: 'Rennen', a: da?.races ?? 0, b: db?.races ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siege', a: da?.wins ?? 0, b: db?.wins ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siegquote', a: da?.races ? da.wins / da.races : null, b: db?.races ? db.wins / db.races : null, format: (v) => fmtPct(v) },
      { label: 'Gegner geschlagen', a: da?.beatShare ?? null, b: db?.beatShare ?? null, format: (v) => fmtPct(v) },
      { label: 'Bestzeit', a: da?.bestLapMs ?? null, b: db?.bestLapMs ?? null, format: (v) => formatTime(v), lower: true },
      { label: 'Pace', a: da?.pace ?? null, b: db?.pace ?? null, format: (v) => (v == null ? '–' : `${fmtNum(v)} %`), lower: true },
      { label: 'Streuung', a: da?.precision ?? null, b: db?.precision ?? null, format: (v) => fmtPct(v, 1), lower: true },
      { label: 'Abflüge / 100 Runden', a: da?.crashRate ?? null, b: db?.crashRate ?? null, format: (v) => fmtNum(v), lower: true },
      { label: 'Kilometer', a: da?.km ?? null, b: db?.km ?? null, format: (v) => fmtNum(v) },
    ]
  } else {
    const ca = all.cars.get(a)
    const cb = all.cars.get(b)
    const wc = winChances([
      { name: 'a', strength: ca?.rating ?? 0 },
      { name: 'b', strength: cb?.rating ?? 0 },
    ])
    chance = { a: wc.get('a')!, b: wc.get('b')!, note: 'bei gleich starken Fahrern' }
    metrics = [
      { label: 'Autowertung', a: ca?.rating ?? null, b: cb?.rating ?? null, format: (v) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`) },
      { label: 'Rennen', a: ca?.races ?? 0, b: cb?.races ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siegquote', a: ca?.winRate ?? null, b: cb?.winRate ?? null, format: (v) => fmtPct(v) },
      { label: 'Gegner geschlagen', a: ca?.beatShare ?? null, b: cb?.beatShare ?? null, format: (v) => fmtPct(v) },
      { label: 'Bestzeit', a: ca?.bestLapMs ?? null, b: cb?.bestLapMs ?? null, format: (v) => formatTime(v), lower: true },
      { label: 'Pace', a: ca?.pace ?? null, b: cb?.pace ?? null, format: (v) => (v == null ? '–' : `${fmtNum(v)} %`), lower: true },
      { label: 'Streuung der Fahrer', a: ca?.spread ?? null, b: cb?.spread ?? null, format: (v) => fmtPct(v, 1), lower: true },
      { label: 'Kilometer', a: ca?.km ?? null, b: cb?.km ?? null, format: (v) => fmtNum(v) },
    ]
  }

  const select = (value: string, onChange: (v: string) => void, color: string, label: string, options = names) => (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', borderColor: color, color: 'var(--text)', fontWeight: 600 }}>
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )

  return (
    <div className="page" style={{ ['--accent' as string]: AREA.drivers, maxWidth: 760 }}>
      <PageHead title="Vergleich" color={AREA.drivers} />
      <Segment label="Was vergleichen" value={kind} onChange={(v) => setParams(new URLSearchParams({ typ: v }), { replace: true })} options={[['fahrer', 'Fahrer'], ['auto', 'Fahrzeuge']]} />
      <div className="grid-2">
        {select(a, (v) => set({ a: v, autoA: null }), colorA, 'Erster')}
        {select(b, (v) => set({ b: v, autoB: null }), colorB, 'Zweiter')}
        {carPick && (
          <>
            {select(carPick.carA, (v) => set({ autoA: v }), '#2A2F38', `Auto von ${a}`, carPick.options)}
            {select(carPick.carB, (v) => set({ autoB: v }), '#2A2F38', `Auto von ${b}`, carPick.options)}
          </>
        )}
      </div>

      {chance && (
        <section className="card">
          <div className="card-head">
            <span className="card-title">Siegchance im direkten Duell</span>
            <span className="hint">aus der Wertung</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="num" style={{ fontSize: 34, fontWeight: 800, color: colorA }}>
              {fmtPct(chance.a)}
            </span>
            <span className="num" style={{ fontSize: 34, fontWeight: 800, color: colorB }}>
              {fmtPct(chance.b)}
            </span>
          </div>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <div style={{ width: `${chance.a * 100}%`, background: colorA }} />
            <div style={{ flex: 1, background: colorB }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {chance.note}
            {h2h && h2h[0] + h2h[1] > 0 ? ` · bisher ${h2h[0]} : ${h2h[1]} in gemeinsamen Rennen` : h2h ? ' · noch nie gegeneinander gefahren' : ''}
          </span>
        </section>
      )}

      <section className="card" style={{ gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <span style={{ color: colorA, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
          <span />
          <span style={{ color: colorB, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
        </div>
        {metrics.map((m) => {
          const better = m.a == null || m.b == null || m.a === m.b ? 0 : (m.lower ? m.a < m.b : m.a > m.b) ? -1 : 1
          const total = Math.abs(m.a ?? 0) + Math.abs(m.b ?? 0)
          const share = total > 0 && m.a != null && m.b != null && m.a >= 0 && m.b >= 0 ? m.a / total : 0.5
          return (
            <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'baseline' }}>
                <span className="num" style={{ fontSize: 15, fontWeight: better === -1 ? 800 : 500, color: better === -1 ? colorA : 'var(--text-2)' }}>
                  {m.format(m.a)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{m.label}</span>
                <span className="num" style={{ fontSize: 15, fontWeight: better === 1 ? 800 : 500, color: better === 1 ? colorB : 'var(--text-2)', textAlign: 'right' }}>
                  {m.format(m.b)}
                </span>
              </div>
              {!m.lower && (
                <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 2, opacity: 0.8 }}>
                  <div style={{ width: `${share * 100}%`, background: colorA }} />
                  <div style={{ flex: 1, background: colorB }} />
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
