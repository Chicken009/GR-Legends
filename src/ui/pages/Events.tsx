import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventFolder } from '../../data/events'
import { driverInsight, eventVisible, todayIso } from '../../domain/event/insights'
import { PageHead, useData } from '../components'
import { useMe } from '../me'
import { StrokeIcon, TOOL_ICONS } from '../icons'
import { CarThumb } from '../CarPhoto'
import { computeFor, dateRange, EVENT_ACCENT, finishedOf, PhasePill, phaseOf, Pts, teamColor } from '../event/shared'

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
      <span style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 6px' }}>
        {folder.tracks.join(', ')} · {state.drivers.length} Fahrer
        {state.teams.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 4 }} aria-label={`${state.teams.length} Teams`}>
            {state.teams.map((t) => (
              <span key={t.id} style={{ width: 8, height: 8, borderRadius: '50%', background: teamColor(t.id, t.name) }} />
            ))}
          </span>
        )}
      </span>
      {state.started && leader ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', fontSize: 13, color: 'var(--text-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>
              {finishedOf(folder.def, state) ? 'Sieger' : 'Vorn'}: <b style={{ color: leader.name === me ? 'var(--me)' : 'var(--text)' }}>{leader.name === me ? 'Du' : leader.name}</b>
            </span>
            <Pts value={leader.total} size={13} />
          </span>
          {mine?.standing && leader.name !== me && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>
                <b style={{ color: 'var(--me)' }}>Du</b>: Platz {mine.standing.rank}
              </span>
              <Pts value={mine.standing.total} size={13} />
            </span>
          )}
        </span>
      ) : (
        takesPart && (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--me)' }}>Du</b> bist dabei
          </span>
        )
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
