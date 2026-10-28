import { describe, expect, it } from 'vitest'
import type { Session } from '../../types'
import { computeEvent, type EventContext } from './engine'
import { driverInsight, eventFinished, storylines } from './insights'
import { normalizeEvent } from './normalize'
import { eventNumbers, eventProgress, heatPointsExplained, myRecap, pointsHistory, recapFacts, recapMoments, waitFor } from './progress'
import { playThrough } from './simulate'
import { TEMPLATES } from './templates'

const DRIVERS = ['Anton Berger', 'Mika', 'Emil', 'F. Lorenz', 'Pia S.', 'Lars v. Hollen', 'Noah T.']
const ELO = Object.fromEntries(DRIVERS.map((d, i) => [d, 700 - i * 40]))
const ctx = (sessions: Session[] = []): EventContext => ({ sessions, elo: (n) => ELO[n] ?? 500, car: () => 0, previousBest: () => null })

/** Alles, was die Wettkampf-Seite, der Rückblick und die Leinwand aus einem Stand berechnen */
function everything(def: ReturnType<typeof normalizeEvent>, sessions: Session[]) {
  const state = computeEvent(def, ctx(sessions))
  const steps = pointsHistory(def, ctx(sessions))
  recapFacts(state, steps)
  recapMoments(state, steps)
  storylines(state)
  eventNumbers(state)
  eventProgress(state, 10_000)
  for (const d of state.drivers) {
    myRecap(state, steps, d)
    waitFor(state, d, 10_000)
    driverInsight(state, d)
  }
  for (const h of state.heats) for (const n of h.order) heatPointsExplained(state, h, n)
  return state
}

const later = (s: Session, min: number, id: string): Session => {
  const t = new Date(Date.UTC(2000, 0, 1, 5, min)).toISOString()
  return { ...s, fileId: id, createdTime: t, modifiedTime: t }
}

describe('Wettkampf übersteht gelöschte, wieder hinzugefügte und doppelte Läufe', () => {
  for (const tpl of TEMPLATES) {
    for (const teams of tpl.id === 'team' ? [true] : [false, true]) {
      it(`${tpl.name}${teams ? ' mit Teams' : ''}`, () => {
        const built = tpl.build()
        const def = normalizeEvent({
          name: 'Test',
          start: '2000-01-01',
          drivers: DRIVERS,
          maxPerHeat: 4,
          sections: built.sections,
          teams: teams ? { mode: 'elo', size: 2, teams: [] } : built.teams,
        })
        // „Ohne Plan“ hat keine geplanten Läufe – dort die Läufe eines klassischen Abends nehmen
        const source = def.sections.every((x) => x.format === 'free') ? normalizeEvent({ ...def, sections: TEMPLATES[1].build().sections }) : def
        const sessions = playThrough(source, ctx(), 'robust', 10_000).heats.map((h) => h.session).filter((s): s is Session => s != null)
        expect(sessions.length).toBeGreaterThan(0)
        const last = sessions[sessions.length - 1]
        const variants: Session[][] = [
          [],
          sessions.slice(0, 1),
          sessions.slice(0, Math.ceil(sessions.length / 2)),
          sessions.slice(0, -1),
          sessions,
          // letztes Rennen gelöscht und als neue Datei wieder hinzugefügt
          [...sessions.slice(0, -1), later(last, 1, 'neu-1')],
          // dieselbe Datei doppelt
          [...sessions, later(last, 2, 'neu-2')],
          // ein Lauf aus der Mitte fehlt
          sessions.filter((_, i) => i !== Math.floor(sessions.length / 2)),
        ]
        for (const v of variants) expect(() => everything(def, v)).not.toThrow()
        expect(everything(def, [...sessions.slice(0, -1), later(last, 1, 'neu-1')]).complete).toBe(everything(def, sessions).complete)
        // Fehlt das letzte Rennen, steht das Ergebnis nicht fest – auch wenn das Datum vorbei ist
        if (source === def) {
          expect(eventFinished(def, everything(def, sessions.slice(0, -1)), '2099-01-01')).toBe(false)
          expect(eventFinished(def, everything(def, sessions), '2000-01-01')).toBe(true)
        }
      })
    }
  }
})
