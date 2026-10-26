import { useState } from 'react'
import { Avatar, Sheet, useData } from './components'
import { SearchIcon } from './icons'
import { useMe } from './me'

/** „Wer bist du?“ – eigener Name wird überall hervorgehoben, nur auf diesem Gerät gespeichert. */
export function MePicker() {
  const { me, setMe, closePicker } = useMe()
  const { model, newcomers } = useData()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(me)
  // Fahrer aus der Wertung, danach neue Fahrer ohne Rennen (aus dem Einstellungen-Sheet)
  const rows: { name: string; sub: string }[] = [
    ...model.ranking('all').map((r) => ({ name: r.name, sub: `${r.placing ? 'Einstufung' : `Rang ${r.rank}`} · ${r.races} Rennen` })),
    ...newcomers.map((name) => ({ name, sub: 'Noch kein Rennen' })),
  ]
  const shown = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Sheet onClose={closePicker} label="Wer bist du?">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Wer bist du?</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.45 }}>
          Dein Name wird überall hervorgehoben: in Ranglisten, Rennergebnissen und bei den Autos siehst du deine eigenen Zeiten. Nur auf diesem Gerät gespeichert.
        </p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--inner-2)', borderRadius: 14, padding: '0 14px', minHeight: 48, border: '1px solid var(--line-2)' }}>
        <SearchIcon />
        <span className="sr-only">Fahrer suchen</span>
        <input
          type="search"
          placeholder="Name suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 15, font: 'inherit' }}
        />
      </label>
      <div role="radiogroup" aria-label="Fahrer" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map((r) => {
          const sel = r.name === picked
          return (
            <button
              key={r.name}
              role="radio"
              aria-checked={sel}
              onClick={() => setPicked(r.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 52,
                padding: '0 12px',
                borderRadius: 14,
                border: `2px solid ${sel ? 'rgba(59,188,74,.53)' : 'transparent'}`,
                background: sel ? 'linear-gradient(90deg, rgba(59,188,74,.3) 0%, rgba(59,188,74,.08) 60%, #1A1E24 100%)' : 'var(--inner-2)',
                textAlign: 'left',
                boxShadow: 'var(--sh-row)',
                flexShrink: 0,
              }}
            >
              <Avatar name={r.name} size={34} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {r.sub}
                </span>
              </span>
              {sel && (
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="var(--me)" />
                  <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#0E1013" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ position: 'sticky', bottom: -20, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--sheet)', paddingTop: 8 }}>
        <button
          className="btn primary"
          disabled={!picked}
          style={{ minHeight: 52, borderRadius: 16, fontSize: 16, ['--accent' as string]: 'var(--me)', opacity: picked ? 1 : 0.5 }}
          onClick={() => {
            setMe(picked)
            closePicker()
          }}
        >
          {picked ? `Das bin ich: ${picked}` : 'Namen auswählen'}
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setMe(null)
            closePicker()
          }}
        >
          Nur zuschauen
        </button>
      </div>
    </Sheet>
  )
}
