/**
 * Wettkampf-Definition, wie sie als `wettkampf.json` im Wettkampf-Ordner liegt
 * (`<Strecke>/<Wettkampfname>/wettkampf.json`). Alle Angaben außer Name und Datum sind optional;
 * fehlende Werte ergänzt `normalizeEvent` mit Standardwerten.
 */

export const EVENT_FILE = 'wettkampf.json'

/** Wann der Wettkampf in der App erscheint */
export type ShowFrom = 'now' | 'week'
/** Wann der Ablauf (Läufe, Besetzung, Autos) sichtbar wird */
export type PlanFrom = 'now' | 'week' | 'day' | 'raceday'

/**
 * Fahrzeugzuteilung:
 * free = egal · fixed = jeder ein bestimmtes Auto · list = freie Wahl aus einer Liste ·
 * skill = Programm teilt nach Können zu (Schwächster bekommt das stärkste Auto) ·
 * random = zufällig verteilt, mit jedem Lauf wird durchgetauscht
 */
export type CarMode = 'free' | 'fixed' | 'list' | 'skill' | 'random'

export interface CarRule {
  scale: '1:32' | '1:24'
  mode: CarMode
  /** Auswahl für list, skill und random */
  pool: string[]
  /** fixed: Fahrer → Auto */
  fixed: Record<string, string>
}

export interface Scoring {
  /** absolute: Punkte für die Platzierung · fair: Siege gegen Stärkere (laut Elo) zählen mehr */
  method: 'absolute' | 'fair'
  perBeaten: number
  win: number
  /** Bonus: schnellste Runde aller Rennen */
  fastestLap: number
  /** Bonus: Schnellster im (ersten) Qualifying */
  pole: number
  /** Bonus: größte Leistung über der Erwartung laut Elo */
  driverOfDay: number
  /** Bonus: neue persönliche Bestzeit auf der Strecke */
  personalBest: number
  /** Bonus je Rennen ohne Abflug */
  clean: number
  /** Der letzte Abschnitt zählt so viel (1 = kein Finalbonus) */
  finaleFactor: number
  /** Nur bei fair: auch den Siegbonus nach Stärke gewichten */
  fairWin?: boolean
}

export interface TeamDef {
  name: string
  drivers: string[]
}

export interface TeamRule {
  /** manual = selbst eingeteilt (oder per Losknopf festgeschrieben) · elo = ausgeglichen nach Elo · random = ausgelost */
  mode: 'manual' | 'elo' | 'random'
  size: number
  teams: TeamDef[]
}

/**
 * Format eines Abschnitts:
 * quali = Qualifying (Wertung nach schnellster Runde) · races = Rennen in Gruppen, Punkte addiert ·
 * ladder = Aufstiegsleiter · ko = K.-o.-System · team = Teamrennen · custom = Läufe selbst festgelegt ·
 * free = Läufe so, wie sie gefahren werden (ohne Plan)
 */
export type SectionFormat = 'quali' | 'races' | 'ladder' | 'ko' | 'team' | 'custom' | 'free'

export type Seeding = 'previous' | 'elo' | 'random'

export interface SectionDef {
  id: string
  name: string
  format: SectionFormat
  /** Gewichtung der Punkte (Qualifying meist 0 = nur Startreihenfolge und Pole) */
  weight: number
  /** Startreihenfolge / Einteilung */
  seeding: Seeding
  /** Fahrzeuge gleichzeitig (leer = vom Wettkampf) */
  maxPerHeat?: number
  /** Fahrzeugregel (leer = vom Wettkampf) */
  cars?: CarRule
  /** Runden pro Lauf – zur Anzeige und für die Zeitschätzung */
  laps?: number
  /** Stattdessen auf Zeit: Minuten pro Lauf (hat Vorrang vor `laps`) */
  minutes?: number
  /** races / team: Durchgänge (team mit zwei Teams je Lauf: 1 Durchgang = jedes Team einmal gegen jedes) */
  rounds?: number
  /** team: auto = nach Spurzahl · teams = Team gegen Team (notfalls mit einem Teil der Fahrer) · single = ein Fahrer je Team */
  teamMode?: 'auto' | 'teams' | 'single'
  /** team mit zwei Teams je Lauf, 1 Durchgang: nur etwa die Hälfte der Paarungen, Gegner nach Elo ausgeglichen */
  half?: boolean
  /** ladder / ko: so viele kommen pro Lauf weiter */
  advance?: number
  /** ladder: Aufsteiger je Rennen automatisch (die Hälfte, Rennen möglichst gleich groß) */
  advanceAuto?: boolean
  /** ladder: so viele Fahrer stehen direkt im Finale (leer = automatisch) */
  finalDirect?: number
  /** Startaufstellung nach Startreihenfolge (vorheriger Abschnitt oder Elo): Beste vorne (Standard) oder Schwächste vorne */
  gridOrder?: 'best' | 'worst'
  /** custom: Läufe mit festen Fahrern */
  heats?: { kind: 'race' | 'quali'; drivers: string[] }[]
}

/** Manuelle Änderung an einem einzelnen Lauf */
export interface HeatOverride {
  drivers?: string[]
  /** Fahrer → Auto */
  cars?: Record<string, string>
}

export interface EventDef {
  version: 1
  name: string
  /** Strecke (für Zeitschätzung und Autowertung; der Ordner hat Vorrang) */
  track?: string
  /** ISO-Datum */
  start: string
  /** ISO-Datum; leer = nur der Starttag */
  end?: string
  drivers: string[]
  show: ShowFrom
  showPlan: PlanFrom
  /** Fahrzeuge gleichzeitig auf der Bahn */
  maxPerHeat: number
  cars: CarRule
  scoring: Scoring
  /** null = Einzelwertung */
  teams: TeamRule | null
  /** Läufe zählen auch für Elo und Saison */
  countInStats: boolean
  /** Startwert für Zufall (Teams, Autos): gleich für alle Geräte */
  seed: string
  sections: SectionDef[]
  overrides: Record<string, HeatOverride>
  /** Korrektur der CSV-Zuordnung: Datei-ID → Lauf-ID oder „ignore“ */
  matches: Record<string, string>
}

export const DEFAULT_SCORING: Scoring = {
  method: 'absolute',
  perBeaten: 1,
  win: 1,
  fastestLap: 2,
  pole: 1,
  driverOfDay: 2,
  personalBest: 1,
  clean: 0,
  finaleFactor: 1,
}

/** Länge eines Laufs als Text: „10 Runden“ oder „5 Minuten“ (leer, wenn nichts festgelegt) */
export function heatLength(x: { laps?: number | null; minutes?: number | null }): string {
  if (x.minutes) return `${x.minutes} ${x.minutes === 1 ? 'Minute' : 'Minuten'}`
  if (x.laps) return `${x.laps} ${x.laps === 1 ? 'Runde' : 'Runden'}`
  return ''
}

export const DEFAULT_CARS: CarRule = { scale: '1:32', mode: 'free', pool: [], fixed: {} }

export const FORMAT_LABEL: Record<SectionFormat, string> = {
  quali: 'Qualifying',
  races: 'Rennen in Gruppen',
  ladder: 'Aufstiegsleiter',
  ko: 'K.-o.-System',
  team: 'Teamrennen',
  custom: 'Eigene Läufe',
  free: 'Wie gefahren',
}

export const CAR_MODE_LABEL: Record<CarMode, string> = {
  free: 'Egal',
  fixed: 'Festes Auto je Fahrer',
  list: 'Freie Wahl aus Liste',
  skill: 'Nach Können zuteilen',
  random: 'Zufällig, wird durchgetauscht',
}
