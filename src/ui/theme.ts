import { useSyncExternalStore } from 'react'

/** Design: automatisch nach dem Gerät, immer hell oder immer dunkel (nur auf diesem Gerät gespeichert) */
export type ThemePref = 'auto' | 'light' | 'dark'

// Gleicher Schlüssel wie in `index.html`, das das Design vor dem Start setzt (kein Aufblitzen)
const KEY = 'gr-legends:theme'
const META_BG = { dark: '#0B0D10', light: '#ECEFF3' }

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null)

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const resolve = (pref: ThemePref): 'light' | 'dark' => (pref === 'auto' ? (media()?.matches ? 'light' : 'dark') : pref)

/** Setzt das Design auf der Seite: `data-theme` (ohne bei „auto“) und die Browserfarbe */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_BG[resolve(pref)])
}

const listeners = new Set<() => void>()
let pref: ThemePref = typeof window !== 'undefined' ? readThemePref() : 'auto'
const notify = () => listeners.forEach((l) => l())

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Speicher gesperrt – gilt nur für diese Sitzung
  }
  applyTheme(next)
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const m = media()
  const onChange = () => {
    applyTheme(pref)
    cb()
  }
  m?.addEventListener('change', onChange)
  return () => {
    listeners.delete(cb)
    m?.removeEventListener('change', onChange)
  }
}

/** Gewählte Einstellung (auto/hell/dunkel) */
export const useThemePref = () => useSyncExternalStore(subscribe, () => pref, () => 'auto' as ThemePref)

/** Tatsächlich angezeigtes Design – für Farben, die im Code berechnet werden (z. B. Heatmap) */
export const useResolvedTheme = () => useSyncExternalStore(subscribe, () => resolve(pref), () => 'dark' as const)
