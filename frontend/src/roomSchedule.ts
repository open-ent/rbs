// Disponibilité d'une salle : créneaux déjà occupés par l'emploi du temps ET par les réservations, comme l'IHM AngularJS
// (controller.ts : roomSchedule, fetchSlotsForResource). Logique pure, testée dans roomSchedule.test.ts.

import type { Booking, EdtCourse } from './api';
import { isSeriesParent } from './calendar';
import { parseBackendDate } from './utils';

export interface ScheduleSlot {
  source: 'edt' | 'rbs';
  start: Date;
  end: Date;
  label: string;
  resourceName: string;
}

/** « 2026-10-20 10:00:00 » (heure locale de l'emploi du temps) → Date. */
const edtDate = (value: string): Date => new Date(value.replace(' ', 'T'));

/**
 * Créneaux d'une ressource : cours de l'emploi du temps dans la salle + réservations non refusées, triés par début. La mère
 * d'une série (qui couvre toute la période de la série) n'occupe rien : seules ses occurrences comptent.
 * Ex. 1 cours lundi 8h et 1 réservation lundi 10h « Réunion » → [edt 8h, rbs 10h « Réunion »].
 */
export function toSlots(resourceName: string, courses: EdtCourse[], bookings: Booking[], labels: { edt: string; rbs: string }): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [
    ...courses.map((c) => ({ source: 'edt' as const, start: edtDate(c.startDate), end: edtDate(c.endDate), label: labels.edt, resourceName })),
    ...bookings.filter((b) => b.status !== 3 && !isSeriesParent(b)).map((b) => ({ source: 'rbs' as const, start: parseBackendDate(b.start_date), end: parseBackendDate(b.end_date), label: b.booking_reason || labels.rbs, resourceName })),
  ];
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export type ScheduleMode = 'week' | 'day';

/** Début de la semaine (lundi 00:00) d'une date. */
export const weekStartOf = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

/** Période interrogée : la semaine à partir de son lundi, ou la journée choisie ; bornes « yyyy-MM-ddTHH:mm:ss ». */
export function scheduleRange(mode: ScheduleMode, weekStart: Date, picked: Date): { from: string; to: string } {
  if (mode === 'day') {
    const from = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
    return { from: iso(from), to: iso(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1)) };
  }
  return { from: iso(weekStart), to: iso(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)) };
}

/** Semaine précédente ou suivante : la date choisie suit le lundi, comme l'AngularJS. */
export const shiftWeek = (weekStart: Date, weeks: number): Date => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7 * weeks);
