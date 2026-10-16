import { useEffect, useMemo, useState } from 'react'
import { careerTitle as titleFor, TIER_ORDER, type Medal } from '../domain/model'
import { Placement, useData, useMyName } from './components'
import { Chevrons } from './icons'
import { MedalArt, TIERS } from './Medal'
import { fmtDelta, fmtElo } from './format'

const KEY = (me: string) => `gr-legends:seen-medals:${me}`

function readSeen(me: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY(me))
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function writeSeen(me: string, ids: string[]) {
  try {
    localStorage.setItem(KEY(me), JSON.stringify(ids))
  } catch {
    // egal
  }
}

const CONFETTI = ['#F6C83C', '#3BBC4A', '#FF5A4E', '#F6C83C', '#AE6DEE', '#3BBC4A', '#EE9E10', '#FFFFFF', '#FF5A4E', '#F6C83C']

/**
 * Feier-Popup für neue Medaillen des eigenen Fahrers. Beim ersten Mal werden alle vorhandenen
 * Medaillen still als gesehen markiert.
 */
export function Celebration() {
  const { model } = useData()
  const me = useMyName()
  // Gesehene Medaillen werden im Speicher gehalten; `version` erzwingt nach „Weiter“ ein Neuberechnen
  const [version, setVersion] = useState(0)
  const queue = useMemo(() => {
    if (!me) return []
    const current = (model.medals.get(me) ?? []).filter((m) => !m.former)
    const seen = readSeen(me)
    if (!seen) return current.map((m) => ({ ...m, silent: true }))
    return current.filter((m) => !seen.has(m.id)).sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, model, version]) as (Medal & { silent?: boolean })[]

  useEffect(() => {
    // Beim ersten Mal alles still als gesehen markieren
    if (me && queue.length && queue[0].silent) {
      writeSeen(me, queue.map((m) => m.id))
      setVersion((v) => v + 1)
    }
  }, [me, queue])

  const medal = queue[0]?.silent ? undefined : queue[0]
  if (!me) return null
  // Erst die Medaillen, danach ein Level-Aufstieg
  if (!medal) return <LevelUp me={me} />
  const t = TIERS[medal.tier]
  const hist = model.rating.history.get(me) ?? []
  const last = hist[hist.length - 1]
  const rank = model.ranking('all').find((r) => r.name === me)?.rank
  const placing = model.placement(me)
  const next = () => {
    const seen = readSeen(me) ?? new Set<string>()
    seen.add(medal.id)
    writeSeen(me, [...seen])
    setVersion((v) => v + 1)
  }
  const share = async () => {
    const text = `${me} hat bei GR Legends die Medaille „${medal.name}“ (${t.label}) geholt!`
    try {
      if (navigator.share) await navigator.share({ title: 'GR Legends', text, url: window.location.origin + window.location.pathname })
      else await navigator.clipboard.writeText(text)
    } catch {
      // abgebrochen
    }
  }
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={`Neue Medaille: ${medal.name}`}>
      {CONFETTI.map((c, i) => (
        <span key={i} className="confetti" style={{ left: `${8 + i * 9}%`, background: c, animationDelay: `${(i * 0.37) % 3}s` }} />
      ))}
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#F6C83C' }}>Neue Medaille</span>
      <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg className="rays" width="260" height="260" viewBox="0 0 260 260" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <path d="M130 130L118 0h24zM130 130l12 130h-24zM130 130L0 118v24zM130 130l130 12v-24zM130 130L32 15l17-17zM130 130l98 115-17 17zM130 130L15 228l-17-17zM130 130L245 32l17 17z" fill={t.glow} opacity="0.12" />
        </svg>
        <div className="pop">
          <MedalArt tier={medal.tier} icon={medal.icon} size={180} label={`${t.label}-Medaille ${medal.name}`} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{medal.name}</h1>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: t.text }}>{t.label}</span>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5, maxWidth: 300 }}>{medal.description}</p>
      </div>
      {last && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--nav)', border: '1px solid #262B33', borderRadius: 16, padding: '10px 14px', boxShadow: 'var(--sh1)' }}>
          {placing != null ? (
            <Placement n={placing} size={14} />
          ) : (
            <>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Elo</span>
              <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>
                {fmtElo(last.after)}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: last.delta >= 0 ? 'var(--me)' : 'var(--muted)' }}>{fmtDelta(last.delta)}</span>
              {last.delta > 0 && <Chevrons value={1} size={20} />}
              {rank && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Platz {rank}</span>}
            </>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 400, marginTop: 8 }}>
        <button className="btn" style={{ flex: 1, minHeight: 52, borderRadius: 16, fontSize: 15, fontWeight: 600, background: 'var(--nav)' }} onClick={share}>
          Teilen
        </button>
        <button className="btn" style={{ flex: 1, minHeight: 52, borderRadius: 16, border: 'none', background: '#F6C83C', color: '#2A1F00', fontSize: 15, fontWeight: 700 }} onClick={next} autoFocus>
          {queue.length > 1 ? `Weiter (${queue.length - 1})` : 'Weiter'}
        </button>
      </div>
    </div>
  )
}

const LEVEL_KEY = (me: string) => `gr-legends:seen-level:${me}`

function readLevel(me: string): number | null {
  try {
    const raw = localStorage.getItem(LEVEL_KEY(me))
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

function writeLevel(me: string, level: number) {
  try {
    localStorage.setItem(LEVEL_KEY(me), String(level))
  } catch {
    // egal
  }
}

/** Feier-Popup beim Karriere-Aufstieg. Beim ersten Mal wird das aktuelle Level still gemerkt. */
function LevelUp({ me }: { me: string }) {
  const { model } = useData()
  const [version, setVersion] = useState(0)
  const career = model.career(me)
  const stored = useMemo(() => readLevel(me), [me, version]) // eslint-disable-line react-hooks/exhaustive-deps
  // Beim ersten Mal gilt das aktuelle Level als gesehen
  const seen = stored ?? career?.level ?? null
  useEffect(() => {
    if (career && stored == null) writeLevel(me, career.level)
  }, [me, career, stored])
  if (!career || seen == null || career.level <= seen) return null
  const done = () => {
    writeLevel(me, career.level)
    setVersion((v) => v + 1)
  }
  const prevTitle = model.career(me) && seen != null ? titleFor(seen) : null
  const newTitle = prevTitle !== career.title
  const share = async () => {
    const text = `${me} ist bei GR Legends auf Level ${career.level} (${career.title}) aufgestiegen!`
    try {
      if (navigator.share) await navigator.share({ title: 'GR Legends', text, url: window.location.origin + window.location.pathname })
      else await navigator.clipboard.writeText(text)
    } catch {
      // abgebrochen
    }
  }
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={`Level ${career.level} erreicht`}>
      {CONFETTI.map((c, i) => (
        <span key={i} className="confetti" style={{ left: `${8 + i * 9}%`, background: c, animationDelay: `${(i * 0.37) % 3}s` }} />
      ))}
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#6BE07A' }}>Aufgestiegen</span>
      <div style={{ position: 'relative', width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg className="rays" width="240" height="240" viewBox="0 0 260 260" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <path d="M130 130L118 0h24zM130 130l12 130h-24zM130 130L0 118v24zM130 130l130 12v-24zM130 130L32 15l17-17zM130 130l98 115-17 17zM130 130L15 228l-17-17zM130 130L245 32l17 17z" fill="#3BBC4A" opacity="0.14" />
        </svg>
        <div
          className="pop"
          style={{ width: 140, height: 140, borderRadius: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #8CF09A, #3BBC4A 55%, #23802F)', boxShadow: '0 18px 40px -10px rgba(59,188,74,.55), inset 0 2px 0 rgba(255,255,255,.35)', color: '#0E1013' }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.75 }}>Level</span>
          <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{career.level}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>Level {career.level} erreicht!</h1>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#6BE07A' }}>{newTitle ? `Neuer Titel: ${career.title}` : career.title}</span>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--text-2)', lineHeight: 1.5, maxWidth: 300 }}>
          {career.xp.toLocaleString('de-DE')} XP gesammelt – noch {(career.nextXp - career.xp).toLocaleString('de-DE')} bis Level {career.level + 1}.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 400, marginTop: 8 }}>
        <button className="btn" style={{ flex: 1, minHeight: 52, borderRadius: 16, fontSize: 15, fontWeight: 600, background: 'var(--nav)' }} onClick={share}>
          Teilen
        </button>
        <button className="btn" style={{ flex: 1, minHeight: 52, borderRadius: 16, border: 'none', background: '#3BBC4A', color: '#0E1013', fontSize: 15, fontWeight: 700 }} onClick={done} autoFocus>
          Weiter
        </button>
      </div>
    </div>
  )
}
