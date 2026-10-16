import { useNavigate } from 'react-router-dom'
import { Segment } from './components'

/** Umschalter in der Gruppe „Fahrer“: Fahrer-Rangliste und Fahrzeuge */
export function FieldSwitch({ value }: { value: 'fahrer' | 'autos' }) {
  const navigate = useNavigate()
  return (
    <Segment
      label="Fahrer oder Autos"
      value={value}
      onChange={(v) => navigate(v === 'autos' ? '/autos' : '/fahrer', { replace: true })}
      options={[
        ['fahrer', 'Fahrer'],
        ['autos', 'Autos'],
      ]}
    />
  )
}
