// Arbre établissement › type › ressource (sélection et dépliage mémorisés), comme l'IHM AngularJS
// (controller.ts#initStructures / saveTreeState, models.ts#loadTreeState). L'état est stocké dans la préférence
// `rbs` du compte (`{ treeState: [...] }`), partagée avec l'AngularJS : un réglage vaut pour les deux interfaces.
// Fonctions pures, testées dans tree.test.ts.

/** Établissement des types non rattachés à un établissement de l'usager (types partagés par d'autres). */
export const DETACHED_ID = 'DETACHED';

export interface StateResource {
  id: number;
  selected: boolean;
}
export interface StateType {
  id: number;
  expanded: boolean;
  resources: StateResource[];
}
export interface StateStructure {
  id: string;
  expanded: boolean;
  selected: boolean;
  types: StateType[];
}

export interface TreeResource {
  id: number;
  name: string;
  selected: boolean;
}
export interface TreeType {
  id: number;
  name: string;
  color?: string | null;
  expanded: boolean;
  resources: TreeResource[];
}
export interface TreeStructure {
  id: string;
  name: string;
  expanded: boolean;
  selected: boolean;
  types: TreeType[];
}

interface Named {
  id: number;
  name: string;
}
export interface TypeInput extends Named {
  school_id: string;
  color?: string | null;
}
export interface ResourceInput extends Named {
  type_id: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/**
 * Construit l'arbre. Les types dont l'établissement n'est pas parmi ceux de l'usager vont dans l'établissement
 * « détaché ». Ex. un type d'un autre collège partagé avec l'usager apparaît sous « Autres établissements ».
 */
export function buildTree(
  structures: Array<{ id: string; name: string }>,
  types: TypeInput[],
  resources: ResourceInput[],
  state: StateStructure[],
  detachedName: string,
): TreeStructure[] {
  const known = new Set(structures.map((s) => s.id));
  const groups: Array<{ id: string; name: string }> = [...structures, { id: DETACHED_ID, name: detachedName }];
  const out = groups.map((g): TreeStructure => {
    const st = state.find((s) => s.id === g.id);
    const mine = types.filter((t) => (g.id === DETACHED_ID ? !known.has(t.school_id) : t.school_id === g.id));
    return {
      id: g.id,
      name: g.name,
      expanded: st?.expanded ?? false,
      selected: st?.selected ?? false,
      types: mine.sort(byName).map((t): TreeType => {
        const ts = st?.types.find((x) => x.id === t.id);
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          expanded: ts?.expanded ?? false,
          resources: resources
            .filter((r) => r.type_id === t.id)
            .sort(byName)
            .map((r) => ({ id: r.id, name: r.name, selected: ts?.resources.find((x) => x.id === r.id)?.selected ?? false })),
        };
      }),
    };
  });
  // Un établissement sans type n'a rien à montrer (sauf l'établissement courant, gardé pour l'explication).
  return out.filter((s) => s.types.length > 0 || s.id !== DETACHED_ID);
}

/** Identifiants des ressources cochées. */
export const selectedResourceIds = (tree: TreeStructure[]): number[] => tree.flatMap((s) => s.types.flatMap((t) => t.resources.filter((r) => r.selected).map((r) => r.id)));

const mapTree = (tree: TreeStructure[], f: (s: TreeStructure) => TreeStructure): TreeStructure[] => tree.map(f);

/** Coche ou décoche tout un établissement : toutes ses ressources suivent. */
export function toggleStructure(tree: TreeStructure[], id: string): TreeStructure[] {
  return mapTree(tree, (s) => {
    if (s.id !== id) return s;
    const selected = !s.selected;
    return { ...s, selected, types: s.types.map((t) => ({ ...t, resources: t.resources.map((r) => ({ ...r, selected })) })) };
  });
}

/** Coche ou décoche tout un type : un établissement n'est « coché » que si toutes ses ressources le sont. */
export function toggleType(tree: TreeStructure[], typeId: number): TreeStructure[] {
  return mapTree(tree, (s) => {
    if (!s.types.some((t) => t.id === typeId)) return s;
    const types = s.types.map((t) => {
      if (t.id !== typeId) return t;
      const selected = !(t.resources.length > 0 && t.resources.every((r) => r.selected));
      return { ...t, resources: t.resources.map((r) => ({ ...r, selected })) };
    });
    return { ...s, types, selected: allSelected(types) };
  });
}

/** Coche ou décoche une ressource. */
export function toggleResource(tree: TreeStructure[], resourceId: number): TreeStructure[] {
  return mapTree(tree, (s) => {
    if (!s.types.some((t) => t.resources.some((r) => r.id === resourceId))) return s;
    const types = s.types.map((t) => ({ ...t, resources: t.resources.map((r) => (r.id === resourceId ? { ...r, selected: !r.selected } : r)) }));
    return { ...s, types, selected: allSelected(types) };
  });
}

const allSelected = (types: TreeType[]): boolean => {
  const all = types.flatMap((t) => t.resources);
  return all.length > 0 && all.every((r) => r.selected);
};

export const toggleExpandStructure = (tree: TreeStructure[], id: string): TreeStructure[] => mapTree(tree, (s) => (s.id === id ? { ...s, expanded: !s.expanded } : s));
export const toggleExpandType = (tree: TreeStructure[], typeId: number): TreeStructure[] =>
  mapTree(tree, (s) => ({ ...s, types: s.types.map((t) => (t.id === typeId ? { ...t, expanded: !t.expanded } : t)) }));

/** État à enregistrer (même format que l'AngularJS). */
export function toState(tree: TreeStructure[]): StateStructure[] {
  return tree.map((s) => ({
    id: s.id,
    expanded: s.expanded,
    selected: s.selected,
    types: s.types.map((t) => ({ id: t.id, expanded: t.expanded, resources: t.resources.map((r) => ({ id: r.id, selected: r.selected })) })),
  }));
}
