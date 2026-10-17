// Logique pure du calendrier des réservations (jour / semaine / mois), comme l'IHM AngularJS
// (models.ts : couleurs des types, calendrier d'entcore : grille horaire, « voir plus »).
// Aucune dépendance à React : testée dans calendar.test.ts.

import type { Booking, Resource, ResourceType } from './api';
import { parseBackendDate, startOfWeek, weekDays } from './utils';

/** Palette de repli de l'AngularJS (`model.colors`) : couleur d'un type qui n'en a pas choisi. */
export const PALETTE = ['#4bafd5', '#46bfaf', '#FF8500', '#b930a2', '#763294'];

export type StatusKind = 'pending' | 'validated' | 'refused' | 'suspended' | 'partial';

/**
 * Famille d'un statut du serveur : 1 en attente, 2 validée, 3 refusée, 4 suspendue, 9 partielle (série dont
 * seules certaines occurrences sont validées). Un statut inconnu se lit « en attente ».
 */
export function statusKind(status: number): StatusKind {
  switch (status) {
    case 2:
      return 'validated';
    case 3:
      return 'refused';
    case 4:
      return 'suspended';
    case 9:
      return 'partial';
    default:
      return 'pending';
  }
}

/**
 * Couleur de chaque type : celle choisie, sinon la palette dans l'ordre des types SANS couleur.
 * Ex. types [A (rouge), B (aucune), C (aucune)] → A rouge, B `#4bafd5`, C `#46bfaf`.
 */
export function typeColors(types: ResourceType[]): Map<number, string> {
  const colors = new Map<number, string>();
  let next = 0;
  types.forEach((type) => {
    colors.set(type.id, type.color || PALETTE[next++ % PALETTE.length]);
  });
  return colors;
}

/** Couleur d'une réservation : celle de sa ressource, sinon celle de son type. */
export function bookingColor(booking: Booking, resources: Map<number, Resource>, colors: Map<number, string>): string {
  const resource = resources.get(booking.resource_id);
  return resource?.color || (resource ? colors.get(resource.type_id) : undefined) || PALETTE[0];
}

/** Réservation d'une série (la mère ou une occurrence) : repérée par une icône dans le calendrier. */
export const isPeriodic = (booking: Booking): boolean => booking.is_periodic || booking.parent_booking_id != null;

/**
 * Réservation « mère » d'une série : elle couvre toute la période de la série (ex. lundis de septembre à juin) et
 * n'occupe pas la ressource, seules ses occurrences le font. Elle n'est jamais dessinée dans le calendrier — sinon
 * un bloc géant masquerait tout le reste.
 */
export const isSeriesParent = (booking: Booking): boolean => booking.is_periodic && booking.parent_booking_id == null;

const startOf = (booking: Booking): Date => parseBackendDate(booking.start_date);
const endOf = (booking: Booking): Date => parseBackendDate(booking.end_date);

/** Début de la journée locale (00:00) d'une date. */
export const dayStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** La réservation touche-t-elle ce jour civil local ? Une réservation sur plusieurs jours touche chacun d'eux. */
export function touchesDay(booking: Booking, day: Date): boolean {
  const from = dayStart(day);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return startOf(booking) < to && endOf(booking) > from;
}

/** Réservations d'un jour, par heure de début (vue mois). */
export const dayBookings = (bookings: Booking[], day: Date): Booking[] =>
  bookings.filter((b) => touchesDay(b, day)).sort((a, b) => startOf(a).getTime() - startOf(b).getTime());

/** Une réservation positionnée dans la grille d'un jour : minutes depuis minuit, colonne parmi celles qui se chevauchent. */
export interface Segment {
  booking: Booking;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

/**
 * Segments d'un jour, avec la colonne de chacun : deux réservations qui se chevauchent se partagent la largeur au
 * lieu de se masquer. Ex. 9h-11h et 10h-12h → colonnes 0 et 1 sur 2 ; 9h-10h et 10h-11h → une colonne chacune.
 * Une réservation à cheval sur minuit est coupée aux bornes du jour.
 */
export function daySegments(bookings: Booking[], day: Date): Segment[] {
  const from = dayStart(day);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const items = bookings
    .filter((b) => touchesDay(b, day))
    .map((booking) => {
      const s = Math.max(startOf(booking).getTime(), from.getTime());
      const e = Math.min(endOf(booking).getTime(), to.getTime());
      return { booking, startMin: Math.round((s - from.getTime()) / 60000), endMin: Math.round((e - from.getTime()) / 60000) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const out: Segment[] = [];
  let cluster: Segment[] = [];
  let clusterEnd = -1;
  const close = () => {
    const cols = Math.max(1, ...cluster.map((s) => s.col + 1));
    cluster.forEach((s) => (s.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  items.forEach((item) => {
    if (cluster.length && item.startMin >= clusterEnd) close();
    // Première colonne libre : celle dont la dernière réservation est finie.
    let col = 0;
    while (cluster.some((s) => s.col === col && s.endMin > item.startMin)) col++;
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  });
  if (cluster.length) close();
  return out;
}

/**
 * Heures affichées dans la grille : 7h-20h par défaut (comme le calendrier AngularJS), élargies pour qu'aucune
 * réservation ne soit coupée. Ex. une réservation 6h30-8h donne 6h→20h ; une réservation 19h-21h30, 7h→22h.
 */
export function visibleHours(segments: Segment[], from = 7, to = 20): { from: number; to: number } {
  let lo = from;
  let hi = to;
  segments.forEach((s) => {
    lo = Math.min(lo, Math.floor(s.startMin / 60));
    hi = Math.max(hi, Math.ceil(s.endMin / 60));
  });
  return { from: lo, to: Math.min(24, hi) };
}

/** Semaines (lundi→dimanche) couvrant le mois de `cursor`, de 4 à 6 lignes. */
export function monthGrid(cursor: Date): Date[][] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  for (let monday = startOfWeek(first); monday <= last; ) {
    weeks.push(weekDays(monday));
    monday = new Date(monday);
    monday.setDate(monday.getDate() + 7);
  }
  return weeks;
}

/** Au plus `max` réservations visibles dans une case du mois ; le reste part dans « voir plus ». */
export function splitMore<T>(items: T[], max = 3): { shown: T[]; more: T[] } {
  if (items.length <= max) return { shown: items, more: [] };
  return { shown: items.slice(0, max - 1), more: items.slice(max - 1) };
}

/** Début d'un créneau cliqué dans la grille : jour + minutes depuis minuit, en heure locale. */
export function slotStart(day: Date, minutes: number): Date {
  const d = dayStart(day);
  d.setMinutes(minutes);
  return d;
}

/** Créneau dans le passé : on ne réserve pas rétroactivement (même règle que l'AngularJS). */
export const isPastSlot = (start: Date, now = new Date()): boolean => start < now;

/** « yyyy-MM-ddTHH:mm » local, valeur d'un champ `datetime-local`. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Deux semaines entières (lundi → dimanche) à partir du lundi de la date : la vue « Quinzaine ». */
export function fortnightGrid(cursor: Date): Date[][] {
  const monday = startOfWeek(cursor);
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return [weekDays(monday), weekDays(next)];
}

/** Jour affiché ? Samedi et dimanche ne le sont que si on les a demandés (cases « Afficher le samedi / le dimanche »). */
export const dayVisible = (d: Date, showSaturday: boolean, showSunday: boolean): boolean => (d.getDay() !== 6 || showSaturday) && (d.getDay() !== 0 || showSunday);
