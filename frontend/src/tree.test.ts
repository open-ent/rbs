import { describe, expect, it } from 'vitest';

import { buildTree, DETACHED_ID, selectedResourceIds, toggleExpandStructure, toggleResource, toggleStructure, toggleType, toState } from './tree';

const structures = [{ id: 's1', name: 'Collège A' }, { id: 's2', name: 'Lycée B' }];
const types = [
  { id: 1, name: 'Salles', school_id: 's1', color: '#111' },
  { id: 2, name: 'Matériel', school_id: 's1' },
  { id: 3, name: 'Labos', school_id: 's2' },
  { id: 4, name: 'Prêté', school_id: 'autre' },
];
const resources = [
  { id: 10, name: 'Salle 102', type_id: 1 },
  { id: 11, name: 'Salle 101', type_id: 1 },
  { id: 12, name: 'Projecteur', type_id: 2 },
  { id: 13, name: 'Labo 1', type_id: 3 },
  { id: 14, name: 'Chariot', type_id: 4 },
];
const build = (state = [] as Parameters<typeof buildTree>[3]) => buildTree(structures, types, resources, state, 'Autres établissements');

describe('arbre établissement › type › ressource', () => {
  it('construction : types par établissement, ressources triées, types d\'ailleurs sous « détaché »', () => {
    const t = build();
    expect(t.map((s) => s.id)).toEqual(['s1', 's2', DETACHED_ID]);
    expect(t[0].types.map((x) => x.name)).toEqual(['Matériel', 'Salles']);
    expect(t[0].types[1].resources.map((r) => r.name)).toEqual(['Salle 101', 'Salle 102']);
    expect(t[2].types[0].name).toBe('Prêté');
  });
  it('l\'établissement détaché disparaît quand il n\'a aucun type', () => {
    const t = buildTree(structures, types.slice(0, 3), resources, [], 'Autres');
    expect(t.map((s) => s.id)).toEqual(['s1', 's2']);
  });
  it('restaure l\'état enregistré', () => {
    const t = build([{ id: 's1', expanded: true, selected: false, types: [{ id: 1, expanded: true, resources: [{ id: 10, selected: true }] }] }]);
    expect(t[0].expanded).toBe(true);
    expect(t[0].types[1].expanded).toBe(true);
    expect(selectedResourceIds(t)).toEqual([10]);
  });
  it('cocher un établissement coche toutes ses ressources, et inversement', () => {
    let t = toggleStructure(build(), 's1');
    expect(selectedResourceIds(t).sort()).toEqual([10, 11, 12]);
    t = toggleStructure(t, 's1');
    expect(selectedResourceIds(t)).toEqual([]);
  });
  it('cocher un type ; l\'établissement n\'est coché que si tout l\'est', () => {
    let t = toggleType(build(), 1);
    expect(selectedResourceIds(t).sort()).toEqual([10, 11]);
    expect(t[0].selected).toBe(false);
    t = toggleType(t, 2);
    expect(t[0].selected).toBe(true);
    t = toggleResource(t, 12);
    expect(t[0].selected).toBe(false);
  });
  it('dépliage et sérialisation au format de l\'AngularJS', () => {
    const t = toggleExpandStructure(toggleResource(build(), 13), 's2');
    expect(toState(t).find((s) => s.id === 's2')).toEqual({ id: 's2', expanded: true, selected: true, types: [{ id: 3, expanded: false, resources: [{ id: 13, selected: true }] }] });
  });
});
