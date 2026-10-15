import { useEffect, useMemo, useState } from 'react'
import { TIER_ORDER, type Medal } from '../domain/model'
import { useData, useMyName } from './components'
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
  if (!me || !medal) return null
  const t = TIERS[medal.tier]
  const hist = model.rating.history.get(me) ?? []
  const last = hist[hist.length - 1]
  const rank = model.ranking('all').find((r) => r.name === me)?.rank
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
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Elo</span>
          <span className="num" style={{ fontSize: 18, fontWeight: 800 }}>
            {fmtElo(last.after)}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: last.delta >= 0 ? 'var(--me)' : 'var(--muted)' }}>{fmtDelta(last.delta)}</span>
          {last.delta > 0 && <Chevrons value={1} size={20} />}
          {rank && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Platz {rank}</span>}
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
