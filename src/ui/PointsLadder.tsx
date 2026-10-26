import { fmtNum } from './format'

/** Punkte je Platz als Treppe: Platz 1 links, Balkenhöhe nach Punkten (Saison und Wettkampf gleich) */
export function PointsLadder({ points, color, label }: { points: number[]; color: string; label: string }) {
  const max = Math.max(1, ...points)
  return (
    <div className="points-ladder" role="img" aria-label={`${label}: ${points.map((p, i) => `Platz ${i + 1} ${fmtNum(p, 1)}`).join(', ')}`}>
      {points.map((p, i) => (
        <span key={i} className="step">
          <b className="num">{fmtNum(p, Number.isInteger(p) ? 0 : 1)}</b>
          <span className="bar" style={{ height: Math.max(4, (p / max) * 56), background: color, opacity: 1 - i * (0.5 / Math.max(1, points.length - 1)) }} />
          <span className="place">{i + 1}.</span>
        </span>
      ))}
    </div>
  )
}

/** Kleiner Baustein „Symbol/Wert + Text“, z. B. „×2 Finale“ oder „+2 Schnellste Runde“ */
export function RuleChip({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <span className="rule-chip">
      <b className="num" style={{ color }}>
        {value}
      </b>
      {label}
    </span>
  )
}
