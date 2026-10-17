import { DEFAULT_CARS, DEFAULT_SCORING, type CarRule, type EventDef, type SectionDef, type SectionFormat, type TeamRule } from './types'

const FORMATS: SectionFormat[] = ['quali', 'races', 'ladder', 'ko', 'team', 'custom', 'free']
const ISO = /^\d{4}-\d{2}-\d{2}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v != null && !Array.isArray(v)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback)
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x)).filter(Boolean))] : [])
const strMap = (v: unknown): Record<string, string> =>
  isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string' && x.trim()).map(([k, x]) => [k, (x as string).trim()])) : {}
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback)

/** Ordnername / URL-Teil aus dem Wettkampfnamen */
export const eventSlug = (name: string) =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'wettkampf'

export function normalizeCars(v: unknown, fallback: CarRule = DEFAULT_CARS): CarRule {
  if (!isObj(v)) return { ...fallback, pool: [...fallback.pool], fixed: { ...fallback.fixed } }
  return {
    scale: oneOf(v.scale, ['1:32', '1:24'] as const, fallback.scale),
    mode: oneOf(v.mode, ['free', 'fixed', 'list', 'skill', 'random'] as const, fallback.mode),
    pool: strList(v.pool),
    fixed: strMap(v.fixed),
  }
}

function normalizeTeams(v: unknown): TeamRule | null {
  if (!isObj(v)) return null
  return {
    mode: oneOf(v.mode, ['manual', 'elo', 'random'] as const, 'elo'),
    size: num(v.size, 2, 1, 20),
    teams: Array.isArray(v.teams)
      ? v.teams.filter(isObj).map((t, i) => ({ name: str(t.name, `Team ${i + 1}`) || `Team ${i + 1}`, drivers: strList(t.drivers) }))
      : [],
  }
}

function normalizeSection(v: Obj, i: number): SectionDef {
  const format = oneOf(v.format, FORMATS, 'races')
  const out: SectionDef = {
    id: str(v.id) || `a${i + 1}`,
    name: str(v.name) || `Abschnitt ${i + 1}`,
    format,
    weight: num(v.weight, format === 'quali' ? 0 : 1, 0, 10),
    seeding: oneOf(v.seeding, ['previous', 'elo', 'random'] as const, 'previous'),
  }
  if (v.maxPerHeat != null) out.maxPerHeat = num(v.maxPerHeat, 4, 1, 12)
  if (v.cars != null) out.cars = normalizeCars(v.cars)
  if (v.laps != null) out.laps = num(v.laps, 10, 1, 999)
  if (v.minutes != null) out.minutes = num(v.minutes, 5, 1, 240)
  if (v.rounds != null) out.rounds = num(v.rounds, 1, 1, 20)
  if (v.half === true) out.half = true
  if (v.teamMode === 'teams' || v.teamMode === 'single') out.teamMode = v.teamMode
  if (v.advanceAuto === true) out.advanceAuto = true
  if (v.advance != null) out.advance = num(v.advance, 1, 1, 11)
  if (Array.isArray(v.heats)) {
    out.heats = v.heats.filter(isObj).map((h) => ({ kind: h.kind === 'quali' ? 'quali' : 'race', drivers: strList(h.drivers) }))
  }
  return out
}

/**
 * Liest eine Wettkampf-Definition (JSON) und ergänzt fehlende Angaben. Wirft einen Fehler mit
 * verständlichem Text, wenn Name oder Datum fehlen.
 */
export function normalizeEvent(raw: unknown, fallbackName = ''): EventDef {
  if (!isObj(raw)) throw new Error('Die Datei enthält keinen Wettkampf.')
  const name = str(raw.name) || fallbackName
  if (!name) throw new Error('Der Wettkampf hat keinen Namen.')
  const start = str(raw.start)
  if (!ISO.test(start)) throw new Error('Startdatum fehlt oder ist ungültig (JJJJ-MM-TT).')
  const end = str(raw.end)
  const scoring = isObj(raw.scoring) ? raw.scoring : {}
  const ids = new Set<string>()
  const sections = (Array.isArray(raw.sections) ? raw.sections.filter(isObj) : []).map((s, i) => {
    const sec = normalizeSection(s, i)
    // Abschnitts-IDs müssen eindeutig sein (Lauf-IDs bauen darauf auf)
    while (ids.has(sec.id)) sec.id = `${sec.id}x`
    ids.add(sec.id)
    return sec
  })
  const overrides: EventDef['overrides'] = {}
  if (isObj(raw.overrides)) {
    for (const [id, o] of Object.entries(raw.overrides)) {
      if (!isObj(o)) continue
      const entry: EventDef['overrides'][string] = {}
      if (Array.isArray(o.drivers)) entry.drivers = strList(o.drivers)
      if (isObj(o.cars)) entry.cars = strMap(o.cars)
      if (entry.drivers || entry.cars) overrides[id] = entry
    }
  }
  return {
    version: 1,
    name,
    track: str(raw.track) || undefined,
    start,
    end: ISO.test(end) && end > start ? end : undefined,
    drivers: strList(raw.drivers),
    show: oneOf(raw.show, ['now', 'week'] as const, 'now'),
    showPlan: oneOf(raw.showPlan, ['now', 'week', 'day', 'raceday'] as const, 'now'),
    maxPerHeat: num(raw.maxPerHeat, 4, 1, 12),
    cars: normalizeCars(raw.cars),
    scoring: {
      method: oneOf(scoring.method, ['absolute', 'fair'] as const, DEFAULT_SCORING.method),
      perBeaten: num(scoring.perBeaten, DEFAULT_SCORING.perBeaten, 0, 100),
      win: num(scoring.win, DEFAULT_SCORING.win, 0, 100),
      fastestLap: num(scoring.fastestLap, DEFAULT_SCORING.fastestLap, 0, 100),
      pole: num(scoring.pole, DEFAULT_SCORING.pole, 0, 100),
      driverOfDay: num(scoring.driverOfDay, DEFAULT_SCORING.driverOfDay, 0, 100),
      personalBest: num(scoring.personalBest, DEFAULT_SCORING.personalBest, 0, 100),
      clean: num(scoring.clean, DEFAULT_SCORING.clean, 0, 100),
      finaleFactor: num(scoring.finaleFactor, DEFAULT_SCORING.finaleFactor, 1, 5),
    },
    teams: normalizeTeams(raw.teams),
    countInStats: raw.countInStats !== false,
    seed: str(raw.seed) || name,
    sections,
    overrides,
    matches: strMap(raw.matches),
  }
}

/** JSON für den Download: nur gesetzte Werte, gut lesbar */
export function serializeEvent(def: EventDef): string {
  const clean = JSON.parse(JSON.stringify(def)) as Obj
  if (!def.end) delete clean.end
  if (!def.track) delete clean.track
  return `${JSON.stringify(clean, null, 2)}\n`
}
