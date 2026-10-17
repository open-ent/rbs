import { describe, expect, it } from 'vitest';

import { clampRange, dayValue, earliestStart, exportBody, exportFilename, latestEnd } from './exportOptions';

const TODAY = new Date(2026, 9, 17); // samedi 17 octobre 2026

describe('bornes de dates', () => {
  it('premier jour : le lundi d\'il y a 12 semaines', () => expect(dayValue(earliestStart(TODAY))).toBe('2026-07-20'));
  it('dernier jour : le dimanche 12 semaines après la semaine du début', () => expect(dayValue(latestEnd(new Date(2026, 9, 12)))).toBe('2027-01-10'));
  it('un début trop ancien est ramené', () => expect(clampRange('2025-01-01', '2026-10-30', TODAY).start).toBe('2026-07-20'));
  it('une fin trop lointaine est ramenée', () => expect(clampRange('2026-10-12', '2028-01-01', TODAY).end).toBe('2027-01-10'));
  it('une fin avant le début devient le début', () => expect(clampRange('2026-10-20', '2026-10-01', TODAY)).toEqual({ start: '2026-10-20', end: '2026-10-20' }));
  it('une période valide ne bouge pas', () => expect(clampRange('2026-10-12', '2026-11-12', TODAY)).toEqual({ start: '2026-10-12', end: '2026-11-12' }));
});

describe('corps de l\'export', () => {
  const choice = { format: 'PDF' as const, scope: 'selected' as const, view: 'WEEK' as const, start: '2026-10-12', end: '2026-10-18' };
  it('PDF : vue choisie, ressources cochées', () => expect(exportBody(choice, [1, 2], [1, 2, 3], 'Europe/Paris')).toEqual({ startdate: '2026-10-12', enddate: '2026-10-18', format: 'PDF', view: 'WEEK', resourceIds: [1, 2], usertimezone: 'Europe/Paris' }));
  it('iCalendar : pas de vue ; toutes les ressources', () => {
    const b = exportBody({ ...choice, format: 'ICAL', scope: 'all' }, [1], [1, 2, 3], 'Europe/Paris');
    expect(b.view).toBe('NA');
    expect(b.resourceIds).toEqual([1, 2, 3]);
  });
  it('nom du fichier', () => {
    expect(exportFilename('PDF', TODAY)).toBe('2026-10-17_export-reservations.pdf');
    expect(exportFilename('ICAL', TODAY)).toBe('2026-10-17_export-reservations.ics');
  });
});
