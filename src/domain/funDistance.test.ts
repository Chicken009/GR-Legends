import { describe, expect, it } from 'vitest'
import { distanceComparisons, funDistance } from './funDistance'

describe('Witzige Streckenvergleiche', () => {
  it('nimmt nur Vergleiche mit sinnvoller Anzahl', () => {
    const list = distanceComparisons(12)
    expect(list).toContain('so weit wie 114 Fußballfelder')
    expect(list).toContain('im Maßstab 1:32 wären das 384 km, weiter als von Hamburg nach Berlin')
    expect(list.some((t) => t.includes('Mond'))).toBe(false)
    expect(list.some((t) => t.includes('Bratwürste'))).toBe(true)
  })

  it('wählt mit dem Zufallswert einen Vergleich aus', () => {
    const list = distanceComparisons(30)
    expect(funDistance(30, 0)).toBe(list[0])
    expect(funDistance(30, 0.9999)).toBe(list.at(-1))
    expect(funDistance(0, 0.5)).toBeNull()
  })

  it('rundet große Zahlen grob', () => {
    expect(distanceComparisons(20).find((t) => t.includes('Bratwürste'))).toBe('100.000 Bratwürste aneinandergelegt')
  })
})
