import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '../api';
import { notifyState, NotifyState } from '../tree';

const KEY = ['rbs', 'notifications'];

/**
 * Abonnements de l'usager aux notifications de réservation, par ressource ou par type (cloches de l'arbre), comme
 * l'IHM AngularJS : cliquer la cloche d'un type abonne (ou désabonne) toutes ses ressources, celle d'une ressource
 * seulement elle. L'écran suit aussitôt le clic ; il revient à l'état du serveur si l'appel échoue.
 */
export function useNotifications() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: api.getNotifiedResourceIds, staleTime: 60_000 });
  const notified = useMemo(() => new Set(query.data ?? []), [query.data]);

  const apply = async (ids: number[], on: boolean, call: () => Promise<void>) => {
    const previous = qc.getQueryData<number[]>(KEY) ?? [];
    qc.setQueryData<number[]>(KEY, on ? [...new Set([...previous, ...ids])] : previous.filter((x) => !ids.includes(x)));
    try {
      await call();
    } catch {
      qc.setQueryData<number[]>(KEY, previous);
    }
  };

  const toggleResource = useMutation({
    mutationFn: (id: number) => (notified.has(id) ? apply([id], false, () => api.unsubscribeResource(id)) : apply([id], true, () => api.subscribeResource(id))),
  });
  const toggleType = useMutation({
    mutationFn: ({ typeId, resourceIds }: { typeId: number; resourceIds: number[] }) =>
      notifyState(resourceIds, notified) === 'all' ? apply(resourceIds, false, () => api.unsubscribeType(typeId)) : apply(resourceIds, true, () => api.subscribeType(typeId)),
  });

  return {
    notified,
    stateOf: (resourceIds: number[]): NotifyState => notifyState(resourceIds, notified),
    toggleResource: (id: number) => toggleResource.mutate(id),
    toggleType: (typeId: number, resourceIds: number[]) => toggleType.mutate({ typeId, resourceIds }),
  };
}
