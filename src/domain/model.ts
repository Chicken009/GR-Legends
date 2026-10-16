import { formatTime } from '../data/time'
import type { Result, Session } from '../types'
import { isGuest } from './drivers'
import { quantile } from './laps'
import { carKey, computeRatings, isQuali, sortSessions, type RatingEvent, type RatingResult } from './rating'

/** „all“ oder ein Jahr wie „2025“ */
export type Period = string

const inPeriod = (date: string, period: Period) => period === 'all' || date.startsWith(period)
const median = (xs: number[]) => (xs.length ? quantile([...xs].sort((a, b) => a - b), 0.5) : null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const normalLaps = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)

function cv(xs: number[]): number | null {
  if (xs.length < 4) return null
  const m = mean(xs)!
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))!) / m
}

export interface CarUse {
  races: number
  wins: number
  laps: number
  bestLapMs: number | null
  normal: number[]
}

export interface DriverStats {
  name: string
  races: number
  wins: number
  podiums: number
  qualis: number
  poles: number
  /** Anteil geschlagener Gegner über alle Rennen (normiert auf die Feldgröße), 0–1 */
  beatShare: number | null
  /** Ø Platzierung in Rennen */
  avgPosition: number | null
  laps: number
  km: number | null
  bestLapMs: number | null
  /** Ø saubere Runde in % der typischen Streckenbestzeit (100 = Referenz) */
  pace: number | null
  /** Schwankung sauberer Runden, z. B. 0.07 = 7 % */
  precision: number | null
  crashes: number
  /** Runden aus Rennen ohne Tankfunktion (Basis für die Abflugquote) */
  crashBaseLaps: number
  crashRate: number | null
  crashLossMs: number
  cars: Map<string, CarUse>
  favoriteCar: string | null
  opponentsMet: Set<string>
  opponentsBeaten: Set<string>
  h2h: Map<string, [number, number]>
  raceDays: Set<string>
  streak: number
  maxStreak: number
  /** Lauf-IDs der Rennen in Reihenfolge, für Serien-Auswertungen */
  raceResults: { session: Session; result: Result }[]
}

export interface CarStats {
  name: string
  races: number
  wins: number
  podiums: number
  winRate: number | null
  beatShare: number | null
  avgPosition: number | null
  laps: number
  km: number | null
  bestLapMs: number | null
  bestBy: string | null
  pace: number | null
  /** Ø Präzision der Fahrer mit diesem Auto */
  spread: number | null
  rating: number | null
  /** 0 = kein Bonus, 1–3 = Underdog-Bonus */
  bonus: number
  drivers: Map<string, { races: number; bestLapMs: number | null; normal: number[] }>
}

export interface RankRow {
  name: string
  elo: number
  rank: number
  rankStart: number | null
  races: number
}

export type StatusCode =
  | 'crown' | 'flame' | 'record-track' | 'record-car' | 'record-personal' | 'up' | 'giant'
  | 'comeback' | 'pole' | 'precision' | 'clean' | 'form' | 'rookie' | 'ice' | 'hunter'

export interface Status {
  code: StatusCode
  /** Zahl für Flamme (Serie) und Chevrons (Plätze) */
  value?: number
  label: string
}

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond']

export interface Medal {
  id: string
  kind: string
  name: string
  description: string
  tier: Tier
  /** Erreicht am (Stufen) bzw. Titel seit */
  date: string
  /** Titel mit genau einem Inhaber (wechselt mit dem aktuellen Stand) */
  title?: boolean
  /** Ehemaliger Titel (Wanderpokal), mit Zeitraum */
  former?: { from: string; to: string }
  icon: 'trophy' | 'track' | 'clock' | 'people' | 'sword' | 'flag' | 'target' | 'shield' | 'car' | 'flame' | 'star' | 'road' | 'chevrons'
}

export interface Goal {
  label: string
  detail: string
  progress: number
}

export interface RecordEntry {
  ms: number
  driver: string
  car: string
  date: string
  fileId: string
  guest: boolean
}

export interface Tip {
  title: string
  text: string
  /** Lob statt Verbesserungstipp */
  good?: boolean
}

export interface NewsItem {
  kind: 'medal' | 'record-track' | 'record-car' | 'record-personal' | 'climb'
  driver: string
  title: string
  detail: string
  medal?: Medal
  value?: number
}

export interface Model {
  sessions: Session[]
  years: string[]
  tracks: string[]
  rating: RatingResult
  drivers: string[]
  stats: (period: Period) => { drivers: Map<string, DriverStats>; cars: Map<string, CarStats> }
  ranking: (period: Period) => RankRow[]
  statuses: (period: Period) => Map<string, Status[]>
  medals: Map<string, Medal[]>
  trackRecords: Map<string, RecordEntry>
  carRecords: Map<string, RecordEntry>
  goals: (driver: string) => Goal[]
  rival: (driver: string) => { name: string; wins: number; losses: number } | null
  /** Tipps und Lob zum Durchwischen, Verbesserungstipps zuerst */
  tips: (driver: string) => Tip[]
  eloAt: (driver: string, date: string) => number | null
  /** Rang aller Fahrer an jedem Renntag */
  rankTimeline: () => { dates: string[]; ranks: Map<string, (number | null)[]> }
  /** Was am letzten Renntag passiert ist */
  news: () => NewsItem[]
}

function emptyDriver(name: string): DriverStats {
  return {
    name, races: 0, wins: 0, podiums: 0, qualis: 0, poles: 0, beatShare: null, avgPosition: null, laps: 0, km: null,
    bestLapMs: null, pace: null, precision: null, crashes: 0, crashBaseLaps: 0, crashRate: null,
    crashLossMs: 0, cars: new Map(), favoriteCar: null, opponentsMet: new Set(), opponentsBeaten: new Set(),
    h2h: new Map(), raceDays: new Set(), streak: 0, maxStreak: 0, raceResults: [],
  }
}

/** Typische Bestzeit (10. Perzentil gültiger Runden) pro Strecke – Basis für den Pace-Index. */
function trackReferences(sessions: Session[]) {
  const pools = new Map<string, number[]>()
  for (const s of sessions) {
    const list = pools.get(s.track) ?? []
    for (const r of s.results) for (const l of r.lapTimes) if (l.status !== 'invalid') list.push(l.ms)
    pools.set(s.track, list)
  }
  return new Map([...pools].map(([t, xs]) => [t, quantile(xs.sort((a, b) => a - b), 0.1)]))
}

export function buildModel(input: Session[]): Model {
  const sessions = sortSessions(input)
  const rating = computeRatings(sessions)
  const trackRef = trackReferences(sessions)
  const years = [...new Set(sessions.map((s) => s.date.slice(0, 4)))].sort().reverse()
  const tracks = [...new Set(sessions.map((s) => s.track))]
  const drivers = [...rating.history.keys()]

  // ---- Kennzahlen pro Zeitraum ---------------------------------------------------------
  const statsCache = new Map<Period, ReturnType<Model['stats']>>()
  const stats = (period: Period) => {
    const cached = statsCache.get(period)
    if (cached) return cached
    const ds = new Map<string, DriverStats>()
    const cs = new Map<string, CarStats>()
    const get = (n: string) => ds.get(n) ?? (ds.set(n, emptyDriver(n)), ds.get(n)!)
    const getCar = (n: string): CarStats =>
      cs.get(n) ?? (cs.set(n, { name: n, races: 0, wins: 0, podiums: 0, winRate: null, beatShare: null, avgPosition: null, laps: 0, km: null, bestLapMs: null, bestBy: null, pace: null, spread: null, rating: null, bonus: 0, drivers: new Map() }), cs.get(n)!)
    const beat = new Map<string, number[]>()
    const carBeat = new Map<string, number[]>()
    const positions = new Map<string, number[]>()
    const carPositions = new Map<string, number[]>()
    const push = (m: Map<string, number[]>, k: string, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v)
    const paceSamples = new Map<string, number[]>()
    const carPace = new Map<string, number[]>()
    const precSamples = new Map<string, number[]>()
    const carPrec = new Map<string, number[]>()

    for (const s of sessions) {
      if (!inPeriod(s.date, period)) continue
      const quali = isQuali(s)
      const ref = trackRef.get(s.track) ?? null
      for (const r of s.results) {
        const car = getCar(r.car)
        const nl = normalLaps(r)
        const valid = r.lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms)
        const best = valid.length ? Math.min(...valid) : null
        const km = s.trackLengthCm ? (r.laps * s.trackLengthCm) / 100000 : null
        car.laps += r.laps
        if (km != null) car.km = (car.km ?? 0) + km
        if (best != null && (car.bestLapMs == null || best < car.bestLapMs)) { car.bestLapMs = best; car.bestBy = r.driver }
        const c = cv(nl)
        if (c != null) (carPrec.get(r.car) ?? carPrec.set(r.car, []).get(r.car)!).push(c)
        const med = median(nl)
        if (med != null && ref) (carPace.get(r.car) ?? carPace.set(r.car, []).get(r.car)!).push((med / ref) * 100)
        const dEntry = car.drivers.get(r.driver) ?? { races: 0, bestLapMs: null, normal: [] }
        if (!quali) dEntry.races++
        if (best != null && (dEntry.bestLapMs == null || best < dEntry.bestLapMs)) dEntry.bestLapMs = best
        dEntry.normal.push(...nl)
        car.drivers.set(r.driver, dEntry)
        const share = s.results.length > 1 ? (s.results.length - r.position) / (s.results.length - 1) : null
        if (!quali) {
          car.races++
          if (r.position === 1) car.wins++
          if (r.position <= 3) car.podiums++
          push(carPositions, r.car, r.position)
          if (share != null) (carBeat.get(r.car) ?? carBeat.set(r.car, []).get(r.car)!).push(share)
        }

        if (isGuest(r.driver)) continue
        const d = get(r.driver)
        d.laps += r.laps
        if (km != null) d.km = (d.km ?? 0) + km
        if (best != null && (d.bestLapMs == null || best < d.bestLapMs)) d.bestLapMs = best
        const use = d.cars.get(r.car) ?? { races: 0, wins: 0, laps: 0, bestLapMs: null, normal: [] }
        use.laps += r.laps
        use.normal.push(...nl)
        if (best != null && (use.bestLapMs == null || best < use.bestLapMs)) use.bestLapMs = best
        if (c != null) (precSamples.get(r.driver) ?? precSamples.set(r.driver, []).get(r.driver)!).push(c)
        if (med != null && ref) (paceSamples.get(r.driver) ?? paceSamples.set(r.driver, []).get(r.driver)!).push((med / ref) * 100)
        if (quali) {
          d.qualis++
          if (r.position === 1) d.poles++
        } else {
          d.races++
          d.raceDays.add(s.date)
          d.raceResults.push({ session: s, result: r })
          use.races++
          if (r.position === 1) { d.wins++; use.wins++; d.streak++; d.maxStreak = Math.max(d.maxStreak, d.streak) } else d.streak = 0
          if (r.position <= 3) d.podiums++
          push(positions, r.driver, r.position)
          if (share != null) (beat.get(r.driver) ?? beat.set(r.driver, []).get(r.driver)!).push(share)
          for (const o of s.results) {
            if (o === r || isGuest(o.driver)) continue
            d.opponentsMet.add(o.driver)
            const hh = d.h2h.get(o.driver) ?? [0, 0]
            if (r.position < o.position) { d.opponentsBeaten.add(o.driver); hh[0]++ } else hh[1]++
            d.h2h.set(o.driver, hh)
          }
          if (!s.tank) {
            d.crashBaseLaps += r.laps
            for (const l of r.lapTimes) if (l.status === 'crash') { d.crashes++; d.crashLossMs += l.lossMs ?? 0 }
          }
        }
        d.cars.set(r.car, use)
      }
    }
    for (const d of ds.values()) {
      d.beatShare = mean(beat.get(d.name) ?? [])
      d.avgPosition = mean(positions.get(d.name) ?? [])
      d.pace = mean(paceSamples.get(d.name) ?? [])
      d.precision = mean(precSamples.get(d.name) ?? [])
      d.crashRate = d.crashBaseLaps >= 20 ? (d.crashes / d.crashBaseLaps) * 100 : null
      d.favoriteCar = [...d.cars].sort((a, b) => b[1].races - a[1].races || b[1].laps - a[1].laps)[0]?.[0] ?? null
    }
    // Autowertung: Mittel über Strecken, gewichtet nach Rennen
    const carRatings = new Map<string, number>()
    for (const [key, v] of rating.cars) {
      const car = key.split('\u0000')[1]
      carRatings.set(car, (carRatings.get(car) ?? 0) + v / tracks.length)
    }
    const rated = [...cs.values()].filter((c) => c.races >= 3).map((c) => carRatings.get(c.name) ?? 0)
    const m = mean(rated) ?? 0
    const sd = Math.sqrt(mean(rated.map((x) => (x - m) ** 2)) ?? 0) || 1
    for (const c of cs.values()) {
      c.winRate = c.races ? c.wins / c.races : null
      c.beatShare = mean(carBeat.get(c.name) ?? [])
      c.avgPosition = mean(carPositions.get(c.name) ?? [])
      c.pace = mean(carPace.get(c.name) ?? [])
      c.spread = mean(carPrec.get(c.name) ?? [])
      c.rating = carRatings.get(c.name) ?? null
      const z = ((c.rating ?? m) - m) / sd
      c.bonus = c.races < 3 ? 0 : z < -1.5 ? 3 : z < -1 ? 2 : z < -0.5 ? 1 : 0
    }
    const result = { drivers: ds, cars: cs }
    statsCache.set(period, result)
    return result
  }

  // ---- Wertung zu einem Zeitpunkt --------------------------------------------------------
  const eloAt = (driver: string, date: string): number | null => {
    let v: number | null = null
    for (const e of rating.history.get(driver) ?? []) if (e.date <= date) v = e.after
    return v
  }
  const rankingAt = (date: string) => {
    const rows = drivers.map((n) => ({ name: n, elo: eloAt(n, date) })).filter((r): r is { name: string; elo: number } => r.elo != null)
    rows.sort((a, b) => b.elo - a.elo)
    return new Map(rows.map((r, i) => [r.name, i + 1]))
  }
  const dates = [...new Set(sessions.map((s) => s.date))].sort()
  const periodEnd = (period: Period) => (period === 'all' ? dates[dates.length - 1] ?? '' : `${period}-12-31`)
  const periodStart = (period: Period) => {
    if (period === 'all') return dates.length > 1 ? dates[dates.length - 2] : null
    const prev = dates.filter((d) => d < `${period}-01-01`)
    return prev.length ? prev[prev.length - 1] : null
  }
  const ranking = (period: Period): RankRow[] => {
    const end = periodEnd(period)
    const start = periodStart(period)
    const endRanks = rankingAt(end)
    const startRanks = start ? rankingAt(start) : new Map<string, number>()
    const st = stats(period).drivers
    return [...endRanks]
      .filter(([n]) => (st.get(n)?.races ?? 0) + (st.get(n)?.qualis ?? 0) > 0)
      .map(([name, rank]) => ({ name, elo: eloAt(name, end)!, rank, rankStart: startRanks.get(name) ?? null, races: st.get(name)?.races ?? 0 }))
      .sort((a, b) => a.rank - b.rank)
  }

  // ---- Rekorde ---------------------------------------------------------------------------
  const trackRecords = new Map<string, RecordEntry>()
  const carRecords = new Map<string, RecordEntry>()
  const recordTimeline: { kind: 'track' | 'car'; key: string; entry: RecordEntry; prev: RecordEntry | null }[] = []
  const personalBest = new Map<string, number>()
  const pbEvents: { driver: string; date: string; prevExisted: boolean; ms: number; car: string }[] = []
  for (const s of sessions) {
    for (const r of s.results) {
      const valid = r.lapTimes.filter((l) => l.status !== 'invalid').map((l) => l.ms)
      if (!valid.length) continue
      const best = Math.min(...valid)
      const entry: RecordEntry = { ms: best, driver: r.driver, car: r.car, date: s.date, fileId: s.fileId, guest: isGuest(r.driver) }
      const tr = trackRecords.get(s.track)
      if (!tr || best < tr.ms) { recordTimeline.push({ kind: 'track', key: s.track, entry, prev: tr ?? null }); trackRecords.set(s.track, entry) }
      const ck = carKey(s.track, r.car)
      const cr = carRecords.get(ck)
      if (!cr || best < cr.ms) { recordTimeline.push({ kind: 'car', key: ck, entry, prev: cr ?? null }); carRecords.set(ck, entry) }
      if (!entry.guest) {
        const pk = `${s.track}\u0000${r.driver}`
        const pb = personalBest.get(pk)
        if (pb == null || best < pb) { pbEvents.push({ driver: r.driver, date: s.date, prevExisted: pb != null, ms: best, car: r.car }); personalBest.set(pk, best) }
      }
    }
  }

  // ---- Status-Symbole --------------------------------------------------------------------
  const statusCache = new Map<Period, Map<string, Status[]>>()
  const statuses = (period: Period) => {
    const cached = statusCache.get(period)
    if (cached) return cached
    const out = new Map<string, Status[]>()
    const st = stats(period).drivers
    const rows = ranking(period)
    const inP = sessions.filter((s) => inPeriod(s.date, period))
    const lastDay = inP[inP.length - 1]?.date
    const daySessions = inP.filter((s) => s.date === lastDay)
    // Präzision des letzten Renntags
    let precise: string | null = null
    let preciseCv = Infinity
    for (const s of daySessions) for (const r of s.results) {
      if (isGuest(r.driver)) continue
      const c = cv(normalLaps(r))
      if (c != null && normalLaps(r).length >= 8 && c < preciseCv) { preciseCv = c; precise = r.driver }
    }
    for (const row of rows) {
      const d = st.get(row.name)
      const list: Status[] = []
      const hist = (rating.history.get(row.name) ?? []).filter((e) => e.date <= periodEnd(period))
      if (row.rank === 1) list.push({ code: 'crown', label: 'Platz 1 der Wertung' })
      if (d && d.streak >= 2) list.push({ code: 'flame', value: d.streak, label: `${d.streak} Siege in Folge` })
      if (lastDay) {
        const tRec = recordTimeline.find((t) => t.kind === 'track' && t.entry.date === lastDay && t.entry.driver === row.name)
        const cRec = recordTimeline.find((t) => t.kind === 'car' && t.entry.date === lastDay && t.entry.driver === row.name && t.prev)
        const pb = pbEvents.find((p) => p.driver === row.name && p.date === lastDay && p.prevExisted)
        const recCount = recordTimeline.filter((t) => t.entry.date === lastDay && t.entry.driver === row.name && t.prev).length
        if (recCount >= 3) list.push({ code: 'hunter', label: `Rekordjäger: ${recCount} Rekorde am letzten Renntag` })
        else if (tRec) list.push({ code: 'record-track', label: 'Neuer Streckenrekord' })
        else if (cRec) list.push({ code: 'record-car', label: `Neuer Rekord mit ${cRec.entry.car}` })
        else if (pb) list.push({ code: 'record-personal', label: 'Neue persönliche Bestzeit' })
      }
      if (row.rankStart != null && row.rankStart > row.rank) list.push({ code: 'up', value: row.rankStart - row.rank, label: `${row.rankStart - row.rank} Plätze aufgestiegen` })
      const lastEvents = hist.filter((e) => e.date === lastDay)
      if (lastEvents.some((e) => e.upsetExpectation != null && e.upsetExpectation < 0.3)) list.push({ code: 'giant', label: 'Viel stärkeren Gegner geschlagen' })
      const lastRaces = d?.raceResults ?? []
      const dayRaces = lastRaces.filter((x) => x.session.date === lastDay)
      if (dayRaces.some(({ session, result }) => {
        const trace = positionTrace(session)
        const first = trace.get(result.driver + '#' + result.position)?.[0]
        return first != null && result.position <= 3 && first - result.position >= 2
      })) list.push({ code: 'comeback', label: 'Von hinten aufs Podium' })
      if (daySessions.some((s) => isQuali(s) && s.results[0]?.driver === row.name)) list.push({ code: 'pole', label: 'Schnellster im Qualifying' })
      if (precise === row.name) list.push({ code: 'precision', label: 'Konstantester Fahrer des Renntags' })
      const clean = lastRaces.filter((x) => !x.session.tank).slice(-3)
      if (clean.length === 3 && clean.every((x) => x.result.lapTimes.every((l) => l.status !== 'crash'))) list.push({ code: 'clean', label: '3 Rennen ohne Abflug' })
      const last3 = hist.slice(-3)
      if (last3.length === 3 && last3.every((e) => e.delta > 0)) list.push({ code: 'form', label: 'Wertung 3× in Folge gestiegen' })
      if ((rating.history.get(row.name)?.length ?? 0) < 5) list.push({ code: 'rookie', label: 'Rookie: unter 5 Läufen' })
      const last5 = lastRaces.slice(-5)
      if (last5.length === 5 && last5.every((x) => x.result.position > 3)) list.push({ code: 'ice', label: '5 Rennen ohne Podium' })
      out.set(row.name, list)
    }
    statusCache.set(period, out)
    return out
  }

  // ---- Medaillen -------------------------------------------------------------------------
  const medals = computeMedals(sessions, rating, stats('all').drivers, recordTimeline, years, rankingAt, dates)

  // ---- Ziele, Rivale, Tipps --------------------------------------------------------------
  const rival = (driver: string) => {
    const d = stats('all').drivers.get(driver)
    if (!d) return null
    let best: { name: string; wins: number; losses: number; score: number } | null = null
    for (const [name, [w, l]] of d.h2h) {
      const n = w + l
      if (n < 2) continue
      const score = n * (1 - Math.abs(w / n - 0.5) * 2) + n * 0.1
      if (!best || score > best.score) best = { name, wins: w, losses: l, score }
    }
    return best ? { name: best.name, wins: best.wins, losses: best.losses } : null
  }

  const goals = (driver: string): Goal[] => {
    const d = stats('all').drivers.get(driver)
    if (!d) return []
    const out: Goal[] = []
    const rows = ranking('all')
    const me = rows.find((r) => r.name === driver)
    const above = me ? rows.find((r) => r.rank === me.rank - 1) : null
    if (me && above) {
      const gap = Math.ceil(above.elo - me.elo)
      out.push({ label: `${gap} Punkte bis Platz ${above.rank}`, detail: `vor ${above.name}`, progress: Math.max(0, Math.min(1, 1 - gap / 30)) })
    }
    const nextStep = (value: number, steps: number[]) => steps.find((s) => s > value)
    const w = nextStep(d.wins, WIN_STEPS)
    if (w) out.push({ label: `Noch ${w - d.wins} ${w - d.wins === 1 ? 'Sieg' : 'Siege'} bis „${w} Siege“`, detail: 'Medaille', progress: d.wins / w })
    if (d.favoriteCar) {
      for (const t of tracks) {
        const rec = carRecords.get(carKey(t, d.favoriteCar))
        const own = d.cars.get(d.favoriteCar)?.bestLapMs
        if (rec && own != null && rec.driver !== driver && own - rec.ms < 400) {
          out.push({ label: `${((own - rec.ms) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3 })} s bis zum Rekord`, detail: `${d.favoriteCar} (${rec.driver})`, progress: Math.max(0, 1 - (own - rec.ms) / 400) })
        }
      }
    }
    const o = nextStep(d.opponentsBeaten.size, OPP_STEPS)
    if (o) out.push({ label: `Noch ${o - d.opponentsBeaten.size} neue Gegner schlagen`, detail: `für „${o} Gegner geschlagen“`, progress: d.opponentsBeaten.size / o })
    return out.slice(0, 3)
  }

  const tips = (driver: string): Tip[] => {
    const all = stats('all').drivers
    const d = all.get(driver)
    if (!d) return []
    const out: Tip[] = []
    const regulars = [...all.values()].filter((x) => x.races >= 3)
    const s1 = (ms: number) => (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
    const nl = (r: Result) => r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)

    // Fahrzeugwahl: Tempo und Ergebnisse je Auto
    // Tempo relativ zum Feld desselben Laufs – so stören Bahnzustand und Jahr nicht
    const relPace = new Map<string, number[]>()
    for (const { session, result } of d.raceResults) {
      const own = median(nl(result))
      const fieldMed = median(session.results.flatMap((r) => nl(r)))
      if (own != null && fieldMed && nl(result).length >= 5) relPace.set(result.car, [...(relPace.get(result.car) ?? []), own / fieldMed])
    }
    const typical = median(d.raceResults.flatMap(({ result }) => nl(result)))
    const carSpeed = [...relPace].filter(([, xs]) => xs.length >= 3).map(([n, xs]) => ({ n, v: mean(xs)! })).sort((a, b) => a.v - b.v)
    if (carSpeed.length >= 2 && typical) {
      const diff = (carSpeed[carSpeed.length - 1].v - carSpeed[0].v) * typical
      if (diff >= 200) out.push({ title: 'Fahrzeugwahl', text: `Mit dem ${carSpeed[0].n} bist du im Vergleich zum Feld etwa ${s1(diff)} s pro Runde schneller als mit dem ${carSpeed[carSpeed.length - 1].n}.` })
    }
    const carShare = new Map<string, number[]>()
    for (const { session, result } of d.raceResults) {
      const n = session.results.length
      if (n > 1) carShare.set(result.car, [...(carShare.get(result.car) ?? []), (n - result.position) / (n - 1)])
    }
    const shares = [...carShare].filter(([, xs]) => xs.length >= 3).map(([n, xs]) => ({ n, v: mean(xs)! })).sort((a, b) => b.v - a.v)
    if (shares.length >= 2 && shares[0].v - shares[shares.length - 1].v >= 0.25) {
      out.push({ title: 'Erfolgsauto', text: `Mit dem ${shares[0].n} schlägst du ${pct(shares[0].v)} deiner Gegner, mit dem ${shares[shares.length - 1].n} nur ${pct(shares[shares.length - 1].v)}.` })
    }

    // Abflüge
    const avgCrash = mean(regulars.map((x) => x.crashRate).filter((x): x is number => x != null))
    if (d.crashRate != null && avgCrash != null) {
      const n1 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      if (d.crashRate > avgCrash * 1.3) out.push({ title: 'Abflüge', text: `Du fliegst öfter ab als der Schnitt (${n1(d.crashRate)} statt ${n1(avgCrash)} pro 100 Runden). Konstanz bringt hier mehr als Tempo.` })
      else if (d.crashRate < avgCrash * 0.6) out.push({ title: 'Sauber unterwegs', good: true, text: `Du fliegst selten ab: ${n1(d.crashRate)} Abflüge pro 100 Runden, der Schnitt liegt bei ${n1(avgCrash)}.` })
    }

    // Konstanz
    const avgPrec = mean(regulars.map((x) => x.precision).filter((x): x is number => x != null))
    if (d.precision != null && avgPrec != null && d.races >= 3) {
      if (d.precision > avgPrec * 1.15) out.push({ title: 'Gleichmäßigkeit', text: `Deine sauberen Runden schwanken um ${pct(d.precision)}, der Schnitt liegt bei ${pct(avgPrec)}. Gleichmäßig fahren bringt oft mehr als Risiko.` })
      else if (d.precision < avgPrec * 0.85) out.push({ title: 'Präzise', good: true, text: `Deine Runden sind sehr gleichmäßig: ${pct(d.precision)} Schwankung, der Schnitt liegt bei ${pct(avgPrec)}.` })
    }

    // Ausdauer: zweite Rennhälfte
    const halves = d.raceResults
      .map(({ result }) => {
        const laps = nl(result)
        if (laps.length < 8) return null
        const h = Math.floor(laps.length / 2)
        return mean(laps.slice(h))! - mean(laps.slice(0, h))!
      })
      .filter((x): x is number => x != null)
    const fade = halves.length >= 3 ? mean(halves) : null
    if (fade != null && fade > 250) out.push({ title: 'Ausdauer', text: `In der zweiten Rennhälfte verlierst du im Schnitt ${s1(fade)} s pro Runde. Vielleicht am Anfang etwas weniger riskieren.` })
    else if (fade != null && fade < -250) out.push({ title: 'Steigerung', good: true, text: `Du wirst im Rennen schneller: In der zweiten Hälfte bist du im Schnitt ${s1(-fade)} s pro Runde flotter.` })

    // Start: erste Runde gegenüber der eigenen typischen Runde, verglichen mit dem Feld
    const startLoss = (r: Result) => {
      const first = r.lapTimes[0]
      const med = median(nl(r))
      return first && first.status !== 'invalid' && med != null && nl(r).length >= 5 ? first.ms - med : null
    }
    const mine = d.raceResults.map(({ result }) => startLoss(result)).filter((x): x is number => x != null)
    const field = sessions.filter((x) => !isQuali(x)).flatMap((x) => x.results.filter((r) => !isGuest(r.driver) && r.driver !== driver).map(startLoss)).filter((x): x is number => x != null)
    if (mine.length >= 3 && field.length >= 10) {
      const diff = median(mine)! - median(field)!
      if (diff > 500) out.push({ title: 'Start', text: `Deine Startrunde kostet dich im Schnitt ${s1(diff)} s mehr als die anderen. Ein ruhiger, sauberer Start lohnt sich.` })
      else if (diff < -500) out.push({ title: 'Starke Starts', good: true, text: `Deine Startrunde ist im Schnitt ${s1(-diff)} s besser als die der anderen.` })
    }

    // Boxenstopps (Rennen mit Tankfunktion)
    const pitLoss = (name: string | null) =>
      sessions
        .filter((x) => x.tank && !isQuali(x))
        .flatMap((x) => x.results.filter((r) => (name ? r.driver === name : r.driver !== driver && !isGuest(r.driver))))
        // nur reine Stopps; mit leerem Tank kommen nicht gezählte Runden dazu
        .flatMap((r) => r.lapTimes.filter((l) => l.status === 'pit' && l.lossMs != null && l.lossMs <= 10_000).map((l) => l.lossMs!))
    const myPits = pitLoss(driver)
    const fieldPits = pitLoss(null)
    if (myPits.length >= 3 && fieldPits.length >= 10) {
      const diff = median(myPits)! - median(fieldPits)!
      if (diff > 1000) out.push({ title: 'Boxenstopps', text: `Deine Boxenstopps kosten im Schnitt ${s1(diff)} s mehr als die der anderen. Hier lässt sich leicht Zeit gutmachen.` })
      else if (diff < -1000) out.push({ title: 'Schnelle Box', good: true, text: `Deine Boxenstopps sind im Schnitt ${s1(-diff)} s schneller als die der anderen.` })
    }

    // Rivale: Tempo-Unterschied in gemeinsamen Rennen
    const rv = rival(driver)
    if (rv && rv.losses > rv.wins) {
      const diffs = d.raceResults
        .map(({ session, result }) => {
          const o = session.results.find((r) => r.driver === rv.name)
          const a = median(nl(result))
          const b2 = o ? median(nl(o)) : null
          return a != null && b2 != null ? a - b2 : null
        })
        .filter((x): x is number => x != null)
      const diff = mean(diffs)
      if (diff != null && diff > 100) out.push({ title: 'Rivale', text: `Gegen ${rv.name} steht es ${rv.wins} : ${rv.losses}. In gemeinsamen Rennen ist ${rv.name} im Schnitt ${s1(diff)} s pro Runde schneller.` })
      else out.push({ title: 'Rivale', text: `Gegen ${rv.name} steht es ${rv.wins} : ${rv.losses} – vom Tempo her seid ihr gleichauf. Es entscheiden Fehler und Starts.` })
    }

    // Noch nie gefahren: schnelles Auto ausprobieren
    const carsAll = [...stats('all').cars.values()].filter((c) => c.races >= 10 && c.pace != null).sort((a, b) => a.pace! - b.pace!)
    const untried = carsAll.find((c) => !d.cars.has(c.name))
    if (untried && carsAll.indexOf(untried) <= 2) out.push({ title: 'Ausprobieren', text: `Den ${untried.name} bist du noch nie gefahren – mit ihm gelingen im Schnitt mit die schnellsten Runden.` })

    // Fortschritt: dieses Jahr gegenüber dem Vorjahr (Hauptstrecke)
    const track = d.raceResults.length ? d.raceResults[d.raceResults.length - 1].session.track : null
    const yearLaps = (y: string) => d.raceResults.filter(({ session }) => session.track === track && session.date.startsWith(y)).flatMap(({ result }) => nl(result))
    const [y1, y0] = years
    if (y1 && y0) {
      const a = yearLaps(y1)
      const b2 = yearLaps(y0)
      if (a.length >= 30 && b2.length >= 30) {
        const diff = median(b2)! - median(a)!
        if (diff > 150) out.push({ title: 'Fortschritt', good: true, text: `${y1} bist du im Schnitt ${s1(diff)} s pro Runde schneller als ${y0}.` })
        else if (diff < -150) out.push({ title: 'Formkurve', text: `${y1} bist du im Schnitt ${s1(-diff)} s pro Runde langsamer als ${y0}. Ein Blick auf die Fahrzeugwahl lohnt sich.` })
      }
    }

    // Bahnrekord
    if (track) {
      const rec = trackRecords.get(track)
      const own = Math.min(...d.raceResults.filter(({ session }) => session.track === track).map(({ result }) => result.validBestLapMs ?? Infinity))
      if (rec && rec.driver === driver) out.push({ title: 'Bahnrekord', good: true, text: `Du hältst den Bahnrekord mit ${formatTime(rec.ms)} – verteidige ihn!` })
      else if (rec && isFinite(own)) out.push({ title: 'Bahnrekord', text: `Bis zum Bahnrekord (${formatTime(rec.ms)}, ${rec.driver}${rec.guest ? ' als Gast' : ''}) fehlen dir ${((own - rec.ms) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3 })} s.` })
    }

    // Verbesserungstipps zuerst, dann Lob
    return [...out.filter((t) => !t.good), ...out.filter((t) => t.good)]
  }

  let timelineCache: ReturnType<Model['rankTimeline']> | null = null
  const rankTimeline = () => {
    if (timelineCache) return timelineCache
    const ranks = new Map<string, (number | null)[]>(drivers.map((d) => [d, []]))
    for (const date of dates) {
      const at = rankingAt(date)
      for (const d of drivers) ranks.get(d)!.push(at.get(d) ?? null)
    }
    timelineCache = { dates, ranks }
    return timelineCache
  }

  const news = (): NewsItem[] => {
    const lastDay = dates[dates.length - 1]
    if (!lastDay) return []
    const out: NewsItem[] = []
    for (const t of recordTimeline) {
      if (t.entry.date !== lastDay || t.entry.guest || !t.prev) continue
      if (t.kind === 'track') out.push({ kind: 'record-track', driver: t.entry.driver, title: `${t.entry.driver}: neuer Bahnrekord`, detail: `${formatTime(t.entry.ms)} im ${t.entry.car} · vorher ${formatTime(t.prev.ms)}`, value: t.entry.ms })
      else out.push({ kind: 'record-car', driver: t.entry.driver, title: `${t.entry.driver}: Rekord mit dem ${t.entry.car}`, detail: `${formatTime(t.entry.ms)} · vorher ${formatTime(t.prev.ms)} (${t.prev.driver})`, value: t.entry.ms })
    }
    for (const [driver, list] of medals) {
      for (const m of list) {
        if (m.date !== lastDay || m.former || m.kind === 'debuet' || m.kind === 'fahrzeugrekord' || m.kind === 'bahnrekord') continue
        if (m.kind === 'siege' && m.id === 'siege-1') out.push({ kind: 'medal', driver, title: `${driver}: erster Sieg!`, detail: `${TIER_LABEL[m.tier]}-Medaille „${m.name}“`, medal: m })
        else if (STEP_KINDS.has(m.kind)) out.push({ kind: 'medal', driver, title: `${driver}: ${m.name}`, detail: `${TIER_LABEL[m.tier]}-Medaille`, medal: m })
      }
    }
    const prevDay = dates[dates.length - 2]
    if (prevDay) {
      const before = rankingAt(prevDay)
      const after = rankingAt(lastDay)
      const climbs = [...after]
        .filter(([n, r]) => before.has(n) && before.get(n)! - r >= 1 && r <= 10)
        .map(([n, r]) => ({ n, r, up: before.get(n)! - r, d: (eloAt(n, lastDay) ?? 0) - (eloAt(n, prevDay) ?? 0) }))
        .sort((a, b) => b.up - a.up || a.r - b.r)
        .slice(0, 3)
      for (const c of climbs) out.push({ kind: 'climb', driver: c.n, title: `${c.n} klettert auf Platz ${c.r}`, detail: `${c.d >= 0 ? '+' : '−'}${Math.abs(Math.round(c.d))} Elo an einem Renntag`, value: c.up })
    }
    const pbs = pbEvents.filter((p) => p.date === lastDay && p.prevExisted)
    const recordHolders = new Set(out.filter((o) => o.kind.startsWith('record')).map((o) => o.driver))
    const seenPb = new Set<string>()
    for (const p of pbs.reverse()) {
      if (recordHolders.has(p.driver) || seenPb.has(p.driver)) continue
      seenPb.add(p.driver)
      out.push({ kind: 'record-personal', driver: p.driver, title: `${p.driver}: persönliche Bestzeit`, detail: `${formatTime(p.ms)} im ${p.car}`, value: p.ms })
    }
    const order = { 'record-track': 0, medal: 1, 'record-car': 2, climb: 3, 'record-personal': 4 }
    return out.sort((a, b) => order[a.kind] - order[b.kind])
  }

  return {
    sessions, years, tracks, rating, drivers, stats, ranking, statuses, medals,
    trackRecords, carRecords, goals, rival, tips, eloAt, rankTimeline, news,
  }
}

const TIER_LABEL: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold', platinum: 'Platin', diamond: 'Diamant' }
const STEP_KINDS = new Set(['siege', 'rennen', 'km', 'gegner'])

export const WIN_STEPS = [1, 5, 10, 25, 50]
export const RACE_STEPS = [10, 25, 50, 100]
export const KM_STEPS = [1, 5, 10, 25]
export const OPP_STEPS = [5, 10, 15, 20, 25]

/** Platzierungen pro Runde aus den aufsummierten Rundenzeiten. Schlüssel: Fahrer#Platz */
export function positionTrace(s: Session): Map<string, number[]> {
  const maxLaps = Math.max(0, ...s.results.map((r) => r.lapTimes.length))
  const out = new Map<string, number[]>(s.results.map((r) => [r.driver + '#' + r.position, []]))
  for (let k = 1; k <= maxLaps; k++) {
    const order = s.results
      .map((r) => {
        const done = Math.min(k, r.lapTimes.length)
        return { key: r.driver + '#' + r.position, done, time: r.lapTimes.slice(0, done).reduce((a, l) => a + l.ms, 0), pos: r.position }
      })
      .sort((a, b) => b.done - a.done || a.time - b.time || a.pos - b.pos)
    order.forEach((o, i) => out.get(o.key)!.push(i + 1))
  }
  return out
}

export interface RaceEvent {
  lap: number
  driver: string
  text: string
  kind: 'overtake' | 'pit' | 'crash' | 'lead'
}

/** Überholmanöver, Führungswechsel, Boxenstopps und Abflüge eines Laufs. */
export function raceEvents(s: Session): RaceEvent[] {
  const trace = positionTrace(s)
  const events: RaceEvent[] = []
  const keys = [...trace.keys()]
  const name = (k: string) => k.split('#')[0]
  const laps = Math.max(0, ...[...trace.values()].map((v) => v.length))
  for (let i = 1; i < laps; i++) {
    for (const k of keys) {
      const prev = trace.get(k)![i - 1]
      const cur = trace.get(k)![i]
      if (cur < prev) {
        const passed = keys.find((o) => o !== k && trace.get(o)![i - 1] === cur)
        events.push({ lap: i + 1, driver: name(k), kind: cur === 1 ? 'lead' : 'overtake', text: cur === 1 ? `${name(k)} übernimmt die Führung${passed ? ` vor ${name(passed)}` : ''}` : `${name(k)} überholt ${passed ? name(passed) : ''} – P${cur}` })
      }
    }
  }
  for (const r of s.results) {
    r.lapTimes.forEach((l) => {
      if (l.status === 'pit') events.push({ lap: l.number, driver: r.driver, kind: 'pit', text: `${r.driver} an der Box (+${((l.lossMs ?? 0) / 1000).toFixed(1)} s)` })
      if (l.status === 'crash') events.push({ lap: l.number, driver: r.driver, kind: 'crash', text: `${r.driver}: Abflug (+${((l.lossMs ?? 0) / 1000).toFixed(1)} s)` })
    })
  }
  return events.sort((a, b) => a.lap - b.lap)
}

function computeMedals(
  sessions: Session[],
  rating: RatingResult,
  all: Map<string, DriverStats>,
  timeline: { kind: 'track' | 'car'; key: string; entry: RecordEntry; prev: RecordEntry | null }[],
  years: string[],
  rankingAt: (date: string) => Map<string, number>,
  dates: string[],
): Map<string, Medal[]> {
  const out = new Map<string, Medal[]>()
  const add = (driver: string, m: Medal) => {
    if (isGuest(driver)) return
    const list = out.get(driver) ?? []
    list.push(m)
    out.set(driver, list)
  }
  const drivers = [...all.values()].filter((d) => d.races + d.qualis > 0)
  const lastDate = sessions[sessions.length - 1]?.date ?? ''

  // Wanderpokale: Bahn- und Fahrzeugrekorde (nur Fahrer, keine Gäste)
  const holders = new Map<string, { driver: string; from: string }[]>()
  for (const t of timeline) {
    if (t.entry.guest) continue
    const list = holders.get(t.kind + t.key) ?? []
    if (list[list.length - 1]?.driver !== t.entry.driver) list.push({ driver: t.entry.driver, from: t.entry.date })
    holders.set(t.kind + t.key, list)
  }
  for (const [k, list] of holders) {
    const isTrack = k.startsWith('track')
    const [, car] = k.slice(isTrack ? 5 : 3).split('\u0000')
    const base = isTrack
      ? { kind: 'bahnrekord', name: 'Bahnrekord', description: 'Schnellste Runde auf der Strecke', tier: 'diamond' as Tier, icon: 'trophy' as const }
      : { kind: 'fahrzeugrekord', name: `Rekord ${car}`, description: `Schnellste Runde mit dem ${car}`, tier: 'gold' as Tier, icon: 'clock' as const }
    const current = list[list.length - 1]
    add(current.driver, { id: `${k}-now`, ...base, date: current.from })
    // Ehemalige Inhaber: je Fahrer nur die letzte Amtszeit
    const seen = new Set([current.driver])
    for (let i = list.length - 2; i >= 0; i--) {
      const h = list[i]
      if (seen.has(h.driver)) continue
      seen.add(h.driver)
      add(h.driver, { id: `${k}-${i}`, ...base, date: h.from, former: { from: h.from, to: list[i + 1].from } })
    }
  }

  // Titel mit genau einem Inhaber (aktueller Stand)
  const title = (kind: string, name: string, description: string, tier: Tier, icon: Medal['icon'], pick: (d: DriverStats) => number | null, higher = true) => {
    let best: number | null = null
    let who: string[] = []
    for (const d of drivers) {
      const v = pick(d)
      if (v == null) continue
      if (best == null || (higher ? v > best : v < best)) { best = v; who = [d.name] } else if (v === best) who.push(d.name)
    }
    for (const w of who) add(w, { id: kind, kind, name, description, tier, icon, date: lastDate, title: true })
  }
  title('rekordsieger', 'Rekordsieger', 'Die meisten Rennsiege', 'diamond', 'trophy', (d) => (d.wins > 0 ? d.wins : null))
  title('beste-platzierung', 'Beste Platzierung', 'Höchster Anteil geschlagener Gegner (ab 5 Rennen)', 'platinum', 'star', (d) => (d.races >= 5 ? d.beatShare : null))
  title('laengste-serie', 'Längste Siegesserie', 'Die meisten Siege in Folge', 'platinum', 'flame', (d) => (d.maxStreak >= 2 ? d.maxStreak : null))
  title('allrounder', 'Allrounder', 'Die meisten verschiedenen Autos gefahren', 'gold', 'car', (d) => (d.cars.size >= 3 ? d.cars.size : null))
  title('praezision', 'Präzisionsmeister', 'Die gleichmäßigsten Rundenzeiten (ab 5 Rennen)', 'gold', 'target', (d) => (d.races >= 5 ? d.precision : null), false)
  title('saubermann', 'Saubermann', 'Die wenigsten Abflüge pro 100 Runden', 'gold', 'shield', (d) => (d.crashBaseLaps >= 50 ? d.crashRate : null), false)
  title('kilometerfresser', 'Kilometerfresser', 'Die meisten gefahrenen Kilometer', 'gold', 'road', (d) => d.km)
  title('dauerbrenner', 'Dauerbrenner', 'An den meisten Renntagen dabei', 'gold', 'flag', (d) => (d.raceDays.size >= 2 ? d.raceDays.size : null))
  title('quali-ass', 'Qualifying-Ass', 'Die meisten Bestzeiten im Qualifying', 'gold', 'flag', (d) => (d.poles > 0 ? d.poles : null))

  // Giant Killer: die meisten Siege gegen klar stärkere Gegner
  const upsets = new Map<string, number>()
  for (const e of rating.events) if (e.upsetExpectation != null && e.upsetExpectation < 0.35) upsets.set(e.driver, (upsets.get(e.driver) ?? 0) + 1)
  const maxUpset = Math.max(0, ...upsets.values())
  for (const [d, n] of upsets) if (n === maxUpset && n > 0) add(d, { id: 'giant-killer', kind: 'giant-killer', name: 'Giant Killer', description: 'Am öftesten stärkere Fahrer und Autos geschlagen', tier: 'platinum', icon: 'sword', date: lastDate, title: true })

  // Jahresschnellster
  for (const y of years) {
    let best: { ms: number; driver: string; date: string } | null = null
    for (const s of sessions) if (s.date.startsWith(y)) for (const r of s.results) {
      if (isGuest(r.driver) || r.validBestLapMs == null) continue
      if (!best || r.validBestLapMs < best.ms) best = { ms: r.validBestLapMs, driver: r.driver, date: s.date }
    }
    if (best) add(best.driver, { id: `jahr-${y}`, kind: 'jahresschnellster', name: `Jahresschnellster ${y}`, description: 'Schnellste Runde des Jahres', tier: 'platinum', icon: 'clock', date: best.date })
  }

  // Aufsteiger des Jahres: die meisten Plätze in der Wertung gewonnen (Stand vor dem Jahr → Jahresende)
  for (const y of years) {
    const before = dates.filter((dt) => dt < `${y}-01-01`)
    const inYear = dates.filter((dt) => dt.startsWith(y))
    if (!before.length || !inYear.length) continue
    const start = rankingAt(before[before.length - 1])
    const end = rankingAt(inYear[inYear.length - 1])
    const gains = [...end].filter(([n]) => start.has(n)).map(([n, r]) => ({ n, g: start.get(n)! - r }))
    const max = Math.max(0, ...gains.map((x) => x.g))
    if (max < 2) continue
    for (const x of gains.filter((x) => x.g === max)) {
      add(x.n, { id: `aufsteiger-${y}`, kind: 'aufsteiger', name: `Aufsteiger ${y}`, description: `Die meisten Plätze in der Wertung gewonnen (+${max})`, tier: 'gold', icon: 'chevrons', date: inYear[inYear.length - 1] })
    }
  }

  // Stufen: Siege, Rennen, Kilometer, geschlagene Gegner
  const steps: { kind: string; name: (n: number) => string; icon: Medal['icon']; levels: number[]; value: (d: DriverStats) => number }[] = [
    { kind: 'siege', name: (n) => (n === 1 ? 'Erster Sieg' : `${n} Siege`), icon: 'trophy', levels: WIN_STEPS, value: (d) => d.wins },
    { kind: 'rennen', name: (n) => `${n} Rennen`, icon: 'flag', levels: RACE_STEPS, value: (d) => d.races },
    { kind: 'km', name: (n) => `${n} km gefahren`, icon: 'track', levels: KM_STEPS, value: (d) => d.km ?? 0 },
    { kind: 'gegner', name: (n) => `${n} Gegner geschlagen`, icon: 'people', levels: OPP_STEPS, value: (d) => d.opponentsBeaten.size },
  ]
  // Pro Art zählt die höchste erreichte Stufe (die niedrigeren stehen in der Beschreibung)
  for (const st of steps) {
    for (const d of drivers) {
      const v = st.value(d)
      const idx = st.levels.reduce((best, level, i) => (v >= level ? i : best), -1)
      if (idx < 0) continue
      const level = st.levels[idx]
      add(d.name, {
        id: `${st.kind}-${level}`, kind: st.kind, name: st.name(level),
        description: idx > 0 ? `Stufe ${idx + 1} von ${st.levels.length} · vorher ${st.levels.slice(0, idx).join(', ')}` : `Stufe 1 von ${st.levels.length}`,
        tier: TIER_ORDER[Math.min(idx, 3)], icon: st.icon, date: reachedDate(d, st.kind, level),
      })
    }
  }
  // Jeder bekommt mindestens eine Medaille
  for (const d of drivers) {
    if ((out.get(d.name) ?? []).length === 0) {
      const first = rating.history.get(d.name)?.[0]?.date ?? lastDate
      add(d.name, { id: 'debuet', kind: 'debuet', name: 'Debüt', description: 'Erster Lauf bei GR Legends', tier: 'bronze', icon: 'star', date: first })
    }
  }
  for (const [k, list] of out) {
    list.sort((a, b) => Number(!!a.former) - Number(!!b.former) || TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier) || b.date.localeCompare(a.date))
    out.set(k, list)
  }
  return out
}

/** Datum, an dem ein Fahrer eine Stufe erreicht hat. */
function reachedDate(d: DriverStats, kind: string, level: number): string {
  let wins = 0, races = 0, km = 0
  const beaten = new Set<string>()
  for (const { session, result } of d.raceResults) {
    races++
    if (result.position === 1) wins++
    if (session.trackLengthCm) km += (result.laps * session.trackLengthCm) / 100000
    for (const o of session.results) if (o !== result && !isGuest(o.driver) && result.position < o.position) beaten.add(o.driver)
    const v = kind === 'siege' ? wins : kind === 'rennen' ? races : kind === 'km' ? km : beaten.size
    if (v >= level) return session.date
  }
  return d.raceResults[d.raceResults.length - 1]?.session.date ?? ''
}

export type { RatingEvent }
