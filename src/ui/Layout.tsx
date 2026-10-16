import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AREA } from './colors'
import { Avatar, useData, useMyName, Wordmark } from './components'
import { NAV_ICONS, StrokeIcon } from './icons'
import { useMe } from './me'

// „Rennen“ umfasst Renntage (Historie), Statistik und einzelne Läufe
const ITEMS = [
  { to: '/', label: 'Boxengasse', short: 'Start', icon: NAV_ICONS.home, color: AREA.home, match: (p: string) => p === '/' },
  { to: '/fahrer', label: 'Fahrer', short: 'Fahrer', icon: NAV_ICONS.drivers, color: AREA.drivers, match: (p: string) => p.startsWith('/fahrer') },
  { to: '/autos', label: 'Fahrzeuge', short: 'Autos', icon: NAV_ICONS.cars, color: AREA.cars, match: (p: string) => p.startsWith('/autos') },
  { to: '/saison', label: 'Saison', short: 'Saison', icon: NAV_ICONS.season, color: AREA.season, match: (p: string) => p.startsWith('/saison') || p.startsWith('/wrapped') || p.startsWith('/wettkampf') },
  { to: '/historie', label: 'Rennen', short: 'Rennen', icon: NAV_ICONS.races, color: AREA.history, match: (p: string) => /^\/(historie|statistik|lauf)/.test(p) },
]

export function Layout() {
  const me = useMyName()
  const { openPicker } = useMe()
  const { source } = useData()
  const { pathname } = useLocation()
  return (
    <div className="shell">
      <nav className="side-nav" aria-label="Hauptnavigation">
        <div className="brand">
          <Wordmark width={150} />
        </div>
        {ITEMS.map((it) => (
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
          onClick={openPicker}
          style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 12px', borderRadius: 16, border: '1px solid var(--line-2)', background: 'var(--inner-2)', textAlign: 'left', boxShadow: 'var(--sh2)' }}
        >
          {me ? <Avatar name={me} size={36} ring="var(--me)" /> : <span className="avatar" style={{ width: 36, height: 36, border: '2px dashed var(--muted)' }} />}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{me ?? 'Wer bist du?'}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{me ? 'Das bin ich · ändern' : 'Fahrer auswählen'}</span>
          </span>
        </button>
      </nav>
      <div className="content">
        <Outlet />
      </div>
      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} aria-label={it.label} className={() => (it.match(pathname) ? 'active' : '')} aria-current={it.match(pathname) ? 'page' : undefined} style={{ ['--nav-color' as string]: it.color }}>
            <StrokeIcon d={it.icon} color={it.match(pathname) ? it.color : '#7D8691'} />
            <span>{it.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
