import { describe, expect, it } from 'vitest';

import { BOOKING_STATUS } from './api';
import {
  bitstringToDayLabels,
  dateInputToUnix,
  formatDateTime,
  localInputToUnix,
  shortTime,
  statusBadgeClass,
  statusLabel,
  timeInputToSeconds,
} from './utils';

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

describe('timeInputToSeconds', () => {
  it('convertit HH:mm en secondes depuis minuit', () => {
    expect(timeInputToSeconds('08:30')).toBe(8 * 3600 + 30 * 60);
    expect(timeInputToSeconds('00:00')).toBe(0);
  });
  it('renvoie NaN pour une entrée invalide', () => {
    expect(Number.isNaN(timeInputToSeconds(''))).toBe(true);
    expect(Number.isNaN(timeInputToSeconds('8h'))).toBe(true);
  });
});

describe('dateInputToUnix', () => {
  it('convertit une date en secondes Unix entières', () => {
    expect(Number.isInteger(dateInputToUnix('2026-09-01'))).toBe(true);
    expect(Number.isNaN(dateInputToUnix(''))).toBe(true);
  });
});

describe('shortTime', () => {
  it('réduit HH:mm:ss en HH:mm', () => {
    expect(shortTime('09:30:00')).toBe('09:30');
    expect(shortTime()).toBe('');
  });
});

describe('bitstringToDayLabels', () => {
  it('liste les jours cochés (index 0 = dimanche)', () => {
    expect(bitstringToDayLabels('0111110')).toBe('Lun, Mar, Mer, Jeu, Ven');
    expect(bitstringToDayLabels('1000001')).toBe('Dim, Sam');
    expect(bitstringToDayLabels('')).toBe('');
  });
});
