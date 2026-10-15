import { NavLink, Outlet } from 'react-router-dom'
import { AREA } from './colors'
import { Avatar, useData, useMyName, Wordmark } from './components'
import { NAV_ICONS, StrokeIcon } from './icons'
import { useMe } from './me'

const ITEMS = [
  { to: '/', label: 'Boxengasse', short: 'Start', icon: NAV_ICONS.home, color: AREA.home, end: true },
  { to: '/fahrer', label: 'Fahrer', short: 'Fahrer', icon: NAV_ICONS.drivers, color: AREA.drivers },
  { to: '/autos', label: 'Fahrzeuge', short: 'Autos', icon: NAV_ICONS.cars, color: AREA.cars },
  { to: '/historie', label: 'Historie', short: 'Historie', icon: NAV_ICONS.history, color: AREA.history },
  { to: '/statistik', label: 'Statistiken', short: 'Statistik', icon: NAV_ICONS.stats, color: AREA.stats },
]

export function Layout() {
  const me = useMyName()
  const { openPicker } = useMe()
  const { source } = useData()
  return (
    <div className="shell">
      <nav className="side-nav" aria-label="Hauptnavigation">
        <div className="brand">
          <Wordmark width={150} />
        </div>
        {ITEMS.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className="item" style={{ ['--nav-color' as string]: it.color }}>
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
          <NavLink key={it.to} to={it.to} end={it.end} aria-label={it.label} style={{ ['--nav-color' as string]: it.color }}>
            {({ isActive }) => (
              <>
                <StrokeIcon d={it.icon} color={isActive ? it.color : '#7D8691'} />
                <span>{it.short}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
