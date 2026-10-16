import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Medal, Wrapped as WrappedData } from '../../domain/model'
import { CarThumb } from '../CarPhoto'
import { DonutChart } from '../charts/DonutChart'
import { MiniBars, MiniLine } from '../charts/Mini'
import { AREA, ME, SERIES } from '../colors'
import { Avatar, carPath, driverPath, useData, useMyName } from '../components'
import { fmtDelta, fmtElo, fmtNum, formatDate, formatTime } from '../format'
import { ChevronLeft, ShareIcon } from '../icons'
import { MedalBadge } from '../Medal'
import { useOneStep } from '../useOneStep'

/** Hintergründe der Karten – je Karte ein eigener Farbton, Text bleibt hell */
const BG = [
  'linear-gradient(150deg, #1F3A2A 0%, #14181D 75%)',
  'linear-gradient(150deg, #2E2347 0%, #14181D 75%)',
  'linear-gradient(150deg, #3A2A12 0%, #14181D 75%)',
  'linear-gradient(150deg, #10303A 0%, #14181D 75%)',
  'linear-gradient(150deg, #3A1B22 0%, #14181D 75%)',
]

const Big = ({ children }: { children: ReactNode }) => <span className="num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{children}</span>
const Line = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.45 }}>{children}</span>
const Hint = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11, color: 'var(--muted)' }}>{children}</span>
const short = (iso: string) => formatDate(iso).slice(0, 5)

interface CardDef {
  key: string
  kicker: string
  body: ReactNode
}

function CardFrame({ i, kicker, children, story }: { i: number; kicker: string; children: ReactNode; story?: boolean }) {
  return (
    <section
      style={{
        background: BG[i % BG.length], border: '1px solid #262B33', borderRadius: 24, padding: story ? '26px 22px' : '22px 20px',
        display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--sh2)', ...(story ? { minHeight: '62vh', justifyContent: 'center' } : {}),
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--text-2)' }}>{kicker}</span>
      {children}
    </section>
  )
}

/** Medaillen des Jahres; antippen zeigt die Beschreibung */
function MedalRow({ medals }: { medals: Medal[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const m = medals.find((x) => x.id === open)
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {medals.map((x) => (
          <button key={x.id} onClick={() => setOpen(open === x.id ? null : x.id)} title={x.description} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 84, textAlign: 'center', background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer', opacity: open && open !== x.id ? 0.5 : 1 }}>
            <MedalBadge medal={x} size={52} />
            <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{x.name}</span>
          </button>
        ))}
      </div>
      <Hint>{m ? m.description : 'Medaille antippen für die Beschreibung'}</Hint>
    </>
  )
}

/** Duell-Balken: Siege gegen Niederlagen */
function DuelBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses || 1
  return (
    <span style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }} title={`${wins} Siege, ${losses} Niederlagen`}>
      <span style={{ width: `${(wins / total) * 100}%`, background: SERIES[0] }} />
      <span style={{ flex: 1, background: SERIES[1] }} />
    </span>
  )
}

function buildCards(w: WrappedData, you: boolean, seasonDates: string[]): CardDef[] {
  const driver = w.driver
  const year = w.year
  const cards: CardDef[] = []
  cards.push({
    key: 'intro', kicker: `GR Legends · ${year}`,
    body: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={driver} size={64} ring={you ? 'var(--me)' : undefined} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{you ? 'Dein Jahr' : driver}</span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{you ? `${driver} auf der Bahn` : `Das Jahr ${year} auf der Bahn`}</span>
        </div>
      </div>
    ),
  })
  cards.push({
    key: 'strecke', kicker: 'Auf der Strecke',
    body: (
      <>
        <Big>{w.races}</Big>
        <Line>
          Rennen an {w.days} {w.days === 1 ? 'Renntag' : 'Renntagen'}
          {w.qualis ? ` und ${w.qualis} Qualifyings` : ''} – {fmtNum(w.laps, 0)} Runden
          {w.km != null ? `, ${fmtNum(w.km)} km` : ''}.
        </Line>
        {w.perDay.length > 1 && (
          <>
            <MiniBars items={w.perDay.map((p) => ({ label: formatDate(p.date), value: p.races, text: `${p.races} ${p.races === 1 ? 'Rennen' : 'Rennen'}${p.wins ? `, ${p.wins} ${p.wins === 1 ? 'Sieg' : 'Siege'}` : ''}` }))} color={AREA.drivers} label="Rennen je Renntag" />
            <Hint>Rennen je Renntag – Balken antippen</Hint>
          </>
        )}
      </>
    ),
  })
  if (w.season) {
    const prog = w.season.progress.map((v, i) => (v != null ? { label: formatDate(seasonDates[i] ?? ''), value: v, text: `${v} Punkte` } : null)).filter((x): x is NonNullable<typeof x> => x != null)
    cards.push({
      key: 'saison', kicker: 'Saisonwertung',
      body: (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Big>P{w.season.rank}</Big>
            <span style={{ fontSize: 16, color: 'var(--text-2)' }}>von {w.seasonSize}</span>
          </div>
          <Line>
            {w.season.points} Punkte · {w.wins} {w.wins === 1 ? 'Sieg' : 'Siege'}
            {w.podiums ? ` · ${w.podiums} Podien` : ''}
            {w.season.poles ? ` · ${w.season.poles} Pole` : ''}
            {w.season.fastestLaps ? ` · ${w.season.fastestLaps}× schnellste Runde` : ''}
          </Line>
          {prog.length > 1 && (
            <>
              <MiniLine items={prog} color={AREA.season} label="Punkteverlauf" />
              <Hint>Punkteverlauf – Punkte antippen</Hint>
            </>
          )}
          <Link to={`/saison/${year}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Zur Saison ›
          </Link>
        </>
      ),
    })
  }
  if (w.bestRace) {
    const br = w.bestRace
    cards.push({
      key: 'rennen', kicker: 'Bestes Rennen',
      body: (
        <>
          <Big>{br.result.position === 1 ? 'Sieg' : `Platz ${br.result.position}`}</Big>
          <Line>
            {formatDate(br.session.date)} · {br.session.type} {br.session.heat} · {br.beaten} Gegner geschlagen im {br.result.car}
          </Line>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {br.session.results.map((r) => (
              <span key={r.driver + r.position} style={{ display: 'flex', gap: 8, fontSize: 13, color: r.driver === driver ? 'var(--text)' : 'var(--muted)', fontWeight: r.driver === driver ? 700 : 400 }}>
                <span className="num" style={{ width: 18 }}>{r.position}.</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.driver}</span>
                <span className="num">{formatTime(r.validBestLapMs)}</span>
              </span>
            ))}
          </div>
          <Link to={`/lauf/${br.session.fileId}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Rennen ansehen ›
          </Link>
        </>
      ),
    })
  }
  if (w.favoriteCar) {
    cards.push({
      key: 'auto', kicker: 'Lieblingsauto',
      body: (
        <>
          <Link to={carPath(w.favoriteCar.name)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CarThumb car={w.favoriteCar.name} size={64} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{w.favoriteCar.name}</span>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{w.favoriteCar.races} Rennen</span>
            </span>
          </Link>
          {w.cars.length > 1 && (
            <DonutChart
              label="Autos im Jahr"
              size={120}
              center={String(w.races)}
              sub="Rennen"
              parts={[
                ...w.cars.slice(0, 4).map((c, i) => ({ label: c.name, value: c.races, color: SERIES[i] })),
                ...(w.cars.length > 4 ? [{ label: 'Andere', value: w.cars.slice(4).reduce((a, c) => a + c.races, 0), color: '#4A515C' }] : []),
              ]}
            />
          )}
        </>
      ),
    })
  }
  if (w.victim || w.nemesis) {
    cards.push({
      key: 'gegner', kicker: 'Gegner',
      body: (
        <>
          {w.victim && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Line>
                Am häufigsten geschlagen:{' '}
                <Link to={driverPath(w.victim.name)} style={{ color: 'var(--text)', fontWeight: 700 }}>
                  {w.victim.name}
                </Link>
              </Line>
              <DuelBar wins={w.victim.wins} losses={w.victim.losses} />
              <Hint>
                {w.victim.wins} : {w.victim.losses} in gemeinsamen Rennen
              </Hint>
            </div>
          )}
          {w.nemesis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Line>
                {you ? 'Dein' : 'Der'} Angstgegner:{' '}
                <Link to={driverPath(w.nemesis.name)} style={{ color: 'var(--text)', fontWeight: 700 }}>
                  {w.nemesis.name}
                </Link>
              </Line>
              <DuelBar wins={w.nemesis.wins} losses={w.nemesis.losses} />
              <Hint>
                {w.nemesis.wins} : {w.nemesis.losses} in gemeinsamen Rennen
              </Hint>
            </div>
          )}
          <span style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: SERIES[0], marginRight: 5 }} />gewonnen</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: SERIES[1], marginRight: 5 }} />verloren</span>
          </span>
        </>
      ),
    })
  }
  if (w.bestLap) {
    const laps = w.perDay.filter((p) => p.bestLapMs != null).map((p) => ({ label: formatDate(p.date), value: p.bestLapMs!, text: `beste Runde ${formatTime(p.bestLapMs)}` }))
    cards.push({
      key: 'runde', kicker: 'Schnellste Runde',
      body: (
        <>
          <Big>{formatTime(w.bestLap.ms)}</Big>
          <Line>
            im {w.bestLap.car} am {formatDate(w.bestLap.date)}
            {w.pbGain != null ? ` – ${fmtNum(w.pbGain / 1000, 3)} s schneller als je zuvor.` : '.'}
          </Line>
          {laps.length > 1 && (
            <>
              <MiniLine items={laps} color={ME} invert label="Beste Runde je Renntag" />
              <Hint>Beste Runde je Renntag (oben = schneller)</Hint>
            </>
          )}
        </>
      ),
    })
  }
  if (w.eloStart != null && w.eloEnd != null) {
    cards.push({
      key: 'elo', kicker: 'Elo',
      body: (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Big>{fmtElo(w.eloEnd)}</Big>
            <span className="num" style={{ fontSize: 18, fontWeight: 700, color: w.eloEnd >= w.eloStart ? 'var(--me)' : 'var(--muted)' }}>
              {fmtDelta(w.eloEnd - w.eloStart)}
            </span>
          </div>
          <Line>von {fmtElo(w.eloStart)} zu Jahresbeginn</Line>
          {w.elo.length > 1 && (
            <>
              <MiniLine items={w.elo.map((e) => ({ label: `${short(e.date)} · ${e.label}`, value: e.value, text: `Elo ${fmtElo(e.value)}` }))} color={AREA.drivers} label="Elo-Verlauf im Jahr" />
              <Hint>Elo nach jedem Lauf</Hint>
            </>
          )}
        </>
      ),
    })
  } else if (w.elo.length > 1) {
    cards.push({
      key: 'elo', kicker: 'Elo',
      body: (
        <>
          <Big>{fmtElo(w.elo[w.elo.length - 1].value)}</Big>
          <Line>nach {w.elo.length} Läufen im ersten Jahr</Line>
          <MiniLine items={w.elo.map((e) => ({ label: `${short(e.date)} · ${e.label}`, value: e.value, text: `Elo ${fmtElo(e.value)}` }))} color={AREA.drivers} label="Elo-Verlauf im Jahr" />
        </>
      ),
    })
  }
  if (w.crashRate != null) {
    cards.push({
      key: 'abfluege', kicker: 'Abflüge',
      body: (
        <>
          <Big>{w.crashes}</Big>
          <Line>Abflüge – {fmtNum(w.crashRate)} pro 100 Runden (nur Rennen ohne Tankfunktion).</Line>
          {w.perDay.length > 1 && (
            <>
              <MiniBars items={w.perDay.map((p) => ({ label: formatDate(p.date), value: p.crashes, text: `${p.crashes} ${p.crashes === 1 ? 'Abflug' : 'Abflüge'} in ${p.races} Rennen` }))} color="#D95926" label="Abflüge je Renntag" />
              <Hint>Abflüge je Renntag</Hint>
            </>
          )}
        </>
      ),
    })
  }
  if (w.medals.length > 0) {
    cards.push({ key: 'medaillen', kicker: `Medaillen ${year}`, body: <MedalRow medals={w.medals} /> })
  }
  const done = w.challenges.filter((c) => c.done)
  cards.push({
    key: 'challenges', kicker: 'Challenges',
    body: (
      <>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Big>{done.length}</Big>
          <span style={{ fontSize: 16, color: 'var(--text-2)' }}>von {w.challenges.length} geschafft</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {w.challenges.map((c) => (
            <span key={c.id} style={{ fontSize: 13, color: c.done ? 'var(--text)' : 'var(--faint)' }}>
              {c.done ? '✓' : '○'} {c.label} <span style={{ color: 'var(--muted)' }}>· {c.detail}</span>
            </span>
          ))}
        </div>
      </>
    ),
  })
  return cards
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn round" onClick={() => setStory(true)}>
              ▶ Als Story
            </button>
            <button className="btn round" onClick={share} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShareIcon /> Teilen
            </button>
          </div>
        </div>
        {cards.map((c, i) => (
          <CardFrame key={c.key} i={i} kicker={c.kicker}>
            {c.body}
          </CardFrame>
        ))}
      </div>
    </>
  )
}

/** Karten einzeln durchwischen; danach geht es zur Übersicht */
function Story({ cards, w, you, onDone, onShare }: { cards: CardDef[]; w: WrappedData; you: boolean; onDone: () => void; onShare: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  useOneStep(ref)
  const total = cards.length + 1 // + Abschlusskarte
  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const next = Math.max(0, Math.min(total - 1, i))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }
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
      <div
        ref={ref}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', overscrollBehaviorX: 'contain' }}
      >
        {cards.map((c, i) => (
          <div key={c.key} style={{ flex: '0 0 100%', scrollSnapAlign: 'center', scrollSnapStop: 'always', padding: '16px max(16px, env(safe-area-inset-left, 0px))', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflowY: 'auto' }}>
            <div style={{ maxWidth: 520, width: '100%', margin: '0 auto' }}>
              <CardFrame i={i} kicker={c.kicker} story>
                {c.body}
              </CardFrame>
            </div>
          </div>
        ))}
        <div style={{ flex: '0 0 100%', scrollSnapAlign: 'center', scrollSnapStop: 'always', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ maxWidth: 520, width: '100%', margin: '0 auto' }}>
            <CardFrame i={cards.length} kicker="Das war dein Jahr" story>
              <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{you ? `Danke fürs Mitfahren, ${w.driver}!` : `Das war ${w.year} für ${w.driver}`}</span>
              <Line>
                {w.races} Rennen · {w.wins} Siege{w.season ? ` · Platz ${w.season.rank} in der Saison` : ''}
              </Line>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <button className="btn round" onClick={onShare} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ShareIcon /> Teilen
                </button>
                <button className="btn round" onClick={onDone} style={{ background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
                  Zur Übersicht
                </button>
              </div>
            </CardFrame>
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
