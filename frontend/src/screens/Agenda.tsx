import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api, Booking } from '../api';
import { hourSlots, isoTime, isSameDay, localHour, startOfWeek, statusBadgeClass, weekDays, yyyymmdd } from '../utils';
import { ExportDialog } from './ExportDialog';

const DAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const SLOTS = hourSlots(7, 20);

type View = 'day' | 'week' | 'month';

/**
 * Planning des réservations (parité IHM AngularJS) : vues Jour / Semaine / Mois, sélection
 * multiple de ressources groupées par type (panneau latéral), navigation temporelle.
 * Vue par défaut de RBS.
 */
export function Agenda() {
  const { t } = useTranslation(['rbs', 'common']);
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [checked, setChecked] = useState<Set<number> | null>(null); // null = tout coché (défaut)
  const [exporting, setExporting] = useState(false);

  const monday = useMemo(() => startOfWeek(cursor), [cursor]);
  const days = useMemo(() => weekDays(monday).slice(0, 5), [monday]);

  // Bornes de chargement selon la vue (mois = 1er → dernier jour).
  const { start, end } = useMemo(() => {
    if (view === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return { start: yyyymmdd(first), end: yyyymmdd(last) };
    }
    if (view === 'day') return { start: yyyymmdd(cursor), end: yyyymmdd(cursor) };
    return { start: yyyymmdd(monday), end: yyyymmdd(weekDays(monday)[6]) };
  }, [view, cursor, monday]);

  const typesQuery = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const bookingsQuery = useQuery({ queryKey: ['rbs', 'agenda', start, end], queryFn: () => api.getBookingsInRange(start, end) });

  const types = typesQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];

  // Toutes les ressources cochées par défaut dès leur chargement.
  useEffect(() => {
    if (checked == null && resources.length > 0) setChecked(new Set(resources.map((r) => r.id)));
  }, [resources, checked]);

  const isChecked = (id: number) => checked == null || checked.has(id);
  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev ?? resources.map((r) => r.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bookings = (bookingsQuery.data ?? []).filter((b) => isChecked(b.resource_id));

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const sunday = weekDays(monday)[6];
  const periodLabel =
    view === 'day'
      ? cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : view === 'month'
        ? cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : `${monday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} – ${sunday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  const shiftLabels: Record<View, [string, string]> = {
    day: [t('rbs.agenda.prevday', { defaultValue: 'Jour précédent' }), t('rbs.agenda.nextday', { defaultValue: 'Jour suivant' })],
    week: [t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' }), t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })],
    month: [t('rbs.agenda.prevmonth', { defaultValue: 'Mois précédent' }), t('rbs.agenda.nextmonth', { defaultValue: 'Mois suivant' })],
  };

  /** Réservations (ressources cochées) couvrant (jour, heure). */
  const cellBookings = (day: Date, hour: number) =>
    bookings.filter((b) => isSameDay(b.start_date, day) && localHour(b.start_date) <= hour && hour < Math.max(localHour(b.end_date), localHour(b.start_date) + 1));

  const resourceName = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);

  const BookingChip = ({ b }: { b: Booking }) => (
    <div className="rounded px-4 py-2 mb-2" style={{ background: '#fff', border: '1px solid #cfe3d0', fontSize: 11 }} title={`${resourceName.get(b.resource_id) ?? ''} — ${b.booking_reason}`}>
      <span className={statusBadgeClass(b.status)} style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, display: 'inline-block', marginRight: 4 }} aria-hidden />
      <strong>{isoTime(b.start_date)}</strong> {b.booking_reason}
    </div>
  );

  /** Grille créneaux × jours (vues jour et semaine). */
  const grid = (cols: Date[], labels: string[]) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="table table-bordered mb-0" style={{ minWidth: cols.length > 1 ? 760 : 420 }}>
        <thead>
          <tr>
            <th style={{ width: 110 }} />
            {cols.map((d, i) => (
              <th key={i} className="text-center" style={{ background: '#e8f5e9' }}>
                {labels[i]}<br /><span className="text-muted" style={{ fontWeight: 400 }}>{d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((slot) => (
            <tr key={slot.from}>
              <td className="text-center text-muted" style={{ background: '#e8f5e9', fontSize: 12, whiteSpace: 'nowrap' }}>{slot.label}</td>
              {cols.map((day, di) => (
                <td key={di} style={{ height: 44, verticalAlign: 'top', padding: 2 }}>
                  {cellBookings(day, slot.from).map((b) => <BookingChip key={b.id} b={b} />)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /** Vue mois : semaines (lignes) × jours (colonnes), réservations listées par jour. */
  const monthView = () => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const firstMonday = startOfWeek(first);
    const weeks: Date[][] = [];
    for (let w = 0; ; w++) {
      const mondayW = new Date(firstMonday);
      mondayW.setDate(firstMonday.getDate() + w * 7);
      if (mondayW.getMonth() > cursor.getMonth() && mondayW.getFullYear() >= cursor.getFullYear() && w > 0) break;
      if (weeks.length > 5) break;
      weeks.push(weekDays(mondayW).slice(0, 5));
    }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="table table-bordered mb-0" style={{ minWidth: 760, tableLayout: 'fixed' }}>
          <thead>
            <tr>{DAY_LABELS.map((l) => <th key={l} className="text-center" style={{ background: '#e8f5e9', textTransform: 'capitalize' }}>{l}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  const inMonth = day.getMonth() === cursor.getMonth();
                  const dayBookings = bookings.filter((b) => isSameDay(b.start_date, day));
                  return (
                    <td key={di} style={{ height: 90, verticalAlign: 'top', padding: 4, background: inMonth ? undefined : '#f6f6f6' }}>
                      <div className="text-muted" style={{ fontSize: 11 }}>{day.getDate()}</div>
                      {dayBookings.map((b) => <BookingChip key={b.id} b={b} />)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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

      <div className="d-flex gap-16" style={{ alignItems: 'flex-start' }}>
        {/* Panneau latéral : ressources groupées par type, sélection multiple (parité Angular) */}
        <aside style={{ minWidth: 210 }}>
          <strong>{t('rbs.agenda.resources', { defaultValue: 'Ressources' })}</strong>
          {types.map((ty) => {
            const ofType = resources.filter((r) => r.type_id === ty.id);
            if (ofType.length === 0) return null;
            return (
              <div key={ty.id} className="mt-8">
                <div className="text-muted" style={{ fontSize: 13 }}>{ty.name}</div>
                <ul className="list-unstyled mb-0">
                  {ofType.map((r) => (
                    <li key={r.id} className="py-2">
                      <label className="d-flex align-items-center gap-8 m-0" style={{ cursor: 'pointer', fontSize: 14 }}>
                        <input type="checkbox" checked={isChecked(r.id)} onChange={() => toggle(r.id)} aria-label={r.name} />
                        {r.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {resources.length === 0 && <p className="text-muted mt-8" style={{ fontSize: 13 }}>{t('rbs.agenda.noresource', { defaultValue: 'Aucune ressource' })}</p>}
        </aside>

        <div className="flex-grow-1">
          {/* Barre : vue + navigation */}
          <div className="d-flex align-items-center justify-content-between mb-12 flex-wrap gap-8">
            <div className="btn-group" role="group" aria-label={t('rbs.agenda.views', { defaultValue: 'Vues' })}>
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button key={v} type="button" className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === 'day' ? t('rbs.view.day', { defaultValue: 'Jour' }) : v === 'week' ? t('rbs.view.week', { defaultValue: 'Semaine' }) : t('rbs.view.month', { defaultValue: 'Mois' })}
                </button>
              ))}
            </div>
            <div className="d-flex align-items-center gap-12">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)} aria-label={shiftLabels[view][0]}>←</button>
              <strong style={{ minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>{periodLabel}</strong>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(1)} aria-label={shiftLabels[view][1]}>→</button>
            </div>
          </div>

          {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
          {bookingsQuery.isError && <div className="alert alert-warning" role="alert">{t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}</div>}

          {view === 'day' && grid([cursor], [cursor.toLocaleDateString('fr-FR', { weekday: 'long' })])}
          {view === 'week' && grid(days, DAY_LABELS)}
          {view === 'month' && monthView()}
        </div>
      </div>
    </div>
  );
}

export default Agenda;
