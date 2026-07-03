/** Fonctions pures du module RBS (testables). */

import { BOOKING_STATUS } from './api';

/** Formate une date backend en « jj/mm/aaaa hh:mm » (heure locale FR). */
export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = parseBackendDate(iso);
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

/** Convertit une valeur d'`<input type="date">` (« 2026-09-01 ») en timestamp Unix (secondes). */
export function dateInputToUnix(value: string): number {
  if (!value) return NaN;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? NaN : Math.floor(ms / 1000);
}

/** Convertit une valeur d'`<input type="time">` (« 08:30 ») en secondes depuis minuit. */
export function timeInputToSeconds(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** Formate une date backend en « jj/mm/aaaa » (jour local, sans l'heure). */
export function formatDateOnly(iso?: string): string {
  if (!iso) return '';
  const d = parseBackendDate(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Réduit une heure « HH:mm:ss » à « HH:mm ». */
export function shortTime(hms?: string): string {
  return hms ? hms.slice(0, 5) : '';
}

/** Renvoie le lundi (00:00) de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day; // ramène au lundi
  date.setDate(date.getDate() + diff);
  return date;
}

/** Les 7 dates (lundi→dimanche) de la semaine débutant à `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** Format « yyyy-MM-dd » (pour les endpoints par période). */
export function yyyymmdd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Parse une date renvoyée par le backend RBS.
 *
 * Le backend renvoie des dates **en UTC mais sans indicateur de fuseau** (ex.
 * `'2026-07-03T08:00:00.000'`). `new Date(...)` les interpréterait comme des heures **locales**,
 * ce qui décale l'affichage (une réservation à 10:00 CEST s'affichait 08:00). On force donc
 * l'interprétation **UTC** ; l'affichage et la comparaison se font ensuite en **heure locale**.
 */
export function parseBackendDate(iso: string): Date {
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

/** Même jour civil (année/mois/jour) **local** qu'une date backend ? */
export function isSameDay(iso: string, d: Date): boolean {
  const b = parseBackendDate(iso);
  return b.getFullYear() === d.getFullYear() && b.getMonth() === d.getMonth() && b.getDate() === d.getDate();
}

/** Heure « HH:mm » en **heure locale** (FR) d'une date backend. */
export function isoTime(iso?: string): string {
  if (!iso) return '';
  const d = parseBackendDate(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Libellés FR des jours cochés d'un bitstring (index 0 = dimanche). */
export function bitstringToDayLabels(bits?: string): string {
  if (!bits) return '';
  const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return bits
    .split('')
    .map((c, i) => (c === '1' ? labels[i] : null))
    .filter(Boolean)
    .join(', ');
}
