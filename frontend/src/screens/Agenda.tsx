import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { isSameDay, isoTime, startOfWeek, statusBadgeClass, weekDays, yyyymmdd } from '../utils';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Vue agenda hebdomadaire : réservations réparties par jour, avec navigation de semaine. */
export function Agenda() {
  const { t } = useTranslation(['rbs', 'common']);
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));

  const days = useMemo(() => weekDays(monday), [monday]);
  const sunday = days[6];
  const start = yyyymmdd(monday);
  const end = yyyymmdd(sunday);

  const bookingsQuery = useQuery({
    queryKey: ['rbs', 'agenda', start, end],
    queryFn: () => api.getBookingsInRange(start, end),
  });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });

  const resourceName = useMemo(() => {
    const m = new Map<number, string>();
    (resourcesQuery.data ?? []).forEach((r) => m.set(r.id, r.name));
    return m;
  }, [resourcesQuery.data]);

  const bookings = bookingsQuery.data ?? [];
  const shiftWeek = (weeks: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + weeks * 7);
    setMonday(d);
  };

  const weekLabel = `${monday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} – ${sunday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-16">
        <h1 className="m-0">{t('rbs.agenda.title', { defaultValue: 'Agenda' })}</h1>
        <Link to="/" className="btn btn-secondary">
          {t('rbs.back.to.resources', { defaultValue: 'Retour aux ressources' })}
        </Link>
      </div>

      <div className="d-flex align-items-center justify-content-center gap-16 mb-16">
        <button type="button" className="btn btn-link" onClick={() => shiftWeek(-1)} aria-label={t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' })}>
          ← {t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' })}
        </button>
        <strong style={{ minWidth: 220, textAlign: 'center' }}>{weekLabel}</strong>
        <button type="button" className="btn btn-link" onClick={() => shiftWeek(1)} aria-label={t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })}>
          {t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })} →
        </button>
      </div>

      {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {bookingsQuery.isError && (
        <div className="alert alert-warning" role="alert">
          {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
        {days.map((day, i) => {
          const dayBookings = bookings
            .filter((b) => isSameDay(b.start_date, day))
            .sort((a, b) => a.start_date.localeCompare(b.start_date));
          return (
            <div key={i} className="border rounded p-8" style={{ minHeight: 140, background: '#fafafa' }}>
              <div className="fw-bold mb-8" style={{ fontSize: 13 }}>
                {DAY_LABELS[i]} {day.getDate()}
              </div>
              {dayBookings.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 12 }}>—</div>
              ) : (
                dayBookings.map((b) => (
                  <div key={b.id} className="rounded p-4 mb-4" style={{ background: '#fff', border: '1px solid #e0e0e0', fontSize: 12 }}>
                    <div className="d-flex align-items-center gap-4">
                      <span className={statusBadgeClass(b.status)} style={{ width: 8, height: 8, borderRadius: '50%', padding: 0, display: 'inline-block' }} aria-hidden />
                      <strong>{isoTime(b.start_date)}–{isoTime(b.end_date)}</strong>
                    </div>
                    <div>{b.booking_reason}</div>
                    <div className="text-muted">{resourceName.get(b.resource_id) ?? `#${b.resource_id}`}</div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Agenda;
