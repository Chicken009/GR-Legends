import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventFolder } from '../../data/events'
import { driverInsight, eventVisible, todayIso } from '../../domain/event/insights'
import { PageHead, useData } from '../components'
import { useMe } from '../me'
import { StrokeIcon, TOOL_ICONS } from '../icons'
import { CarThumb } from '../CarPhoto'
import { computeFor, dateRange, EVENT_ACCENT, fmtPts, PhasePill, phaseOf } from '../event/shared'

/** Liste der Wettkämpfe (Seite und Reiter „Wettkämpfe“ der Saison) */
export function EventList() {
  const data = useData()
  const { me } = useMe()
  const [showHidden, setShowHidden] = useState(false)
  const today = todayIso()
  const visible = data.events.filter((e) => eventVisible(e.def, today))
  const hidden = data.events.filter((e) => !eventVisible(e.def, today))
  return (
    <>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {data.events.length ? `${visible.length} ${visible.length === 1 ? 'Wettkampf' : 'Wettkämpfe'}` : 'Noch keine Wettkämpfe'}
      </span>
      {!data.events.length && (
        <section className="inner" style={{ padding: 14, gap: 6 }}>
          <span className="card-title">So funktioniert’s</span>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            Wettkampf mit dem Plus oben anlegen (Rennleitung) und <b>wettkampf.json</b> herunterladen. Im Drive-Ordner der Strecke einen Unterordner mit dem Namen des Wettkampfs anlegen, die Datei hineinlegen – und die Smartrace-Exporte des Abends ebenfalls dort speichern. Die App ordnet jede
            Datei dem passenden Lauf zu.
          </p>
        </section>
      )}
      {visible.map((e) => (
        <EventCard key={e.id} folder={e} me={me} />
      ))}
      {hidden.length > 0 && (
        <button className="btn ghost" onClick={() => setShowHidden(!showHidden)} style={{ alignSelf: 'flex-start' }}>
          {showHidden ? 'Noch nicht angekündigte ausblenden' : `Noch nicht angekündigt (${hidden.length})`}
        </button>
      )}
      {showHidden && hidden.map((e) => <EventCard key={e.id} folder={e} me={me} />)}
    </>
  )
}

export function EventCard({ folder, me }: { folder: EventFolder; me: string | null }) {
  const data = useData()
  const state = useMemo(() => computeFor(data, folder.def, folder.id), [data, folder])
  const phase = phaseOf(folder.def, state)
  const mine = me && state.drivers.includes(me) ? driverInsight(state, me) : null
  const leader = state.standings[0]
  const takesPart = !!me && state.drivers.includes(me)
  const rule = folder.def.cars
  const cars = rule.mode === 'fixed' ? [...new Set(Object.values(rule.fixed))] : rule.mode === 'free' ? [] : rule.pool
  return (
    <Link to={`/wettkampf/${folder.id}`} className={`card${takesPart ? ' me-row' : ''}`} style={{ gap: 8 }}>
      <div className="card-head">
        <span className="kicker" style={{ color: EVENT_ACCENT }}>
          Wettkampf · {dateRange(folder.def)}
        </span>
        <PhasePill phase={phase} />
      </div>
      <span style={{ fontSize: 20, fontWeight: 800 }}>{folder.def.name}</span>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {takesPart && <b style={{ color: 'var(--me)' }}>Du bist dabei · </b>}
        {folder.tracks.join(', ')} · {state.drivers.length} Fahrer{state.teams.length ? ` · ${state.teams.length} Teams` : ''}
        {state.started && leader ? ` · ${phase === 'done' ? 'Sieger' : 'vorne'}: ${leader.name} (${fmtPts(leader.total)})` : ''}
      </span>
      {mine?.standing && state.started && (
        <span style={{ fontSize: 13, color: 'var(--me)', fontWeight: 600 }}>
          Du: Platz {mine.standing.rank} · {fmtPts(mine.standing.total)} Punkte
          {mine.nextHeat ? ` · als Nächstes ${mine.nextHeat.label}` : ''}
        </span>
      )}
      {cars.length > 0 && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label={`Autos: ${cars.join(', ')}`}>
          {cars.slice(0, 8).map((c) => (
            <CarThumb key={c} car={c} size={30} />
          ))}
          {cars.length > 8 && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>+{cars.length - 8}</span>}
        </span>
      )}
      {folder.problem && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{folder.problem}</span>}
    </Link>
  )
}

export function Events() {
  return (
    <div className="page" style={{ ['--accent' as string]: EVENT_ACCENT }}>
      <PageHead title="Events" kicker="Wettkämpfe" color={EVENT_ACCENT}>
        <Link to="/wettkampf/neu" className="icon-btn" aria-label="Neuer Wettkampf (Rennleitung)" title="Neuer Wettkampf (Rennleitung)">
          <StrokeIcon d={TOOL_ICONS.plus} size={20} color="var(--muted)" />
        </Link>
      </PageHead>
      <EventList />
    </div>
  )
}
