import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '../api';
import { anyRight, rightsOn } from '../rights';
import { useRbsContext } from './useRbsContext';

/**
 * Ce que l'usager peut faire dans le module, comme l'IHM AngularJS (`hasWorkflowOrAnyResourceHasBehaviour`) :
 * le droit de workflow OU le droit sur au moins un type. Ex. un enseignant modérateur d'un seul type voit
 * l'onglet « Modération » sans avoir le droit de workflow.
 */
export function useRbsRights() {
  const ctx = useRbsContext();
  const types = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  return useMemo(() => {
    const list = (types.data ?? []).map((t) => rightsOn(t, ctx.me));
    return {
      ready: ctx.ready && types.isSuccess,
      moderate: ctx.can.validator || anyRight(list, 'process'),
      manage: ctx.can.typemanage || anyRight(list, 'manage'),
      book: anyRight(list, 'contrib') || ctx.can.typemanage,
      importEdt: ctx.can.edtImport,
      typeRights: (t: Parameters<typeof rightsOn>[0]) => rightsOn(t, ctx.me),
    };
  }, [ctx, types.data, types.isSuccess]);
}
