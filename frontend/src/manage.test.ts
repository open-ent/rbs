import { describe, expect, it } from 'vitest';

import type { Resource } from './api';
import { PALETTE } from './calendar';
import { daysToSeconds, defaultChoices, DEFAULT_TYPES, initialValues, nextTypeColor, resourceBody, secondsToDays, typeBody, typesToCreate } from './manage';

describe('délais', () => {
  it('jours ↔ secondes', () => {
    expect(daysToSeconds(3)).toBe(259200);
    expect(secondsToDays(259200)).toBe(3);
  });
});

describe('types par défaut', () => {
  it('grise et décoche ceux qui existent déjà', () => {
    const choices = defaultChoices(['Gymnase', 'CDI']);
    expect(choices.find((c) => c.name === 'Gymnase')).toMatchObject({ alreadyExists: true, checked: false });
    expect(choices.find((c) => c.name === 'Amphithéâtre')).toMatchObject({ alreadyExists: false, checked: true, quantity: 1 });
    expect(choices).toHaveLength(DEFAULT_TYPES.length);
  });
  it('plusieurs exemplaires : « Nom 1 », « Nom 2 »', () => {
    const choices = defaultChoices([]).map((c) => ({ ...c, checked: c.name === 'Laboratoire de SVT', quantity: 2 }));
    expect(typesToCreate(choices, '')).toEqual([
      { name: 'Laboratoire de SVT 1', category: 'LABO_SVT' },
      { name: 'Laboratoire de SVT 2', category: 'LABO_SVT' },
    ]);
  });
  it('saisie libre : une ligne par type, catégorie facultative', () => {
    const none = defaultChoices([]).map((c) => ({ ...c, checked: false }));
    expect(typesToCreate(none, 'Salle 12 - labo_svt\n\n  Salle des profs  \nAtelier - ')).toEqual([
      { name: 'Salle 12', category: 'LABO_SVT' },
      { name: 'Salle des profs', category: 'GENERAL' },
      { name: 'Atelier -', category: 'GENERAL' },
    ]);
  });
  it('un type déjà existant n\'est jamais recréé', () => {
    const choices = defaultChoices(['Gymnase']).map((c) => ({ ...c, checked: true }));
    expect(typesToCreate(choices, '').some((t) => t.name === 'Gymnase')).toBe(false);
  });
  it('couleur suivante de la palette', () => {
    expect(nextTypeColor([])).toBe(PALETTE[0]);
    expect(nextTypeColor([{ color: PALETTE[0] }, { color: '#123456' }])).toBe(PALETTE[1]);
    expect(nextTypeColor(PALETTE.map((color) => ({ color })))).toBe(PALETTE[0]);
  });
  it('corps du type : catégorie vide = GENERAL, profil non choisi absent', () => {
    const b = typeBody({ name: ' Labo ', validation: true, category: ' ', color: '#fff', extendcolor: false, slotprofile: '' }, 's1');
    expect(b).toEqual({ name: 'Labo', validation: true, school_id: 's1', color: '#fff', extendcolor: false, category: 'GENERAL' });
    expect(typeBody({ name: 'x', validation: false, category: 'CDI', color: '#fff', extendcolor: true, slotprofile: 'p1' }).slotprofile).toBe('p1');
  });
});

describe('formulaire de ressource', () => {
  const type = { color: '#4bafd5', validation: true };
  it('valeurs de départ à la création : celles du type', () => {
    const v = initialValues(undefined, type);
    expect(v).toMatchObject({ validation: true, isAvailable: true, periodic: true, quantity: 1, color: '#4bafd5', hasMinDelay: false, isMobile: false });
  });
  it('valeurs de départ en modification : celles de la ressource, délais en jours', () => {
    const r = { id: 1, name: 'Salle', validation: false, is_available: false, periodic_booking: false, quantity: 3, is_mobile: true, requires_key: true, capacity: 30, min_delay: 172800, max_delay: null, color: '#000', description: '<p>x</p>' } as unknown as Resource;
    expect(initialValues(r, type)).toMatchObject({ validation: false, isAvailable: false, hasMinDelay: true, minDays: 2, hasMaxDelay: false, isMobile: true, requiresKey: true, capacity: '30', color: '#000' });
  });
  it('une salle est unique : quantité 1 et capacité saisie', () => {
    const v = { ...initialValues(undefined, type), name: ' Salle 1 ', quantity: 5, capacity: '28' };
    expect(resourceBody(v)).toMatchObject({ name: 'Salle 1', quantity: 1, capacity: 28, is_mobile: false });
  });
  it('un matériel mobile a une quantité et pas de capacité', () => {
    const v = { ...initialValues(undefined, type), isMobile: true, quantity: 4, capacity: '28' };
    expect(resourceBody(v)).toMatchObject({ quantity: 4, capacity: null, is_mobile: true });
  });
  it('capacité vide = null ; délais non cochés absents, cochés en secondes', () => {
    const v = { ...initialValues(undefined, type), capacity: ' ' };
    const b = resourceBody(v);
    expect(b.capacity).toBeNull();
    expect('min_delay' in b).toBe(false);
    expect(resourceBody({ ...v, hasMinDelay: true, minDays: 2, hasMaxDelay: true, maxDays: 10 })).toMatchObject({ min_delay: 172800, max_delay: 864000 });
  });
  it('équipements à la création seulement', () => {
    const v = initialValues(undefined, type);
    expect(resourceBody(v, [3, 4]).equipmentIds).toEqual([3, 4]);
    expect('equipmentIds' in resourceBody(v, [])).toBe(false);
  });
});
