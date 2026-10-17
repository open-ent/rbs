import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { buildTree, selectedResourceIds, StateStructure, toggleExpandStructure, toggleExpandType, toggleResource, toggleStructure, toggleType, toState, TreeStructure } from '../tree';
import { useRbsContext } from './useRbsContext';

/**
 * Arbre établissement › type › ressource de l'usager, avec son état (déplié, coché) mémorisé dans la préférence
 * `rbs` du compte, comme l'IHM AngularJS. Sans état mémorisé (première visite), tout est coché.
 */
export function useResourceTree() {
  const { t } = useTranslation(['rbs', 'common']);
  const ctx = useRbsContext();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resources = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const preference = useQuery({ queryKey: ['rbs', 'preference'], queryFn: api.getRbsPreference, staleTime: Infinity });
  const save = useMutation({
    mutationFn: (state: StateStructure[]) => api.saveRbsPreference({ ...(preference.data ?? {}), treeState: state }),
    // La préférence est réécrite ENTIÈRE à chaque fois : on la remet en cache pour qu'une écriture suivante reparte de celle-ci.
    onSuccess: (_d, state) => qc.setQueryData(['rbs', 'preference'], { ...(preference.data ?? {}), treeState: state }),
  });

  const ready = types.isSuccess && resources.isSuccess && preference.isSuccess && ctx.ready;
  const saved = useMemo(() => (preference.data?.['treeState'] as StateStructure[] | undefined) ?? [], [preference.data]);
  const [tree, setTree] = useState<TreeStructure[]>([]);
  const initialised = useRef(false);

  useEffect(() => {
    if (!ready || initialised.current) return;
    initialised.current = true;
    let built = buildTree(ctx.structures, types.data ?? [], resources.data ?? [], saved, t('rbs.structure.detached', { defaultValue: 'Autres établissements' }));
    // Première visite : aucune sélection mémorisée → tout est coché, pour ne pas montrer un planning vide.
    if (saved.length === 0) built = built.map((s) => (s.types.length ? toggleStructure(built, s.id).find((x) => x.id === s.id)! : s));
    setTree(built);
  }, [ready, ctx.structures, types.data, resources.data, saved, t]);

  const update = (next: TreeStructure[]) => {
    setTree(next);
    save.mutate(toState(next));
  };

  return {
    ready: ready && initialised.current,
    tree,
    selectedIds: useMemo(() => selectedResourceIds(tree), [tree]),
    types: types.data ?? [],
    resources: resources.data ?? [],
    toggleStructure: (id: string) => update(toggleStructure(tree, id)),
    toggleType: (id: number) => update(toggleType(tree, id)),
    toggleResource: (id: number) => update(toggleResource(tree, id)),
    toggleExpandStructure: (id: string) => update(toggleExpandStructure(tree, id)),
    toggleExpandType: (id: number) => update(toggleExpandType(tree, id)),
  };
}
