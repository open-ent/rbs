import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { hourSlots, isoTime, isSameDay, localHour, startOfWeek, statusBadgeClass, weekDays, yyyymmdd } from '../utils';
import { ExportDialog } from './ExportDialog';

const DAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const SLOTS = hourSlots(7, 20);

/**
 * Planning hebdomadaire des réservations (parité IHM AngularJS) : grille créneaux horaires (lignes)
 * × jours (colonnes), pour une ressource sélectionnée, avec navigation de semaine. Vue par défaut de RBS.
 */
export function Agenda() {
  const { t } = useTranslation(['rbs', 'common']);
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const days = useMemo(() => weekDays(monday).slice(0, 5), [monday]);
  const start = yyyymmdd(monday);
  const end = yyyymmdd(weekDays(monday)[6]);

  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const bookingsQuery = useQuery({ queryKey: ['rbs', 'agenda', start, end], queryFn: () => api.getBookingsInRange(start, end) });

  const resources = resourcesQuery.data ?? [];
  // Sélection par défaut : première ressource disponible.
  useEffect(() => {
    if (resourceId == null && resources.length > 0) setResourceId(resources[0].id);
  }, [resources, resourceId]);

  const bookings = (bookingsQuery.data ?? []).filter((b) => resourceId == null || b.resource_id === resourceId);

  const shiftWeek = (weeks: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + weeks * 7);
    setMonday(d);
  };

  const sunday = weekDays(monday)[6];
  const weekLabel = `${monday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} – ${sunday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  /** Réservations de la ressource couvrant (jour, heure). */
  const cellBookings = (day: Date, hour: number) =>
    bookings.filter((b) => isSameDay(b.start_date, day) && localHour(b.start_date) <= hour && hour < Math.max(localHour(b.end_date), localHour(b.start_date) + 1));

  return (
    <div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      <div className="d-flex align-items-center justify-content-between mb-16 flex-wrap gap-8">
        <h1 className="m-0">{t('rbs.agenda.title', { defaultValue: 'Réservation de ressources' })}</h1>
        <div className="d-flex gap-8">
          <Link to="/resources" className="btn btn-primary">{t('rbs.new.booking', { defaultValue: 'Nouvelle réservation' })}</Link>
          <Link to="/resources" className="btn btn-secondary">{t('rbs.manage.resources', { defaultValue: 'Gérer les ressources' })}</Link>
          <button type="button" className="btn btn-secondary" onClick={() => setExporting(true)}>
            {t('rbs.export.title', { defaultValue: 'Exporter' })}
          </button>
          <Link to="/moderation" className="btn btn-secondary">{t('rbs.moderation.title', { defaultValue: 'Modération des réservations' })}</Link>
        </div>
      </div>

      {/* Barre : sélection de ressource + navigation de semaine */}
      <div className="d-flex align-items-center justify-content-between mb-12 flex-wrap gap-8">
        <div style={{ minWidth: 240 }}>
          <select className="form-select" aria-label={t('rbs.agenda.resource', { defaultValue: 'Ressource' })} value={resourceId ?? ''} onChange={(e) => setResourceId(e.target.value ? Number(e.target.value) : null)}>
            {resources.length === 0 && <option value="">{t('rbs.agenda.noresource', { defaultValue: 'Aucune ressource' })}</option>}
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="d-flex align-items-center gap-12">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shiftWeek(-1)} aria-label={t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' })}>←</button>
          <strong style={{ minWidth: 180, textAlign: 'center' }}>{weekLabel}</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => shiftWeek(1)} aria-label={t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })}>→</button>
        </div>
      </div>

      {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {bookingsQuery.isError && <div className="alert alert-warning" role="alert">{t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}</div>}

      {/* Grille planning : créneaux (lignes) × jours (colonnes) */}
      <div style={{ overflowX: 'auto' }}>
        <table className="table table-bordered mb-0" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 110 }} />
              {days.map((d, i) => (
                <th key={i} className="text-center" style={{ background: '#e8f5e9' }}>
                  {DAY_LABELS[i]}<br /><span className="text-muted" style={{ fontWeight: 400 }}>{d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot.from}>
                <td className="text-center text-muted" style={{ background: '#e8f5e9', fontSize: 12, whiteSpace: 'nowrap' }}>{slot.label}</td>
                {days.map((day, di) => {
                  const cell = cellBookings(day, slot.from);
                  return (
                    <td key={di} style={{ height: 44, verticalAlign: 'top', padding: 2 }}>
                      {cell.map((b) => (
                        <div key={b.id} className="rounded px-4 py-2 mb-2" style={{ background: '#fff', border: '1px solid #cfe3d0', fontSize: 11 }} title={b.booking_reason}>
                          <span className={statusBadgeClass(b.status)} style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, display: 'inline-block', marginRight: 4 }} aria-hidden />
                          <strong>{isoTime(b.start_date)}</strong> {b.booking_reason}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Agenda;
