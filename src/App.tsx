import { useEffect, useRef } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom'
import { DriveUnreachableError } from './data/drive'
import { useAppData, useLoadProgress } from './data/useRaceDays'
import { Celebration } from './ui/Celebration'
import { DataContext, Monogram } from './ui/components'
import { GradientDefs } from './ui/icons'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Layout } from './ui/Layout'
import { MeProvider, useMe } from './ui/me'
import { MedalPopupProvider } from './ui/MedalPopup'
import { MePicker } from './ui/MePicker'
import { CarProfile, Cars } from './ui/pages/Cars'
import { Compare } from './ui/pages/Compare'
import { DriverProfile, MedalsSheet } from './ui/pages/DriverProfile'
import { Drivers } from './ui/pages/Drivers'
import { EventEditor } from './ui/pages/EventEditor'
import { EventLive } from './ui/pages/EventLive'
import { EventRecap } from './ui/pages/EventRecap'
import { Events } from './ui/pages/Events'
import { EventView } from './ui/pages/EventView'
import { History, RaceView } from './ui/pages/History'
import { Home } from './ui/pages/Home'
import { Season } from './ui/pages/Season'
import { Stats } from './ui/pages/Stats'
import { Wrapped } from './ui/pages/Wrapped'

const ASKED_KEY = 'gr-legends:me-asked'

function AppRoutes() {
  const location = useLocation()
  const navigate = useNavigate()
  const { me, pickerOpen, openPicker } = useMe()
  // Beim allerersten Öffnen fragen „Wer bist du?“ (einmal pro Gerät, nicht auf der Leinwand)
  useEffect(() => {
    if (me || location.pathname.endsWith('/leinwand')) return
    try {
      if (localStorage.getItem(ASKED_KEY)) return
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      return
    }
    openPicker()
    // nur beim Start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Fahrer- und Fahrzeugprofile öffnen sich als Panel über der vorherigen Seite;
  // bei direktem Link über der Fahrer- bzw. Fahrzeugliste
  const state = location.state as { bg?: Location } | null
  const isSheet = /^\/(fahrer|autos)\/[^/]+/.test(location.pathname)
  const listPath = location.pathname.startsWith('/autos') ? '/autos' : '/fahrer'
  const lastPage = useRef<Location | null>(null)
  useEffect(() => {
    if (!isSheet) lastPage.current = location
  })
  const bg = state?.bg ?? lastPage.current
  const background = isSheet ? (bg ?? ({ ...location, pathname: listPath } as Location)) : location
  const close = () => (bg ? navigate(-1) : navigate(listPath))
  const navType = useNavigationType()
  // Neue Seite beginnt oben (außer Profil-Panels und Zurück)
  useEffect(() => {
    if (!isSheet && navType !== 'POP') window.scrollTo(0, 0)
  }, [location.pathname, isSheet, navType])

  return (
    <>
      <Routes location={background}>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="fahrer" element={<Drivers />} />
          <Route path="autos" element={<Cars />} />
          <Route path="historie" element={<History />} />
          <Route path="lauf/:fileId" element={<RaceView />} />
          <Route path="statistik" element={<Stats />} />
          <Route path="statistik/:tab" element={<Stats />} />
          <Route path="vergleich" element={<Compare />} />
          <Route path="saison" element={<Season />} />
          <Route path="saison/:year" element={<Season />} />
          <Route path="wrapped/:year/:name" element={<Wrapped />} />
          <Route path="wettkampf" element={<Events />} />
          <Route path="wettkampf/neu" element={<EventEditor />} />
          <Route path="wettkampf/:id" element={<EventView />} />
          <Route path="wettkampf/:id/bearbeiten" element={<EventEditor />} />
          <Route path="wettkampf/:id/rueckblick" element={<EventRecap />} />
          <Route path="*" element={<div className="state">Seite nicht gefunden.</div>} />
        </Route>
        {/* Leinwand: ganzer Bildschirm ohne Navigation */}
        <Route path="wettkampf/:id/leinwand" element={<EventLive />} />
      </Routes>
      {isSheet && (
        <Routes>
          <Route path="/fahrer/:name" element={<DriverProfile onClose={close} />} />
          <Route path="/fahrer/:name/medaillen" element={<MedalsSheet onClose={close} />} />
          <Route path="/autos/:name" element={<CarProfile onClose={close} />} />
        </Routes>
      )}
      {pickerOpen && <MePicker />}
      <Celebration />
    </>
  )
}

function Loading() {
  const progress = useLoadProgress()
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="state">
      <Monogram width={90} />
      <span>Lade Rennergebnisse …</span>
      {progress && progress.total > 0 && (
        <>
          <div className="load-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <span className="muted small">
            {progress.done} / {progress.total} Läufe · beim ersten Öffnen dauert es etwas
          </span>
          {progress.problems && <span className="muted small">Google: {progress.problems}</span>}
        </>
      )}
    </div>
  )
}

function Loaded() {
  const { data, isPending, error, refetch } = useAppData()
  const progress = useLoadProgress()
  if (isPending) return <Loading />
  if (error) {
    return (
      <div className="state">
        <Monogram width={90} />
        {error instanceof DriveUnreachableError ? (
          <p className="error">
            Google Drive ist nicht erreichbar. Internetverbindung prüfen – oder ein Tracking-Schutz bzw. Werbeblocker sperrt
            googleapis.com (in Edge: Schloss-Symbol neben der Adresse → Tracking-Verhinderung für diese Seite aus).
          </p>
        ) : (
          <p className="error">Die Rennergebnisse konnten nicht geladen werden: {error.message}</p>
        )}
        {progress?.problems && <span className="muted small">Google: {progress.problems}</span>}
        <button className="btn" onClick={() => refetch()}>
          Nochmal versuchen
        </button>
      </div>
    )
  }
  return (
    <DataContext.Provider value={data}>
      <HashRouter>
        <MedalPopupProvider>
          <AppRoutes />
        </MedalPopupProvider>
      </HashRouter>
    </DataContext.Provider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <MeProvider>
        <GradientDefs />
        <Loaded />
      </MeProvider>
    </ErrorBoundary>
  )
}
