import type { ReactNode } from 'react'
import { carScale } from '../../data/settings'
import { CAR_MODE_LABEL, type CarMode, type CarRule } from '../../domain/event/types'
import { Segment, useData } from '../components'

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  )
}

/** Feld ohne <label> (für Gruppen von Knöpfen) */
export function Group({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; format?: (v: number) => string }) {
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100)
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - step)} disabled={value <= min} aria-label={`${label} verringern`}>
        −
      </button>
      <span aria-live="polite">{format ? format(value) : value.toLocaleString('de-DE')}</span>
      <button type="button" onClick={() => set(value + step)} disabled={value >= max} aria-label={`${label} erhöhen`}>
        +
      </button>
    </span>
  )
}

export function ToggleChip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className="toggle-chip" aria-pressed={on} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

/** Autos aus allen Läufen und dem Einstellungen-Sheet, passend zum Maßstab */
export function useCarOptions(scale: '1:32' | '1:24'): string[] {
  const { model, settings } = useData()
  const cars = [...model.stats('all').cars.values()].sort((a, b) => b.races + b.qualis - (a.races + a.qualis)).map((c) => c.name)
  const fromSheet = Object.values(settings.cars).map((c) => c.displayName ?? c.name ?? '').filter(Boolean)
  const all = [...new Set([...cars, ...fromSheet])]
  const want = scale === '1:24' ? 24 : 32
  return all.filter((c) => carScale(settings, c) === want)
}

export function CarRuleEditor({ rule, onChange, drivers }: { rule: CarRule; onChange: (r: CarRule) => void; drivers: string[] }) {
  const options = useCarOptions(rule.scale)
  const pool = rule.pool.filter((c) => options.includes(c) || !options.length)
  const extra = rule.pool.filter((c) => !options.includes(c))
  const togglePool = (car: string) => onChange({ ...rule, pool: rule.pool.includes(car) ? rule.pool.filter((c) => c !== car) : [...rule.pool, car] })
  const needsPool = rule.mode === 'list' || rule.mode === 'skill' || rule.mode === 'random'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-grid">
        <Group label="Maßstab">
          <Segment
            small
            label="Maßstab"
            value={rule.scale}
            onChange={(scale) => onChange({ ...rule, scale })}
            options={[
              ['1:32', '1:32'],
              ['1:24', '1:24'],
            ]}
          />
        </Group>
        <Field label="Zuordnung">
          <select className="select" value={rule.mode} onChange={(e) => onChange({ ...rule, mode: e.target.value as CarMode })}>
            {(Object.keys(CAR_MODE_LABEL) as CarMode[]).map((m) => (
              <option key={m} value={m}>
                {CAR_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {needsPool && (
        <Group
          label={`Autoliste (${rule.pool.length})`}
          help={
            rule.mode === 'skill'
              ? 'Der schwächste Fahrer im Lauf bekommt das stärkste Auto (Autowertung auf der Strecke).'
              : rule.mode === 'random'
                ? 'Jeder startet mit einem ausgelosten Auto und bekommt mit jedem Lauf das nächste aus der Liste – so fährt jeder möglichst jedes Auto.'
                : 'Jeder sucht sich vor dem Lauf ein Auto aus der Liste aus.'
          }
        >
          <div className="chips">
            {options.map((c) => (
              <ToggleChip key={c} on={pool.includes(c)} onClick={() => togglePool(c)}>
                {c}
              </ToggleChip>
            ))}
            {extra.map((c) => (
              <ToggleChip key={c} on onClick={() => togglePool(c)}>
                {c}
              </ToggleChip>
            ))}
            {!options.length && !extra.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Keine Autos im Maßstab {rule.scale} bekannt (Maßstab im Einstellungen-Sheet).</span>}
          </div>
        </Group>
      )}
      {rule.mode === 'fixed' && (
        <Group label="Auto je Fahrer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drivers.map((d) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 14 }}>{d}</span>
                <select className="select" value={rule.fixed[d] ?? ''} onChange={(e) => onChange({ ...rule, fixed: { ...rule.fixed, [d]: e.target.value } })} aria-label={`Auto für ${d}`}>
                  <option value="">– offen –</option>
                  {options.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {!drivers.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Erst Fahrer auswählen.</span>}
          </div>
        </Group>
      )}
    </div>
  )
}
