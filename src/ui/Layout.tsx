import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AREA } from './colors'
import { Avatar, useData, useMyName, useOpenMe, Wordmark } from './components'
import { NAV_ICONS, StrokeIcon } from './icons'
import { useStored } from './useStored'
import { PrivacyFooter } from './Privacy'

const isField = (p: string) => /^\/(fahrer|autos)/.test(p)

// „Stats“ umfasst Fahrer und Fahrzeuge (Umschalter oben), „Historie“ Renntage, Statistik und einzelne Läufe
const ITEMS = [
  { to: '/', label: 'Boxengasse', short: 'Start', icon: NAV_ICONS.home, color: AREA.home, match: (p: string) => p === '/' },
  { to: '/fahrer', label: 'Stats', short: 'Stats', icon: NAV_ICONS.stats, color: AREA.drivers, match: isField },
  { to: '/saison', label: 'Saison', short: 'Saison', icon: NAV_ICONS.season, color: AREA.season, match: (p: string) => p.startsWith('/saison') || p.startsWith('/wrapped') },
  { to: '/wettkampf', label: 'Events', short: 'Events', icon: NAV_ICONS.events, color: AREA.events, match: (p: string) => p.startsWith('/wettkampf') },
  { to: '/historie', label: 'Historie', short: 'Historie', icon: NAV_ICONS.races, color: AREA.history, match: (p: string) => /^\/(historie|statistik|lauf)/.test(p) },
]

/** Stats-Gruppe: führt zurück zu dem, was zuletzt offen war (Fahrer oder Autos), in dessen Farbe */
function useNavItems(pathname: string) {
  const [field, setField] = useStored<'fahrer' | 'autos'>('nav:field', 'fahrer')
  const now = pathname.startsWith('/autos') ? 'autos' : pathname.startsWith('/fahrer') ? 'fahrer' : null
  useEffect(() => {
    if (now && now !== field) setField(now)
  }, [now, field, setField])
  const cars = (now ?? field) === 'autos'
  return ITEMS.map((it) => (it.to === '/fahrer' ? { ...it, to: cars ? '/autos' : '/fahrer', color: cars ? AREA.cars : AREA.drivers } : it))
}

export function Layout() {
  const me = useMyName()
  const openMe = useOpenMe()
  const { source } = useData()
  const { pathname } = useLocation()
  const items = useNavItems(pathname)
  return (
    <div className="shell">
      <nav className="side-nav" aria-label="Hauptnavigation">
        <div className="brand">
          <Wordmark width={150} />
        </div>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={() => `item${it.match(pathname) ? ' active' : ''}`} aria-current={it.match(pathname) ? 'page' : undefined} style={{ ['--nav-color' as string]: it.color }}>
            <StrokeIcon d={it.icon} color={it.color} />
            <span>{it.label}</span>
            <span className="dot" />
          </NavLink>
        ))}
        {source !== 'drive' && (
          <span className="pill" style={{ alignSelf: 'flex-start', margin: '12px 12px 0', color: 'var(--history)' }}>
            {source === 'local' ? 'Lokale Daten' : 'Testdaten'}
          </span>
        )}
        <button
          onClick={openMe}
          style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 12px', borderRadius: 16, border: '1px solid var(--line-2)', background: 'var(--inner-2)', textAlign: 'left', boxShadow: 'var(--sh2)' }}
        >
          {me ? <Avatar name={me} size={36} ring="var(--me)" /> : <span className="avatar" style={{ width: 36, height: 36, border: '2px dashed var(--muted)' }} />}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{me ?? 'Wer bist du?'}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{me ? 'Mein Profil' : 'Fahrer auswählen'}</span>
          </span>
        </button>
      </nav>
      <div className="content">
        <Outlet />
        <PrivacyFooter />
      </div>
      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} aria-label={it.label} className={() => (it.match(pathname) ? 'active' : '')} aria-current={it.match(pathname) ? 'page' : undefined} style={{ ['--nav-color' as string]: it.color }}>
            <StrokeIcon d={it.icon} color={it.match(pathname) ? it.color : '#7D8691'} />
            <span>{it.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
