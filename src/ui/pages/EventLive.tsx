import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { planVisible, storylines, todayIso } from '../../domain/event/insights'
import { Avatar, useData } from '../components'
import { formatTime } from '../format'
import { EVENT_ACCENT, fmtPts, PhasePill, phaseOf, Podium, StoryIcon, useEventState } from '../event/shared'

const REFRESH_MS = 30_000
const TICKER_MS = 8_000
const CONFETTI = ['#F6C83C', '#3BBC4A', '#FF5A4E', '#4AA8F0', '#AE6DEE', '#3BBC4A', '#EE9E10', '#FFFFFF', '#FF5A4E', '#F6C83C']

/**
 * Leinwand-Modus für Tablet oder Fernseher an der Bahn: groß, ohne Navigation, aktualisiert sich
 * alle 30 Sekunden – sobald eine neue CSV im Drive-Ordner liegt, erscheint das Ergebnis.
 */
export function EventLive() {
  const { id = '' } = useParams()
  const data = useData()
  const folder = data.events.find((e) => e.id === id)
  const state = useEventState(folder)
  const queryClient = useQueryClient()
  const [updated, setUpdated] = useState(() => new Date())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['appData'] }).then(() => setUpdated(new Date()))
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [queryClient])
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), TICKER_MS)
    return () => clearInterval(timer)
  }, [])
  // Bildschirm anlassen, solange die Leinwand offen ist (wo unterstützt)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [])

  if (!folder || !state) {
    return (
      <div className="live">
        <p>Diesen Wettkampf gibt es nicht.</p>
        <Link to="/wettkampf" className="btn">
          Zurück
        </Link>
      </div>
    )
  }
  const def = folder.def
  const phase = phaseOf(def, state)
  const stories = storylines(state)
  const story = stories.length ? stories[tick % stories.length] : null
  const showPlan = planVisible(def, todayIso())
  const lastDone = [...state.heats].reverse().find((h) => h.status === 'done')
  const after = state.next ? state.heats.slice(state.heats.indexOf(state.next) + 1).filter((h) => h.status !== 'done').slice(0, 2) : []
  const done = phase === 'done' && state.started

  return (
    <div className="live" style={{ ['--accent' as string]: EVENT_ACCENT }}>
      {done && CONFETTI.map((c, i) => <span key={i} className="confetti" style={{ left: `${6 + i * 9.5}%`, background: c, animationDelay: `${(i * 0.37) % 3}s` }} />)}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="kicker" style={{ color: EVENT_ACCENT }}>
            {folder.tracks.join(', ')}
          </span>
          <h1>{def.name}</h1>
        </div>
        <PhasePill phase={phase} />
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--faint)' }}>Stand {updated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
        <Link to={`/wettkampf/${id}`} className="btn round" aria-label="Leinwand schließen">
          Schließen
        </Link>
      </header>

      <div className="live-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {done ? (
            <section className="card">
              <span className="card-title" style={{ fontSize: '1.1em' }}>
                Siegerehrung
              </span>
              <div className="pop">
                <Podium state={state} />
              </div>
              {state.teamStandings[0] && <span style={{ textAlign: 'center' }}>Bestes Team: <b>{state.teamStandings[0].name}</b></span>}
            </section>
          ) : showPlan && state.next ? (
            <section className="card" style={{ borderColor: EVENT_ACCENT }}>
              <span className="kicker" style={{ color: EVENT_ACCENT }}>
                Als Nächstes · {state.next.label}
              </span>
              {state.next.note && <span style={{ color: 'var(--muted)' }}>{state.next.note}</span>}
              {state.next.entrants.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {e.name ? <Avatar name={e.name} size={48} /> : <span style={{ width: 48, height: 48, borderRadius: 24, border: '2px dashed var(--faint)' }} />}
                  <span className="big-name" style={e.name ? undefined : { color: 'var(--faint)' }}>
                    {e.label}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--muted)', textAlign: 'right' }}>{e.name ? state.next!.cars[e.name] ?? '' : ''}</span>
                </div>
              ))}
              {state.next.carHint && <span style={{ color: 'var(--muted)', fontSize: '0.8em' }}>{state.next.carHint}</span>}
              {after.length > 0 && (
                <span style={{ color: 'var(--muted)', fontSize: '0.85em' }}>
                  Danach: {after.map((h) => `${h.label} (${h.entrants.map((e) => (e.name ? e.name.split(' ')[0] : '?')).join(', ')})`).join(' · ')}
                </span>
              )}
            </section>
          ) : (
            <section className="card">
              <span className="big-name">{state.started ? 'Alle Läufe gefahren' : 'Gleich geht’s los'}</span>
            </section>
          )}
          {lastDone && !done && (
            <section className="card">
              <span className="kicker">Letztes Ergebnis · {lastDone.label}</span>
              {lastDone.order.map((n, i) => {
                const r = lastDone.session?.results.find((x) => x.driver === n)
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className={`rank${i < 3 ? ` r${i + 1}` : ''}`} style={{ fontSize: '1.3em', minWidth: 30 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontWeight: 700 }}>{n}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{r?.validBestLapMs ? formatTime(r.validBestLapMs) : ''}</span>
                    <span className="num" style={{ minWidth: 50, textAlign: 'right', fontWeight: 800, color: lastDone.advancing?.includes(n) ? EVENT_ACCENT : undefined }}>
                      {lastDone.advancing?.includes(n) ? '↑ weiter' : lastDone.points.has(n) ? `+${fmtPts(lastDone.points.get(n)!)}` : ''}
                    </span>
                  </div>
                )
              })}
            </section>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card" style={{ gap: 6 }}>
            <span className="kicker">{state.started ? 'Stand' : 'Teilnehmer'}</span>
            {(state.started ? state.standings.slice(0, 10) : state.standings).map((r) => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: '2em' }}>
                {state.started ? (
                  <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`} style={{ fontSize: '1.3em', minWidth: 30 }}>
                    {r.rank}
                  </span>
                ) : (
                  <Avatar name={r.name} size={32} />
                )}
                <span style={{ fontWeight: 700 }}>{r.name}</span>
                {r.team && <span style={{ color: 'var(--muted)', fontSize: '0.8em' }}>{r.team}</span>}
                {state.started && (
                  <span className="num" style={{ marginLeft: 'auto', fontSize: '1.3em', fontWeight: 800 }}>
                    {fmtPts(r.total)}
                  </span>
                )}
              </div>
            ))}
          </section>
          {state.teamStandings.length > 0 && (
            <section className="card" style={{ gap: 6 }}>
              <span className="kicker">Teams</span>
              {state.teamStandings.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`rank${t.rank <= 3 ? ` r${t.rank}` : ''}`} style={{ fontSize: '1.2em', minWidth: 30 }}>
                    {t.rank}
                  </span>
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8em' }}>{t.drivers.join(', ')}</span>
                  <span className="num" style={{ marginLeft: 'auto', fontSize: '1.2em', fontWeight: 800 }}>
                    {fmtPts(t.points)}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {story && (
        <div className="ticker" key={tick} style={{ animation: 'fade 0.6s ease-out' }}>
          <StoryIcon icon={story.icon} size={28} />
          <span>{story.text}</span>
        </div>
      )}
    </div>
  )
}
