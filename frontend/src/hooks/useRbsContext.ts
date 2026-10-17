import { useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { useMemo } from 'react';

import type { Me } from '../rights';

/** Droits de workflow du module (clés de la session, cf. public/ts/behaviours.ts). */
export const WORKFLOW = {
  typemanage: 'net.atos.entng.rbs.controllers.ResourceTypeController|createResourceType',
  validator: 'net.atos.entng.rbs.controllers.BookingController|listUnprocessedBookings',
  edtImport: 'net.atos.entng.rbs.controllers.EdtImportController|importFromEdt',
} as const;

export interface RbsContext {
  ready: boolean;
  me: Me;
  /** Établissements de l'usager, dans l'ordre de la session. */
  structures: Array<{ id: string; name: string }>;
  /** Peut créer des types (gestion), valider (modération), importer depuis l'emploi du temps. */
  can: { typemanage: boolean; validator: boolean; edtImport: boolean };
}

/** Usager, droits de workflow et établissements du module. */
export function useRbsContext(): RbsContext {
  const { user, init } = useEdificeClient();
  const typemanage = useHasWorkflow(WORKFLOW.typemanage) === true;
  const validator = useHasWorkflow(WORKFLOW.validator) === true;
  const edtImport = useHasWorkflow(WORKFLOW.edtImport) === true;

  const me = useMemo<Me>(() => {
    const functions = (user?.functions ?? {}) as Record<string, { scope?: string[] } | undefined>;
    return {
      userId: user?.userId ?? '',
      groupsIds: user?.groupsIds ?? [],
      adminLocalScope: functions['ADMIN_LOCAL']?.scope ?? [],
      isSuperAdmin: !!functions['SUPER_ADMIN'],
    };
  }, [user]);
  const structures = useMemo(() => (user?.structures ?? []).map((id, i) => ({ id, name: user?.structureNames?.[i] ?? id })), [user]);

  return { ready: init && !!user, me, structures, can: { typemanage, validator, edtImport } };
}
