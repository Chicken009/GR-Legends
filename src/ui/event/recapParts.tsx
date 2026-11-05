import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { QuizQuestion } from '../../domain/event/recap'
import { ME } from '../colors'
import { Avatar } from '../components'
import { reduced, useStoryCard } from '../story'

/**
 * Bausteine für den Wettkampf-Rückblick: Inhalte erscheinen nacheinander, Rennen laufen als
 * Animation ab, Auszeichnungen werden umgedreht. Jede Animation startet, sobald ihre Karte vorn ist,
 * und beim nächsten Besuch von vorn; mit reduzierter Bewegung steht gleich das Ergebnis da.
 */

const you = (n: string, me: string | null | undefined) => (n === me ? 'Du' : n)
const meStyle = (n: string, me: string | null | undefined): CSSProperties | undefined => (n === me ? { color: ME, fontWeight: 700 } : undefined)
const MEDAL = ['var(--gold)', 'var(--silver)', 'var(--bronze)']
const medal = (place: number) => MEDAL[place - 1]

// ---- Nacheinander einblenden ------------------------------------------------------------------

/** Rahmen: Kinder vom Typ `Item` erscheinen nacheinander, sobald die Karte vorn ist */
export function Staged({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { active, epoch } = useStoryCard()
  return (
    <div key={epoch} className={`stg${active ? ' go' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'inherit', ...style }}>
      {children}
    </div>
  )
}

export function Item({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="stg-i" style={{ ['--d' as string]: `${delay}ms`, ...style }}>
      {children}
    </div>
  )
}

/** Podest, dessen Stufen nacheinander aufsteigen: erst Platz 3, dann 2, zuletzt der Sieger */
export function StagedPodium({ children }: { children: ReactNode }) {
  const { active, epoch } = useStoryCard()
  return (
    <div key={epoch} className={`podium-stg${active ? ' go' : ''}`}>
      {children}
    </div>
  )
}

/** true im ersten Rendern, nachdem die Karte nach vorn gekommen ist (Zustand dann zurücksetzen) */
function useArrived(): boolean {
  const { active, epoch } = useStoryCard()
  const [seen, setSeen] = useState<number | null>(null)
  const arrived = active && seen !== epoch
  if (arrived) setSeen(epoch)
  return arrived
}

// ---- Zeitleiste -----------------------------------------------------------------------------

/** Fortschritt 0–1 einer Animation; startet, wenn die Karte vorn ist, mit Pause und Wiederholen */
function useTimeline(duration: number) {
  const { active, epoch } = useStoryCard()
  const still = reduced()
  const [p, setP] = useState(still ? 1 : 0)
  const [playing, setPlaying] = useState(false)
  const [run, setRun] = useState(0)
  const pRef = useRef(p)
  if (useArrived() && !still) {
    setP(0)
    setPlaying(false)
  }
  useEffect(() => {
    if (!active || still) return
    pRef.current = 0
    // kurz stehen lassen, dann los
    const t = setTimeout(() => setPlaying(true), 450)
    return () => clearTimeout(t)
  }, [active, epoch, run, still])
  useEffect(() => {
    if (!playing || !active) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const next = Math.min(1, pRef.current + (now - last) / duration)
      last = now
      pRef.current = next
      setP(next)
      if (next < 1) raf = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, active, duration])
  return {
    p,
    playing,
    toggle: () => setPlaying((x) => !x),
    replay: () => {
      pRef.current = 0
      setP(0)
      setPlaying(false)
      setRun((r) => r + 1)
    },
  }
}

const PLAY = 'M8 5v14l11-7z'
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'
const AGAIN = 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5'

function Controls({ playing, done, toggle, replay }: { playing: boolean; done: boolean; toggle: () => void; replay: () => void }) {
  const btn: CSSProperties = { minHeight: 32, minWidth: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button className="btn round" style={btn} onClick={done ? replay : toggle} aria-label={done ? 'Noch einmal abspielen' : playing ? 'Anhalten' : 'Weiter abspielen'}>
        <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
          {done ? <path d={AGAIN} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /> : <path d={playing ? PAUSE : PLAY} fill="currentColor" />}
        </svg>
        {done ? 'Nochmal' : playing ? 'Pause' : 'Start'}
      </button>
    </span>
  )
}

// ---- Rennen auf Spuren (Variante B) bzw. Rangliste (Variante A) -------------------------------

export interface LaneFrame {
  name: string
  /** Weg bis zur Ziellinie, 0–1 */
  x: number
  rank: number
  /** Platz als Kommazahl (für die Rangliste: Zeilen gleiten) */
  pos: number
  crash?: boolean
  /** Wert rechts in der Rangliste */
  value?: string
}

/** Bis so viele Fahrer passen die Spuren in die Karte, darüber wird es eine Rangliste */
const MAX_LANES = 10
const ROWS_SHOWN = 8
/** So lange bleibt „Führungswechsel!“ stehen (ms) */
const FLASH_MS = 2200

/** Wann (Fortschritt 0–1) wer die Führung übernimmt – Gleichstand an der Spitze zählt nicht als Wechsel */
function leadChanges(frame: (p: number) => LaneFrame[]): { p: number; name: string }[] {
  const out: { p: number; name: string }[] = []
  let last: string | null = null
  for (let i = 1; i <= 400; i++) {
    const q = i / 400
    const top = frame(q).filter((r) => r.rank === 1)
    if (top.length !== 1) continue
    if (last && top[0].name !== last) out.push({ p: q, name: top[0].name })
    last = top[0].name
  }
  return out
}

/**
 * Rennen zum Zuschauen: Jeder Fahrer hat eine Spur, sein Avatar fährt Richtung Ziellinie, der Platz
 * steht daneben. Bei mehr als zehn Fahrern gleiten stattdessen die Zeilen einer Rangliste.
 */
export function LaneRace({ names, frame, duration, me, label, after, crashes }: { names: string[]; frame: (p: number) => LaneFrame[]; duration: number; me: string | null; label: (p: number) => ReactNode; after?: ReactNode; crashes?: boolean }) {
  // Leinwand: fertig, bevor die nächste Karte kommt
  const { auto } = useStoryCard()
  const ms = auto ? Math.min(duration, 8000) : duration
  const { p, playing, toggle, replay } = useTimeline(ms)
  const rows = frame(p)
  const by = new Map(rows.map((r) => [r.name, r]))
  // Letzter Führungswechsel bis jetzt; bleibt gut zwei Sekunden stehen (die Karte wird nicht neu gebaut, solange sie läuft)
  const changes = useMemo(() => leadChanges(frame), [frame])
  const flash = [...changes].reverse().find((c) => c.p <= p && p - c.p < FLASH_MS / ms) ?? null
  const lanes = names.length <= MAX_LANES
  const laneH = names.length <= 6 ? 36 : names.length <= 8 ? 31 : 27
  const car = laneH - 8
  const done = p >= 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 32 }}>
        <span className="num" style={{ fontSize: 14, fontWeight: 800 }}>
          {label(p)}
        </span>
        <Controls playing={playing} done={done} toggle={toggle} replay={replay} />
      </div>
      {/* fester Platz, damit nichts springt */}
      <div style={{ minHeight: 26, marginTop: -4, display: 'flex', alignItems: 'center' }} aria-live="polite">
        {flash && (
          <span key={flash.p} className="lead-flash" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#14181D', background: 'var(--gold)', borderRadius: 13, padding: '3px 10px' }}>
            Führungswechsel! <span style={{ fontWeight: 600 }}>{flash.name === me ? 'Du führst' : `${flash.name} vorn`}</span>
          </span>
        )}
      </div>
      {lanes ? (
        <div style={{ position: 'relative', borderRadius: 14, background: 'rgba(255,255,255,0.04)', padding: '4px 0' }} onClick={done ? undefined : toggle}>
          {/* Ziellinie */}
          <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 4, width: 6, background: 'repeating-conic-gradient(#F2F4F5 0 25%, #14181D 0 50%) 0 0 / 6px 6px', opacity: 0.8, borderRadius: 2 }} />
          {names.map((n) => {
            const r = by.get(n)!
            const x = Math.max(0, Math.min(1, r.x))
            const at = `calc((100% - ${car + 14}px) * ${x.toFixed(4)})`
            const ahead = x > 0.42
            return (
              <div key={n} style={{ position: 'relative', height: laneH, borderBottom: '1px dashed rgba(255,255,255,0.07)' }}>
                {/* Spur hinter dem Auto */}
                <span aria-hidden="true" style={{ position: 'absolute', left: 4, top: laneH / 2 - 2, height: 4, borderRadius: 2, width: `calc(${at} + ${car / 2}px)`, background: n === me ? ME : r.rank === 1 ? 'var(--gold)' : '#5B6573', opacity: n === me || r.rank === 1 ? 0.55 : 0.4 }} />
                <span
                  style={{
                    position: 'absolute', top: laneH / 2 - 7, fontSize: 11, lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-2)',
                    ...(ahead ? { left: 4, width: `calc(${at} - 4px)`, textAlign: 'right' } : { left: `calc(${at} + ${car + 10}px)`, maxWidth: '45%' }),
                    ...meStyle(n, me),
                  }}
                >
                  {you(n, me)}
                </span>
                <span style={{ position: 'absolute', top: 4, left: `calc(${at} + 4px)`, display: 'inline-flex' }}>
                  <Avatar name={n} size={car} ring={n === me ? ME : undefined} />
                  <span className="num" style={{ position: 'absolute', right: -7, bottom: -3, minWidth: 16, height: 16, borderRadius: 8, padding: '0 3px', fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center', background: r.rank <= 3 ? medal(r.rank) : '#3A404A', color: r.rank <= 3 ? '#14181D' : '#F2F4F5' }}>
                    {r.rank}
                  </span>
                  {crashes && r.crash && (
                    <span aria-label="Abflug" style={{ position: 'absolute', left: -6, top: -8, fontSize: 13 }}>
                      💥
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <RankRows rows={rows} me={me} />
      )}
      <div style={{ minHeight: 30 }}>{done && after}</div>
    </div>
  )
}

/** Variante A: Rangliste, deren Zeilen beim Überholen aneinander vorbeigleiten */
function RankRows({ rows, me }: { rows: LaneFrame[]; me: string | null }) {
  const rowH = 34
  const mine = rows.find((r) => r.name === me)
  return (
    <>
      <div style={{ position: 'relative', height: ROWS_SHOWN * rowH, overflow: 'hidden' }}>
        {rows.map((r) => (
          <div key={r.name} style={{ position: 'absolute', left: 0, right: 0, top: (r.pos - 1) * rowH, height: rowH - 4, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', borderRadius: 10, background: r.name === me ? 'var(--me-solid)' : 'rgba(255,255,255,0.04)' }}>
            <span className="num" style={{ width: 20, fontWeight: 800, fontSize: 13, color: r.rank <= 3 ? medal(r.rank) : 'var(--muted)' }}>
              {r.rank}
            </span>
            <Avatar name={r.name} size={22} ring={r.name === me ? ME : undefined} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...meStyle(r.name, me) }}>{you(r.name, me)}</span>
            <span style={{ width: '34%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(1, r.x)) * 100}%`, background: r.name === me ? ME : r.rank === 1 ? 'var(--gold)' : '#5B6573' }} />
            </span>
            {r.value && (
              <span className="num" style={{ fontSize: 12, fontWeight: 700, minWidth: 34, textAlign: 'right' }}>
                {r.value}
              </span>
            )}
          </div>
        ))}
      </div>
      {mine && mine.rank > ROWS_SHOWN && (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ color: ME, fontWeight: 700 }}>Du</span> gerade auf Platz {mine.rank}
        </span>
      )}
    </>
  )
}

// ---- Größter Sprung: Zeilen tauschen die Plätze --------------------------------------------

/** Ausschnitt der Wertung vor und nach einem Lauf; die Zeile von `focus` fliegt nach oben */
export function RankShuffle({ before, after, focus, me }: { before: Map<string, number>; after: Map<string, number>; focus: string; me: string | null }) {
  const { active, epoch } = useStoryCard()
  const [moved, setMoved] = useState(reduced())
  if (useArrived() && !reduced()) setMoved(false)
  useEffect(() => {
    if (!active || reduced()) return
    const t = setTimeout(() => setMoved(true), 900)
    return () => clearTimeout(t)
  }, [active, epoch])
  const from = before.get(focus) ?? 1
  const to = after.get(focus) ?? 1
  const lo = Math.max(1, to - 1)
  const hi = from + 1
  const names = [...after.keys()].filter((n) => {
    const a = after.get(n)!
    const b = before.get(n) ?? a
    return (a >= lo && a <= hi) || (b >= lo && b <= hi)
  })
  const order = (m: Map<string, number>) => [...names].sort((x, y) => (m.get(x) ?? 99) - (m.get(y) ?? 99) || x.localeCompare(y))
  const slotsBefore = order(before)
  const slotsAfter = order(after)
  const rowH = 32
  return (
    <div style={{ position: 'relative', height: names.length * rowH }}>
      {names.map((n) => {
        const slot = (moved ? slotsAfter : slotsBefore).indexOf(n)
        const rank = (moved ? after : before).get(n)
        const hot = n === focus
        return (
          <div
            key={n}
            style={{
              position: 'absolute', left: 0, right: 0, top: slot * rowH, height: rowH - 4, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 10,
              transition: 'top 1.1s cubic-bezier(0.3, 1.3, 0.5, 1)', zIndex: hot ? 2 : 1,
              background: hot ? 'rgba(255, 216, 77, 0.16)' : 'rgba(255,255,255,0.04)', boxShadow: hot && moved ? '0 6px 18px -6px rgba(255, 216, 77, 0.6)' : undefined,
            }}
          >
            <span className="num" style={{ width: 22, fontWeight: 800, fontSize: 14, color: hot ? 'var(--gold)' : 'var(--muted)' }}>
              {rank}
            </span>
            <Avatar name={n} size={22} ring={n === me ? ME : undefined} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: hot ? 800 : 500, ...meStyle(n, me) }}>{you(n, me)}</span>
            {hot && moved && (
              <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>
                ▲ {from - to}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Fotofinish ----------------------------------------------------------------------------

/** Zwei Autos auf die Ziellinie zu, in Zeitlupe; der Abstand im Ziel bleibt stehen */
export function PhotoFinish({ first, second, ms, me }: { first: string; second: string; ms: number; me: string | null }) {
  const { active, epoch } = useStoryCard()
  const [go, setGo] = useState(reduced())
  if (useArrived() && !reduced()) setGo(false)
  useEffect(() => {
    if (!active || reduced()) return
    const t = setTimeout(() => setGo(true), 300)
    return () => clearTimeout(t)
  }, [active, epoch])
  const car = 34
  // sichtbarer Abstand: wächst mit der Zeit, bleibt aber erkennbar knapp
  const gapPx = Math.round(Math.max(5, Math.min(56, 5 + (ms / 3000) * 60)))
  const lane = (n: string, offset: number, winner: boolean) => (
    <div style={{ position: 'relative', height: car + 14, borderBottom: '1px dashed rgba(255,255,255,0.08)' }}>
      {/* rechts verankert: das Auto (Avatar) vorn, der Name dahinter */}
      <span style={{ position: 'absolute', top: 7, right: go ? 14 + offset : '100%', transition: go ? `right 2.8s cubic-bezier(0.12, 0.75, 0.25, 1)` : 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', ...meStyle(n, me) }}>{you(n, me)}</span>
        <Avatar name={n} size={car} ring={n === me ? ME : winner ? 'var(--gold)' : undefined} />
      </span>
    </div>
  )
  return (
    <div style={{ position: 'relative', borderRadius: 14, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', padding: '0 4px' }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, right: 8, width: 6, background: 'repeating-conic-gradient(#F2F4F5 0 25%, #14181D 0 50%) 0 0 / 6px 6px', opacity: 0.85 }} />
      {lane(first, 0, true)}
      {lane(second, gapPx, false)}
      {go && <span key={epoch} aria-hidden="true" className="photo-flash" />}
    </div>
  )
}

// ---- Kleine Diagramme ------------------------------------------------------------------------

/** Abstand Runde für Runde: über der Linie liegt der Sieger vorn */
export function GapLine({ gaps, first, second, me }: { gaps: number[]; first: string; second: string; me: string | null }) {
  const { epoch } = useStoryCard()
  const w = 300
  const h = 84
  const max = Math.max(200, ...gaps.map((g) => Math.abs(g)))
  const x = (i: number) => (gaps.length < 2 ? w / 2 : (i / (gaps.length - 1)) * (w - 8) + 4)
  const y = (g: number) => h / 2 - (g / max) * (h / 2 - 8)
  const d = gaps.map((g, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(g).toFixed(1)}`).join(' ')
  const swaps = gaps.reduce((n, g, i) => n + (i > 0 && Math.sign(g) !== Math.sign(gaps[i - 1]) && g !== 0 && gaps[i - 1] !== 0 ? 1 : 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>
          ▲ <span style={meStyle(first, me)}>{you(first, me)}</span> vorn
        </span>
        <span>{swaps > 0 ? `${swaps}× die Führung getauscht` : 'nie überholt'}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Abstand nach jeder Runde">
        <rect x={0} y={0} width={w} height={h / 2} fill="rgba(255, 216, 77, 0.06)" />
        <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
        <path key={epoch} className="draw" d={d} pathLength={1} fill="none" stroke="var(--gold)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(gaps.length - 1)} cy={y(gaps[gaps.length - 1])} r={4} fill="var(--gold)" />
      </svg>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        ▼ <span style={meStyle(second, me)}>{you(second, me)}</span> vorn
      </span>
    </div>
  )
}

/** Platz nach jedem Lauf als kleine Linie (oben = Platz 1) */
export function RankSpark({ ranks, of, color = ME, height = 64 }: { ranks: number[]; of: number; color?: string; height?: number }) {
  const { epoch } = useStoryCard()
  const w = 300
  const n = Math.max(2, of)
  const x = (i: number) => (ranks.length < 2 ? w / 2 : (i / (ranks.length - 1)) * (w - 24) + 12)
  const y = (r: number) => 10 + ((r - 1) / (n - 1)) * (height - 20)
  const d = ranks.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={`Platz im Verlauf: ${ranks.join(', ')}`}>
      <line x1={0} x2={w} y1={y(1)} y2={y(1)} stroke="rgba(255, 216, 77, 0.35)" strokeDasharray="3 4" />
      <path key={epoch} className="draw" d={d} pathLength={1} fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {ranks.map((r, i) => (
        <circle key={i} cx={x(i)} cy={y(r)} r={i === ranks.length - 1 ? 5 : 3} fill={r === 1 ? 'var(--gold)' : color} />
      ))}
      <text x={x(0)} y={y(ranks[0]) - 7} fontSize={11} fill="var(--muted)" textAnchor="middle">
        {ranks[0]}
      </text>
      <text x={x(ranks.length - 1)} y={y(ranks[ranks.length - 1]) - 8} fontSize={12} fontWeight={800} fill="var(--text)" textAnchor="middle">
        {ranks[ranks.length - 1]}
      </text>
    </svg>
  )
}

/** Rundenzeiten eines Laufs als Balken; die Runde mit Abflug rot */
export function LapBars({ laps, focus }: { laps: { ms: number; crash: boolean }[]; focus: number }) {
  const { active, epoch } = useStoryCard()
  const sorted = [...laps.map((l) => l.ms)].sort((a, b) => a - b)
  const base = sorted[0] * 0.8
  const max = Math.max(...sorted)
  return (
    <div key={epoch} className={`lap-bars${active ? ' go' : ''}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }} role="img" aria-label={`Rundenzeiten, Abflug in Runde ${focus}`}>
      {laps.map((l, i) => (
        <span
          key={i}
          style={{
            flex: 1, borderRadius: '4px 4px 1px 1px', height: `${Math.max(8, ((l.ms - base) / (max - base)) * 100)}%`, transitionDelay: `${i * 40}ms`,
            background: l.crash ? (i + 1 === focus ? 'var(--crash)' : 'rgba(255, 107, 90, 0.5)') : '#5B6573',
          }}
        />
      ))}
    </div>
  )
}

/** Plätze über bzw. unter der Erwartung als Balken nach links und rechts */
export function OverBars({ rows, me }: { rows: { name: string; value: number }[]; me: string | null }) {
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.value)))
  return (
    <Staged style={{ gap: 5 }}>
      {rows.map((r, i) => {
        const w = `${(Math.abs(r.value) / max) * 50}%`
        const up = r.value >= 0
        return (
          <Item key={r.name} delay={i * 90}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.4fr) 42px', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...meStyle(r.name, me) }}>{you(r.name, me)}</span>
              <span style={{ position: 'relative', height: 10 }}>
                <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, width: w, ...(up ? { left: '50%' } : { right: '50%' }), background: r.name === me ? ME : up ? '#4AA8F0' : '#5B6573' }} />
              </span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 700, color: up ? 'var(--text)' : 'var(--muted)' }}>
                {up ? '+' : '−'}
                {Math.abs(r.value).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
              </span>
            </div>
          </Item>
        )
      })}
    </Staged>
  )
}

/** Große Platzzahl, die vom schlechtesten Zwischenplatz auf den Endplatz herunterzählt */
export function RankCount({ from, to, color }: { from: number; to: number; color?: string }) {
  const { active, epoch } = useStoryCard()
  const [shown, setShown] = useState(reduced() ? to : from)
  if (useArrived()) setShown(reduced() ? to : from)
  useEffect(() => {
    if (!active || reduced() || from === to) return
    let raf = 0
    const t0 = performance.now() + 300
    const step = (t: number) => {
      const q = Math.max(0, Math.min(1, (t - t0) / 1300))
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - q, 2))))
      if (q < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, epoch, from, to])
  return (
    <span className="num" aria-label={`Platz ${to}`} style={{ fontSize: 'clamp(52px, 17vw, 76px)', fontWeight: 800, lineHeight: 0.95, letterSpacing: -1, color }}>
      <span aria-hidden="true">{shown}.</span>
    </span>
  )
}

// ---- Eigene Läufe als Chips ------------------------------------------------------------------

export interface HeatChip {
  key: string
  label: string
  place: number
  of: number
  detail: string
}

/** Je Lauf ein Chip mit dem Platz (Gold/Silber/Bronze); Antippen zeigt die Einzelheiten */
export function HeatChips({ heats, initial }: { heats: HeatChip[]; initial?: string }) {
  const [sel, setSel] = useState(initial ?? heats[0]?.key)
  const cur = heats.find((h) => h.key === sel)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {heats.map((h) => (
          <button
            key={h.key}
            onClick={() => setSel(h.key)}
            aria-pressed={h.key === sel}
            aria-label={`${h.label}: Platz ${h.place}`}
            className="num"
            style={{
              width: 38, height: 38, borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer',
              background: h.place <= 3 ? medal(h.place) : 'var(--inner)', color: h.place <= 3 ? '#14181D' : 'var(--text)',
              border: h.key === sel ? '2px solid #F2F4F5' : '2px solid transparent', opacity: h.key === sel ? 1 : 0.85,
            }}
          >
            {h.place}
          </button>
        ))}
      </div>
      {cur && (
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <b>{cur.label}</b> · {cur.detail}
        </span>
      )}
    </div>
  )
}

// ---- Quiz ----------------------------------------------------------------------------------

/** Quiz: Frage, drei Antworten zum Antippen, dann die Auflösung; auf der Leinwand löst es sich selbst auf */
export function Quiz({ questions: all, me }: { questions: QuizQuestion[]; me: string | null }) {
  const { active, auto } = useStoryCard()
  // Leinwand: nur so viele Fragen, wie in die Zeit einer Karte passen
  const questions = auto ? all.slice(0, 2) : all
  const count = questions.length
  const answers = questions.map((x) => x.answer).join(',')
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null))
  const q = questions[at]
  const choice = picked[at]
  const shown = choice != null
  const finished = picked.every((x) => x != null)
  const score = picked.filter((x, i) => x === questions[i].answer).length
  // Leinwand: jede Frage kurz stehen lassen, dann auflösen und weiter
  useEffect(() => {
    if (!auto || !active) return
    const t = setTimeout(
      () => {
        if (!shown) setPicked((p) => p.map((x, i) => (i === at ? Number(answers.split(',')[i]) : x)))
        else setAt((a) => (a + 1) % count)
      },
      shown ? 1800 : 2600,
    )
    return () => clearTimeout(t)
    // nur an Zahlen hängen: die Karten werden bei jedem Neuzeichnen der Seite neu gebaut
  }, [auto, active, shown, at, count, answers])
  if (useArrived() && auto) {
    setAt(0)
    setPicked(questions.map(() => null))
  }
  if (!q) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {questions.map((x, i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: picked[i] == null ? (i === at ? '#F2F4F5' : '#3A404A') : picked[i] === x.answer ? 'var(--good)' : 'var(--crash)' }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        Frage {at + 1} von {questions.length}
      </span>
      <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{q.question}</span>
      <div key={at} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((o, i) => {
          const right = i === q.answer
          const mine = i === choice
          const bg = !shown ? 'rgba(255,255,255,0.06)' : right ? 'rgba(123, 219, 138, 0.2)' : mine ? 'rgba(255, 107, 90, 0.2)' : 'rgba(255,255,255,0.03)'
          const border = !shown ? 'transparent' : right ? 'var(--good)' : mine ? 'var(--crash)' : 'transparent'
          return (
            <button
              key={o}
              className={shown && right ? 'quiz-right' : undefined}
              disabled={shown}
              onClick={() => setPicked((p) => p.map((x, k) => (k === at ? i : x)))}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: bg, border: `2px solid ${border}`, color: 'var(--text)', textAlign: 'left', fontSize: 15, fontWeight: 700, cursor: shown ? 'default' : 'pointer', opacity: shown && !right && !mine ? 0.55 : 1 }}
            >
              {q.drivers && <Avatar name={o} size={30} ring={o === me ? ME : undefined} />}
              <span style={{ flex: 1, ...(q.drivers ? meStyle(o, me) : {}) }}>{q.drivers ? you(o, me) : o}</span>
              {shown && right && <span aria-label="richtig">✓</span>}
              {shown && mine && !right && <span aria-label="falsch">✗</span>}
            </button>
          )
        })}
      </div>
      <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        {shown && (
          <>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
              {!auto && <b style={{ color: choice === q.answer ? 'var(--good)' : 'var(--crash-text)' }}>{choice === q.answer ? 'Richtig! ' : 'Leider nicht. '}</b>}
              {q.reveal}
            </span>
            {!auto && at < questions.length - 1 && (
              <button className="btn round" onClick={() => setAt(at + 1)} style={{ flexShrink: 0 }}>
                Nächste ›
              </button>
            )}
          </>
        )}
      </div>
      {!auto && finished && (
        <span className="stg-pop" style={{ fontSize: 18, fontWeight: 800 }}>
          {score} von {questions.length} richtig{score === questions.length ? ' – Profi!' : score === 0 ? ' – nächstes Mal besser aufpassen!' : ''}
        </span>
      )}
    </div>
  )
}

// ---- Auszeichnungen zum Umdrehen --------------------------------------------------------------

export interface AwardDef {
  key: string
  icon: ReactNode
  label: string
  names: string[]
  value: string
  /** Punkte in der Wertung („+2 Pkt.“), sonst Ehrentitel */
  points?: string
}

/** Auszeichnung als Karte: vorne nur Titel und Symbol, umgedreht wer sie bekommt */
export function AwardCard({ a, me, delay }: { a: AwardDef; me: string | null; delay: number }) {
  const { active, auto } = useStoryCard()
  const [open, setOpen] = useState(reduced())
  useEffect(() => {
    if (!auto || !active || open) return
    const t = setTimeout(() => setOpen(true), 600 + delay)
    return () => clearTimeout(t)
  }, [auto, active, open, delay])
  const mine = !!me && a.names.includes(me)
  return (
    <button className={`flip${open ? ' open' : ''}`} onClick={() => setOpen(true)} aria-label={open ? `${a.label}: ${a.names.join(', ')}` : `${a.label} aufdecken`} style={{ ['--accent' as string]: a.points ? 'var(--gold)' : '#86a9c8' }}>
      <span className="flip-inner">
        <span className={`flip-face flip-front${a.points ? ' pts' : ''}`}>
          <span className="flip-icon">{a.icon}</span>
          <span className="award-label">{a.label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Antippen</span>
        </span>
        <span className={`flip-face flip-back${a.points ? ' pts' : ''}${mine ? ' me-row' : ''}`}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 6 }}>
            <span className="award-label" style={{ fontSize: 10 }}>
              {a.label}
            </span>
            {a.points && (
              <span className="num" style={{ fontSize: 11, fontWeight: 800, color: '#14181D', background: 'var(--gold)', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                {a.points}
              </span>
            )}
          </span>
          <span style={{ display: 'flex' }}>
            {a.names.slice(0, 4).map((n, i) => (
              <span key={n} style={{ marginLeft: i ? -10 : 0 }}>
                <Avatar name={n} size={32} ring={n === me ? ME : undefined} />
              </span>
            ))}
          </span>
          <b style={{ fontSize: 13, lineHeight: 1.25, textAlign: 'left' }}>
            {a.names.slice(0, 3).map((n, i) => (
              <span key={n}>
                {i > 0 && ', '}
                <span style={n === me ? { color: ME } : undefined}>{you(n, me)}</span>
              </span>
            ))}
            {a.names.length > 3 && ` +${a.names.length - 3}`}
          </b>
          <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'left' }}>{a.value}</span>
        </span>
      </span>
    </button>
  )
}
