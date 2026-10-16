import type { Tip } from '../domain/model'
import { BulbIcon, StrokeIcon } from './icons'
import { useSwipePager } from './useSwipePager'

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'

/** Tipps zum seitlichen Durchwischen, mit Punkten zum Springen */
export function TipCarousel({ tips, accent }: { tips: Tip[]; accent: string }) {
  const { index, go, viewportProps, trackProps } = useSwipePager(tips.length)
  if (tips.length === 0) return null
  return (
    <section className="inner tips" style={{ padding: 0, gap: 0, boxShadow: `inset 3px 0 0 ${accent}, var(--sh2)` }} aria-roledescription="Karussell" aria-label="Tipps">
      <div {...viewportProps}>
        <div {...trackProps}>
          {tips.map((t, i) => (
            <div key={i} className="tips-slide" role="group" aria-roledescription="Tipp" aria-label={`${i + 1} von ${tips.length}: ${t.title}`}>
              <span style={{ flexShrink: 0 }}>{t.good ? <StrokeIcon d={STAR} color="#F6C83C" /> : <BulbIcon color={accent} />}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {t.good ? 'Stark' : 'Tipp'} · {t.title}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>{t.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {tips.length > 1 && (
        <div className="tips-dots">
          {tips.map((t, i) => (
            <button key={i} aria-label={`Tipp ${i + 1}: ${t.title}`} aria-current={i === index} onClick={() => go(i)} style={{ background: i === index ? accent : '#3A404A', width: i === index ? 16 : 6 }} />
          ))}
        </div>
      )}
    </section>
  )
}
