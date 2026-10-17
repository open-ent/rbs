import { describe, expect, it } from 'vitest';

import type { Booking, Resource, ResourceType } from './api';
import { bookingColor, dayVisible, fortnightGrid, isSeriesParent, dayBookings, daySegments, isPeriodic, isPastSlot, monthGrid, PALETTE, slotStart, splitMore, statusKind, toLocalInput, touchesDay, typeColors, visibleHours } from './calendar';

// Dates avec fuseau (« Z ») : indépendantes du fuseau de la machine de test, sauf pour les bornes de jour,
// construites en heure locale comme le fait l'écran.
const at = (h: number, m = 0, day = 20) => new Date(2026, 9, day, h, m).toISOString();
const booking = (id: number, start: string, end: string, extra: Partial<Booking> = {}): Booking => ({
  id, resource_id: 1, owner: 'u', booking_reason: 'r', created: '', modified: '', start_date: start, end_date: end, status: 2, is_periodic: false, quantity: 1, ...extra,
});
const day = new Date(2026, 9, 20);

describe('statusKind', () => {
  it('mappe les statuts du serveur', () => {
    expect(statusKind(1)).toBe('pending');
    expect(statusKind(2)).toBe('validated');
    expect(statusKind(3)).toBe('refused');
    expect(statusKind(4)).toBe('suspended');
    expect(statusKind(9)).toBe('partial');
  });
  it('lit un statut inconnu « en attente »', () => expect(statusKind(42)).toBe('pending'));
});

describe('couleurs', () => {
  const types = [{ id: 1, color: '#ff0000' }, { id: 2, color: null }, { id: 3 }] as unknown as ResourceType[];
  it('garde la couleur choisie, la palette pour les types sans couleur dans leur ordre', () => {
    const colors = typeColors(types);
    expect(colors.get(1)).toBe('#ff0000');
    expect(colors.get(2)).toBe(PALETTE[0]);
    expect(colors.get(3)).toBe(PALETTE[1]);
  });
  it('reboucle sur la palette', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, color: null })) as unknown as ResourceType[];
    expect(typeColors(many).get(6)).toBe(PALETTE[0]);
  });
  it('prend la couleur de la ressource, sinon celle du type, sinon la palette', () => {
    const colors = typeColors(types);
    const resources = new Map<number, Resource>([
      [1, { id: 1, type_id: 2, color: '#00ff00' } as Resource],
      [2, { id: 2, type_id: 1, color: null } as Resource],
    ]);
    expect(bookingColor(booking(1, at(9), at(10), { resource_id: 1 }), resources, colors)).toBe('#00ff00');
    expect(bookingColor(booking(2, at(9), at(10), { resource_id: 2 }), resources, colors)).toBe('#ff0000');
    expect(bookingColor(booking(3, at(9), at(10), { resource_id: 99 }), resources, colors)).toBe(PALETTE[0]);
  });
});

describe('isPeriodic', () => {
  it('reconnaît la mère et les occurrences', () => {
    expect(isPeriodic(booking(1, at(9), at(10)))).toBe(false);
    expect(isPeriodic(booking(1, at(9), at(10), { is_periodic: true }))).toBe(true);
    expect(isPeriodic(booking(1, at(9), at(10), { parent_booking_id: 5 }))).toBe(true);
  });
});

describe('isSeriesParent', () => {
  it('distingue la mère d\'une série de ses occurrences', () => {
    expect(isSeriesParent(booking(1, at(9), at(10), { is_periodic: true }))).toBe(true);
    expect(isSeriesParent(booking(2, at(9), at(10), { is_periodic: true, parent_booking_id: 1 }))).toBe(false);
    expect(isSeriesParent(booking(3, at(9), at(10)))).toBe(false);
  });
});

describe('jours touchés', () => {
  it('une réservation sur deux jours touche les deux', () => {
    const b = booking(1, at(22, 0, 20), at(8, 0, 21));
    expect(touchesDay(b, new Date(2026, 9, 20))).toBe(true);
    expect(touchesDay(b, new Date(2026, 9, 21))).toBe(true);
    expect(touchesDay(b, new Date(2026, 9, 22))).toBe(false);
  });
  it('fin à minuit pile : ne touche pas le jour suivant', () => {
    const b = booking(1, at(22, 0, 20), at(0, 0, 21));
    expect(touchesDay(b, new Date(2026, 9, 21))).toBe(false);
  });
  it('trie les réservations d\'un jour par début', () => {
    const list = dayBookings([booking(2, at(14), at(15)), booking(1, at(9), at(10))], day);
    expect(list.map((b) => b.id)).toEqual([1, 2]);
  });
});

describe('daySegments', () => {
  it('positionne en minutes depuis minuit', () => {
    const [s] = daySegments([booking(1, at(9, 30), at(11))], day);
    expect([s.startMin, s.endMin, s.col, s.cols]).toEqual([570, 660, 0, 1]);
  });
  it('partage la largeur entre réservations qui se chevauchent', () => {
    const segs = daySegments([booking(1, at(9), at(11)), booking(2, at(10), at(12))], day);
    expect(segs.map((s) => [s.booking.id, s.col, s.cols])).toEqual([[1, 0, 2], [2, 1, 2]]);
  });
  it('ne partage pas la largeur de réservations bout à bout', () => {
    const segs = daySegments([booking(1, at(9), at(10)), booking(2, at(10), at(11))], day);
    expect(segs.map((s) => [s.col, s.cols])).toEqual([[0, 1], [0, 1]]);
  });
  it('réutilise une colonne libérée dans un même groupe', () => {
    // 9-12 | 9-10 | 10-11 : la 3e prend la colonne de la 2e, finie.
    const segs = daySegments([booking(1, at(9), at(12)), booking(2, at(9), at(10)), booking(3, at(10), at(11))], day);
    expect(segs.map((s) => [s.booking.id, s.col, s.cols])).toEqual([[1, 0, 2], [2, 1, 2], [3, 1, 2]]);
  });
  it('coupe une réservation à cheval sur minuit', () => {
    const [s] = daySegments([booking(1, at(22, 0, 20), at(8, 0, 21))], new Date(2026, 9, 21));
    expect([s.startMin, s.endMin]).toEqual([0, 480]);
  });
});

describe('visibleHours', () => {
  it('7h-20h par défaut', () => expect(visibleHours([])).toEqual({ from: 7, to: 20 }));
  it('s\'élargit pour une réservation hors plage', () => {
    const segs = daySegments([booking(1, at(6, 30), at(8)), booking(2, at(19), at(21, 30))], day);
    expect(visibleHours(segs)).toEqual({ from: 6, to: 22 });
  });
});

describe('mois et « voir plus »', () => {
  it('octobre 2026 : lundi 28/09 → dimanche 01/11, 5 semaines', () => {
    const weeks = monthGrid(new Date(2026, 9, 15));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0].getDate()).toBe(28);
    expect(weeks[0][0].getMonth()).toBe(8);
    expect(weeks[4][6].getDate()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('février 2027 tient en 4 semaines', () => expect(monthGrid(new Date(2027, 1, 10))).toHaveLength(4));
  it('garde tout ce qui tient', () => expect(splitMore([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: [] }));
  it('réserve la dernière ligne au bouton « voir plus »', () => expect(splitMore([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], more: [3, 4, 5] }));
});

describe('créneau cliqué', () => {
  it('calcule le début en heure locale', () => expect(toLocalInput(slotStart(day, 9 * 60 + 30))).toBe('2026-10-20T09:30'));
  it('refuse le passé', () => {
    expect(isPastSlot(new Date(2026, 0, 1), new Date(2026, 5, 1))).toBe(true);
    expect(isPastSlot(new Date(2026, 8, 1), new Date(2026, 5, 1))).toBe(false);
  });
});

describe('quinzaine et week-end', () => {
  it('deux semaines entières à partir du lundi', () => {
    const [a, b] = fortnightGrid(new Date(2026, 9, 21)); // mercredi 21/10
    expect([a[0].getDate(), a[6].getDate(), b[0].getDate(), b[6].getDate()]).toEqual([19, 25, 26, 1]);
    expect(b[6].getMonth()).toBe(10);
  });
  it('samedi et dimanche masqués par défaut, affichés à la demande', () => {
    const sat = new Date(2026, 9, 24);
    const sun = new Date(2026, 9, 25);
    const mon = new Date(2026, 9, 26);
    expect([dayVisible(sat, false, false), dayVisible(sun, false, false), dayVisible(mon, false, false)]).toEqual([false, false, true]);
    expect([dayVisible(sat, true, false), dayVisible(sun, true, false)]).toEqual([true, false]);
    expect(dayVisible(sun, false, true)).toBe(true);
  });
});
