import { describe, expect, it } from 'vitest';

import type { Booking } from './api';
import { scheduleRange, shiftWeek, toSlots, weekStartOf } from './roomSchedule';

const booking = (id: number, status: number, h: number, reason = ''): Booking => ({ id, resource_id: 1, owner: 'u', booking_reason: reason, created: '', modified: '', start_date: new Date(2026, 9, 19, h).toISOString(), end_date: new Date(2026, 9, 19, h + 1).toISOString(), status, is_periodic: false, quantity: 1 });
const labels = { edt: 'Emploi du temps', rbs: 'Réservation' };

describe('créneaux', () => {
  it('fusionne cours et réservations, triés ; ignore les refusées', () => {
    const slots = toSlots('Salle 1', [{ startDate: '2026-10-19 08:00:00', endDate: '2026-10-19 09:00:00' }], [booking(1, 2, 10, 'Réunion'), booking(2, 3, 11, 'Refusée'), booking(3, 1, 7)], labels);
    expect(slots.map((s) => [s.source, s.start.getHours(), s.label])).toEqual([['rbs', 7, 'Réservation'], ['edt', 8, 'Emploi du temps'], ['rbs', 10, 'Réunion']]);
    expect(slots.every((s) => s.resourceName === 'Salle 1')).toBe(true);
  });
  it('ignore la réservation mère d\'une série (elle couvre toute la période)', () => {
    const mother = { ...booking(9, 2, 10, 'Série'), is_periodic: true, parent_booking_id: null };
    const child = { ...booking(10, 2, 10, 'Série'), parent_booking_id: 9 };
    expect(toSlots('S', [], [mother, child], labels).map((s) => s.label)).toEqual(['Série']);
  });
  it('sans cours ni réservation : aucun créneau', () => expect(toSlots('S', [], [], labels)).toEqual([]));
});

describe('période', () => {
  const monday = weekStartOf(new Date(2026, 9, 21)); // mercredi → lundi 19
  it('lundi de la semaine', () => expect(monday.getDate()).toBe(19));
  it('semaine : lundi → lundi suivant', () => expect(scheduleRange('week', monday, monday)).toEqual({ from: '2026-10-19T00:00:00', to: '2026-10-26T00:00:00' }));
  it('jour : la journée choisie', () => expect(scheduleRange('day', monday, new Date(2026, 9, 21, 15))).toEqual({ from: '2026-10-21T00:00:00', to: '2026-10-22T00:00:00' }));
  it('semaine précédente et suivante', () => {
    expect(shiftWeek(monday, 1).getDate()).toBe(26);
    expect(shiftWeek(monday, -1).getDate()).toBe(12);
  });
});
