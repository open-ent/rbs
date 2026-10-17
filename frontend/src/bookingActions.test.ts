import { describe, expect, it } from 'vitest';

import type { Availability, Booking } from './api';
import { canProcessSelection, editTarget, isOver, planDeletion, planTreatment, processable } from './bookingActions';

const NOW = new Date(2026, 9, 5, 8, 0);
const at = (day: number, h: number, month = 9) => new Date(2026, month, day, h).toISOString();
const b = (id: number, day: number, h1: number, h2: number, extra: Partial<Booking> = {}): Booking => ({
  id, resource_id: 1, owner: 'u', booking_reason: '', created: '', modified: '', start_date: at(day, h1), end_date: at(day, h2), status: 1, is_periodic: false, quantity: 1, parent_booking_id: null, ...extra,
});
const mother = (id: number, extra: Partial<Booking> = {}) => b(id, 6, 9, 10, { is_periodic: true, ...extra });
const child = (id: number, parent: number, day: number, status = 1) => b(id, day, 9, 10, { parent_booking_id: parent, status });

describe('suppression', () => {
  const pool = [b(1, 6, 9, 10), mother(2), child(3, 2, 7), child(4, 2, 14), mother(5), child(6, 5, 8), b(7, 1, 9, 10)];
  it('une série cochée avec ses occurrences part entière', () => {
    const plan = planDeletion(new Set([2, 3, 4]), pool, NOW);
    expect(plan.wholes.map((x) => x.id)).toEqual([2]);
    expect(plan.occurrences).toEqual([]);
  });
  it('une occurrence cochée sans sa mère part seule', () => {
    const plan = planDeletion(new Set([1, 6]), pool, NOW);
    expect(plan.wholes.map((x) => x.id)).toEqual([1]);
    expect(plan.occurrences.map((x) => x.id)).toEqual([6]);
  });
  it('une réservation terminée n\'est jamais supprimée', () => {
    expect(planDeletion(new Set([7]), pool, NOW).wholes).toEqual([]);
    expect(isOver(pool[6], NOW)).toBe(true);
  });
});

describe('validation / refus', () => {
  const pool = [b(1, 6, 9, 10), b(2, 6, 11, 12, { status: 2 }), mother(3), child(4, 3, 7), child(5, 3, 14, 4)];
  it('ne traite que les demandes en attente, jamais la mère d\'une série', () => {
    expect(processable(new Set([1, 2, 3, 4, 5]), pool, NOW).map((x) => x.id)).toEqual([1, 4]);
  });
  it('les boutons exigent une sélection entièrement en attente', () => {
    expect(canProcessSelection(new Set([1, 4]), pool, NOW)).toBe(true);
    expect(canProcessSelection(new Set([1, 2]), pool, NOW)).toBe(false);
    expect(canProcessSelection(new Set(), pool, NOW)).toBe(false);
  });
});

describe('traitement automatique', () => {
  const rule = (extra: Partial<Availability>): Availability => ({ id: 1, resource_id: 1, start_date: '2026-10-01T00:00:00.000', end_date: '2026-10-31T00:00:00.000', start_time: '00:00:00', end_time: '23:59:00', days: '1111111', quantity: 1, is_unavailability: true, ...extra });
  it('rien à faire quand la ressource suffit', () => {
    const plan = planTreatment([b(1, 6, 9, 10, { status: 2 })], { quantity: 1, is_available: true }, [], undefined, NOW);
    expect(plan).toEqual({ suspend: [], resubmit: [] });
  });
  it('suspend une réservation que la ressource ne couvre plus, et le reste de sa série', () => {
    // Ressource d'une unité, deux réservations simultanées : la seconde fait déborder la première.
    const list = [b(1, 6, 9, 10, { status: 2 }), b(2, 6, 9, 10, { status: 1 }), mother(10), child(11, 10, 20), child(12, 10, 21)];
    const plan = planTreatment(list, { quantity: 1, is_available: true }, [], undefined, NOW);
    expect(plan.suspend.map((x) => x.id).sort()).toEqual([1, 2]);
    // une indisponibilité totale touchant l'occurrence 11 suspend aussi 12
    const plan2 = planTreatment(list.filter((x) => x.id >= 10), { quantity: 1, is_available: true }, [rule({ start_date: '2026-10-20T00:00:00.000', end_date: '2026-10-20T00:00:00.000' })], undefined, NOW);
    expect(plan2.suspend.map((x) => x.id).sort()).toEqual([11, 12]);
  });
  it('re-soumet une suspendue dont le solde est redevenu positif (et toute sa série)', () => {
    const list = [b(1, 6, 9, 10, { status: 4 })];
    expect(planTreatment(list, { quantity: 1, is_available: true }, [], undefined, NOW).resubmit.map((x) => x.id)).toEqual([1]);
  });
  it('ne re-soumet pas une occurrence si une autre de sa série est encore en conflit', () => {
    const list = [mother(10), child(11, 10, 20, 4), child(12, 10, 21, 4)];
    const blockOne = rule({ start_date: '2026-10-21T00:00:00.000', end_date: '2026-10-21T00:00:00.000' });
    expect(planTreatment(list, { quantity: 1, is_available: true }, [blockOne], undefined, NOW).resubmit).toEqual([]);
  });
  it('la réservation en cours de suppression ne compte plus', () => {
    const list = [b(1, 6, 9, 10, { status: 2 }), b(2, 6, 9, 10, { status: 4 })];
    const plan = planTreatment(list, { quantity: 1, is_available: true }, [], 1, NOW);
    expect(plan.resubmit.map((x) => x.id)).toEqual([2]);
  });
});

describe('modification', () => {
  const pool = [b(1, 6, 9, 10), mother(2), child(3, 2, 7), child(4, 2, 14), b(5, 8, 9, 10)];
  const open = () => true;
  it('une réservation simple', () => expect(editTarget(new Set([1]), pool, open)?.id).toBe(1));
  it('des occurrences d\'une même série ouvrent la mère', () => expect(editTarget(new Set([3, 4]), pool, open)?.id).toBe(2));
  it('la mère cochée avec ses occurrences', () => expect(editTarget(new Set([2, 3, 4]), pool, open)?.id).toBe(2));
  it('deux réservations différentes : pas de modification', () => expect(editTarget(new Set([1, 5]), pool, open)).toBeNull());
  it('ressource indisponible : pas de modification', () => expect(editTarget(new Set([1]), pool, () => false)).toBeNull());
  it('rien de coché', () => expect(editTarget(new Set(), pool, open)).toBeNull());
});
