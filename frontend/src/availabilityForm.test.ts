import { describe, expect, it } from 'vitest';

import type { Availability, Booking } from './api';
import { availabilityBody, checkAvailability, conflictsAfterChange, emptyValues, fromAvailability, rulesAfterDelete, rulesAfterSave, toAvailability } from './availabilityForm';

const NOW = new Date(2026, 9, 5, 8, 0);
const values = (extra = {}) => ({ startDate: '2026-10-12', endDate: '2026-10-30', startTime: '09:00', endTime: '12:00', days: [false, true, true, false, false, false, false], quantity: 1, ...extra });

describe('contrôles de saisie', () => {
  it('rien à signaler', () => expect(checkAvailability(values(), NOW)).toEqual([]));
  it('dates : passé, identiques, inversées', () => {
    expect(checkAvailability(values({ startDate: '2026-10-01' }), NOW)).toContain('rbs.availability.invalid.date.past');
    expect(checkAvailability(values({ endDate: '2026-10-12' }), NOW)).toContain('rbs.availability.invalid.date.equals');
    expect(checkAvailability(values({ endDate: '2026-10-10' }), NOW)).toContain('rbs.availability.invalid.date.switched');
  });
  it('heures : égales, inversées ; aucun jour', () => {
    expect(checkAvailability(values({ endTime: '09:00' }), NOW)).toContain('rbs.availability.invalid.time.equals');
    expect(checkAvailability(values({ endTime: '08:00' }), NOW)).toContain('rbs.availability.invalid.time.switched');
    expect(checkAvailability(values({ days: Array(7).fill(false) }), NOW)).toContain('rbs.availability.invalid.days.empty');
  });
  it('le jour même n\'est pas « dans le passé »', () => expect(checkAvailability(values({ startDate: '2026-10-05', endDate: '2026-10-06' }), NOW)).not.toContain('rbs.availability.invalid.date.past'));
  it('période vide proposée : demain → dans une semaine, aucun jour', () => {
    const v = emptyValues(NOW);
    expect([v.startDate, v.endDate]).toEqual(['2026-10-06', '2026-10-13']);
    expect(v.days.some(Boolean)).toBe(false);
  });
});

describe('conversions', () => {
  it('serveur → saisie', () => {
    const a: Availability = { id: 1, resource_id: 2, start_date: '2026-10-12T00:00:00.000', end_date: '2026-10-30T00:00:00.000', start_time: '09:00:00', end_time: '12:30:00', days: '0110000', quantity: 2, is_unavailability: true };
    expect(fromAvailability(a)).toEqual({ startDate: '2026-10-12', endDate: '2026-10-30', startTime: '09:00', endTime: '12:30', days: [false, true, true, false, false, false, false], quantity: 2 });
  });
  it('saisie → corps : dates et heures en horodatages dont l\'heure locale est celle saisie', () => {
    const b = availabilityBody(7, true, values({ endTime: '12:30' }), 'Europe/Paris');
    expect(b).toMatchObject({ resource_id: 7, is_unavailability: true, iana: 'Europe/Paris', quantity: 1 });
    expect(b.start_date).toBe(Math.floor(new Date(2026, 9, 12).getTime() / 1000));
    const at = (ts: number) => new Date(ts * 1000);
    expect([at(b.start_time).getHours(), at(b.start_time).getMinutes()]).toEqual([9, 0]);
    expect([at(b.end_time).getHours(), at(b.end_time).getMinutes()]).toEqual([12, 30]);
  });
  it('saisie → période du serveur', () => expect(toAvailability(0, 7, false, values())).toMatchObject({ days: '0110000', start_time: '09:00:00', is_unavailability: false }));
  it('liste après ajout, remplacement et suppression', () => {
    const a = toAvailability(1, 7, true, values());
    const b = toAvailability(2, 7, true, values());
    expect(rulesAfterSave([a], b).map((x) => x.id)).toEqual([1, 2]);
    expect(rulesAfterSave([a, b], { ...a, quantity: 3 }).find((x) => x.id === 1)?.quantity).toBe(3);
    expect(rulesAfterDelete([a, b], 1).map((x) => x.id)).toEqual([2]);
  });
});

describe('conflits', () => {
  const booking = (id: number, status = 2): Booking => ({ id, resource_id: 7, owner: 'u', booking_reason: '', created: '', modified: '', start_date: new Date(2026, 9, 13, 10).toISOString(), end_date: new Date(2026, 9, 13, 11).toISOString(), status, is_periodic: false, quantity: 1, parent_booking_id: null });
  const resource = { quantity: 1, is_available: true };
  it('une indisponibilité qui couvre une réservation la suspend', () => {
    const rule = toAvailability(9, 7, true, values());
    const plan = conflictsAfterChange([booking(1)], resource, rulesAfterSave([], rule), NOW);
    expect(plan.suspend.map((b) => b.id)).toEqual([1]);
  });
  it('supprimer cette indisponibilité libère les réservations suspendues', () => {
    const rule = toAvailability(9, 7, true, values());
    const plan = conflictsAfterChange([booking(1, 4)], resource, rulesAfterDelete([rule], 9), NOW);
    expect(plan.resubmit.map((b) => b.id)).toEqual([1]);
  });
});
