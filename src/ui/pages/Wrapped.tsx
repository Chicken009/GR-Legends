import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CHALLENGE_XP } from '../../domain/challenges'
import type { Medal, Wrapped as WrappedData } from '../../domain/model'
import { fmtMark } from '../../domain/splits'
import { CarPhoto, usePhotoId } from '../CarPhoto'
import { ChallengeBadge } from '../ChallengeItem'
import { DonutChart } from '../charts/DonutChart'
import { MiniBars, MiniLine } from '../charts/Mini'
import { RadarChart } from '../charts/RadarChart'
import { AREA, ME, SERIES } from '../colors'
import { Avatar, carPath, driverPath, useData, useMyName } from '../components'
import { Amount, CurrencyIcon } from '../currency'
import { fmtElo, fmtNum, formatDate, formatTime } from '../format'
import { ChevronLeft, NAV_ICONS, PATHS, ShareIcon, StrokeIcon } from '../icons'
import { MedalBadge } from '../Medal'
import { useMedalPopup } from '../MedalPopup'
import { useSwipePager } from '../useSwipePager'

/** Hintergründe der Karten – je Karte ein eigener Farbton, Text bleibt hell */
const BG = [
  'linear-gradient(160deg, #1F3A2A 0%, #14181D 70%)',
  'linear-gradient(160deg, #2E2347 0%, #14181D 70%)',
  'linear-gradient(160deg, #3A2A12 0%, #14181D 70%)',
  'linear-gradient(160deg, #10303A 0%, #14181D 70%)',
  'linear-gradient(160deg, #3A1B22 0%, #14181D 70%)',
]
const CONFETTI = ['#F6C83C', '#3BBC4A', '#FF5A4E', '#4AA8F0', '#AE6DEE', '#F6C83C', '#EE9E10', '#FFFFFF', '#FF5A4E', '#3BBC4A']
const STOPWATCH = 'M12 8.5v4.5l3 2M9.5 2.5h5M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM18.5 6.5l1.5-1.5'
const SPARK = 'M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z'
const short = (iso: string) => formatDate(iso).slice(0, 5)
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Wird true, sobald das Element (zur Hälfte) sichtbar ist – bleibt dann true */
function useInView<T extends Element>(ref: RefObject<T | null>): boolean {
  // Ohne IntersectionObserver gleich sichtbar
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, seen])
  return seen
}

/** Zahl, die beim Erscheinen hochzählt */
function CountUp({ value, format = (v) => fmtNum(v, 0), duration = 900 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref)
  const [shown, setShown] = useState(reduced() ? value : 0)
  useEffect(() => {
    // Mit reduzierter Bewegung steht die Zahl von Anfang an
    if (!seen || reduced()) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      setShown(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [seen, value, duration])
  return (
    <span ref={ref} aria-label={format(value)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  )
}

/** Inhalt blendet beim Erscheinen von unten ein (Diagramme „wachsen“) */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref)
  return (
    <div ref={ref} className={`wr-reveal${seen ? ' in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/** Kurzes Konfetti, sobald die Karte sichtbar ist */
function Confetti() {
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useInView(ref)
  return (
    <span ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {seen &&
        !reduced() &&
        CONFETTI.map((c, i) => <span key={i} className="confetti wr-confetti" style={{ left: `${6 + i * 9.5}%`, background: c, animationDelay: `${(i * 0.23) % 1.4}s` }} />)}
    </span>
  )
}

const Huge = ({ children, color }: { children: ReactNode; color?: string }) => (
  <span className="num" style={{ fontSize: 'clamp(52px, 17vw, 76px)', fontWeight: 800, lineHeight: 0.95, letterSpacing: -1, color }}>
    {children}
  </span>
)
const Line = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.45 }}>{children}</span>
const Hint = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11, color: 'var(--muted)' }}>{children}</span>
const Group = ({ children, gap = 8 }: { children: ReactNode; gap?: number }) => <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>

interface CardDef {
  key: string
  kicker: string
  /** Großes, blasses Symbol im Hintergrund */
  icon?: string
  confetti?: boolean
  body: ReactNode
}

function CardFrame({ i, card, children, story }: { i: number; card: Pick<CardDef, 'kicker' | 'icon' | 'confetti'>; children: ReactNode; story?: boolean }) {
  return (
    <section
      style={{
        position: 'relative', overflow: 'hidden', background: BG[i % BG.length], border: '1px solid #262B33', borderRadius: 26, padding: story ? '26px 22px 24px' : '22px 20px',
        display: 'flex', flexDirection: 'column', gap: story ? 22 : 16, boxShadow: 'var(--sh2)',
        ...(story ? { minHeight: 'min(74vh, 660px)', justifyContent: 'space-between' } : {}),
      }}
    >
      {card.icon && (
        <span aria-hidden="true" style={{ position: 'absolute', right: -40, bottom: -40, opacity: 0.07, pointerEvents: 'none' }}>
          <StrokeIcon d={card.icon} size={240} color="#FFFFFF" width={1.4} />
        </span>
      )}
      {card.confetti && <Confetti />}
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--text-2)', position: 'relative' }}>{card.kicker}</span>
      {children}
    </section>
  )
}

/** Kachel für die Startkarte */
function StatTile({ value, label, format }: { value: number | string; label: string; format?: (v: number) => string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="num" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05 }}>{typeof value === 'number' ? <CountUp value={value} format={format} /> : value}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

/** Die kursive Acht, die sich beim Erscheinen zeichnet */
function TrackDraw({ laps }: { laps: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const seen = useInView(ref)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg ref={ref} width="120" height="120" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d={PATHS.track} fill="none" stroke="#2C333C" strokeWidth="1.6" strokeLinecap="round" />
        <path d={PATHS.track} fill="none" stroke={AREA.drivers} strokeWidth="1.6" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset={seen ? 0 : 100} style={{ transition: reduced() ? undefined : 'stroke-dashoffset 1.6s ease-out' }} />
      </svg>
      <Group gap={2}>
        <span className="num" style={{ fontSize: 34, fontWeight: 800 }}>
          <CountUp value={laps} />
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Runden gedreht</span>
      </Group>
    </div>
  )
}

/** Duell-Ansicht: beide Avatare groß, Stand dazwischen */
function Duel({ me, other, wins, losses, title }: { me: string; other: string; wins: number; losses: number; title: string }) {
  return (
    <Group gap={10}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>{title}</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={me} size={56} ring="var(--me)" />
          <span style={{ fontSize: 12, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me}</span>
        </span>
        <span className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: SERIES[0] }}>{wins}</span>
          <span style={{ color: 'var(--faint)', margin: '0 6px' }}>:</span>
          <span style={{ color: SERIES[1] }}>{losses}</span>
        </span>
        <Link to={driverPath(other)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={other} size={56} />
          <span style={{ fontSize: 12, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other}</span>
        </Link>
      </div>
    </Group>
  )
}

/** Großes Fahrzeugfoto (oder Symbol) über die ganze Breite */
function CarHero({ car }: { car: string }) {
  const photo = usePhotoId(car)
  const icon = (
    <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <StrokeIcon d={NAV_ICONS.cars} size={96} color="#5B6573" width={1.4} />
    </span>
  )
  return (
    <Link to={carPath(car)} style={{ display: 'block', width: '100%', height: 170, borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
      {photo ? <CarPhoto key={photo} fileId={photo} alt={car} width={900} fallback={icon} /> : icon}
    </Link>
  )
}

/** Medaillen des Jahres; antippen öffnet das Medaillen-Pop-up */
function MedalRow({ medals, driver }: { medals: Medal[]; driver: string }) {
  const openMedal = useMedalPopup()
  return (
    <Group>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {medals.map((x) => (
          <button key={x.id} onClick={() => openMedal(x, driver)} aria-label={`Medaille ${x.name} anzeigen`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer' }}>
            <MedalBadge medal={x} size={70} />
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{x.name}</span>
          </button>
        ))}
      </div>
      <Hint>Medaille antippen für Details</Hint>
    </Group>
  )
}

/** Fahrertyp aus der stärksten Eigenschaft im Netzdiagramm */
const TYPES: Record<string, [string, string]> = {
  tempo: ['Tempo pur', 'Kaum jemand fährt so schnelle Runden.'],
  konstanz: ['Uhrwerk', 'Runde für Runde fast dieselbe Zeit.'],
  start: ['Raketenstart', 'In der ersten Runde holst du dir die Plätze.'],
  ausdauer: ['Langstrecke', 'Wenn andere nachlassen, wirst du stärker.'],
  sauber: ['Fehlerlos', 'Abflüge sind bei dir die Ausnahme.'],
  zweikampf: ['Zweikampf-Ass', 'Im direkten Duell schlägst du die meisten.'],
}

/** Vorjahresvergleich: eine Zeile je Kennzahl */
function CompareRow({ label, before, now, diff, better }: { label: string; before: string; now: string; diff: string; better: boolean | null }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>{before}</span>
      <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>{now}</span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, minWidth: 56, textAlign: 'right', color: better == null ? 'var(--muted)' : better ? '#7BDB8A' : '#FF8A7A' }}>{diff}</span>
    </div>
  )
}

function buildCards(w: WrappedData, you: boolean, seasonDates: string[]): CardDef[] {
  const driver = w.driver
  const year = w.year
  const cards: CardDef[] = []

  cards.push({
    key: 'intro', kicker: `GR Legends · ${year}`, icon: PATHS.track,
    body: (
      <>
        <span aria-hidden="true" className="num" style={{ position: 'absolute', top: 40, right: -8, fontSize: 120, fontWeight: 800, letterSpacing: -4, color: 'transparent', WebkitTextStroke: '1.5px rgba(255,255,255,0.12)', pointerEvents: 'none' }}>
          {year}
        </span>
        <Group gap={14}>
          <Avatar name={driver} size={88} ring={you ? 'var(--me)' : undefined} />
          <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>{you ? 'Dein Jahr' : driver}</span>
          <Line>{you ? `${driver}, das war ${year} auf der Bahn.` : `Das Jahr ${year} auf der Bahn.`}</Line>
        </Group>
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatTile value={w.races} label="Rennen" />
            <StatTile value={w.wins} label={w.wins === 1 ? 'Sieg' : 'Siege'} />
            {w.km != null ? <StatTile value={w.km} label="Kilometer" format={(v) => fmtNum(v, 1)} /> : <StatTile value={w.laps} label="Runden" />}
            {w.season ? <StatTile value={`P${w.season.rank}`} label={`Saison · von ${w.seasonSize}`} /> : <StatTile value={w.days} label="Renntage" />}
          </div>
        </Reveal>
      </>
    ),
  })

  cards.push({
    key: 'strecke', kicker: 'Auf der Strecke', icon: NAV_ICONS.races,
    body: (
      <>
        <Group>
          <Huge>
            <CountUp value={w.races} />
          </Huge>
          <Line>
            Rennen an {w.days} {w.days === 1 ? 'Renntag' : 'Renntagen'}
            {w.qualis ? ` und ${w.qualis} Qualifyings` : ''}
            {w.km != null ? ` – ${fmtNum(w.km)} km, so weit wie ${Math.max(1, Math.round((w.km * 1000) / 105))} Fußballfelder.` : '.'}
          </Line>
        </Group>
        <Reveal>
          <TrackDraw laps={w.laps} />
        </Reveal>
        {w.perDay.length > 1 && (
          <Reveal delay={150}>
            <MiniBars items={w.perDay.map((p) => ({ label: formatDate(p.date), value: p.races, text: `${p.races} Rennen${p.wins ? `, ${p.wins} ${p.wins === 1 ? 'Sieg' : 'Siege'}` : ''}` }))} color={AREA.drivers} height={90} label="Rennen je Renntag" />
            <Hint>Rennen je Renntag – Balken antippen</Hint>
          </Reveal>
        )}
      </>
    ),
  })

  if (w.season) {
    const st = w.season
    const prog = st.progress.map((v, i) => (v != null ? { label: formatDate(seasonDates[i] ?? ''), value: v, text: `${v} Punkte` } : null)).filter((x): x is NonNullable<typeof x> => x != null)
    cards.push({
      key: 'saison', kicker: 'Saisonwertung', icon: NAV_ICONS.season, confetti: st.rank === 1,
      body: (
        <>
          <Group>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <Huge color={st.rank === 1 ? '#F6C83C' : undefined}>P{st.rank}</Huge>
              <span style={{ fontSize: 18, color: 'var(--text-2)' }}>von {w.seasonSize}</span>
            </div>
            <Amount kind="pts" value={st.points} size={22} />
          </Group>
          {prog.length > 1 && (
            <Reveal>
              <MiniLine items={prog} color={AREA.season} height={130} label="Punkteverlauf" />
              <Hint>Punkteverlauf – Punkte antippen</Hint>
            </Reveal>
          )}
          <Group gap={6}>
            <Line>
              {w.wins} {w.wins === 1 ? 'Sieg' : 'Siege'}
              {w.podiums ? ` · ${w.podiums} Podien` : ''}
              {st.poles ? ` · ${st.poles} Pole` : ''}
              {st.fastestLaps ? ` · ${st.fastestLaps}× schnellste Runde` : ''}
            </Line>
            <Link to={`/saison/${year}`} style={{ fontSize: 13, color: 'var(--text)' }}>
              Zur Saison ›
            </Link>
          </Group>
        </>
      ),
    })
  }

  if (w.bestDay && w.season && w.season.days.length > 1) {
    const bd = w.bestDay
    cards.push({
      key: 'abend', kicker: 'Dein bester Abend', icon: SPARK,
      body: (
        <>
          <Group>
            <Huge>{short(bd.date)}</Huge>
            <Amount kind="pts" value={bd.points} size={22} />
          </Group>
          <Reveal>
            <MiniBars items={w.season.days.map((d) => ({ label: formatDate(d.date), value: d.points, text: `${d.points} Punkte${d.date === bd.date ? ' – bester Abend' : ''}` }))} color={AREA.season} height={110} label="Punkte je Renntag" />
            <Hint>Punkte je Renntag</Hint>
          </Reveal>
          <Line>
            {bd.races} {bd.races === 1 ? 'Rennen' : 'Rennen'}
            {bd.wins ? `, ${bd.wins} ${bd.wins === 1 ? 'Sieg' : 'Siege'}` : ''} am {formatDate(bd.date)}.
          </Line>
        </>
      ),
    })
  }

  if (w.bestRace) {
    const br = w.bestRace
    cards.push({
      key: 'rennen', kicker: 'Bestes Rennen', icon: NAV_ICONS.races,
      body: (
        <>
          <Group>
            <Huge color={br.result.position === 1 ? '#F6C83C' : undefined}>{br.result.position === 1 ? 'Sieg' : `Platz ${br.result.position}`}</Huge>
            <Line>
              {formatDate(br.session.date)} · {br.beaten} {br.beaten === 1 ? 'Gegner' : 'Gegner'} geschlagen im {br.result.car}
            </Line>
          </Group>
          <Reveal>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {br.session.results.slice(0, 6).map((r) => (
                <span key={r.driver + r.position} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, padding: '6px 10px', borderRadius: 12, background: r.driver === driver ? 'rgba(59,188,74,0.18)' : 'rgba(255,255,255,0.04)', fontWeight: r.driver === driver ? 700 : 400 }}>
                  <span className={`rank${r.position <= 3 ? ` r${r.position}` : ''}`} style={{ width: 20, fontSize: 15 }}>
                    {r.position}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.driver}</span>
                  <span className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{formatTime(r.validBestLapMs)}</span>
                </span>
              ))}
            </div>
          </Reveal>
          <Link to={`/lauf/${br.session.fileId}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Rennen ansehen ›
          </Link>
        </>
      ),
    })
  }

  if (w.favoriteCar) {
    const fc = w.favoriteCar
    cards.push({
      key: 'auto', kicker: 'Lieblingsauto', icon: NAV_ICONS.cars,
      body: (
        <>
          <Group gap={4}>
            <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{fc.name}</span>
            <Line>
              <CountUp value={fc.races} /> von {w.races} Rennen
            </Line>
          </Group>
          <Reveal>
            <CarHero car={fc.name} />
          </Reveal>
          {w.cars.length > 1 && (
            <Reveal delay={150}>
              <DonutChart
                label="Autos im Jahr"
                size={120}
                center={String(w.cars.length)}
                sub="Autos"
                parts={[
                  ...w.cars.slice(0, 4).map((c, i) => ({ label: c.name, value: c.races, color: SERIES[i] })),
                  ...(w.cars.length > 4 ? [{ label: 'Andere', value: w.cars.slice(4).reduce((a, c) => a + c.races, 0), color: '#4A515C' }] : []),
                ]}
              />
            </Reveal>
          )}
        </>
      ),
    })
  }

  if (w.victim || w.nemesis) {
    cards.push({
      key: 'gegner', kicker: 'Duelle', icon: PATHS.sword,
      body: (
        <>
          {w.victim && (
            <Reveal>
              <Duel me={driver} other={w.victim.name} wins={w.victim.wins} losses={w.victim.losses} title="Am häufigsten geschlagen" />
            </Reveal>
          )}
          {w.nemesis && w.nemesis.name !== w.victim?.name && (
            <Reveal delay={200}>
              <Duel me={driver} other={w.nemesis.name} wins={w.nemesis.wins} losses={w.nemesis.losses} title={you ? 'Dein Angstgegner' : 'Angstgegner'} />
            </Reveal>
          )}
          {w.nemesis && w.nemesis.name === w.victim?.name && <Line>{w.nemesis.name} ist gleichzeitig {you ? 'dein' : 'der'} Angstgegner – das ist echte Rivalität.</Line>}
          <Hint>Siege : Niederlagen in gemeinsamen Rennen</Hint>
        </>
      ),
    })
  }

  if (w.bestLap) {
    const laps = w.perDay.filter((p) => p.bestLapMs != null).map((p) => ({ label: formatDate(p.date), value: p.bestLapMs!, text: `beste Runde ${formatTime(p.bestLapMs)}` }))
    const lr = w.lapRank
    cards.push({
      key: 'runde', kicker: 'Schnellste Runde', icon: STOPWATCH, confetti: lr?.rank === 1,
      body: (
        <>
          <Group>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <StrokeIcon d={STOPWATCH} size={54} color={ME} width={1.8} />
              <Huge>{formatTime(w.bestLap.ms)}</Huge>
            </div>
            <Line>
              im {w.bestLap.car} am {formatDate(w.bestLap.date)}
              {w.pbGain != null ? ` – ${fmtNum(w.pbGain / 1000, 3)} s schneller als je zuvor.` : '.'}
            </Line>
          </Group>
          {lr && (
            <Reveal>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 800, color: lr.rank === 1 ? '#F6C83C' : undefined }}>P{lr.rank}</span>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  von {lr.of} Fahrern {year} auf {lr.track}
                </span>
              </div>
            </Reveal>
          )}
          {laps.length > 1 && (
            <Reveal delay={150}>
              <MiniLine items={laps} color={ME} invert height={110} label="Beste Runde je Renntag" />
              <Hint>Beste Runde je Renntag (oben = schneller)</Hint>
            </Reveal>
          )}
        </>
      ),
    })
  }

  if (w.splits.length) {
    const main = w.splits[0]
    const block = (x: (typeof w.splits)[number]) => (
      <>
        {x.before != null && x.ms < x.before && <Line>{fmtNum((x.before - x.ms) / 1000, 2)} s schneller als {you ? 'deine' : 'die'} Bestmarke vor {year} ({formatTime(x.before)}).</Line>}
        {x.before == null && <Line>{you ? 'Deine' : 'Die'} erste Bestmarke über {x.n} Runden.</Line>}
        {x.before != null && x.ms >= x.before && <Line>Die Bestmarke von früher ({formatTime(x.before)}) steht noch – {fmtNum((x.ms - x.before) / 1000, 2)} s fehlen.</Line>}
        {x.marks.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {x.marks.map((m) => (
              <span key={m} className="num" style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.07)', color: ME }}>
                unter {fmtMark(m)} ✓
              </span>
            ))}
          </div>
        )}
        <Hint>
          P{x.rank} von {x.of} Fahrern {year}
        </Hint>
      </>
    )
    cards.push({
      key: 'zehner', kicker: w.splits.length > 1 ? 'Bestmarken über 10 und 20 Runden' : `Bestmarke über ${main.n} Runden`, icon: STOPWATCH, confetti: main.rank === 1,
      body: (
        <>
          <Group>
            <Huge>{formatTime(main.ms)}</Huge>
            <Line>
              {you ? 'Deine' : 'Die'} beste Zeit {year} für die ersten {main.n} Runden eines Rennens – am {formatDate(main.date)} im {main.car}.
            </Line>
            {block(main)}
          </Group>
          {w.splits.slice(1).map((x) => (
            <Reveal key={x.n}>
              <Group>
                <div className="num" style={{ fontSize: 30, fontWeight: 800 }}>{formatTime(x.ms)}</div>
                <Line>
                  beste Zeit {year} für die ersten {x.n} Runden, am {formatDate(x.date)}.
                </Line>
                {block(x)}
              </Group>
            </Reveal>
          ))}
        </>
      ),
    })
  }

  if (w.moment) {
    const m = w.moment
    cards.push({
      key: 'moment', kicker: 'Moment des Jahres', icon: SPARK,
      body: (
        <>
          <Group>
            <Huge color={AREA.drivers}>
              +<CountUp value={m.delta} />
            </Huge>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, color: AREA.drivers }}>
              <CurrencyIcon kind="elo" size={18} /> Elo auf einen Schlag
            </span>
          </Group>
          <Reveal>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{m.reason}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {formatDate(m.date)} · {m.type} · Platz {m.position} von {m.field} · {m.car}
              </span>
            </div>
          </Reveal>
          <Link to={`/lauf/${m.fileId}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Rennen ansehen ›
          </Link>
        </>
      ),
    })
  }

  if (w.elo.length > 1) {
    const vals = w.elo.map((e) => e.value)
    const end = w.eloEnd ?? vals[vals.length - 1]
    const start = w.eloStart
    cards.push({
      key: 'elo', kicker: 'Elo', icon: 'M3.5 16.5a8.5 8.5 0 1 1 17 0M12 16.5l4.2-5.2',
      body: (
        <>
          <Group>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <Huge color={AREA.drivers}>
                <CountUp value={end} format={(v) => fmtElo(v)} />
              </Huge>
              {/* aus gerundeten Werten, damit es zu den angezeigten Zahlen passt */}
              {start != null && <Amount kind="elo" value={Math.round(end) - Math.round(start)} signed size={20} unit={false} />}
            </div>
            <Line>{start != null ? `von ${fmtElo(start)} zu Jahresbeginn` : `nach ${w.elo.length} Läufen im ersten Jahr`}</Line>
          </Group>
          <Reveal>
            <MiniLine
              items={[
                // Startpunkt: Stand zu Jahresbeginn, danach jeder Lauf
                ...(start != null ? [{ label: 'Jahresbeginn', value: start, text: `Elo ${fmtElo(start)}` }] : []),
                ...w.elo.map((e) => ({ label: `${short(e.date)} · ${e.label}`, value: e.value, text: `Elo ${fmtElo(e.value)}` })),
              ]}
              color={AREA.drivers}
              height={140}
              label="Elo-Verlauf im Jahr"
            />
          </Reveal>
          <div style={{ display: 'flex', gap: 10 }}>
            <span style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              Tief <b className="num" style={{ fontSize: 18, color: 'var(--text)', display: 'block' }}>{fmtElo(Math.min(...vals))}</b>
            </span>
            <span style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              Hoch <b className="num" style={{ fontSize: 18, color: AREA.drivers, display: 'block' }}>{fmtElo(Math.max(...vals))}</b>
            </span>
          </div>
        </>
      ),
    })
  }

  if (w.radar.length) {
    const sorted = [...w.radar].sort((a, b) => b.score - a.score)
    const [title, text] = TYPES[sorted[0].key] ?? ['Allrounder', 'Überall solide.']
    cards.push({
      key: 'typ', kicker: you ? 'Dein Fahrertyp' : 'Fahrertyp', icon: SPARK,
      body: (
        <>
          <Group gap={6}>
            <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>{title}</span>
            <Line>
              {text} Dazu: {sorted[1].label}.
            </Line>
          </Group>
          <Reveal>
            <RadarChart series={[{ name: driver, color: AREA.drivers, axes: w.radar }]} label={`Fahrerprofil von ${driver}`} size={280} />
          </Reveal>
          <Hint>Im Vergleich zu den Stammfahrern, über alle Jahre · Achse antippen</Hint>
        </>
      ),
    })
  }

  if (w.crashRate != null) {
    cards.push({
      key: 'abfluege', kicker: 'Abflüge', icon: 'M12 3l9 16H3zM12 10v4M12 17h.01',
      body: (
        <>
          <Group>
            <Huge>
              <CountUp value={w.crashes} />
            </Huge>
            <Line>Abflüge – {fmtNum(w.crashRate)} pro 100 Runden (nur Rennen ohne Tankfunktion).</Line>
          </Group>
          {w.perDay.length > 1 && (
            <Reveal>
              <MiniBars items={w.perDay.map((p) => ({ label: formatDate(p.date), value: p.crashes, text: `${p.crashes} ${p.crashes === 1 ? 'Abflug' : 'Abflüge'} in ${p.races} Rennen` }))} color="#D95926" height={100} label="Abflüge je Renntag" />
              <Hint>Abflüge je Renntag</Hint>
            </Reveal>
          )}
        </>
      ),
    })
  }

  if (w.prev) {
    const p = w.prev
    const lapNow = w.bestLap?.ms ?? null
    const sec = (ms: number) => fmtNum(ms / 1000, 2)
    cards.push({
      key: 'vorjahr', kicker: `Im Vergleich zu ${p.year}`, icon: 'M4 17l5-5 4 4 7-7M15 9h5v5',
      body: (
        <>
          <Group>
            <Huge>
              {w.wins - p.wins >= 0 ? '+' : '−'}
              {Math.abs(w.wins - p.wins)}
            </Huge>
            <Line>{w.wins - p.wins === 0 ? `Genauso viele Siege wie ${p.year}.` : `${w.wins - p.wins > 0 ? 'Siege mehr' : 'Siege weniger'} als ${p.year}.`}</Line>
          </Group>
          <Reveal>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, fontSize: 11, color: 'var(--faint)' }}>
                <span />
                <span>{p.year}</span>
                <span>{year}</span>
                <span style={{ minWidth: 56, textAlign: 'right' }}>Δ</span>
              </div>
              <CompareRow label="Rennen" before={String(p.races)} now={String(w.races)} diff={`${w.races - p.races >= 0 ? '+' : '−'}${Math.abs(w.races - p.races)}`} better={w.races === p.races ? null : w.races > p.races} />
              <CompareRow label="Siege" before={String(p.wins)} now={String(w.wins)} diff={`${w.wins - p.wins >= 0 ? '+' : '−'}${Math.abs(w.wins - p.wins)}`} better={w.wins === p.wins ? null : w.wins > p.wins} />
              {p.bestLapMs != null && lapNow != null && (
                <CompareRow label="Bestzeit" before={sec(p.bestLapMs)} now={sec(lapNow)} diff={`${lapNow <= p.bestLapMs ? '−' : '+'}${sec(Math.abs(lapNow - p.bestLapMs))} s`} better={lapNow === p.bestLapMs ? null : lapNow < p.bestLapMs} />
              )}
              {p.rank != null && w.season && <CompareRow label="Saisonplatz" before={`P${p.rank}`} now={`P${w.season.rank}`} diff={p.rank === w.season.rank ? '±0' : `${p.rank > w.season.rank ? '↑' : '↓'}${Math.abs(p.rank - w.season.rank)}`} better={p.rank === w.season.rank ? null : w.season.rank < p.rank} />}
              {p.km != null && w.km != null && <CompareRow label="Kilometer" before={fmtNum(p.km, 1)} now={fmtNum(w.km, 1)} diff={`${w.km >= p.km ? '+' : '−'}${fmtNum(Math.abs(w.km - p.km), 1)}`} better={null} />}
            </div>
          </Reveal>
        </>
      ),
    })
  }

  if (w.medals.length > 0) {
    cards.push({
      key: 'medaillen', kicker: `Medaillen ${year}`, icon: NAV_ICONS.season,
      body: (
        <>
          <Group>
            <Huge>
              <CountUp value={w.medals.length} />
            </Huge>
            <Line>{w.medals.length === 1 ? 'Medaille' : 'Medaillen'} in diesem Jahr</Line>
          </Group>
          <Reveal>
            <MedalRow medals={w.medals} driver={driver} />
          </Reveal>
        </>
      ),
    })
  }

  const done = w.challenges.filter((c) => c.done)
  cards.push({
    key: 'challenges', kicker: 'Challenges', icon: NAV_ICONS.season, confetti: done.length === w.challenges.length && w.challenges.length > 0,
    body: (
      <>
        <Group>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Huge color={AREA.season}>
              <CountUp value={done.length} />
            </Huge>
            <span style={{ fontSize: 18, color: 'var(--text-2)' }}>von {w.challenges.length} geschafft</span>
          </div>
          <Amount kind="xp" value={done.length * CHALLENGE_XP} size={20} />
        </Group>
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[...w.challenges].sort((a, b) => Number(b.done) - Number(a.done)).map((c) => (
              <span key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center' }} title={c.detail}>
                <ChallengeBadge c={c} accent={AREA.season} size={54} />
                <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, color: c.done ? 'var(--text)' : 'var(--faint)' }}>{c.label}</span>
              </span>
            ))}
          </div>
        </Reveal>
      </>
    ),
  })
  return cards
}

/** Teilbild im Story-Format (1080 × 1920) mit den wichtigsten Zahlen */
async function shareImage(w: WrappedData, you: boolean): Promise<void> {
  const W = 1080
  const H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  try {
    await document.fonts?.load('800 60px Rubik')
  } catch {
    // Systemschrift reicht
  }
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#1F3A2A')
  g.addColorStop(0.55, '#14181D')
  g.addColorStop(1, '#2E2347')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const font = (weight: number, size: number) => `${weight} ${size}px Rubik, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.font = font(800, 360)
  ctx.textAlign = 'right'
  ctx.fillText(w.year, W + 30, 520)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#C5CCD3'
  ctx.font = font(800, 36)
  ctx.fillText(`GR LEGENDS · ${w.year}`, 90, 200)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = font(800, 96)
  ctx.fillText(you ? 'Mein Jahr' : w.driver, 90, 330)
  if (you) {
    ctx.font = font(500, 44)
    ctx.fillStyle = '#C5CCD3'
    ctx.fillText(w.driver, 90, 400)
  }
  const stats: [string, string, string][] = [
    [String(w.races), 'Rennen', '#FFFFFF'],
    [String(w.wins), w.wins === 1 ? 'Sieg' : 'Siege', '#F6C83C'],
    [w.km != null ? fmtNum(w.km, 1) : String(w.laps), w.km != null ? 'Kilometer' : 'Runden', '#FFFFFF'],
    [w.season ? `P${w.season.rank}` : String(w.days), w.season ? `Saison · ${w.season.points} Pkt.` : 'Renntage', AREA.season],
    [w.eloEnd != null ? fmtElo(w.eloEnd) : '–', 'Elo', AREA.drivers],
    [w.bestLap ? formatTime(w.bestLap.ms) : '–', 'Schnellste Runde', ME],
  ]
  stats.forEach(([v, l, c], i) => {
    const x = 90 + (i % 2) * 470
    const y = 620 + Math.floor(i / 2) * 330
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.roundRect(x, y, 430, 280, 36)
    ctx.fill()
    ctx.fillStyle = c
    ctx.font = font(800, 110)
    ctx.fillText(v, x + 40, y + 160)
    ctx.fillStyle = '#9AA3AD'
    ctx.font = font(600, 38)
    ctx.fillText(l, x + 40, y + 228)
  })
  if (w.favoriteCar) {
    ctx.fillStyle = '#C5CCD3'
    ctx.font = font(500, 40)
    ctx.fillText(`Lieblingsauto: ${w.favoriteCar.name}`, 90, 1680)
  }
  ctx.fillStyle = '#6B7480'
  ctx.font = font(600, 32)
  ctx.fillText('GR Legends · Jahresrückblick', 90, 1800)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const file = new File([blob], `gr-legends-${w.year}-${w.driver.replace(/\s+/g, '-')}.png`, { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `GR Legends ${w.year}` })
      return
    }
  } catch {
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const seenKey = (driver: string, year: string) => `gr-legends:wrapped-seen:${driver}:${year}`

export function Wrapped() {
  const { year = '', name = '' } = useParams()
  const driver = decodeURIComponent(name)
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const [story, setStory] = useState(() => {
    try {
      return localStorage.getItem(seenKey(driver, year)) == null
    } catch {
      return true
    }
  })
  const w = model.wrapped(driver, year)
  const seasonDates = [...new Set(model.sessions.filter((s) => s.date.startsWith(year)).map((s) => s.date))].sort()
  const you = driver === me
  if (!w) return <div className="page"><p className="muted">Für {driver} gibt es {year} keine Rennen.</p></div>
  const cards = buildCards(w, you, seasonDates)
  const share = async () => {
    const text = `${you ? 'Mein' : `${driver}s`} GR-Legends-Jahr ${year}: ${w.races} Rennen, ${w.wins} Siege${w.season ? `, Platz ${w.season.rank} in der Saison` : ''}`
    try {
      if (navigator.share) await navigator.share({ title: `GR Legends ${year}`, text, url: location.href })
      else await navigator.clipboard.writeText(`${text} – ${location.href}`)
    } catch {
      // Teilen abgebrochen
    }
  }
  const finish = () => {
    try {
      localStorage.setItem(seenKey(driver, year), '1')
    } catch {
      // ohne Speicher: nächstes Mal wieder als Story
    }
    setStory(false)
    window.scrollTo(0, 0)
  }
  return (
    <>
      {story && <Story cards={cards} w={w} you={you} onDone={finish} onShare={share} />}
      <div className="page" style={{ maxWidth: 560, gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button className="icon-btn" aria-label="Zurück" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/saison/${year}`))}>
            <ChevronLeft />
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn round" onClick={() => setStory(true)}>
              ▶ Als Story
            </button>
            <button className="btn round" onClick={() => void shareImage(w, you)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShareIcon /> Als Bild
            </button>
          </div>
        </div>
        {cards.map((c, i) => (
          <CardFrame key={c.key} i={i} card={c}>
            {c.body}
          </CardFrame>
        ))}
      </div>
    </>
  )
}

/** Karten einzeln durchwischen; danach geht es zur Übersicht */
function Story({ cards, w, you, onDone, onShare }: { cards: CardDef[]; w: WrappedData; you: boolean; onDone: () => void; onShare: () => void }) {
  const total = cards.length + 1 // + Abschlusskarte
  const { index, go, viewportProps, trackProps } = useSwipePager(total)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const last = index === total - 1
  const slide = { flex: '0 0 100%', minWidth: 0, minHeight: 0, padding: '14px max(16px, env(safe-area-inset-left, 0px))', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', overscrollBehavior: 'contain' } as const
  return (
    <div role="dialog" aria-modal="true" aria-label={`Jahresrückblick ${w.year}`} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0' }}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= index ? '#F2F4F5' : '#3A404A', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {index + 1} / {total}
        </span>
        <button className="btn round" onClick={onDone} style={{ minHeight: 34, fontSize: 13 }}>
          Überspringen
        </button>
      </div>
      <div {...viewportProps} style={{ ...viewportProps.style, flex: 1, minHeight: 0, display: 'flex' }}>
        <div {...trackProps} style={{ ...trackProps.style, flex: '0 0 100%', width: '100%', minWidth: 0, minHeight: 0 }}>
          {cards.map((c, i) => (
            // Eigene Scrollfläche: pan-y hier noch einmal, sonst übernimmt der Browser auch waagerechte Wische
            <div key={c.key} style={slide}>
              <div style={{ maxWidth: 520, width: '100%', margin: 'auto' }}>
                <CardFrame i={i} card={c} story>
                  {c.body}
                </CardFrame>
              </div>
            </div>
          ))}
          <div style={slide}>
            <div style={{ maxWidth: 520, width: '100%', margin: 'auto' }}>
              <CardFrame i={cards.length} card={{ kicker: you ? 'Das war dein Jahr' : `Das war ${w.year}`, icon: PATHS.track, confetti: true }} story>
                <Group gap={10}>
                  <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>{you ? `Danke fürs Mitfahren, ${w.driver}!` : `Das war ${w.year} für ${w.driver}`}</span>
                  <Line>
                    {w.races} Rennen · {w.wins} Siege{w.season ? ` · Platz ${w.season.rank} in der Saison` : ''}
                  </Line>
                </Group>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn round" onClick={() => void shareImage(w, you)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, fontWeight: 700 }}>
                    <ShareIcon /> Als Bild teilen
                  </button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn round" onClick={onShare} style={{ flex: 1 }}>
                      Link teilen
                    </button>
                    <button className="btn round" onClick={onDone} style={{ flex: 1, background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
                      Zur Übersicht
                    </button>
                  </div>
                </div>
              </CardFrame>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 14px', gap: 10 }}>
        <button className="btn round" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Karte" style={{ opacity: index === 0 ? 0.4 : 1 }}>
          ‹ Zurück
        </button>
        <button className="btn round" onClick={() => (last ? onDone() : go(index + 1))} style={{ background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
          {last ? 'Zur Übersicht' : 'Weiter ›'}
        </button>
      </div>
    </div>
  )
}
