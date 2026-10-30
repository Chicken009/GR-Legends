import { Link, useNavigate, useParams } from 'react-router-dom'
import { CAR_PROVISIONAL_RACES, type CarStats } from '../../domain/model'
import { carScale } from '../../data/settings'
import { quantile } from '../../domain/laps'
import { AREA } from '../colors'
import { CarPhoto, CarThumb, usePhotoId } from '../CarPhoto'
import { FieldSwitch } from '../FieldSwitch'
import { carPath, PageHead, PeriodTabs, Segment, SettingsHint, SettingsProblem, Sheet, Tile, useData, useMyName, ViewToggle } from '../components'
import { DataTable, type Column } from '../DataTable'
import { BoxPlot, type BoxRow } from '../charts/BoxPlot'
import { LapHistogram } from '../charts/LapHistogram'
import { RadarChart } from '../charts/RadarChart'
import { CarSilhouette, Chevrons, RecordFlame } from '../icons'
import { fmtGapSec, fmtNum, fmtPct, formatTime } from '../format'
import { useStored } from '../useStored'
import { isGuest } from '../../domain/drivers'

const ACCENT = AREA.cars

/** Autos sortiert nach Autowertung (ab 3 Rennen), danach die übrigen nach Rennen */
function rankedCars(cars: Map<string, CarStats>) {
  // auch Autos, die bisher nur im Qualifying gefahren sind
  const list = [...cars.values()].filter((c) => c.races > 0 || c.qualis > 0)
  const rated = list.filter((c) => c.races >= 3).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const rest = list.filter((c) => c.races < 3).sort((a, b) => b.races - a.races || b.qualis - a.qualis)
  return { rated, rest }
}

const fmtRating = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(Math.round(r))}`

/** Autowertung mit wenigen Rennen: noch unsicher */
function Provisional() {
  const label = `Vorläufig: weniger als ${CAR_PROVISIONAL_RACES} Rennen – die Wertung kann sich noch deutlich ändern`
  return (
    <span title={label} aria-label={label} style={{ marginLeft: 4, fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>
      vorl.
    </span>
  )
}

export function UnderdogBonus({ bonus, compact }: { bonus: number; compact?: boolean }) {
  if (bonus <= 0) return null
  const label = `Underdog-Bonus ${bonus} von 3: Siege mit diesem Auto bringen mehr Elo`
  return (
    <span role="img" aria-label={label} title={label} style={{ display: 'inline-flex', gap: compact ? 0 : 2 }}>
      {[1, 2, 3].map((i) => (
        <Chevrons key={i} value={2} size={compact ? 14 : 20} color={i <= bonus ? ACCENT : 'var(--line-3)'} className={i <= bonus ? 'pulse' : undefined} />
      ))}
    </span>
  )
}

export function Cars() {
  const { model, settings, unmatched } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const [period, setPeriod] = useStored('cars:period', 'all')
  const [view, setView] = useStored<'table' | 'cards'>('cars:view', 'table')
  const p = period === 'all' || model.years.includes(period) ? period : 'all'
  const cars = model.stats(p).cars
  const { rated, rest } = rankedCars(cars)
  const all = [...rated, ...rest]
  const rankOf = new Map(rated.map((c, i) => [c.name, i + 1]))
  const myFav = me ? model.stats(p).drivers.get(me)?.favoriteCar : null
  // Verteilung der sauberen Runden je Auto (ab 5 Rennen), schnellster Median oben
  const boxes: BoxRow[] = all
    .filter((c) => c.races >= 5)
    .map((c) => {
      const xs = [...c.drivers.values()].flatMap((v) => v.normal).sort((a, b) => a - b)
      return { key: c.name, label: c.name, n: xs.length, highlight: c.name === myFav, q: [0.05, 0.25, 0.5, 0.75, 0.95].map((q) => quantile(xs, q)) as BoxRow['q'] }
    })
    .filter((b) => b.n >= 20)
    .sort((a, b) => a.q[2] - b.q[2])
  const columns: Column<CarStats>[] = [
    { key: 'name', label: 'Fahrzeug', left: true, value: (c) => c.name, render: (c) => <CarName car={c} /> },
    { key: 'rating', label: 'Wertung', title: `Autowertung in Elo-Punkten: fahrerbereinigtes Tempo und Zeitverlust durch Abflüge und Defekte aus allen Rennen, gleichbleibende neue Entwicklungen zählen zusätzlich. vorl. = weniger als ${CAR_PROVISIONAL_RACES} Rennen`, strong: true, value: (c) => c.rating, render: (c) => (c.rating == null ? '–' : <>{fmtRating(c.rating)}{c.provisional && <Provisional />}</>) },
    { key: 'races', label: 'Rennen', value: (c) => c.races },
    { key: 'qualis', label: 'Qualis', value: (c) => c.qualis },
    { key: 'wins', label: 'Siege', value: (c) => c.wins },
    { key: 'winRate', label: 'Siegquote', value: (c) => c.winRate, render: (c) => fmtPct(c.winRate) },
    { key: 'podiums', label: 'Podien', value: (c) => c.podiums },
    { key: 'avgPos', label: 'Ø Platz', asc: true, value: (c) => c.avgPosition, render: (c) => fmtNum(c.avgPosition) },
    { key: 'beat', label: 'Ø geschlagen', title: 'Anteil des Feldes, den man mit diesem Auto im Schnitt hinter sich lässt', value: (c) => c.beatShare, render: (c) => fmtPct(c.beatShare) },
    { key: 'best', label: 'Bestzeit', asc: true, value: (c) => c.bestLapMs, render: (c) => formatTime(c.bestLapMs) },
    { key: 'bestBy', label: 'von', left: true, value: (c) => c.bestBy },
    { key: 'tempo', label: 'Tempo', title: 'Saubere Runde gegenüber dem Ø Auto, fahrer- und laufbereinigt (minus = schneller)', asc: true, value: (c) => c.tempo, render: (c) => fmtGapSec(c.tempo) },
    { key: 'loss', label: 'Verlust/10 Rd', title: 'Verlorene Zeit durch Abflüge und Defekte in Sekunden je 10 Runden – neutral, nicht um Fahrer bereinigt (nur Rennen ohne Tankfunktion)', asc: true, value: (c) => c.lossPer10, render: (c) => (c.lossPer10 == null ? '–' : `${fmtNum(c.lossPer10)} s`) },
    { key: 'crash', label: 'Abflüge/100', title: 'Abflüge pro 100 Runden, fahrer- und laufbereinigt (nur Rennen ohne Tankfunktion)', asc: true, value: (c) => c.crashRate, render: (c) => fmtNum(c.crashRate) },
    { key: 'spread', label: 'Streuung', title: 'Ø Schwankung der Fahrer mit diesem Auto', asc: true, value: (c) => c.spread, render: (c) => fmtPct(c.spread, 1) },
    { key: 'drivers', label: 'Fahrer', title: 'Verschiedene Fahrer mit diesem Auto', value: (c) => [...c.drivers.keys()].filter((n) => !isGuest(n)).length },
    { key: 'laps', label: 'Runden', value: (c) => c.laps, render: (c) => fmtNum(c.laps, 0) },
    { key: 'km', label: 'km', value: (c) => c.km, render: (c) => fmtNum(c.km) },
    { key: 'scale', label: 'Maßstab', value: (c) => carScale(settings, c.name), render: (c) => `1:${carScale(settings, c.name)}` },
  ]
  return (
    <div className="page" style={{ ['--accent' as string]: ACCENT }}>
      <PageHead title="Fahrzeuge" kicker="Autowertung" color={ACCENT}>
        <ViewToggle value={view} onChange={setView} />
      </PageHead>
      <FieldSwitch value="autos" />
      <PeriodTabs value={p} onChange={setPeriod} years={model.years} />
      {view === 'table' ? (
        <DataTable
          label="Fahrzeuge"
          rows={all}
          columns={columns}
          rank={(c) => rankOf.get(c.name) ?? null}
          picture={(c) => <CarThumb car={c.name} />}
          rowKey={(c) => c.name}
          onRowClick={(c) => navigate(carPath(c.name))}
          highlight={(c) => c.name === myFav}
        />
      ) : (
        <div className="card-grid">
          {all.map((c) => (
            <CarCard key={c.name} car={c} rank={rankOf.get(c.name) ?? null} mine={c.name === myFav} />
          ))}
        </div>
      )}
      {boxes.length > 1 && (
        <section className="card" style={{ gap: 8 }}>
          <div className="card-head">
            <span className="card-title">Rundenzeiten je Auto</span>
            <span className="hint">alle sauberen Runden</span>
          </div>
          <BoxPlot rows={boxes} color={ACCENT} label="Verteilung der Rundenzeiten je Auto" onPick={(car) => navigate(carPath(car))} />
          <div className="legend">
            <span>Balken = mittlere Hälfte, Strich = Median, Linie = schnellste bis langsamste 5 %</span>
            <span>nicht fahrerbereinigt – dafür gibt es das Netzdiagramm im Autoprofil</span>
            {myFav && <span style={{ color: 'var(--me)' }}>Grün: dein Lieblingsauto</span>}
          </div>
        </section>
      )}
      <SettingsProblem />
      <SettingsHint names={unmatched.cars} kind="Fahrzeug" />
      <div className="legend">
        <span>Rang nach Autowertung: Tempo und Zeitverlust durch Abflüge und Defekte, umgerechnet in Elo-Punkte (ab 3 Rennen)</span>
        {view === 'table' && <span>Tempo, Zeitverlust und Abflüge sind fahrerbereinigt: verglichen wird, was dieselben Fahrer im selben Lauf mit anderen Autos fahren</span>}
        <span>vorl. = vorläufig: weniger als {CAR_PROVISIONAL_RACES} Rennen, die Wertung kann sich noch deutlich ändern</span>
        {view === 'table' && <span>Verlust/10 Rd = verlorene Sekunden je 10 Runden durch Abflüge und Defekte, neutral (nicht um Fahrer bereinigt), je Zwischenfall höchstens 5 Runden</span>}
        <span>
          <UnderdogBonus bonus={1} compact /> Underdog-Bonus: schwaches Auto, Siege zählen mehr
        </span>
        {myFav && <span style={{ color: 'var(--me)' }}>Grün: dein Lieblingsauto</span>}
      </div>
    </div>
  )
}

function CarName({ car }: { car: CarStats }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 600 }}>
      {car.name}
      <UnderdogBonus bonus={car.bonus} compact />
    </span>
  )
}

function CarCard({ car, rank, mine }: { car: CarStats; rank: number | null; mine: boolean }) {
  const photo = usePhotoId(car.name)
  const silhouette = <CarSilhouette width={150} />
  return (
    <Link to={carPath(car.name)} className="ccard" aria-label={`Fahrzeug ${car.name}`} style={mine ? { borderColor: 'rgba(59,188,74,.5)' } : undefined}>
      <div className="pic">
        {photo ? <CarPhoto key={photo} fileId={photo} alt={car.name} width={600} fallback={silhouette} /> : silhouette}
        <span className={`rank-badge rank${rank != null && rank <= 3 ? ` r${rank}` : ''}`}>{rank ?? '–'}</span>
      </div>
      <div className="info">
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: mine ? 'var(--me)' : undefined }}>{car.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span className="num" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Best {formatTime(car.bestLapMs)}
          </span>
          <UnderdogBonus bonus={car.bonus} compact />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, borderTop: '1px solid var(--track)', paddingTop: 8 }}>
          <Mini v={car.races} l="Rennen" />
          <Mini v={fmtPct(car.winRate)} l="Siege" />
          <Mini v={fmtNum(car.km)} l="km" />
        </div>
      </div>
    </Link>
  )
}

function Mini({ v, l }: { v: string | number; l: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{v}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
}

/** Siegquote erst ab so vielen Rennen mit dem Auto (sonst wären 1 von 1 gleich 100 %) */
const MIN_RACES_WINRATE = 3

type DriverList = 'fast' | 'wins' | 'km'

/** Fahrer mit diesem Auto: schnellste, höchste Siegquote, meiste km */
function CarDrivers({ c, me }: { c: CarStats; me: string | null }) {
  const [kind, setKind] = useStored<DriverList>('car:drivers', 'fast')
  const all = [...c.drivers].filter(([n]) => !isGuest(n))
  const rows =
    kind === 'fast'
      ? all.filter(([, v]) => v.bestLapMs != null).sort((a, b) => a[1].bestLapMs! - b[1].bestLapMs!)
      : kind === 'wins'
        ? all.filter(([, v]) => v.races >= MIN_RACES_WINRATE).sort((a, b) => b[1].wins / b[1].races - a[1].wins / a[1].races || b[1].wins - a[1].wins)
        : all.filter(([, v]) => v.km > 0).sort((a, b) => b[1].km - a[1].km)
  const top = rows.slice(0, 8)
  // Balkenlänge: schnellste Zeit, höchste Quote bzw. meiste km = voll
  const value = (v: CarStats['drivers'] extends Map<string, infer V> ? V : never) => (kind === 'fast' ? v.bestLapMs! : kind === 'wins' ? v.wins / v.races : v.km)
  const vals = top.map(([, v]) => value(v))
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const share = (x: number) => (kind === 'fast' ? (hi > lo ? 1 - ((x - lo) / (hi - lo)) * 0.8 : 1) : hi > 0 ? Math.max(0.04, x / hi) : 0)
  const hint = kind === 'fast' ? 'Bestzeit · Ø saubere Runde' : kind === 'wins' ? `Siege · ab ${MIN_RACES_WINRATE} Rennen` : 'Rennen und Qualifyings'
  return (
    <section className="inner" style={{ padding: 14, gap: 10 }}>
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="card-title">Fahrer</span>
        <Segment small label="Fahrerliste" value={kind} onChange={setKind} options={[['fast', 'Schnellste'], ['wins', 'Siegquote'], ['km', 'Meiste km']]} />
      </div>
      <span style={{ marginTop: -4, fontSize: 12, color: 'var(--muted)' }}>{hint}</span>
      {top.map(([n, v], i) => {
        const isMe = n === me
        const avg = kind === 'fast' && v.normal.length ? quantile([...v.normal].sort((a, b) => a - b), 0.5) : null
        return (
          <div key={n} className={isMe ? 'me-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '4px 6px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--track)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${share(value(v)) * 100}%`, borderRadius: 4, background: isMe ? 'var(--me)' : 'var(--faint-2)' }} />
            </div>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, width: 54, textAlign: 'right', color: i === 0 ? '#C9D4DE' : undefined }}>
              {kind === 'fast' ? formatTime(v.bestLapMs) : kind === 'wins' ? fmtPct(v.wins / v.races) : `${fmtNum(v.km)} km`}
            </span>
            <span className="num" style={{ fontSize: 11, color: 'var(--muted)', width: kind === 'km' ? 56 : 40, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {kind === 'fast'
                ? avg
                  ? (avg / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '–'
                : kind === 'wins'
                  ? `${v.wins}/${v.races}`
                  : `${v.races} Rennen`}
            </span>
          </div>
        )
      })}
      {!top.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{kind === 'wins' ? `Noch niemand mit mindestens ${MIN_RACES_WINRATE} Rennen in diesem Auto.` : 'Noch keine Daten.'}</p>}
    </section>
  )
}

export function CarProfile({ onClose }: { onClose: () => void }) {
  const { name = '' } = useParams()
  const { model, settings, photos } = useData()
  const me = useMyName()
  const car = decodeURIComponent(name)
  const photoId = usePhotoId(car)
  const cars = model.stats('all').cars
  const c = cars.get(car)
  if (!c)
    return (
      <Sheet onClose={onClose} label="Fahrzeug">
        <p className="muted">Fahrzeug „{car}“ nicht gefunden.</p>
      </Sheet>
    )
  const { rated } = rankedCars(cars)
  const rank = rated.findIndex((x) => x.name === car) + 1
  // Vergleich mit dem eigenen Lieblingsauto, sonst mit dem meistgefahrenen anderen Auto
  const myFav = me ? model.stats('all').drivers.get(me)?.favoriteCar : null
  const compareWith = myFav && myFav !== car ? myFav : [...cars.values()].filter((x) => x.name !== car).sort((a, b) => b.races - a.races)[0]?.name
  const photo = photoId
  const scale = carScale(settings, car)
  const drivers = [...c.drivers]
    .filter(([n, v]) => v.bestLapMs != null && !isGuest(n))
    .sort((a, b) => a[1].bestLapMs! - b[1].bestLapMs!)
    .slice(0, 8)
  const records = model.tracks.map((t) => ({ t, rec: model.carRecords.get(`${t}\u0000${car}`) })).filter((x) => x.rec)
  const runnerUp = (track: string) => {
    const rec = model.carRecords.get(`${track}\u0000${car}`)
    return drivers.find(([n]) => n !== rec?.driver)
  }
  return (
    <Sheet
      onClose={onClose}
      label={`Fahrzeug ${car}`}
      actions={
        compareWith && (
          <Link className="btn round" to={`/vergleich?typ=auto&a=${encodeURIComponent(car)}&b=${encodeURIComponent(compareWith)}`}>
            Vergleichen
          </Link>
        )
      }
    >
      <div style={{ ['--accent' as string]: ACCENT, display: 'contents' }}>
        <div style={{ position: 'relative', height: 220, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 20, border: '1px solid var(--line)', boxShadow: 'var(--sh1)', overflow: 'hidden', flexShrink: 0 }}>
          {photo ? (
            <CarPhoto
              key={photo}
              fileId={photo}
              alt={car}
              fallback={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <CarSilhouette />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Foto gefunden, konnte aber nicht geladen werden – Freigabe prüfen.</span>
                </div>
              }
            />
          ) : (
            <CarSilhouette />
          )}
          <span style={{ position: 'absolute', bottom: 14, right: 14, fontSize: 11, fontWeight: 700, letterSpacing: 1, background: 'var(--bg)', borderRadius: 999, padding: '5px 10px', color: 'var(--text-2)' }}>1:{scale}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span className="kicker" style={{ color: ACCENT, letterSpacing: 2 }}>
                Fahrzeug{rank ? ` · Rang ${rank}` : ''}
              </span>
              <h1 style={{ fontSize: 28, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{car}</h1>
            </div>
            {c.bonus > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'var(--inner-2)', borderRadius: 16, padding: '10px 12px', border: '1px solid var(--line-2)', boxShadow: 'var(--sh2)', flexShrink: 0 }}>
                <UnderdogBonus bonus={c.bonus} />
                <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>Underdog-Bonus</span>
              </div>
            )}
          </div>
          {c.bonus > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>Gilt als eher schwaches Auto: Wer damit gewinnt, bekommt mehr Elo-Punkte.</p>}

          <div className="tiles">
            <Tile value={c.races} label="Rennen" />
            <Tile value={fmtPct(c.winRate)} label="Siege" />
            <Tile value={fmtNum(c.km)} label="km" />
            <Tile value={fmtNum(c.laps, 0)} label="Runden" />
          </div>

          <section className="inner" style={{ padding: 14, gap: 8 }}>
            <div className="card-head">
              <span className="card-title">Eigenschaften</span>
              <span className="hint">Autowertung {c.rating == null ? '–' : fmtRating(c.rating)}{c.rating != null && c.provisional && ' (vorläufig)'}</span>
            </div>
            <RadarChart series={[{ name: car, color: ACCENT, axes: c.radar }]} label={`Eigenschaften ${car}: ${c.radar.map((a) => `${a.label} ${Math.round(a.score * 100)}`).join(', ')}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {c.radar.map((a) => (
                <div key={a.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, width: 96, flexShrink: 0 }}>{a.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{a.text}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
              Außen = besser, gestrichelter Ring = Ø Auto. Alles fahrerbereinigt: verglichen wird, wie dieselben Fahrer mit anderen Autos fahren. Bei Tempo und Abflügen zählen konsistente Fahrer und gleichbleibende neue Entwicklungen (z. B. nach einem Umbau) stärker.
            </p>
          </section>

          <CarDrivers c={c} me={me} />

          <section className="inner" style={{ padding: 14, gap: 8 }}>
            <div className="card-head">
              <span className="card-title">Rundenzeiten</span>
              <span className="hint">alle sauberen Runden mit dem Auto</span>
            </div>
            <LapHistogram
              laps={[...c.drivers.values()].flatMap((v) => v.normal)}
              mine={me ? (c.drivers.get(me)?.normal ?? []) : []}
              color="var(--faint-2)"
              meColor="#3BBC4A"
              best={c.bestLapMs}
            />
            <div className="legend">
              <span>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--faint-2)' }} />
                alle Fahrer
              </span>
              {me && c.drivers.has(me) && (
                <span>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3BBC4A' }} />
                  du
                </span>
              )}
              <span>Säule antippen: Anzahl Runden</span>
            </div>
          </section>

          {records.map(({ t, rec }) => {
            const second = runnerUp(t)
            return (
              <div key={t} className="inner" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <RecordFlame metal="silver" size={30} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    Fahrzeugrekord {formatTime(rec!.ms)}
                    {model.tracks.length > 1 ? ` · ${t}` : ''}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {rec!.driver}
                    {rec!.guest ? ' (Gast)' : ''}
                    {second ? ` · vor ${second[0]} (${formatTime(second[1].bestLapMs)})` : ''}
                  </span>
                </div>
              </div>
            )
          })}
          {!photo && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Foto fehlt: Bild mit dem Namen „{car}“ (z. B. „{car}.jpg“) in den Drive-Unterordner „Fotos“ legen.
              {Object.keys(photos).length > 0 && ` Im Ordner gefunden: ${Object.keys(photos).length} Foto(s).`}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
