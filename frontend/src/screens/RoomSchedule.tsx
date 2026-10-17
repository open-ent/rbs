import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Booking, EdtCourse } from '../api';
import { dateLocale } from '../locale';
import { ScheduleMode, scheduleRange, shiftWeek, toSlots, weekStartOf } from '../roomSchedule';

const pad = (n: number) => String(n).padStart(2, '0');
const dayValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Disponibilité d'une ressource (onglet accessible à tous), parité IHM AngularJS : choisir un type puis une ressource (ou
 * « toutes les ressources de ce type »), et voir sur la semaine — ou la journée choisie — les créneaux déjà occupés par
 * l'Emploi du temps et par les réservations, avant de faire une demande. Navigation de semaine en semaine.
 */
export function RoomSchedule() {
  const { t } = useTranslation(['rbs', 'common']);
  const locale = dateLocale();
  const types = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resources = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });

  const [typeId, setTypeId] = useState(0);
  const [resourceChoice, setResourceChoice] = useState<'ALL' | number>('ALL');
  const [mode, setMode] = useState<ScheduleMode>('week');
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [picked, setPicked] = useState(() => new Date());

  const typeById = useMemo(() => new Map((types.data ?? []).map((x) => [x.id, x])), [types.data]);
  /** Types qui ont au moins une ressource, par nom. */
  const listedTypes = useMemo(() => {
    const ids = new Set((resources.data ?? []).map((r) => r.type_id));
    return (types.data ?? []).filter((x) => ids.has(x.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [types.data, resources.data]);
  const ofType = useMemo(() => (resources.data ?? []).filter((r) => r.type_id === typeId).sort((a, b) => a.name.localeCompare(b.name)), [resources.data, typeId]);
  const targets = resourceChoice === 'ALL' ? ofType : ofType.filter((r) => r.id === resourceChoice);
  const range = scheduleRange(mode, weekStart, picked);

  const labels = { edt: t('rbs.roomSchedule.source.edt', { defaultValue: 'Emploi du temps' }), rbs: t('rbs.roomSchedule.source.rbs', { defaultValue: 'Réservation' }) };
  const slotsQuery = useQuery({
    queryKey: ['rbs', 'room-schedule', typeId, resourceChoice, range.from, range.to],
    enabled: !!typeId && targets.length > 0,
    queryFn: async () => {
      const perResource = await Promise.all(
        targets.map(async (r) => {
          const school = typeById.get(r.type_id)?.school_id ?? '';
          const [courses, bookings] = await Promise.all([
            school ? api.getRoomConflicts(school, range.from, range.to, r.name).catch((): EdtCourse[] => []) : Promise.resolve([] as EdtCourse[]),
            api.getResourceBookingsBetween(r.id, range.from, range.to).catch((): Booking[] => []),
          ]);
          return toSlots(r.name, courses, bookings, labels);
        }),
      );
      return perResource.flat().sort((a, b) => a.start.getTime() - b.start.getTime());
    },
  });
  const slots = slotsQuery.data ?? [];

  const goWeek = (n: number) => {
    const next = shiftWeek(weekStart, n);
    setMode('week');
    setWeekStart(next);
    setPicked(next);
  };
  const empty =
    resourceChoice === 'ALL'
      ? mode === 'week' ? t('rbs.roomSchedule.empty.all', { defaultValue: 'Aucun créneau occupé cette semaine pour les ressources de ce type.' }) : t('rbs.roomSchedule.empty.all.day', { defaultValue: 'Aucun créneau occupé ce jour pour les ressources de ce type.' })
      : mode === 'week' ? t('rbs.roomSchedule.empty', { defaultValue: 'Aucun créneau occupé cette semaine pour cette ressource.' }) : t('rbs.roomSchedule.empty.day', { defaultValue: 'Aucun créneau occupé ce jour pour cette ressource.' });

  return (
    <div data-room-schedule>
      <h2>{t('rbs.roomSchedule.title', { defaultValue: "Disponibilité d'une ressource" })}</h2>
      <p style={{ fontStyle: 'italic', color: '#767676' }}>{t('rbs.roomSchedule.help', { defaultValue: 'Consultez les créneaux déjà occupés (emploi du temps et réservations) avant de faire une demande.' })}</p>
      <div className="d-flex gap-12 mb-12 flex-wrap">
        <label htmlFor="rbs-rs-type" style={{ minWidth: 200 }} className="mb-0">
          {t('rbs.roomSchedule.pick.type', { defaultValue: 'Choisir un type de ressource' })}
        </label>
        <select
          id="rbs-rs-type"
          className="form-select"
          style={{ maxWidth: 420 }}
          value={typeId}
          onChange={(e) => {
            setTypeId(Number(e.target.value));
            setResourceChoice('ALL');
          }}
        >
          <option value={0} disabled>
            {t('rbs.roomSchedule.pick.resource.placeholder', { defaultValue: '-- Sélectionner --' })}
          </option>
          {listedTypes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {typeId > 0 && (
        <div className="d-flex gap-12 mb-12 flex-wrap">
          <label htmlFor="rbs-rs-resource" style={{ minWidth: 200 }} className="mb-0">
            {t('rbs.roomSchedule.pick.resource', { defaultValue: 'Choisir une ressource' })}
          </label>
          <select id="rbs-rs-resource" className="form-select" style={{ maxWidth: 420 }} value={resourceChoice} onChange={(e) => setResourceChoice(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
            <option value="ALL">{t('rbs.roomSchedule.pick.resource.all', { defaultValue: 'Toutes les ressources de ce type' })}</option>
            {ofType.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {typeId > 0 && (
        <div className="d-flex align-items-center gap-12 mb-12 flex-wrap">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => goWeek(-1)}>
            {t('rbs.roomSchedule.week.previous', { defaultValue: 'Semaine précédente' })}
          </button>
          <strong data-schedule-label>{mode === 'week' ? weekStart.toLocaleDateString(locale) : picked.toLocaleDateString(locale)}</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => goWeek(1)}>
            {t('rbs.roomSchedule.week.next', { defaultValue: 'Semaine suivante' })}
          </button>
          <label className="d-flex align-items-center gap-8 ms-16">
            {t('rbs.roomSchedule.pick.date', { defaultValue: 'Aller à une date' })}
            <input
              type="date"
              value={dayValue(picked)}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split('-').map(Number);
                setPicked(new Date(y, m - 1, d));
                setMode('day');
              }}
            />
          </label>
        </div>
      )}
      {typeId > 0 && !slotsQuery.isLoading && slots.length === 0 && <p className="text-muted">{empty}</p>}
      {slots.length > 0 && (
        <table className="table table-sm" data-schedule-table>
          <tbody>
            {slots.map((s, i) => (
              <tr key={i} data-source={s.source} style={{ background: s.source === 'edt' ? '#fff8e1' : '#e8f5e9' }}>
                {resourceChoice === 'ALL' && <td>{s.resourceName}</td>}
                <td style={{ textTransform: 'capitalize' }}>{s.start.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' })}</td>
                <td>
                  {hhmm(s.start)} - {hhmm(s.end)}
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default RoomSchedule;
