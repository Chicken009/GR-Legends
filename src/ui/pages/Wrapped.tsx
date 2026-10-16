import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CarThumb } from '../CarPhoto'
import { Avatar, carPath, driverPath, useData, useMyName } from '../components'
import { fmtDelta, fmtElo, fmtNum, formatDate, formatTime } from '../format'
import { ChevronLeft, ShareIcon } from '../icons'
import { MedalBadge } from '../Medal'

/** Hintergründe der Karten – je Karte ein eigener Farbton, Text bleibt hell */
const BG = [
  'linear-gradient(150deg, #1F3A2A 0%, #14181D 75%)',
  'linear-gradient(150deg, #2E2347 0%, #14181D 75%)',
  'linear-gradient(150deg, #3A2A12 0%, #14181D 75%)',
  'linear-gradient(150deg, #10303A 0%, #14181D 75%)',
  'linear-gradient(150deg, #3A1B22 0%, #14181D 75%)',
]

function Card({ i, kicker, children }: { i: number; kicker: string; children: ReactNode }) {
  return (
    <section style={{ background: BG[i % BG.length], border: '1px solid #262B33', borderRadius: 24, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--sh2)' }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase', color: 'var(--text-2)' }}>{kicker}</span>
      {children}
    </section>
  )
}

const Big = ({ children }: { children: ReactNode }) => <span className="num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{children}</span>
const Line = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.45 }}>{children}</span>

export function Wrapped() {
  const { year = '', name = '' } = useParams()
  const driver = decodeURIComponent(name)
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const w = model.wrapped(driver, year)
  const you = driver === me
  if (!w) return <div className="page"><p className="muted">Für {driver} gibt es {year} keine Rennen.</p></div>
  const share = async () => {
    const text = `${you ? 'Mein' : `${driver}s`} GR-Legends-Jahr ${year}: ${w.races} Rennen, ${w.wins} Siege${w.season ? `, Platz ${w.season.rank} in der Saison` : ''}`
    try {
      if (navigator.share) await navigator.share({ title: `GR Legends ${year}`, text, url: location.href })
      else await navigator.clipboard.writeText(`${text} – ${location.href}`)
    } catch {
      // Teilen abgebrochen
    }
  }
  const done = w.challenges.filter((c) => c.done)
  let i = 0
  return (
    <div className="page" style={{ maxWidth: 560, gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="icon-btn" aria-label="Zurück" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/saison/${year}`))}>
          <ChevronLeft />
        </button>
        <button className="btn round" onClick={share} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ShareIcon /> Teilen
        </button>
      </div>

      <Card i={i++} kicker={`GR Legends · ${year}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={driver} size={64} ring={you ? 'var(--me)' : undefined} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{you ? 'Dein Jahr' : driver}</span>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{you ? `${driver} auf der Bahn` : `Das Jahr ${year} auf der Bahn`}</span>
          </div>
        </div>
      </Card>

      <Card i={i++} kicker="Auf der Strecke">
        <Big>{w.races}</Big>
        <Line>
          Rennen an {w.days} {w.days === 1 ? 'Renntag' : 'Renntagen'}
          {w.qualis ? ` und ${w.qualis} Qualifyings` : ''} – {fmtNum(w.laps, 0)} Runden
          {w.km != null ? `, ${fmtNum(w.km)} km` : ''}.
        </Line>
      </Card>

      {w.season && (
        <Card i={i++} kicker="Saisonwertung">
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
          <Link to={`/saison/${year}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Zur Saison ›
          </Link>
        </Card>
      )}

      {w.bestRace && (
        <Card i={i++} kicker="Bestes Rennen">
          <Big>{w.bestRace.result.position === 1 ? 'Sieg' : `Platz ${w.bestRace.result.position}`}</Big>
          <Line>
            {formatDate(w.bestRace.session.date)} · {w.bestRace.session.type} {w.bestRace.session.heat} · {w.bestRace.beaten} {w.bestRace.beaten === 1 ? 'Gegner' : 'Gegner'} geschlagen im {w.bestRace.result.car}
          </Line>
          <Link to={`/lauf/${w.bestRace.session.fileId}`} style={{ fontSize: 13, color: 'var(--text)' }}>
            Rennen ansehen ›
          </Link>
        </Card>
      )}

      {w.favoriteCar && (
        <Card i={i++} kicker="Lieblingsauto">
          <Link to={carPath(w.favoriteCar.name)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <CarThumb car={w.favoriteCar.name} size={64} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{w.favoriteCar.name}</span>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{w.favoriteCar.races} Rennen</span>
            </span>
          </Link>
        </Card>
      )}

      {(w.victim || w.nemesis) && (
        <Card i={i++} kicker="Gegner">
          {w.victim && (
            <Line>
              Am häufigsten geschlagen:{' '}
              <Link to={driverPath(w.victim.name)} style={{ color: 'var(--text)', fontWeight: 700 }}>
                {w.victim.name}
              </Link>{' '}
              ({w.victim.count}×)
            </Line>
          )}
          {w.nemesis && (
            <Line>
              Dein Angstgegner:{' '}
              <Link to={driverPath(w.nemesis.name)} style={{ color: 'var(--text)', fontWeight: 700 }}>
                {w.nemesis.name}
              </Link>{' '}
              ({w.nemesis.count}× vor {you ? 'dir' : driver})
            </Line>
          )}
        </Card>
      )}

      {w.bestLap && (
        <Card i={i++} kicker="Schnellste Runde">
          <Big>{formatTime(w.bestLap.ms)}</Big>
          <Line>
            im {w.bestLap.car} am {formatDate(w.bestLap.date)}
            {w.pbGain != null ? ` – ${fmtNum(w.pbGain / 1000, 3)} s schneller als je zuvor.` : '.'}
          </Line>
        </Card>
      )}

      {w.eloStart != null && w.eloEnd != null && (
        <Card i={i++} kicker="Elo">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <Big>{fmtElo(w.eloEnd)}</Big>
            <span className="num" style={{ fontSize: 18, fontWeight: 700, color: w.eloEnd >= w.eloStart ? 'var(--me)' : 'var(--muted)' }}>
              {fmtDelta(w.eloEnd - w.eloStart)}
            </span>
          </div>
          <Line>von {fmtElo(w.eloStart)} zu Jahresbeginn</Line>
        </Card>
      )}

      {w.crashRate != null && (
        <Card i={i++} kicker="Abflüge">
          <Big>{w.crashes}</Big>
          <Line>
            Abflüge – {fmtNum(w.crashRate)} pro 100 Runden (nur Rennen ohne Tankfunktion).
          </Line>
        </Card>
      )}

      {w.medals.length > 0 && (
        <Card i={i++} kicker={`Medaillen ${year}`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {w.medals.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 84, textAlign: 'center' }}>
                <MedalBadge medal={m} size={52} />
                <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{m.name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card i={i++} kicker="Challenges">
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
      </Card>
    </div>
  )
}
