// Droits de l'usager sur les types et ressources de réservation, comme l'IHM AngularJS
// (public/ts/behaviours.ts#resourceRights). Fonctions pures, testées dans rights.test.ts.

/** Clés de partage portées par un type (rôles « Réserver », « Valider », « Gérer »). */
export const RIGHT_KEYS = {
  contrib: 'net-atos-entng-rbs-controllers-BookingController|createBooking',
  process: 'net-atos-entng-rbs-controllers-BookingController|processBooking',
  manage: 'net-atos-entng-rbs-controllers-ResourceTypeController|updateResourceType',
} as const;

export type RightName = keyof typeof RIGHT_KEYS;
export type Rights = Record<RightName, boolean>;

/** Une ligne de partage : un utilisateur ou un groupe, avec les droits accordés (`<clé>: true`). */
export interface ShareEntry {
  userId?: string;
  groupId?: string;
  [right: string]: unknown;
}

/** Ce que l'on sait de l'usager connecté pour décider de ses droits. */
export interface Me {
  userId: string;
  groupsIds: string[];
  /** Établissements dont l'usager est administrateur local. */
  adminLocalScope: string[];
  isSuperAdmin: boolean;
}

interface Owned {
  owner?: string;
  shared?: ShareEntry[];
}

const NONE: Rights = { contrib: false, process: false, manage: false };

/**
 * Droits sur un type — ou sur une ressource, dont les droits sont ceux de son type. Accordés au propriétaire
 * (du type ou de la ressource), à l'administrateur local de l'établissement du type, au super-administrateur,
 * et à quiconque a reçu le partage (en direct ou par un groupe). Ex. un enseignant dans un groupe partagé en
 * « Réserver » : `{ contrib: true, process: false, manage: false }`.
 */
export function rightsOn(container: Owned & { school_id?: string }, me: Me, resource?: Owned): Rights {
  if (!me.userId) return { ...NONE };
  const owner = container.owner === me.userId || resource?.owner === me.userId;
  const adml = !!container.school_id && me.adminLocalScope.includes(container.school_id);
  const privileged = owner || adml || me.isSuperAdmin;
  const shared = container.shared ?? [];
  const mine = shared.filter((s) => s.userId === me.userId || (!!s.groupId && me.groupsIds.includes(s.groupId)));
  const out = { ...NONE };
  (Object.keys(RIGHT_KEYS) as RightName[]).forEach((name) => {
    out[name] = privileged || mine.some((s) => s[RIGHT_KEYS[name]] === true);
  });
  return out;
}

/** Au moins un des types est dans ce cas (ex. pour afficher l'onglet « Modération »). */
export const anyRight = (rightsList: Rights[], name: RightName): boolean => rightsList.some((r) => r[name]);
