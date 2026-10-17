// Actions sur les réservations (suppression, validation, refus) et traitement automatique des conflits, comme l'IHM
// AngularJS (controller.ts : removeBookingSelection, treatBookings, syncBookingsUsingResource ; models.ts).
// Logique pure, sans React : testée dans bookingActions.test.ts.

import type { Availability, Booking } from './api';
import { quantityBalanceAt, ResourceQuantity } from './bookingForm';
import { isSeriesParent } from './calendar';
import { parseBackendDate } from './utils';

/** Statuts du serveur. */
export const STATUS = { CREATED: 1, VALIDATED: 2, REFUSED: 3, SUSPENDED: 4 } as const;

const startOf = (b: Booking) => parseBackendDate(b.start_date);
const endOf = (b: Booking) => parseBackendDate(b.end_date);

/** Une réservation terminée ne se modifie ni ne se supprime plus. */
export const isOver = (b: Booking, now = new Date()): boolean => endOf(b) <= now;

// ── Suppression ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface DeletionPlan {
  /** Réservations simples et mères de série : leur suppression emporte toute la série. */
  wholes: Booking[];
  /** Occurrences isolées (leur mère n'est pas sélectionnée) : supprimées une à une. */
  occurrences: Booking[];
}

/**
 * Ce qu'une sélection supprime : une mère de série (ou une réservation simple) part avec toutes ses occurrences, les
 * occurrences cochées sans leur mère partent seules. Les réservations terminées sont écartées.
 * Ex. sélection {série 1, ses occurrences 2 et 3, occurrence 9 d'une autre série} → wholes [1], occurrences [9].
 */
export function planDeletion(selected: Set<number>, pool: Booking[], now = new Date()): DeletionPlan {
  const picked = pool.filter((b) => selected.has(b.id) && !isOver(b, now));
  const wholeIds = new Set(picked.filter((b) => b.parent_booking_id == null).map((b) => b.id));
  return {
    wholes: picked.filter((b) => b.parent_booking_id == null),
    occurrences: picked.filter((b) => b.parent_booking_id != null && !wholeIds.has(b.parent_booking_id)),
  };
}

/** Dernier identifiant à supprimer d'une occurrence « et les suivantes » : l'occurrence visée suffit, le serveur fait le reste. */
export const deleteTargets = (plan: DeletionPlan): Booking[] => [...plan.wholes, ...plan.occurrences];

// ── Validation / refus ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Réservations que « valider » ou « refuser » traite : les demandes en attente (jamais une mère de série, qui n'a pas
 * d'état propre), à venir. Une série se traite par ses occurrences.
 */
export function processable(selected: Set<number>, pool: Booking[], now = new Date()): Booking[] {
  return pool.filter((b) => selected.has(b.id) && !isSeriesParent(b) && b.status === STATUS.CREATED && !isOver(b, now));
}

/** Les boutons Valider / Refuser n'ont de sens que si TOUTE la sélection est en attente. */
export const canProcessSelection = (selected: Set<number>, pool: Booking[], now = new Date()): boolean => {
  const chosen = pool.filter((b) => selected.has(b.id) && !isSeriesParent(b));
  return chosen.length > 0 && chosen.every((b) => b.status === STATUS.CREATED && !isOver(b, now));
};

/**
 * Modifier : la sélection doit désigner UNE seule réservation — ou une seule série, dont on modifie la mère, que l'on ait
 * coché la mère ou une ou plusieurs de ses occurrences — sur une ressource disponible.
 */
export function editTarget(selected: Set<number>, pool: Booking[], resourceAvailable: (b: Booking) => boolean): Booking | null {
  const chosen = pool.filter((b) => selected.has(b.id));
  const roots = new Set(chosen.map((b) => b.parent_booking_id ?? b.id));
  if (roots.size !== 1) return null;
  const rootId = [...roots][0];
  const root = pool.find((b) => b.id === rootId);
  return root && resourceAvailable(root) ? root : null;
}

// ── Traitement automatique après un changement de capacité ──────────────────────────────────────────────────────

export interface TreatmentPlan {
  /** À suspendre : en conflit (ou de la même série qu'une réservation en conflit). */
  suspend: Booking[];
  /** À re-soumettre (ou valider si la ressource n'a pas de modération) : suspendues qui ne sont plus en conflit. */
  resubmit: Booking[];
}

/**
 * Après qu'une réservation est supprimée ou que la capacité d'une ressource change, met à jour l'état des réservations
 * à venir de cette ressource, comme l'AngularJS (`treatBookings`) :
 *  - en attente ou validée mais la ressource n'y suffit plus (solde négatif) → suspendue, avec le reste de sa série ;
 *  - suspendue mais le solde est redevenu positif → re-soumise, à condition que toute sa série le soit aussi.
 * `exceptId` : réservation en train d'être supprimée (déjà absente du serveur ou à ignorer).
 */
export function planTreatment(bookings: Booking[], resource: ResourceQuantity, rules: Availability[], exceptId?: number, now = new Date()): TreatmentPlan {
  const candidates = bookings.filter((b) => !b.is_periodic && !!b.quantity && startOf(b) > now && b.id !== exceptId);
  const balance = new Map(candidates.map((b) => [b.id, quantityBalanceAt(b, resource, rules, bookings, exceptId, now)]));
  const conflicting = candidates.filter((b) => (balance.get(b.id) as number) < 0 && (b.status === STATUS.CREATED || b.status === STATUS.VALIDATED));
  const okSuspended = candidates.filter((b) => (balance.get(b.id) as number) >= 0 && b.status === STATUS.SUSPENDED);
  const siblingsOf = (b: Booking) => (b.parent_booking_id == null ? [] : candidates.filter((x) => x.parent_booking_id === b.parent_booking_id && x.id !== b.id));
  const uniq = (list: Booking[]) => [...new Map(list.map((b) => [b.id, b])).values()];

  const suspend = uniq([...conflicting, ...conflicting.flatMap(siblingsOf)]);
  const resubmit: Booking[] = [];
  okSuspended.forEach((b) => {
    const siblings = siblingsOf(b);
    if (siblings.every((s) => (balance.get(s.id) as number) >= 0)) resubmit.push(b, ...siblings);
  });
  return { suspend, resubmit: uniq(resubmit).filter((b) => !suspend.some((s) => s.id === b.id)) };
}
