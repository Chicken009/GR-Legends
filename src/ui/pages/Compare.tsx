import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PLACEMENT_RUNS } from '../../domain/model'
import { carKey, duelDelta, winChances } from '../../domain/rating'
import { CarThumb } from '../CarPhoto'
import { RadarChart } from '../charts/RadarChart'
import { AREA, ME, SERIES } from '../colors'
import { Avatar, carPath, driverPath, Segment, Sheet, useData, useMyName } from '../components'
import { ChevronDown, ChevronLeft } from '../icons'
import { fmtDelta, fmtElo, fmtGapSec, fmtNum, fmtPct, formatTime } from '../format'

type Kind = 'fahrer' | 'auto'

interface Metric {
  label: string
  a: number | null
  b: number | null
  format: (v: number | null) => string
  /** kleiner ist besser */
  lower?: boolean
}

const signed = (v: number | null | undefined) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`)

export function Compare() {
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const kind: Kind = params.get('typ') === 'auto' ? 'auto' : 'fahrer'
  const all = model.stats('all')
  const ranking = model.ranking('all')
  const driverNames = ranking.map((r) => r.name)
  const carNames = [...all.cars.values()].filter((c) => c.races > 0 || c.qualis > 0).sort((x, y) => y.races - x.races || y.qualis - x.qualis).map((c) => c.name)
  const names = kind === 'fahrer' ? driverNames : carNames
  const a = names.includes(params.get('a') ?? '') ? params.get('a')! : kind === 'fahrer' ? (me ?? names[0]) : names[0]
  const b = names.includes(params.get('b') ?? '') && params.get('b') !== a ? params.get('b')! : (names.find((n) => n !== a) ?? '')
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }
  const colorA = kind === 'fahrer' && a === me ? ME : SERIES[0]
  const colorB = kind === 'fahrer' && b === me ? ME : SERIES[1]
  const track = model.tracks[0]
  const carRating = (car: string) => model.rating.cars.get(carKey(track, car)) ?? 0
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/fahrer'))

  const driverOptions = driverNames.map((n) => {
    const r = ranking.find((x) => x.name === n)!
    return { value: n, label: n, sub: model.placement(n) != null ? `Rang ${r.rank} · Einstufung ${model.placement(n)}/${PLACEMENT_RUNS}` : `Rang ${r.rank} · ${fmtElo(r.elo)} Elo`, visual: <Avatar name={n} size={34} ring={n === me ? 'var(--me)' : undefined} /> }
  })
  const carOptions = carNames.map((n) => {
    const c = all.cars.get(n)!
    return { value: n, label: n, sub: `${c.races} Rennen · Best ${formatTime(c.bestLapMs)}`, visual: <CarThumb car={n} size={40} /> }
  })

  let metrics: Metric[] = []
  let chance: { a: number; b: number; note: string } | null = null
  let h2h: [number, number] | null = null
  let carA = ''
  let carB = ''

  if (kind === 'fahrer') {
    const da = all.drivers.get(a)
    const db = all.drivers.get(b)
    carA = carNames.includes(params.get('autoA') ?? '') ? params.get('autoA')! : (da?.favoriteCar ?? carNames[0])
    carB = carNames.includes(params.get('autoB') ?? '') ? params.get('autoB')! : (db?.favoriteCar ?? carNames[0])
    const wc = winChances([
      { name: 'a', strength: (model.rating.drivers.get(a) ?? 0) + carRating(carA) },
      { name: 'b', strength: (model.rating.drivers.get(b) ?? 0) + carRating(carB) },
    ])
    chance = { a: wc.get('a')!, b: wc.get('b')!, note: `${a} im ${carA} gegen ${b} im ${carB}` }
    h2h = da?.h2h.get(b) ?? [0, 0]
    metrics = [
      { label: 'Elo', a: model.rating.drivers.get(a) ?? null, b: model.rating.drivers.get(b) ?? null, format: fmtElo },
      { label: 'Rennen', a: da?.races ?? 0, b: db?.races ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siege', a: da?.wins ?? 0, b: db?.wins ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siegquote', a: da?.races ? da.wins / da.races : null, b: db?.races ? db.wins / db.races : null, format: (v) => fmtPct(v) },
      { label: 'Ø Platz', a: da?.avgPosition ?? null, b: db?.avgPosition ?? null, format: (v) => fmtNum(v), lower: true },
      { label: 'Ø Gegner geschlagen', a: da?.beatShare ?? null, b: db?.beatShare ?? null, format: (v) => fmtPct(v) },
      { label: 'Bestzeit', a: da?.bestLapMs ?? null, b: db?.bestLapMs ?? null, format: (v) => formatTime(v), lower: true },
      { label: 'Pace', a: da?.paceGap ?? null, b: db?.paceGap ?? null, format: fmtGapSec, lower: true },
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
      { label: 'Autowertung', a: ca?.rating ?? null, b: cb?.rating ?? null, format: signed },
      { label: 'Rennen', a: ca?.races ?? 0, b: cb?.races ?? 0, format: (v) => fmtNum(v, 0) },
      { label: 'Siegquote', a: ca?.winRate ?? null, b: cb?.winRate ?? null, format: (v) => fmtPct(v) },
      { label: 'Ø Platz', a: ca?.avgPosition ?? null, b: cb?.avgPosition ?? null, format: (v) => fmtNum(v), lower: true },
      { label: 'Ø Gegner geschlagen', a: ca?.beatShare ?? null, b: cb?.beatShare ?? null, format: (v) => fmtPct(v) },
      { label: 'Bestzeit', a: ca?.bestLapMs ?? null, b: cb?.bestLapMs ?? null, format: (v) => formatTime(v), lower: true },
      { label: 'Tempo (bereinigt)', a: ca?.tempo ?? null, b: cb?.tempo ?? null, format: fmtGapSec, lower: true },
      { label: 'Abflüge/100 (bereinigt)', a: ca?.crashRate ?? null, b: cb?.crashRate ?? null, format: (v) => fmtNum(v), lower: true },
      { label: 'Streuung der Fahrer', a: ca?.spread ?? null, b: cb?.spread ?? null, format: (v) => fmtPct(v, 1), lower: true },
      { label: 'Kilometer', a: ca?.km ?? null, b: cb?.km ?? null, format: (v) => fmtNum(v) },
    ]
  }

  const options = kind === 'fahrer' ? driverOptions : carOptions
  // Ist das gewählte Auto das meistgefahrene, heißt es „Favorit“
  const carLabel = (driver: string, car: string) => (all.drivers.get(driver)?.favoriteCar === car ? `Favorit von ${driver}` : `Fahrer ${driver}`)
  const pathOf = (n: string) => (kind === 'fahrer' ? driverPath(n) : carPath(n))

  return (
    <div className="page" style={{ ['--accent' as string]: AREA.drivers, maxWidth: 760 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="icon-btn" aria-label="Zurück" onClick={back}>
          <ChevronLeft color={AREA.drivers} />
        </button>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: AREA.drivers, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>Vergleich</h1>
      </header>
      <Segment label="Was vergleichen" value={kind} onChange={(v) => setParams(new URLSearchParams({ typ: v }), { replace: true })} options={[['fahrer', 'Fahrer'], ['auto', 'Fahrzeuge']]} />

      <div className="grid-2">
        <Picker label="Erster" value={a} color={colorA} options={options.filter((o) => o.value !== b)} onChange={(v) => set({ a: v, autoA: null })} />
        <Picker label="Zweiter" value={b} color={colorB} options={options.filter((o) => o.value !== a)} onChange={(v) => set({ b: v, autoB: null })} />
        {kind === 'fahrer' && (
          <>
            <Picker label={carLabel(a, carA)} value={carA} color="#2A2F38" options={carOptions} onChange={(v) => set({ autoA: v })} small />
            <Picker label={carLabel(b, carB)} value={carB} color="#2A2F38" options={carOptions} onChange={(v) => set({ autoB: v })} small />
          </>
        )}
      </div>
      <div className="grid-2" style={{ marginTop: -4 }}>
        <Link to={pathOf(a)} state={kind === 'fahrer' ? { bg: location } : undefined} style={{ fontSize: 12, color: 'var(--muted)' }}>
          Profil {a} ›
        </Link>
        <Link to={pathOf(b)} state={kind === 'fahrer' ? { bg: location } : undefined} style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
          Profil {b} ›
        </Link>
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

      {kind === 'fahrer' && <WhatIf a={a} b={b} carA={carA} carB={carB} colorA={colorA} colorB={colorB} />}
      {kind === 'auto' && (
        <section className="card" style={{ gap: 8 }}>
          <span className="card-title">Auto-Bonus in der Wertung</span>
          <CarBonus a={a} b={b} rA={carRating(a)} rB={carRating(b)} colorA={colorA} colorB={colorB} />
        </section>
      )}
      {kind === 'auto' && all.cars.get(a)?.radar.length && all.cars.get(b)?.radar.length ? (
        <section className="card" style={{ gap: 8 }}>
          <span className="card-title">Eigenschaften</span>
          <RadarChart
            series={[
              { name: a, color: colorA, axes: all.cars.get(a)!.radar },
              { name: b, color: colorB, axes: all.cars.get(b)!.radar },
            ]}
            label={`Eigenschaften ${a} gegen ${b}`}
          />
          <div className="legend">
            <span><span style={{ width: 10, height: 10, borderRadius: 3, background: colorA }} />{a}</span>
            <span><span style={{ width: 10, height: 10, borderRadius: 3, background: colorB }} />{b}</span>
            <span>außen = besser · gestrichelt = Ø Auto · Punkte antippen</span>
          </div>
        </section>
      ) : null}

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
              {!m.lower && m.label !== 'Autowertung' && (
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

/** Autowertung beider Autos und ihr Unterschied (aus gerundeten Werten, damit die Zahlen zusammenpassen) */
function CarBonus({ a, b, rA, rB, colorA, colorB }: { a: string; b: string; rA: number; rB: number; colorA: string; colorB: string }) {
  const ra = Math.round(rA)
  const rb = Math.round(rB)
  const diff = Math.abs(ra - rb)
  const stronger = ra > rb ? a : b
  const weaker = ra > rb ? b : a
  const row = (name: string, v: number, color: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
      <span style={{ fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span className="num" style={{ fontWeight: 700, color: v >= 0 ? '#7BDB8A' : '#FF8A7A' }}>{signed(v)}</span>
    </div>
  )
  return (
    <>
      {row(a, ra, colorA)}
      {row(b, rb, colorB)}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, borderTop: '1px solid var(--grid)', paddingTop: 8 }}>
        <span style={{ color: 'var(--muted)' }}>Unterschied</span>
        <span className="num" style={{ fontWeight: 700 }}>{diff === 0 ? 'gleich stark' : `${diff} Punkte für ${stronger}`}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        Die Autowertung wird zur Elo des Fahrers addiert. {diff > 0 ? `Wer im ${weaker} gegen jemanden im ${stronger} gewinnt, bekommt deshalb mehr Elo.` : 'Keins der beiden Autos bringt einen Vorteil.'}
      </p>
    </>
  )
}

/** Auto-Bonus und hypothetische Elo-Änderung für ein Rennen zu zweit */
function WhatIf({ a, b, carA, carB, colorA, colorB }: { a: string; b: string; carA: string; carB: string; colorA: string; colorB: string }) {
  const { model } = useData()
  const track = model.tracks[0]
  const carR = (car: string) => model.rating.cars.get(carKey(track, car)) ?? 0
  const eloA = model.rating.drivers.get(a) ?? 0
  const eloB = model.rating.drivers.get(b) ?? 0
  const sA = eloA + carR(carA)
  const sB = eloB + carR(carB)
  const runsA = model.rating.history.get(a)?.length ?? 0
  const runsB = model.rating.history.get(b)?.length ?? 0
  const outcomes: [string, number][] = [
    ['Sieg mit 1 Runde Vorsprung', 1],
    ['Knapper Sieg', 0.03],
    ['Knappe Niederlage', -0.03],
    ['Niederlage mit 1 Runde Rückstand', -1],
  ]
  const cell = (v: number) => (
    <span className="num" style={{ fontWeight: 700, color: v > 0.5 ? '#7BDB8A' : v < -0.5 ? '#FF8A7A' : 'var(--muted)' }}>
      {fmtDelta(v)}
    </span>
  )
  return (
    <section className="card" style={{ gap: 10 }}>
      <div className="card-head">
        <span className="card-title">Was wäre wenn?</span>
        <span className="hint">Rennen zu zweit</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px 12px', alignItems: 'center', fontSize: 13 }}>
        <span />
        <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>Elo</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>Auto-Bonus</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>Stärke</span>
        {[
          [a, carA, eloA, colorA],
          [b, carB, eloB, colorB],
        ].map(([n, car, elo, color]) => (
          <div key={n as string} style={{ display: 'contents' }}>
            <span style={{ fontWeight: 600, color: color as string, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n as string} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {car as string}</span>
            </span>
            <span className="num" style={{ textAlign: 'right' }}>{fmtElo(elo as number)}</span>
            <span className="num" style={{ textAlign: 'right', color: carR(car as string) >= 0 ? '#7BDB8A' : '#FF8A7A' }}>{signed(carR(car as string))}</span>
            <span className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtElo(Math.round(elo as number) + Math.round(carR(car as string)))}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 16px', alignItems: 'center', fontSize: 13, borderTop: '1px solid var(--grid)', paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ergebnis für {a}</span>
        <span style={{ fontSize: 11, color: colorA, textAlign: 'right', fontWeight: 600 }}>{a.split(' ')[0]}</span>
        <span style={{ fontSize: 11, color: colorB, textAlign: 'right', fontWeight: 600 }}>{b.split(' ')[0]}</span>
        {outcomes.map(([label, margin]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--text-2)' }}>{label}</span>
            <span style={{ textAlign: 'right' }}>{cell(duelDelta(sA, sB, margin, runsA))}</span>
            <span style={{ textAlign: 'right' }}>{cell(duelDelta(sB, sA, -margin, runsB))}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        Stärke = Elo + Auto-Bonus. Je größer der Abstand im Ziel, desto mehr Punkte. Bei mehr Fahrern verteilt sich das auf alle Duelle im Rennen.
        {Math.abs(sA - sB) > 10 && ' Als Außenseiter bringt sogar eine knappe Niederlage Punkte – weil sie besser ist als erwartet.'}
        {(runsA < 5 || runsB < 5) && ' Fahrer mit weniger als 5 Läufen bewegen sich doppelt so stark.'}
      </p>
    </section>
  )
}

interface Option {
  value: string
  label: string
  sub: string
  visual: ReactNode
}

/** Auswahl mit Bild (Profilbild bzw. Autofoto), öffnet eine Liste von unten */
function Picker({ label, value, options, onChange, color, small }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; color: string; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${value} – ändern`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: small ? 48 : 56,
          padding: '6px 10px',
          borderRadius: 14,
          border: `1px solid ${color}`,
          background: 'var(--card)',
          textAlign: 'left',
          minWidth: 0,
          boxShadow: 'var(--sh2)',
        }}
      >
        {current?.visual}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: small ? 13 : 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
          {small && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>}
        </span>
        <ChevronDown />
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} label={label}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>{label}</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                aria-pressed={o.value === value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 54,
                  padding: '6px 12px',
                  borderRadius: 14,
                  border: `2px solid ${o.value === value ? 'rgba(59,188,74,.5)' : 'transparent'}`,
                  background: 'var(--inner-2)',
                  textAlign: 'left',
                  flexShrink: 0,
                }}
              >
                {o.visual}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
