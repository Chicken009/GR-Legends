/** Mini-Liniendiagramm ohne Achsen: vereinfachte Entwicklung, letzter Punkt hervorgehoben */
export function Sparkline({ values, color, width = 56, height = 22, label }: { values: (number | null)[]; color: string; width?: number; height?: number; label: string }) {
  const pts = values.map((v, i) => (v != null ? ([i, v] as const) : null)).filter((p): p is readonly [number, number] => p != null)
  if (pts.length < 2) return <span style={{ display: 'inline-block', width, height, flexShrink: 0 }} aria-hidden="true" />
  const n = Math.max(1, values.length - 1)
  const lo = Math.min(0, ...pts.map((p) => p[1]))
  const hi = Math.max(...pts.map((p) => p[1]))
  const x = (i: number) => 2 + (i / n) * (width - 6)
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const [li, lv] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} role="img" aria-label={label} style={{ flexShrink: 0, overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={x(li)} cy={y(lv)} r="2.6" fill={color} />
    </svg>
  )
}
