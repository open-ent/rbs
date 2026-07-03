import { describe, expect, it } from 'vitest';

import { BOOKING_STATUS } from './api';
import { formatDateTime, localInputToUnix, statusBadgeClass, statusLabel } from './utils';

describe('statusLabel', () => {
  it('mappe les statuts connus', () => {
    expect(statusLabel(BOOKING_STATUS.VALIDATED)).toBe('Validée');
    expect(statusLabel(BOOKING_STATUS.REFUSED)).toBe('Refusée');
    expect(statusLabel(BOOKING_STATUS.CREATED)).toBe('En attente');
  });
  it('replie sur « En attente » pour un statut inconnu', () => {
    expect(statusLabel(99)).toBe('En attente');
  });
});

describe('statusBadgeClass', () => {
  it('associe une classe bootstrap par statut', () => {
    expect(statusBadgeClass(BOOKING_STATUS.VALIDATED)).toContain('bg-success');
    expect(statusBadgeClass(BOOKING_STATUS.REFUSED)).toContain('bg-danger');
    expect(statusBadgeClass(BOOKING_STATUS.CREATED)).toContain('bg-warning');
  });
});

describe('localInputToUnix', () => {
  it('convertit une valeur datetime-local en secondes Unix', () => {
    const unix = localInputToUnix('2026-07-15T10:00');
    expect(Number.isInteger(unix)).toBe(true);
    // cohérence : reconvertir en Date donne la même minute
    expect(new Date(unix * 1000).getMinutes()).toBe(0);
  });
  it('renvoie NaN pour une valeur vide ou invalide', () => {
    expect(Number.isNaN(localInputToUnix(''))).toBe(true);
    expect(Number.isNaN(localInputToUnix('pas-une-date'))).toBe(true);
  });
});

describe('formatDateTime', () => {
  it('renvoie une chaîne vide pour une entrée absente/invalide', () => {
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('pas-une-date')).toBe('');
  });
  it('formate une date ISO', () => {
    expect(formatDateTime('2026-07-15T08:00:00.000')).toMatch(/15\/07\/2026/);
  });
});
