import type { Result, Session } from '../types'
import { isGuest } from './drivers'
import { SPLIT_REWARDS_FROM } from './splits'

/** Saison-Challenges: kleine Aufgaben pro Jahr, jede geschaffte bringt Karriere-XP. */
export interface Challenge {
  id: string
  label: string
  detail: string
  value: number
  target: number
  done: boolean
}

export const CHALLENGE_XP = 20
/** So viele Challenges gibt es pro Saison, davon mindestens `NEW_PER_SEASON` neue gegenüber der Vorsaison */
export const CHALLENGES_PER_SEASON = 7
export const NEW_PER_SEASON = 3

/** Alles, was eine Challenge über die Saison eines Fahrers wissen muss */
export interface ChallengeContext {
  /** Läufe des Jahres, chronologisch */
  sessions: Session[]
  driver: string
  /** verbesserte persönliche Bestzeiten im Jahr (mit Auto) */
  personalBests: { car: string }[]
  /** Pole oder schnellste Runde eines Renntags im Jahr (aus der Saisonwertung) */
  dayBonus: number
  /** Siege als klarer Außenseiter im Jahr */
  upsetWins: number
  /** Autos, die der Fahrer vor diesem Jahr schon gefahren ist */
  carsBefore: Set<string>
  /**
   * 10/20 Runden auf der Hauptstrecke: Bestmarke vor der Saison, die damit schon erreichte
   * Zeitmarke und die Zeiten der Saison (mit der jeweils bisherigen Bestmarke)
   */
  splits?: { n: number; pbBefore: number | null; mark: number | null; times: { ms: number; prevBest: number | null }[] }[]
}

interface Facts {
  races: { s: Session; r: Result }[]
  qualis: { s: Session; r: Result }[]
  days: number
  wins: { s: Session; r: Result }[]
}

interface ChallengeDef {
  id: string
  label: string
  detail: string | ((c: ChallengeContext) => string)
  target: number
  value: (c: ChallengeContext, f: Facts) => number
}

const isQualiSession = (s: Session) => /quali/i.test(s.type)
const isWin = (s: Session, r: Result) => r.position === 1 && s.results.length > 1
const crashed = (r: Result) => r.lapTimes.some((l) => l.status === 'crash')

/** längste Serie aufeinanderfolgender Rennen, die `ok` erfüllen */
function longestRun<T>(xs: T[], ok: (x: T) => boolean | null): number {
  let cur = 0
  let best = 0
  for (const x of xs) {
    const v = ok(x)
    if (v == null) continue
    cur = v ? cur + 1 : 0
    best = Math.max(best, cur)
  }
  return best
}

/** Pool aller Challenges. Neue einfach anhängen – die IDs müssen stabil bleiben. */
export const CHALLENGE_POOL: ChallengeDef[] = [
  { id: 'tage', label: 'Stammgast', detail: 'An 3 Renntagen dabei sein', target: 3, value: (_, f) => f.days },
  { id: 'sieg', label: 'Siegertyp', detail: 'Ein Rennen gewinnen', target: 1, value: (_, f) => f.wins.length },
  {
    id: 'sauber', label: 'Saubere Serie', detail: '3 Rennen am Stück ohne Abflug (ohne Tankfunktion)', target: 3,
    value: (_, f) => longestRun(f.races, ({ s, r }) => (s.tank ? null : !crashed(r))),
  },
  {
    id: 'gegner', label: 'Gegnerjäger', detail: '5 verschiedene Gegner schlagen', target: 5,
    value: (_, f) => new Set(f.races.flatMap(({ s, r }) => s.results.filter((o) => o.position > r.position && !isGuest(o.driver)).map((o) => o.driver))).size,
  },
  { id: 'bestzeit', label: 'Schneller als je zuvor', detail: 'Die persönliche Bestzeit verbessern', target: 1, value: (c) => c.personalBests.length },
  { id: 'bonus', label: 'Bonusjäger', detail: 'Pole oder schnellste Runde eines Renntags holen', target: 1, value: (c) => c.dayBonus },
  { id: 'autos', label: 'Allrounder', detail: 'Mit 3 verschiedenen Autos gewinnen', target: 3, value: (_, f) => new Set(f.wins.map(({ r }) => r.car)).size },
  { id: 'podest', label: 'Podiumsgast', detail: '3-mal aufs Podest (Felder ab 4 Fahrern)', target: 3, value: (_, f) => f.races.filter(({ s, r }) => r.position <= 3 && s.results.length > 3).length },
  { id: 'serie', label: 'Lauf', detail: '2 Rennen in Folge gewinnen', target: 2, value: (_, f) => longestRun(f.races, ({ s, r }) => isWin(s, r)) },
  { id: 'rennen10', label: 'Dauerbrenner', detail: '10 Rennen fahren', target: 10, value: (_, f) => f.races.length },
  { id: 'qualis', label: 'Startaufstellung', detail: 'An 3 Qualifyings teilnehmen', target: 3, value: (_, f) => f.qualis.length },
  { id: 'aussenseiter', label: 'David gegen Goliath', detail: 'Ein Rennen als klarer Außenseiter gewinnen', target: 1, value: (c) => c.upsetWins },
  { id: 'comeback', label: 'Comeback', detail: 'Ein Rennen trotz Abflug gewinnen', target: 1, value: (_, f) => f.wins.filter(({ r }) => crashed(r)).length },
  { id: 'grossesfeld', label: 'Volles Haus', detail: 'Ein Rennen mit mindestens 5 Fahrern gewinnen', target: 1, value: (_, f) => f.wins.filter(({ s }) => s.results.length >= 5).length },
  {
    id: 'km', label: 'Kilometerfresser', detail: '5 km in Rennen fahren', target: 5,
    value: (_, f) => Math.floor(f.races.reduce((a, { s, r }) => a + (s.trackLengthCm ? (r.laps * s.trackLengthCm) / 100000 : 0), 0)),
  },
  { id: 'runden', label: 'Rundenzähler', detail: '100 Runden in Rennen fahren', target: 100, value: (_, f) => f.races.reduce((a, { r }) => a + r.laps, 0) },
  { id: 'neuesauto', label: 'Probefahrt', detail: 'Ein Auto fahren, das du noch nie gefahren bist', target: 1, value: (c, f) => new Set(f.races.map(({ r }) => r.car).filter((car) => !c.carsBefore.has(car))).size },
  {
    id: 'konstant', label: 'Uhrwerk', detail: 'Ein Rennen mit sehr gleichmäßigen Runden (Streuung unter 4 %)', target: 1,
    value: (_, f) =>
      f.races.filter(({ r }) => {
        const xs = r.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms)
        if (xs.length < 8) return false
        const m = xs.reduce((a, b) => a + b, 0) / xs.length
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m < 0.04
      }).length,
  },
  {
    id: 'tagessieger', label: 'Abend des Jahres', detail: '3 Siege an einem Renntag', target: 3,
    value: (_, f) => {
      const byDay = new Map<string, number>()
      for (const { s } of f.wins) byDay.set(s.date, (byDay.get(s.date) ?? 0) + 1)
      return Math.max(0, ...byDay.values())
    },
  },
  { id: 'pbautos', label: 'Tuner', detail: 'In 2 verschiedenen Autos die eigene Bestzeit verbessern', target: 2, value: (c) => new Set(c.personalBests.map((p) => p.car)).size },
]

const fmtMs = (ms: number) => {
  const s = ms / 1000
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
}
const fmtMarkMs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`

/**
 * Zeitjagd über 10 bzw. 20 Runden: geschafft mit einer neuen Bestmarke – oder dreimal unter der
 * Zeitmarke, die man schon einmal geknackt hat (Konstanz statt Rekord).
 */
function timeChallenge(n: number, label: string): ChallengeDef {
  const info = (c: ChallengeContext) => c.splits?.find((x) => x.n === n)
  return {
    id: `zeit${n}`,
    label,
    target: 3,
    detail: (c) => {
      const x = info(c)
      if (!x || x.pbBefore == null || x.mark == null) return `Ein Rennen über mindestens ${n} Runden ohne Tankfunktion fahren – deine erste Bestmarke`
      return `Bestmarke über ${n} Runden verbessern (${fmtMs(x.pbBefore)}) oder 3-mal unter ${fmtMarkMs(x.mark)} bleiben`
    },
    value: (c) => {
      const x = info(c)
      if (!x) return 0
      // jede neue Bestmarke (auch die erste) erfüllt die Challenge sofort
      if (x.times.some((t) => t.prevBest == null || t.ms < t.prevBest)) return 3
      return x.mark == null ? 0 : x.times.filter((t) => t.ms < x.mark!).length
    },
  }
}

/**
 * Zusätzlicher Platz – getrennt vom Pool, damit sich frühere Auswahlen nicht ändern. Erst ab der
 * nächsten Saison, damit laufende Challenges und XP gleich bleiben.
 */
export const TIME_POOL: ChallengeDef[] = [timeChallenge(10, 'Zehner-Jagd'), timeChallenge(20, 'Zwanziger-Jagd')]
export const TIME_FROM = SPLIT_REWARDS_FROM

/** Kleiner, fester Zufallsgenerator: gleiche Saison → gleiche Auswahl auf jedem Gerät */
function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const rnd = seeded(seed)
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const FIRST_SEASON = 2020
const selection = new Map<number, string[]>()

/** Challenges einer Saison: zufällig aus dem Pool, mindestens `NEW_PER_SEASON` neue gegenüber dem Vorjahr. */
export function seasonChallengeIds(year: number | string): string[] {
  const y = Number(year)
  const cached = selection.get(y)
  if (cached) return cached
  const prev = new Set(y > FIRST_SEASON ? seasonChallengeIds(y - 1) : [])
  const order = shuffled(CHALLENGE_POOL.map((c) => c.id), y * 7919 + 17)
  const fresh = order.filter((id) => !prev.has(id)).slice(0, NEW_PER_SEASON)
  const rest = order.filter((id) => !fresh.includes(id)).slice(0, CHALLENGES_PER_SEASON - fresh.length)
  // Reihenfolge wie gezogen, damit neue und bekannte gemischt sind
  const ids = order.filter((id) => fresh.includes(id) || rest.includes(id))
  selection.set(y, ids)
  return ids
}

/** Challenges eines Fahrers in einer Saison mit Fortschritt */
export function seasonChallenges(year: number | string, ctx: ChallengeContext): Challenge[] {
  const mine = ctx.sessions.filter((s) => s.results.some((r) => r.driver === ctx.driver))
  const pick = (list: Session[]) => list.map((s) => ({ s, r: s.results.find((r) => r.driver === ctx.driver)! }))
  const races = pick(mine.filter((s) => !isQualiSession(s)))
  const facts: Facts = { races, qualis: pick(mine.filter(isQualiSession)), days: new Set(mine.map((s) => s.date)).size, wins: races.filter(({ s, r }) => isWin(s, r)) }
  const time = Number(year) >= TIME_FROM ? [TIME_POOL[Math.floor(seeded(Number(year) * 104729)() * TIME_POOL.length)]] : []
  return [...seasonChallengeIds(year).map((id) => CHALLENGE_POOL.find((c) => c.id === id)!), ...time].map((def) => {
    const value = def.value(ctx, facts)
    const detail = typeof def.detail === 'function' ? def.detail(ctx) : def.detail
    return { id: def.id, label: def.label, detail, value: Math.min(value, def.target), target: def.target, done: value >= def.target }
  })
}
