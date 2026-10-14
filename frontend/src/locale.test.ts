import { afterEach, describe, expect, it } from 'vitest';

import { dateLocale, dayLabels, dayShort, DEFAULT_LOCALE, setLanguage } from './locale';
import { bitstringToDayLabels, formatDateOnly } from './utils';

afterEach(() => setLanguage('fr'));

describe('setLanguage', () => {
  it('traduit un code de langue ENT en locale complète', () => {
    setLanguage('en');
    expect(dateLocale()).toBe('en-GB');
    setLanguage('fr');
    expect(dateLocale()).toBe(DEFAULT_LOCALE);
  });

  it('reprend tel quel un code déjà régionalisé', () => {
    setLanguage('pt-BR');
    expect(dateLocale()).toBe('pt-BR');
  });

  it('ignore une langue vide : la session n’est pas encore chargée', () => {
    setLanguage('en');
    setLanguage(undefined);
    setLanguage('');
    expect(dateLocale()).toBe('en-GB');
  });
});

describe('jours de la semaine', () => {
  it('rend le français inchangé, initiale en capitale et sans point', () => {
    setLanguage('fr');
    expect(dayLabels()).toEqual([
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche',
    ]);
    expect(dayShort()).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  });

  it('suit la langue de la session', () => {
    setLanguage('en');
    expect(dayLabels()[0]).toBe('Monday');
    expect(dayShort()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('formatage du module', () => {
  it('suit la langue de la session', () => {
    setLanguage('fr');
    expect(formatDateOnly('2026-11-18T09:30:00.000')).toBe('18/11/2026');
    expect(bitstringToDayLabels('0111110')).toBe('Lun, Mar, Mer, Jeu, Ven');
    setLanguage('en');
    expect(formatDateOnly('2026-11-18T09:30:00.000')).toBe('18/11/2026');
    expect(bitstringToDayLabels('0111110')).toBe('Mon, Tue, Wed, Thu, Fri');
  });

  it('place le dimanche en tête du bitstring, quelle que soit la langue', () => {
    setLanguage('en');
    expect(bitstringToDayLabels('1000001')).toBe('Sun, Sat');
  });
});
