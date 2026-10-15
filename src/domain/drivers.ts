/** Alias → kanonischer Fahrername. Später aus dem Google Sheet (Tab „Fahrer“). */
export type DriverAliases = Record<string, string>

// „Gast“, „Gast 2“ und per Einstellungen markierte „Gast (Name)“
const GUEST_RE = /^gast(\s*\d+)?(\s*\(.*\))?$/i

export function isGuest(name: string): boolean {
  return GUEST_RE.test(name.trim())
}

export function canonicalDriver(name: string, aliases: DriverAliases = {}): string {
  const trimmed = name.trim()
  return aliases[trimmed] ?? trimmed
}
