import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const KEY = 'gr-legends:me'

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

interface MeState {
  me: string | null
  setMe: (name: string | null) => void
  pickerOpen: boolean
  openPicker: () => void
  closePicker: () => void
}

const MeContext = createContext<MeState | null>(null)

/** „Das bin ich“: Auswahl des eigenen Fahrers, nur auf diesem Gerät gespeichert. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<string | null>(read)
  const [pickerOpen, setPickerOpen] = useState(false)
  const setMe = useCallback((name: string | null) => {
    setMeState(name)
    try {
      if (name) localStorage.setItem(KEY, name)
      else localStorage.removeItem(KEY)
    } catch {
      // Speicher gesperrt – Auswahl gilt nur bis zum Neuladen
    }
  }, [])
  const value = useMemo(
    () => ({ me, setMe, pickerOpen, openPicker: () => setPickerOpen(true), closePicker: () => setPickerOpen(false) }),
    [me, setMe, pickerOpen],
  )
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

export function useMe(): MeState {
  const ctx = useContext(MeContext)
  if (!ctx) throw new Error('useMe außerhalb von MeProvider')
  return ctx
}
