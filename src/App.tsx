import { useEffect, useRef } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom'
import { useAppData } from './data/useRaceDays'
import { Celebration } from './ui/Celebration'
import { DataContext, Monogram } from './ui/components'
import { GradientDefs } from './ui/icons'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { Layout } from './ui/Layout'
import { MeProvider, useMe } from './ui/me'
import { MePicker } from './ui/MePicker'
import { CarProfile, Cars } from './ui/pages/Cars'
import { Compare } from './ui/pages/Compare'
import { DriverProfile, MedalsSheet } from './ui/pages/DriverProfile'
import { Drivers } from './ui/pages/Drivers'
import { History, RaceView } from './ui/pages/History'
import { Home } from './ui/pages/Home'
import { Season } from './ui/pages/Season'
import { Stats } from './ui/pages/Stats'
import { Wrapped } from './ui/pages/Wrapped'

function AppRoutes() {
  const location = useLocation()
  const navigate = useNavigate()
  const { pickerOpen } = useMe()
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
          <Route path="*" element={<div className="state">Seite nicht gefunden.</div>} />
        </Route>
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

function Loaded() {
  const { data, isPending, error, refetch } = useAppData()
  if (isPending) {
    return (
      <div className="state">
        <Monogram width={90} />
        <span>Lade Rennergebnisse …</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="state">
        <Monogram width={90} />
        <p className="error">Die Rennergebnisse konnten nicht geladen werden: {error.message}</p>
        <button className="btn" onClick={() => refetch()}>
          Nochmal versuchen
        </button>
      </div>
    )
  }
  return (
    <DataContext.Provider value={data}>
      <HashRouter>
        <AppRoutes />
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
