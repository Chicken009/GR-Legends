import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES = join(import.meta.dirname, '..', 'test', 'fixtures')

/** Liest `test/fixtures/<id>/<Dateiname>` (nur in Tests verwenden). */
export function readFixture(id: string): { name: string; text: string } {
  const dir = join(FIXTURES, id)
  const [name] = readdirSync(dir)
  return { name, text: readFileSync(join(dir, name), 'utf-8') }
}

export function fixtureIds(): string[] {
  return readdirSync(FIXTURES).sort()
}
