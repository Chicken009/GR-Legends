import { DEFAULT_CARS, DEFAULT_SCORING, type EventDef, type SectionDef, type SectionFormat } from './types'

export interface Template {
  id: string
  name: string
  text: string
  build: () => Pick<EventDef, 'sections' | 'teams'> & { scoring?: Partial<EventDef['scoring']> }
}

let counter = 0
const sid = () => `a${Date.now().toString(36)}${(counter++).toString(36)}`

export function newSection(format: SectionFormat, extra: Partial<SectionDef> = {}): SectionDef {
  const base: SectionDef = { id: sid(), name: '', format, weight: format === 'quali' ? 0 : 1, seeding: 'previous' }
  const defaults: Partial<Record<SectionFormat, Partial<SectionDef>>> = {
    quali: { name: 'Qualifying', laps: 4 },
    races: { name: 'Rennen', laps: 10, rounds: 2 },
    ladder: { name: 'Aufstiegsleiter', laps: 10, advanceAuto: true },
    ko: { name: 'K.-o.-Runde', laps: 10, advance: 1 },
    team: { name: 'Teamrennen', laps: 15, rounds: 1 },
    custom: { name: 'Eigene Läufe', laps: 10, heats: [] },
    free: { name: 'Läufe', laps: 10 },
  }
  return { ...base, ...defaults[format], ...extra }
}

export const TEMPLATES: Template[] = [
  {
    id: 'legends',
    name: 'Quali → Leiter',
    text: 'Jeder fährt allein 4 Runden Quali. Dann die Aufstiegsleiter: die Langsamsten zuerst, die Besten steigen auf bis ins Finale.',
    build: () => ({
      sections: [newSection('quali', { name: 'Einzel-Quali', maxPerHeat: 1, laps: 4 }), newSection('ladder', { name: 'Aufstiegsleiter' })],
      teams: null,
    }),
  },
  {
    id: 'abend',
    name: 'Klassischer Abend',
    text: 'Qualifying, danach zwei Durchgänge Rennen in gemischten Gruppen. Die Punkte werden addiert.',
    build: () => ({ sections: [newSection('quali'), newSection('races', { rounds: 2 })], teams: null }),
  },
  {
    id: 'ko',
    name: 'K.-o.-Turnier',
    text: 'Qualifying für die Setzliste, dann Duelle Mann gegen Mann: Wer verliert, scheidet aus.',
    build: () => ({ sections: [newSection('quali'), newSection('ko', { maxPerHeat: 2, advance: 1 })], teams: null }),
  },
  {
    id: 'team',
    name: 'Team-Cup',
    text: 'Ausgeglichene Zweierteams nach Elo. Jedes Team gegen jedes – die Teampunkte bekommen alle Mitglieder.',
    build: () => ({ sections: [newSection('quali'), newSection('team', { seeding: 'elo' })], teams: { mode: 'elo', size: 2, teams: [] } }),
  },
  {
    id: 'frei',
    name: 'Ohne Plan',
    text: 'Einfach fahren: Jede Datei im Ordner ist ein Lauf, die Punkte werden addiert.',
    build: () => ({ sections: [newSection('free')], teams: null }),
  },
]

export function newEvent(today: string, template = TEMPLATES[0]): EventDef {
  const t = template.build()
  return {
    version: 1,
    name: '',
    start: today,
    drivers: [],
    show: 'now',
    showPlan: 'now',
    maxPerHeat: 4,
    cars: { ...DEFAULT_CARS },
    // Neue Wettkämpfe: knapp verloren zählt (bestehende behalten ihre Wertung)
    scoring: { ...DEFAULT_SCORING, closeLoss: true, ...t.scoring },
    teams: t.teams,
    countInStats: true,
    seed: Math.random().toString(36).slice(2, 8),
    sections: t.sections,
    overrides: {},
    matches: {},
  }
}
