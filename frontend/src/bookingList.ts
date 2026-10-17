// Logique pure de la vue liste des réservations, comme l'IHM AngularJS (models.ts#parseBookingsAndSlots,
// controller.ts : tri, sélection). Aucune dépendance à React : testée dans bookingList.test.ts.

import type { Booking } from './api';
import { isSeriesParent } from './calendar';
import { parseBackendDate } from './utils';

/** Une ligne de la liste : une réservation, ou une série (mère) avec ses occurrences. */
export interface Row {
  booking: Booking;
  /** Occurrences connues de la série (vide pour une réservation simple). */
  slots: Booking[];
  /** Statut affiché : pour une série, dérivé de ses occurrences. */
  status: number;
}

/**
 * Statut d'une série d'après ses occurrences, comme l'AngularJS : toutes dans le même état (validées, refusées,
 * en attente, suspendues) → cet état ; sinon « partielle » (9). Sans occurrence connue, le statut de la mère.
 * Ex. 3 occurrences validées et 1 en attente → 9.
 */
export function seriesStatus(parent: Booking, slots: Booking[]): number {
  if (slots.length === 0) return parent.status;
  const first = slots[0].status;
  if ([1, 2, 3, 4].includes(first) && slots.every((s) => s.status === first)) return first;
  return 9;
}

/**
 * Lignes de la liste : réservations simples et mères de série (les occurrences vont sous leur mère, jamais seules).
 * `extraSlots` apporte les occurrences chargées à l'ouverture d'une série (toutes, pas seulement celles de la
 * période) ; elles remplacent celles de la période. `keep` filtre les lignes : une série est gardée si elle ou
 * l'une de ses occurrences passe le filtre.
 * Une occurrence dont la mère est absente (non accessible) reste affichée seule plutôt que de disparaître.
 */
export function buildRows(bookings: Booking[], extraSlots: Map<number, Booking[]> = new Map(), keep: (b: Booking) => boolean = () => true): Row[] {
  const byParent = new Map<number, Booking[]>();
  const parents = new Set(bookings.filter(isSeriesParent).map((b) => b.id));
  const rows: Row[] = [];
  bookings.forEach((b) => {
    if (b.parent_booking_id != null && parents.has(b.parent_booking_id)) {
      byParent.set(b.parent_booking_id, [...(byParent.get(b.parent_booking_id) ?? []), b]);
    }
  });
  bookings.forEach((b) => {
    if (isSeriesParent(b)) {
      const slots = extraSlots.get(b.id) ?? byParent.get(b.id) ?? [];
      if (keep(b) || slots.some(keep)) rows.push({ booking: b, slots, status: seriesStatus(b, slots) });
    } else if (b.parent_booking_id == null || !parents.has(b.parent_booking_id)) {
      if (keep(b)) rows.push({ booking: b, slots: [], status: b.status });
    }
  });
  return rows;
}

export type SortKey = 'is_periodic' | 'owner_name' | 'resource' | 'start_date' | 'end_date' | 'status';

/** Tri stable d'une liste par colonne ; `reverse` inverse. Texte comparé sans tenir compte de la casse ni des accents. */
export function sortRows(rows: Row[], key: SortKey, reverse: boolean, resourceName: (b: Booking) => string): Row[] {
  const value = (r: Row): string | number => {
    switch (key) {
      case 'is_periodic':
        return r.booking.is_periodic ? 1 : 0;
      case 'owner_name':
        return r.booking.owner_name ?? '';
      case 'resource':
        return resourceName(r.booking);
      case 'start_date':
        return parseBackendDate(r.booking.start_date).getTime();
      case 'end_date':
        return parseBackendDate(r.booking.end_date).getTime();
      case 'status':
        return r.status;
    }
  };
  const sign = reverse ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const x = value(a.row);
      const y = value(b.row);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
      return c * sign || a.i - b.i;
    })
    .map((x) => x.row);
}

/** Prochain état de tri quand on clique une colonne : même colonne → on inverse, autre colonne → croissant. */
export function nextSort(current: { key: SortKey; reverse: boolean }, key: SortKey): { key: SortKey; reverse: boolean } {
  return current.key === key ? { key, reverse: !current.reverse } : { key, reverse: false };
}

/** Réservation terminée : on ne la sélectionne plus (même règle que l'AngularJS, `isPast`). */
export const isPast = (booking: Booking, now = new Date()): boolean => parseBackendDate(booking.end_date) <= now;

/** Peut-on agir sur cette réservation ? Son auteur toujours ; sinon qui valide ou gère sa ressource. */
export const canAct = (booking: Booking, userId: string, rights: { process: boolean; manage: boolean }): boolean =>
  booking.owner === userId || rights.process || rights.manage;

/**
 * Sélection après un clic sur la case d'une ligne : cocher une série coche toutes ses occurrences, la décocher les
 * décoche (comme l'AngularJS). Les occurrences passées ne sont pas sélectionnables.
 */
export function toggleRow(selected: Set<number>, row: Row, on: boolean, now = new Date()): Set<number> {
  const next = new Set(selected);
  const apply = (b: Booking) => (on && !isPast(b, now) ? next.add(b.id) : next.delete(b.id));
  apply(row.booking);
  row.slots.forEach(apply);
  return next;
}

/** Tout cocher / tout décocher : seules les lignes sélectionnables comptent (`selectable`). */
export function toggleAll(rows: Row[], on: boolean, selectable: (row: Row) => boolean, now = new Date()): Set<number> {
  let next = new Set<number>();
  if (on) rows.filter(selectable).forEach((row) => (next = toggleRow(next, row, true, now)));
  return next;
}
