import { describe, expect, it } from 'vitest';

import type { Availability, Booking } from './api';
import { atTime, bookingsQuantityUsed, buildBody, checkForm, defaultDays, errorKey, firstOccurrenceDate, occurrenceList, periodicSummary, quantityAvailableAt, resourceQuantityAt, selectedProfileSlots, seriesQuantityAvailable, sortProfileSlots } from './bookingForm';

// Dates en heure locale ; « now » fixé au lundi 5 octobre 2026 08:00 pour des tests stables.
const NOW = new Date(2026, 9, 5, 8, 0);
const d = (day: number, h = 10, m = 0, month = 9) => new Date(2026, month, day, h, m);
const occ = (day: number, h1 = 10, h2 = 11) => ({ start: d(day, h1), end: d(day, h2) });
const TR: Record<string, string> = {
  'rbs.period.days.0': 'dimanche', 'rbs.period.days.1': 'lundi', 'rbs.period.days.2': 'mardi', 'rbs.period.days.3': 'mercredi', 'rbs.period.days.4': 'jeudi', 'rbs.period.days.5': 'vendredi', 'rbs.period.days.6': 'samedi',
  'rbs.period.days.all': 'Tous les jours', 'rbs.period.days.some': 'Certains jours', 'rbs.period.days.one.start': 'Le ', 'rbs.period.days.one.continue': ', le ', 'rbs.period.days.range.start': 'Du ', 'rbs.period.days.range.continue': ', du ', 'rbs.period.days.range.to': ' au ',  // espaces comme dans le vrai fichier fr.json
  'rbs.period.weeks.all': 'chaque semaine', 'rbs.period.weeks.partial': 'une semaine sur ', 'rbs.period.weeks.2': 'deux', 'rbs.period.occurences.for': 'pour ', 'rbs.period.occurences.slots.many': 'occurrences', 'rbs.period.occurences.slots.one': 'occurrence', 'rbs.period.date.until': "jusqu'au ", 'rbs.period.error.nodays': 'Aucun jour',
};
const tr = (k: string) => TR[k] ?? k;
const days = (...on: number[]) => Array.from({ length: 7 }, (_, i) => on.includes(i));
const rule = (extra: Partial<Availability>): Availability => ({ id: 1, resource_id: 1, start_date: '2026-10-01T00:00:00.000', end_date: '2026-10-31T00:00:00.000', start_time: '09:00:00', end_time: '12:00:00', days: '0111110', quantity: 1, is_unavailability: true, ...extra });
const booking = (id: number, day: number, h1: number, h2: number, extra: Partial<Booking> = {}): Booking => ({
  id, resource_id: 1, owner: 'u', booking_reason: '', created: '', modified: '', start_date: d(day, h1).toISOString(), end_date: d(day, h2).toISOString(), status: 2, is_periodic: false, quantity: 1, parent_booking_id: null, ...extra,
});

describe('jours de la série', () => {
  it('coche par défaut le jour de la date de début', () => expect(defaultDays(d(7))).toEqual(days(3))); // mercredi 7/10
  it('démarre au premier jour coché, jamais avant', () => {
    expect(firstOccurrenceDate(d(7), days(3)).getDate()).toBe(7); // mercredi coché
    expect(firstOccurrenceDate(d(7), days(5)).getDate()).toBe(9); // vendredi
    expect(firstOccurrenceDate(d(7), days(1)).getDate()).toBe(12); // lundi suivant
  });
});

describe('résumé de périodicité', () => {
  const base = { periodicity: 1, byOccurrences: true, occurrences: 10, endDateLabel: 'lundi 22 juin 2027' };
  it('plage de jours + occurrences', () => {
    const r = periodicSummary({ ...base, days: days(1, 2, 3) }, tr);
    expect(r.summary).toBe('Du lundi au mercredi, chaque semaine, pour 10 occurrences');
    expect(r.short).toBe('Certains jours, chaque semaine, pour 10 occurrences');
  });
  it('jours séparés', () => expect(periodicSummary({ ...base, days: days(1, 4) }, tr).summary).toBe('Le lundi, le jeudi, chaque semaine, pour 10 occurrences'));
  it('deux jours consécutifs', () => expect(periodicSummary({ ...base, days: days(2, 3) }, tr).summary).toBe('Le mardi, le mercredi, chaque semaine, pour 10 occurrences'));
  it('une semaine sur deux jusqu\'à une date', () => {
    const r = periodicSummary({ ...base, days: days(5), periodicity: 2, byOccurrences: false }, tr);
    expect(r.summary).toBe("Le vendredi, une semaine sur deux, jusqu'au lundi 22 juin 2027");
  });
  it('une seule occurrence au singulier', () => expect(periodicSummary({ ...base, days: days(1), occurrences: 1 }, tr).summary).toContain('pour 1 occurrence'));
  it('tous les jours', () => expect(periodicSummary({ ...base, days: days(0, 1, 2, 3, 4, 5, 6) }, tr).summary).toBe('Tous les jours, chaque semaine, pour 10 occurrences'));
  it('aucun jour : erreur', () => expect(periodicSummary({ ...base, days: days() }, tr).error).toBe('Aucun jour'));
  it('plage qui enjambe dimanche-lundi', () => {
    const r = periodicSummary({ ...base, days: days(5, 6, 0, 1) }, tr).summary;
    expect(r.startsWith('Du vendredi au lundi')).toBe(true);
  });
});

describe('occurrences', () => {
  it('lundi + jeudi, chaque semaine, 3 occurrences', () => {
    const list = occurrenceList(d(5), d(5, 11), days(1, 4), 1, { occurrences: 3 });
    expect(list.map((o) => o.start.getDate())).toEqual([5, 8, 12]);
    expect(list[0].end.getHours()).toBe(11);
  });
  it('une semaine sur deux', () => {
    expect(occurrenceList(d(5), d(5, 11), days(1), 2, { occurrences: 3 }).map((o) => o.start.getDate())).toEqual([5, 19, 2]);
  });
  it('jusqu\'à une date incluse', () => {
    expect(occurrenceList(d(5), d(5, 11), days(1), 1, { until: d(19) }).map((o) => o.start.getDate())).toEqual([5, 12, 19]);
  });
  it('ignore les jours de la première semaine avant le début', () => {
    // début mercredi 7, jours lundi+mercredi : le lundi 5 est avant le début
    expect(occurrenceList(d(7), d(7, 11), days(1, 3), 1, { occurrences: 3 }).map((o) => o.start.getDate())).toEqual([7, 12, 14]);
  });
  it('aucun jour : aucune occurrence', () => expect(occurrenceList(d(5), d(5, 11), days(), 1, { occurrences: 3 })).toEqual([]));
});

describe('quantité', () => {
  const res = { quantity: 3, is_available: true };
  it('sans règle ni réservation : toute la quantité', () => expect(quantityAvailableAt(occ(6), res, [], [], undefined, NOW)).toBe(3));
  it('une indisponibilité qui chevauche réduit la quantité', () => {
    expect(resourceQuantityAt(occ(6), res, [rule({ quantity: 2 })], NOW)).toBe(1); // mardi 6, 10-11 dans 9-12
    expect(resourceQuantityAt(occ(6, 13, 14), res, [rule({ quantity: 2 })], NOW)).toBe(3); // hors horaire
    expect(resourceQuantityAt(occ(11), res, [rule({ quantity: 2 })], NOW)).toBe(3); // dimanche non coché
  });
  it('ressource indisponible par défaut : seules les disponibilités qui couvrent comptent, plafonnées', () => {
    const closed = { quantity: 3, is_available: false };
    const open = rule({ is_unavailability: false, quantity: 5 });
    expect(resourceQuantityAt(occ(6), closed, [open], NOW)).toBe(3);
    expect(resourceQuantityAt(occ(6, 8, 10), closed, [open], NOW)).toBe(0); // début avant l'ouverture
  });
  it('les réservations qui se chevauchent consomment la quantité', () => {
    const others = [booking(1, 6, 9, 11), booking(2, 6, 10, 12)];
    expect(bookingsQuantityUsed(occ(6), others, undefined, NOW)).toBe(2);
    expect(quantityAvailableAt(occ(6), res, [], others, undefined, NOW)).toBe(1);
  });
  it('refusées, mères de série et réservation modifiée ne comptent pas', () => {
    const others = [booking(1, 6, 9, 11, { status: 3 }), booking(2, 6, 9, 11, { is_periodic: true }), booking(3, 6, 9, 11), booking(4, 6, 9, 11, { parent_booking_id: 3 })];
    expect(bookingsQuantityUsed(occ(6), others, 3, NOW)).toBe(0);
    expect(bookingsQuantityUsed(occ(6), others, undefined, NOW)).toBe(2);
  });
  it('jamais négative, et nulle dans le passé ou sans durée', () => {
    const full = [booking(1, 6, 9, 12, { quantity: 3 }), booking(2, 6, 9, 12, { quantity: 3 })];
    expect(quantityAvailableAt(occ(6), res, [], full, undefined, NOW)).toBe(0);
    expect(quantityAvailableAt({ start: d(1), end: d(1, 11) }, res, [], [], undefined, NOW)).toBe(0);
    expect(quantityAvailableAt({ start: d(6), end: d(6) }, res, [], [], undefined, NOW)).toBe(0);
  });
  it('série : le minimum de ses occurrences', () => {
    const list = [occ(6), occ(13)];
    expect(seriesQuantityAvailable(list, res, [], [booking(1, 13, 10, 11, { quantity: 2 })], undefined, NOW)).toBe(1);
    expect(seriesQuantityAvailable([], res, [], [], undefined, NOW)).toBe(0);
  });
});

describe('validation', () => {
  const ok = { start: d(6), end: d(6, 11), periodic: false, days: days(2), quantity: 1, available: 2 };
  it('rien à signaler', () => expect(checkForm(ok, NOW)).toEqual([]));
  it('passé, début = fin, fin avant début', () => {
    expect(checkForm({ ...ok, start: d(1), end: d(1, 11) }, NOW)).toContain('rbs.booking.invalid.datetimes.past');
    expect(checkForm({ ...ok, end: d(6) }, NOW)).toContain('rbs.booking.invalid.datetimes.equals');
    expect(checkForm({ ...ok, end: d(6, 9) }, NOW)).toContain('rbs.booking.invalid.datetimes.switched');
  });
  it('créneau passé : seule la vraie cause est signalée, pas la quantité', () => {
    expect(checkForm({ ...ok, start: d(1), end: d(1, 11), available: 0 }, NOW)).toEqual(['rbs.booking.invalid.datetimes.past']);
  });
  it('série sans jour, quantité nulle ou trop grande', () => {
    expect(checkForm({ ...ok, periodic: true, days: days() }, NOW)).toContain('rbs.booking.missing.days');
    expect(checkForm({ ...ok, quantity: 0 }, NOW)).toContain('rbs.booking.edit.quantity.null');
    expect(checkForm({ ...ok, quantity: 3 }, NOW)).toContain('rbs.booking.edit.quantity.none');
  });
});

describe('corps de la requête', () => {
  const slot = { start: d(6), end: d(6, 11) };
  it('réservation simple', () => {
    const b = buildBody({ reason: ' Cours ', quantity: 1, iana: 'Europe/Paris', slots: [slot] });
    expect(b).toMatchObject({ booking_reason: 'Cours', quantity: 1 });
    expect((b as { slots: unknown[] }).slots).toEqual([{ start_date: Math.floor(slot.start.getTime() / 1000), end_date: Math.floor(slot.end.getTime() / 1000), iana: 'Europe/Paris' }]);
    expect('periodicity' in b).toBe(false);
  });
  it('série par occurrences', () => {
    const b = buildBody({ reason: 'x', quantity: 1, iana: 'Europe/Paris', slots: [slot], periodic: { periodicity: 2, days: days(2), byOccurrences: true, occurrences: 5, until: d(30) } });
    expect(b).toMatchObject({ periodicity: 2, occurrences: 5, days: days(2), iana: 'Europe/Paris' });
    expect('periodic_end_date' in b).toBe(false);
  });
  it('série jusqu\'à une date : fin à l\'heure de fin du créneau', () => {
    const b = buildBody({ reason: 'x', quantity: 1, iana: 'Europe/Paris', slots: [slot], periodic: { periodicity: 1, days: days(2), byOccurrences: false, occurrences: 1, until: d(30) } });
    expect((b as { periodic_end_date: number }).periodic_end_date).toBe(Math.floor(d(30, 11).getTime() / 1000));
    expect('occurrences' in b).toBe(false);
  });
  it('plusieurs plages prédéfinies = plusieurs créneaux', () => {
    const b = buildBody({ reason: 'x', quantity: 1, iana: 'Europe/Paris', slots: [slot, { start: d(6, 11), end: d(6, 12) }] });
    expect((b as { slots: unknown[] }).slots).toHaveLength(2);
  });
});

describe('plages prédéfinies', () => {
  const slots = sortProfileSlots([
    { name: 'M3', startHour: '10:00', endHour: '11:00' },
    { name: 'M1', startHour: '08:00', endHour: '09:00' },
    { name: 'M2', startHour: '09:00', endHour: '10:00' },
  ]);
  it('trie par heure', () => expect(slots.map((s) => s.name)).toEqual(['M1', 'M2', 'M3']));
  it('prend toutes les plages entre la première et la dernière', () => expect(selectedProfileSlots(slots, 0, 1)?.map((s) => s.name)).toEqual(['M1', 'M2']));
  it('refuse un ordre inversé', () => expect(selectedProfileSlots(slots, 2, 0)).toBeNull());
  it('date + heure', () => expect(atTime(d(6), '09:30').getMinutes()).toBe(30));
});

describe('erreurs du serveur', () => {
  it('clé fournie par le serveur', () => expect(errorKey(400, '{"error":"rbs.booking.invalid.min.delay"}')).toBe('rbs.booking.invalid.min.delay'));
  it('repli sur le statut', () => {
    expect(errorKey(409, '')).toBe('rbs.error.conflict');
    expect(errorKey(401, 'x')).toBe('rbs.error.unauthorized');
    expect(errorKey(404, '')).toBe('rbs.error.notfound');
    expect(errorKey(500, '')).toBe('rbs.error.unknown');
  });
});
