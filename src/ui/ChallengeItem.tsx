import type { ReactNode } from 'react'
import { CHALLENGE_XP, type Challenge } from '../domain/challenges'

/** Nach Erfüllung sortiert: geschafft zuerst, dann nach Fortschritt */
export const byProgress = (a: Challenge, b: Challenge) => b.value / b.target - a.value / a.target

/** Eine Saison-Challenge: Fortschritt links, rechts die XP – gestrichelt offen, farbig geschafft */
export function ChallengeItem({ c, accent, showProgress = true, footer }: { c: Challenge; accent: string; showProgress?: boolean; footer?: ReactNode }) {
  return (
    <div className="inner" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</span>
          {showProgress && (
            <span className="num" style={{ fontSize: 12, color: c.done ? accent : 'var(--muted)', flexShrink: 0 }}>
              {c.value} / {c.target}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{c.detail}</span>
        {showProgress && (
          <span className="bar" style={{ width: '100%', height: 6 }}>
            <span style={{ width: `${(c.value / c.target) * 100}%`, borderRadius: 3, background: c.done ? accent : '#5B6573' }} />
          </span>
        )}
        {footer}
      </div>
      <span
        aria-label={c.done ? `${CHALLENGE_XP} XP erhalten` : `bringt ${CHALLENGE_XP} XP`}
        title={c.done ? `${CHALLENGE_XP} XP erhalten` : `bringt ${CHALLENGE_XP} XP`}
        style={{
          width: 46, height: 46, borderRadius: 23, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: c.done ? `2px solid ${accent}` : '2px dashed #4A515C',
          background: c.done ? accent : 'transparent',
          color: c.done ? '#0E1013' : 'var(--muted)',
          lineHeight: 1,
        }}
      >
        <span className="num" style={{ fontSize: 13, fontWeight: 800 }}>+{CHALLENGE_XP}</span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>XP</span>
      </span>
    </div>
  )
}
