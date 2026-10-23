import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Challenge, Medal } from '../domain/model'
import { ChallengeBadge, XpChip } from './ChallengeItem'
import { AREA } from './colors'
import { sheetStack } from './components'
import { formatDate, formatMonth } from './format'
import { MedalArt, TIERS } from './Medal'

type Open = (medal: Medal, driver?: string) => void
type OpenChallenge = (challenge: Challenge, opts?: { driver?: string; year?: string }) => void
const MedalPopupContext = createContext<Open>(() => {})
const ChallengePopupContext = createContext<OpenChallenge>(() => {})

/** Medaille antippen → kleines Pop-up mit großer Medaille und Beschreibung */
export const useMedalPopup = () => useContext(MedalPopupContext)
/** Challenge antippen → Pop-up mit großem Abzeichen, Beschreibung und Fortschritt */
export const useChallengePopup = () => useContext(ChallengePopupContext)

export function MedalPopupProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<{ medal: Medal; driver?: string } | null>(null)
  const [challenge, setChallenge] = useState<{ c: Challenge; driver?: string; year?: string } | null>(null)
  return (
    <MedalPopupContext.Provider value={(medal, driver) => setShown({ medal, driver })}>
      <ChallengePopupContext.Provider value={(c, opts) => setChallenge({ c, ...opts })}>
        {children}
        {shown && <MedalPopup medal={shown.medal} driver={shown.driver} onClose={() => setShown(null)} />}
        {challenge && <ChallengePopup {...challenge} onClose={() => setChallenge(null)} />}
      </ChallengePopupContext.Provider>
    </MedalPopupContext.Provider>
  )
}

/** Esc schließt nur das oberste Pop-up, nicht das Panel dahinter */
function useEscape(onClose: () => void) {
  const id = useId()
  useEffect(() => {
    sheetStack.push(id)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sheetStack[sheetStack.length - 1] === id && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      sheetStack.splice(sheetStack.indexOf(id), 1)
      window.removeEventListener('keydown', onKey)
    }
  }, [id, onClose])
}

function ChallengePopup({ c, driver, year, onClose }: { c: Challenge; driver?: string; year?: string; onClose: () => void }) {
  useEscape(onClose)
  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(7, 8, 10, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fade 0.15s ease-out' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Challenge ${c.label}`}
        style={{ animation: 'medal-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2)', width: '100%', maxWidth: 320, background: 'var(--sheet)', border: '1px solid #262B33', borderRadius: 24, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,.55)' }}
      >
        <ChallengeBadge c={c} accent={AREA.season} size={128} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: c.done ? AREA.season : 'var(--muted)' }}>
          {c.done ? 'Geschafft' : 'Offen'} · Challenge{year ? ` ${year}` : ''}
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{c.label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>{c.detail}</span>
        {!c.done && (
          <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
            {c.value} / {c.target}
          </span>
        )}
        <XpChip done={c.done} />
        {driver && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{driver}</span>}
        <button className="btn round" onClick={onClose} autoFocus style={{ marginTop: 8, minWidth: 140 }}>
          Schließen
        </button>
      </div>
    </div>,
    document.body,
  )
}

function since(m: Medal): string {
  if (m.former) return `Gehalten ${formatMonth(m.former.from)} – ${formatMonth(m.former.to)}`
  if (m.title) return `Aktueller Titel · seit ${formatDate(m.date)}`
  if (m.kind === 'bahnrekord' || m.kind === 'fahrzeugrekord') return `Rekord seit ${formatDate(m.date)}`
  return `Erreicht am ${formatDate(m.date)}`
}

function MedalPopup({ medal, driver, onClose }: { medal: Medal; driver?: string; onClose: () => void }) {
  const t = TIERS[medal.tier]
  useEscape(onClose)
  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(7, 8, 10, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fade 0.15s ease-out' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t.label}-Medaille ${medal.name}`}
        style={{ animation: 'medal-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2)', width: '100%', maxWidth: 320, background: 'var(--sheet)', border: '1px solid #262B33', borderRadius: 24, padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,.55)' }}
      >
        <MedalArt tier={medal.tier} icon={medal.icon} size={128} muted={!!medal.former} label={`${t.label}-Medaille ${medal.name}`} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: medal.former ? 'var(--muted)' : t.text }}>
          {medal.former ? `Ehemals · ${t.label}` : t.label}
        </span>
        <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{medal.name}</span>
        <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>{medal.description}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {driver ? `${driver} · ` : ''}
          {since(medal)}
        </span>
        <button className="btn round" onClick={onClose} autoFocus style={{ marginTop: 8, minWidth: 140 }}>
          Schließen
        </button>
      </div>
    </div>,
    document.body,
  )
}
