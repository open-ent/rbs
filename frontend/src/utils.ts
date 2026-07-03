/** Fonctions pures du module RBS (testables). */

import { BOOKING_STATUS } from './api';

/** Formate une date ISO en « jj/mm/aaaa hh:mm » (locale FR). */
export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Libellé FR d'un statut de réservation. */
export function statusLabel(status: number): string {
  switch (status) {
    case BOOKING_STATUS.VALIDATED:
      return 'Validée';
    case BOOKING_STATUS.REFUSED:
      return 'Refusée';
    case BOOKING_STATUS.CREATED:
    default:
      return 'En attente';
  }
}

/** Classe bootstrap de badge selon le statut. */
export function statusBadgeClass(status: number): string {
  switch (status) {
    case BOOKING_STATUS.VALIDATED:
      return 'badge bg-success';
    case BOOKING_STATUS.REFUSED:
      return 'badge bg-danger';
    case BOOKING_STATUS.CREATED:
    default:
      return 'badge bg-warning';
  }
}

/**
 * Convertit une valeur d'`<input type="datetime-local">` (heure locale, ex.
 * « 2026-07-15T10:00 ») en timestamp Unix (secondes). Renvoie NaN si invalide.
 */
export function localInputToUnix(value: string): number {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? NaN : Math.floor(ms / 1000);
}
