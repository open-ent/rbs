import { describe, expect, it } from 'vitest';

import type { Booking } from './api';
import { buildRows, canAct, isPast, nextSort, seriesStatus, sortRows, toggleAll, toggleRow } from './bookingList';

const at = (day: number, h = 9) => new Date(2026, 9, day, h).toISOString();
const b = (id: number, day: number, extra: Partial<Booking> = {}): Booking => ({
  id, resource_id: 1, owner: 'u1', owner_name: 'Alice', booking_reason: 'r', created: '', modified: '',
  start_date: at(day), end_date: at(day, 10), status: 2, is_periodic: false, quantity: 1, parent_booking_id: null, ...extra,
});
const mother = (id: number, extra: Partial<Booking> = {}) => b(id, 1, { is_periodic: true, end_date: at(30), ...extra });
const child = (id: number, parent: number, day: number, status = 2) => b(id, day, { parent_booking_id: parent, status });
const NOW = new Date(2026, 9, 15, 12);

describe('seriesStatus', () => {
  it('prend le statut commun des occurrences', () => {
    expect(seriesStatus(mother(1), [child(2, 1, 5, 2), child(3, 1, 6, 2)])).toBe(2);
    expect(seriesStatus(mother(1), [child(2, 1, 5, 3), child(3, 1, 6, 3)])).toBe(3);
    expect(seriesStatus(mother(1), [child(2, 1, 5, 1)])).toBe(1);
    expect(seriesStatus(mother(1), [child(2, 1, 5, 4)])).toBe(4);
  });
  it('est « partielle » (9) quand les occurrences diffèrent', () => {
    expect(seriesStatus(mother(1), [child(2, 1, 5, 2), child(3, 1, 6, 1)])).toBe(9);
  });
  it('garde le statut de la mère sans occurrence', () => expect(seriesStatus(mother(1, { status: 1 }), [])).toBe(1));
});

describe('buildRows', () => {
  const data = [b(10, 3), mother(1), child(2, 1, 5), child(3, 1, 6, 1), child(4, 99, 7)];
  it('range les occurrences sous leur mère, jamais seules', () => {
    const rows = buildRows(data);
    expect(rows.map((r) => r.booking.id)).toEqual([10, 1, 4]);
    expect(rows[1].slots.map((s) => s.id)).toEqual([2, 3]);
    expect(rows[1].status).toBe(9);
  });
  it('garde une occurrence orpheline (mère inaccessible) plutôt que de la faire disparaître', () => {
    expect(buildRows(data).some((r) => r.booking.id === 4)).toBe(true);
  });
  it('les occurrences chargées à l\'ouverture remplacent celles de la période', () => {
    const rows = buildRows(data, new Map([[1, [child(2, 1, 5), child(3, 1, 6), child(5, 1, 12)]]]));
    expect(rows[1].slots).toHaveLength(3);
    expect(rows[1].status).toBe(2);
  });
  it('un filtre garde la série si une occurrence passe', () => {
    const rows = buildRows(data, new Map(), (x) => x.status === 1);
    expect(rows.map((r) => r.booking.id)).toEqual([1]);
  });
});

describe('tri', () => {
  const rows = buildRows([b(1, 9, { owner_name: 'Zoé', resource_id: 1 }), b(2, 3, { owner_name: 'alice', resource_id: 2 }), b(3, 5, { owner_name: 'Émile', resource_id: 1 })]);
  const name = (x: Booking) => (x.resource_id === 1 ? 'Salle B' : 'Salle A');
  it('par date de début', () => expect(sortRows(rows, 'start_date', false, name).map((r) => r.booking.id)).toEqual([2, 3, 1]));
  it('inverse', () => expect(sortRows(rows, 'start_date', true, name).map((r) => r.booking.id)).toEqual([1, 3, 2]));
  it('par demandeur sans casse ni accent', () => expect(sortRows(rows, 'owner_name', false, name).map((r) => r.booking.id)).toEqual([2, 3, 1]));
  it('par ressource, stable à égalité', () => expect(sortRows(rows, 'resource', false, name).map((r) => r.booking.id)).toEqual([2, 1, 3]));
  it('clic de colonne : même colonne inverse, autre colonne repart croissant', () => {
    expect(nextSort({ key: 'start_date', reverse: false }, 'start_date')).toEqual({ key: 'start_date', reverse: true });
    expect(nextSort({ key: 'start_date', reverse: true }, 'status')).toEqual({ key: 'status', reverse: false });
  });
});

describe('sélection', () => {
  it('passé = terminé', () => {
    expect(isPast(b(1, 3), NOW)).toBe(true);
    expect(isPast(b(1, 20), NOW)).toBe(false);
  });
  it('droits : auteur toujours, sinon valideur ou gestionnaire', () => {
    expect(canAct(b(1, 20), 'u1', { process: false, manage: false })).toBe(true);
    expect(canAct(b(1, 20), 'u2', { process: false, manage: false })).toBe(false);
    expect(canAct(b(1, 20), 'u2', { process: true, manage: false })).toBe(true);
  });
  it('cocher une série coche ses occurrences à venir seulement, la décocher les décoche', () => {
    const [row] = buildRows([mother(1, { end_date: at(30) }), child(2, 1, 5), child(3, 1, 20), child(4, 1, 22)]);
    const on = toggleRow(new Set(), row, true, NOW);
    expect([...on].sort()).toEqual([1, 3, 4]);
    expect(toggleRow(on, row, false, NOW).size).toBe(0);
  });
  it('tout cocher ne retient que les lignes sélectionnables', () => {
    const rows = buildRows([b(1, 20), b(2, 21), b(3, 3)]);
    const all = toggleAll(rows, true, (r) => r.booking.id !== 2, NOW);
    expect([...all].sort()).toEqual([1]);
    expect(toggleAll(rows, false, () => true, NOW).size).toBe(0);
  });
});
