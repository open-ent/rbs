import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Booking } from '../api';
import { buildRows, canAct, isPast, nextSort, Row, SortKey, sortRows, toggleAll, toggleRow } from '../bookingList';
import { isPeriodic } from '../calendar';
import { formatDateTime } from '../utils';
import { StatusIcon } from './CalendarParts';

interface Props {
  /** Réservations de la période, ressources cochées, filtres « mes réservations » / « à traiter » non appliqués. */
  bookings: Booking[];
  /** Garde une réservation (filtres de la barre) : une série est gardée si l'une de ses occurrences l'est. */
  keep: (b: Booking) => boolean;
  resourceName: (b: Booking) => string;
  colorOf: (b: Booking) => string;
  userId: string;
  /** Droits « valider » / « gérer » de l'usager sur la ressource de la réservation. */
  rightsOf: (b: Booking) => { process: boolean; manage: boolean };
  selected: Set<number>;
  onSelect: (next: Set<number>) => void;
  onOpen: (b: Booking, date?: string) => void;
}

/** Colonnes triables, dans l'ordre d'affichage : mêmes en-têtes que l'IHM AngularJS. */
const COLUMNS: Array<{ key: SortKey; label: string; defaultValue: string }> = [
  { key: 'owner_name', label: 'rbs.booking.headers.owner', defaultValue: 'Demandeur' },
  { key: 'resource', label: 'rbs.booking.headers.resource', defaultValue: 'Ressource' },
  { key: 'start_date', label: 'rbs.booking.headers.start_date', defaultValue: 'Date de début' },
  { key: 'end_date', label: 'rbs.booking.headers.end_date', defaultValue: 'Date de fin' },
  { key: 'status', label: 'rbs.booking.headers.status', defaultValue: 'État' },
];

/**
 * Vue liste des réservations (parité IHM AngularJS) : tableau triable par colonne, une barre de la couleur de la
 * ressource, série périodique dépliable (« + » / « - ») avec toutes ses occurrences, cases à cocher (une série
 * coche ses occurrences à venir ; les réservations terminées et celles sur lesquelles on n'a aucun droit ne
 * s'y prêtent pas), clic sur une ligne → détail.
 */
export function BookingListView({ bookings, keep, resourceName, colorOf, userId, rightsOf, selected, onSelect, onOpen }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const [sort, setSort] = useState<{ key: SortKey; reverse: boolean }>({ key: 'start_date', reverse: false });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Occurrences complètes des séries dépliées : la période affichée n'en contient qu'une partie.
  const [loaded, setLoaded] = useState<Map<number, Booking[]>>(new Map());

  const rows = useMemo(() => sortRows(buildRows(bookings, loaded, keep), sort.key, sort.reverse, resourceName), [bookings, loaded, keep, sort, resourceName]);

  const selectable = (row: Row) => !isPast(row.booking) && canAct(row.booking, userId, rightsOf(row.booking));
  const slotSelectable = (row: Row, slot: Booking) => !isPast(slot) && canAct(row.booking, userId, rightsOf(row.booking));
  const allOn = rows.length > 0 && rows.filter(selectable).every((r) => selected.has(r.booking.id)) && rows.some(selectable);

  const toggleExpand = (row: Row) => {
    const next = new Set(expanded);
    if (next.has(row.booking.id)) next.delete(row.booking.id);
    else next.add(row.booking.id);
    setExpanded(next);
  };

  const header = (key: SortKey, label: string, defaultValue: string) => (
    <th
      key={key}
      scope="col"
      aria-sort={sort.key === key ? (sort.reverse ? 'descending' : 'ascending') : 'none'}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap', background: '#e8f5e9' }}
      onClick={() => setSort(nextSort(sort, key))}
      data-sort={key}
    >
      {t(label, { defaultValue })} {sort.key === key ? (sort.reverse ? '▾' : '▴') : ''}
    </th>
  );

  const cells = (b: Booking, status: number, onClick: () => void) => (
    <>
      <td onClick={onClick}>{b.owner_name}</td>
      <td onClick={onClick}>{resourceName(b)}</td>
      <td onClick={onClick}>{formatDateTime(b.start_date)}</td>
      <td onClick={onClick}>{formatDateTime(b.end_date)}</td>
      <td onClick={onClick}>
        <StatusIcon status={status} />
      </td>
    </>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table table-bordered mb-0" data-booking-list>
        <thead>
          <tr>
            <th style={{ width: 36, background: '#e8f5e9' }}>
              <input
                type="checkbox"
                aria-label={t('rbs.list.selectall', { defaultValue: 'Tout sélectionner' })}
                checked={allOn}
                onChange={(e) => onSelect(toggleAll(rows, e.target.checked, selectable))}
              />
            </th>
            <th style={{ width: 10, background: '#e8f5e9' }} aria-hidden />
            <th style={{ width: 72, background: '#e8f5e9' }}>
              <span role="img" title={t('rbs.booking.headers.periodic', { defaultValue: 'Réservation périodique' })} aria-label={t('rbs.booking.headers.periodic', { defaultValue: 'Réservation périodique' })}>
                ↻
              </span>
            </th>
            {COLUMNS.map((c) => header(c.key, c.label, c.defaultValue))}
          </tr>
        </thead>
        {rows.map((row) => {
          const b = row.booking;
          const open = expanded.has(b.id);
          return (
            <tbody key={b.id} data-booking-row={b.id}>
              <tr style={{ cursor: 'pointer' }}>
                <td>
                  {selectable(row) && (
                    <input
                      type="checkbox"
                      aria-label={`${t('rbs.list.select', { defaultValue: 'Sélectionner' })} ${resourceName(b)}`}
                      checked={selected.has(b.id)}
                      onChange={(e) => onSelect(toggleRow(selected, row, e.target.checked))}
                    />
                  )}
                </td>
                <td style={{ background: colorOf(b), padding: 0 }} onClick={() => onOpen(b)} />
                <td style={{ whiteSpace: 'nowrap' }}>
                  {b.is_periodic && (
                    <button
                      type="button"
                      className="btn btn-link p-0"
                      aria-expanded={open}
                      aria-label={open ? t('rbs.list.collapse', { defaultValue: 'Replier la série' }) : t('rbs.list.expand', { defaultValue: 'Déplier la série' })}
                      onClick={() => toggleExpand(row)}
                    >
                      <span className="badge">{open ? '−' : '+'}</span>
                    </button>
                  )}{' '}
                  {isPeriodic(b) && <span aria-hidden>↻</span>}
                </td>
                {cells(b, row.status, () => onOpen(b))}
              </tr>
              {open && b.is_periodic && <SeriesSlots row={row} loaded={loaded} onLoaded={(id, list) => setLoaded(new Map(loaded).set(id, list))} selected={selected} onSelect={onSelect} slotSelectable={slotSelectable} colorOf={colorOf} cells={cells} onOpen={onOpen} />}
            </tbody>
          );
        })}
        {rows.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={8} className="text-muted text-center">
                {t('rbs.bookings.empty', { defaultValue: 'Aucune réservation - Sélectionnez des ressources ou un filtre dans le menu' })}
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

/** Occurrences d'une série dépliée : chargées en entier au premier dépliage, une case par occurrence. */
function SeriesSlots({
  row,
  loaded,
  onLoaded,
  selected,
  onSelect,
  slotSelectable,
  colorOf,
  cells,
  onOpen,
}: {
  row: Row;
  loaded: Map<number, Booking[]>;
  onLoaded: (id: number, list: Booking[]) => void;
  selected: Set<number>;
  onSelect: (next: Set<number>) => void;
  slotSelectable: (row: Row, slot: Booking) => boolean;
  colorOf: (b: Booking) => string;
  cells: (b: Booking, status: number, onClick: () => void) => JSX.Element;
  onOpen: (b: Booking, date?: string) => void;
}) {
  const { t } = useTranslation(['rbs', 'common']);
  const alreadyLoaded = loaded.has(row.booking.id);
  const query = useQuery({
    queryKey: ['rbs', 'series', row.booking.id],
    queryFn: async () => {
      const list = await api.getSeriesSlots(row.booking.id);
      onLoaded(row.booking.id, list);
      return list;
    },
    enabled: !alreadyLoaded,
    staleTime: 30_000,
  });
  const slots = loaded.get(row.booking.id) ?? row.slots;
  const toggleSlot = (slot: Booking, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(slot.id);
    else {
      next.delete(slot.id);
      next.delete(row.booking.id); // la série n'est plus cochée en entier
    }
    onSelect(next);
  };
  return (
    <>
      {query.isLoading && (
        <tr>
          <td colSpan={8} className="text-muted">
            {t('rbs.loading', { defaultValue: 'Chargement…' })}
          </td>
        </tr>
      )}
      {slots.map((slot) => (
        <tr key={slot.id} data-slot-row={slot.id} style={{ cursor: 'pointer' }}>
          <td>
            {slotSelectable(row, slot) && (
              <input type="checkbox" aria-label={t('rbs.list.select', { defaultValue: 'Sélectionner' })} checked={selected.has(slot.id)} onChange={(e) => toggleSlot(slot, e.target.checked)} />
            )}
          </td>
          <td style={{ background: colorOf(row.booking), padding: 0 }} />
          <td />
          {cells({ ...slot, owner_name: slot.owner_name ?? row.booking.owner_name, resource_id: row.booking.resource_id }, slot.status, () => onOpen(slot, slot.start_date.slice(0, 10)))}
        </tr>
      ))}
    </>
  );
}

export default BookingListView;
