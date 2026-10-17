// Options de l'export des réservations (PDF ou iCalendar), comme l'IHM AngularJS (export-booking-form.ts) : bornes de
// dates (12 semaines autour de la période), choix des ressources, vue du PDF. Logique pure, testée dans exportOptions.test.ts.

import type { ExportBody } from './api';

/** Largeur maximale d'un export, en semaines (comme l'AngularJS) : au-delà le PDF devient illisible. */
export const MAX_WEEKS = 12;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayValue = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (v: string): Date => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const mondayOf = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Premier jour exportable : le lundi d'il y a 12 semaines. */
export const earliestStart = (today = new Date()): Date => addDays(mondayOf(today), -7 * MAX_WEEKS);

/** Dernier jour exportable pour un début donné : le dimanche de la semaine du début + 12 semaines. */
export const latestEnd = (start: Date): Date => addDays(mondayOf(start), 7 * MAX_WEEKS + 6);

/**
 * Dates après une saisie : le début ne remonte pas au-delà de 12 semaines, la fin ne dépasse pas 12 semaines après le
 * début et ne le précède pas. Ex. début il y a un an → ramené à il y a 12 semaines.
 */
export function clampRange(startValue: string, endValue: string, today = new Date()): { start: string; end: string } {
  let start = fromDay(startValue);
  const min = earliestStart(today);
  if (start < min) start = min;
  let end = fromDay(endValue);
  const max = latestEnd(start);
  if (end > max) end = max;
  if (end < start) end = start;
  return { start: dayValue(start), end: dayValue(end) };
}

export type ExportFormat = 'ICAL' | 'PDF';
export type ExportView = 'WEEK' | 'DAY' | 'LIST';

export interface ExportChoice {
  format: ExportFormat;
  /** Ressources cochées dans l'arbre, ou toutes celles de l'usager. */
  scope: 'selected' | 'all';
  view: ExportView;
  start: string;
  end: string;
}

/** Corps du serveur : l'iCalendar n'a pas de vue (`NA`), le PDF en a une ; ressources selon le choix. */
export function exportBody(choice: ExportChoice, selectedIds: number[], allIds: number[], timezone: string): ExportBody {
  return {
    startdate: choice.start,
    enddate: choice.end,
    format: choice.format,
    view: choice.format === 'ICAL' ? 'NA' : choice.view,
    resourceIds: choice.scope === 'selected' ? selectedIds : allIds,
    usertimezone: timezone,
  };
}

/** Nom du fichier téléchargé : « 2026-10-17_export-reservations.pdf ». */
export const exportFilename = (format: ExportFormat, today = new Date()): string => `${dayValue(today)}_export-reservations.${format === 'ICAL' ? 'ics' : 'pdf'}`;
