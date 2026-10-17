// Client REST du module RBS (réservation de ressources) — cookies de session ENT, même origine.
// Mêmes endpoints que la version AngularJS (backend Java inchangé).

import { errorKey } from './bookingForm';
import type { ShareEntry } from './rights';

/** Type de ressource (ex. « Salles »). */
export interface ResourceType {
  id: number;
  owner?: string;
  category?: string | null;
  extendcolor?: boolean;
  name: string;
  validation: boolean;
  school_id: string;
  color?: string | null;
  slotprofile?: string | null;
  shared?: ShareEntry[];
}

/** Ressource réservable (ex. « Salle 101 »). */
export interface Resource {
  id: number;
  owner?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  periodic_booking: boolean;
  is_available: boolean;
  type_id: number;
  validation: boolean;
  color?: string | null;
  quantity: number;
  min_delay?: number | null;
  max_delay?: number | null;
  /** Capacité d'accueil d'une salle (places), distincte de la quantité. */
  capacity?: number | null;
  /** Matériel mobile (chariot, vidéoprojecteur) plutôt qu'une salle fixe. */
  is_mobile?: boolean;
  requires_key?: boolean;
  equipment?: Equipment[] | null;
  shared?: ShareEntry[];
}

/** Équipement du catalogue d'un établissement (ex. « Vidéoprojecteur », « Tableau interactif »). */
export interface Equipment {
  id: number;
  name: string;
  school_id?: string;
}

/** Statut d'une réservation (convention backend rbs). */
export const BOOKING_STATUS = { CREATED: 1, VALIDATED: 2, REFUSED: 3 } as const;

/** Réservation. Les dates renvoyées sont des chaînes ISO. */
export interface Booking {
  id: number;
  resource_id: number;
  owner: string;
  owner_name?: string;
  booking_reason: string;
  created: string;
  modified: string;
  start_date: string;
  end_date: string;
  status: number;
  moderator_id?: string | null;
  refusal_reason?: string | null;
  is_periodic: boolean;
  /** Réservation mère de la série, pour une occurrence. */
  parent_booking_id?: number | null;
  /** Série : une semaine sur n, jours (bitstring, index 0 = dimanche), nombre d'occurrences (0/absent si fin par date). */
  periodicity?: number | null;
  days?: string | null;
  occurrences?: number | null;
  quantity: number;
}

/** Un créneau à réserver : timestamps Unix (secondes) + fuseau IANA. */
export interface Slot {
  start_date: number;
  end_date: number;
  iana: string;
}

/** Corps de POST /rbs/resource/:id/booking (cf. jsonschema/createBooking.json). */
export interface CreateBookingBody {
  booking_reason: string;
  quantity: number;
  slots: Slot[];
}

/**
 * Corps de POST /rbs/resource/:id/booking/periodic (cf. jsonschema/createPeriodicBooking.json).
 * `days` : 7 booléens, index 0 = dimanche … 6 = samedi. Renseigner `periodic_end_date` OU `occurrences`.
 */
export interface CreatePeriodicBookingBody {
  booking_reason: string;
  quantity: number;
  slots: Slot[];
  periodicity: number;
  days: boolean[];
  iana: string;
  periodic_end_date?: number;
  occurrences?: number;
}

/** Corps de PUT /rbs/resource/:id/booking/:bookingId/process. */
export interface ProcessBookingBody {
  status: number;
  refusal_reason?: string;
}

/** Corps de création d'un type de ressource (cf. jsonschema/createResourceType.json). */
export interface CreateTypeBody {
  name: string;
  validation: boolean;
  school_id: string;
  color: string;
  category?: string;
  extendcolor?: boolean;
  slotprofile?: string | null;
}
/** Corps de mise à jour d'un type (school_id non requis). */
export interface UpdateTypeBody {
  name: string;
  validation: boolean;
  color: string;
  category?: string;
  extendcolor?: boolean;
  slotprofile?: string | null;
}
/** Champs éditables d'une ressource (création/màj ; cf. jsonschema/create|updateResource.json). */
export interface ResourceInput {
  name: string;
  description?: string;
  periodic_booking: boolean;
  is_available: boolean;
  validation?: boolean;
  quantity?: number;
  color?: string;
  min_delay?: number;
  max_delay?: number;
  capacity?: number | null;
  is_mobile?: boolean;
  requires_key?: boolean;
  equipmentIds?: number[];
}

/** Disponibilité (ou indisponibilité) d'une ressource. Réponse : dates ISO, heures « HH:mm:ss », jours en bitstring. */
export interface Availability {
  id: number;
  resource_id: number;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  days: string; // bitstring, index 0 = dimanche
  quantity: number;
  is_unavailability: boolean;
}

/**
 * Corps de POST /rbs/resource/:id/availability (cf. jsonschema/createAvailability.json).
 * ⚠️ Le modèle backend lit `resource_id` et `is_unavailability` dans le CORPS (le path :id ne suffit pas).
 * `start_time`/`end_time` = secondes depuis minuit ; `days` = 7 booléens (index 0 = dimanche).
 */
export interface CreateAvailabilityBody {
  resource_id: number;
  is_unavailability: boolean;
  start_date: number;
  end_date: number;
  start_time: number;
  end_time: number;
  iana: string;
  days: boolean[];
  quantity: number;
}

// ── Partage (modèle entcore, identique à forum) ──────────────────────────────
export interface ShareAction {
  name: string[];
  displayName: string;
  type: string;
}
export interface ShareVisible {
  id: string;
  name?: string;
  username?: string;
}
export interface ShareJson {
  actions: ShareAction[];
  groups: { visibles: ShareVisible[]; checked: Record<string, string[]> };
  users: { visibles: ShareVisible[]; checked: Record<string, string[]> };
}
export interface ShareBatch {
  users: Record<string, string[]>;
  groups: Record<string, string[]>;
  bookmarks: Record<string, string[]>;
}

/** Échec d'une écriture : `key` est la clé i18n du motif donné par le serveur (ou déduite du statut). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public key: string,
  ) {
    super(key);
  }
}

/** Comme `json`, mais l'erreur porte la cause métier (délai minimum, ressource indisponible, conflit…). */
async function jsonStrict<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, errorKey(res.status, await res.text().catch(() => '')));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };
const jsonHeaders = { 'Content-Type': 'application/json' };
/** Jeton anti-CSRF du cookie de session, pour les écritures (absent : en-tête vide). */
const xsrfHeader = (): Record<string, string> => {
  const m = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie);
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
};

// ── Lecture ────────────────────────────────────────────────────────────────
export const getTypes = async (): Promise<ResourceType[]> =>
  json<ResourceType[]>(await fetch('/rbs/types', base));

export const getResources = async (): Promise<Resource[]> =>
  json<Resource[]>(await fetch('/rbs/resources', base));

export const getResource = async (id: number): Promise<Resource> =>
  json<Resource>(await fetch(`/rbs/resource/${id}`, base));

/** Une réservation par son identifiant — GET /rbs/booking/:id. */
export const getBooking = async (id: number): Promise<Booking | null> => {
  const b = await json<Booking | null>(await fetch(`/rbs/booking/${id}`, base));
  // Une réservation inexistante ou interdite renvoie 200 avec un objet vide : on la traite comme absente.
  return b && typeof b === 'object' && 'id' in b ? b : null;
};

export const getResourceBookings = async (id: number): Promise<Booking[]> =>
  json<Booking[]>(await fetch(`/rbs/resource/${id}/bookings`, base));

/** Réservations sur une période (dates « yyyy-MM-dd »), toutes ressources accessibles confondues. */
export const getBookingsInRange = async (startdate: string, enddate: string): Promise<Booking[]> =>
  json<Booking[]>(await fetch(`/rbs/bookings/all/${startdate}/${enddate}`, base));

/** Modification d'une réservation (simple) ou d'une série entière (`periodic`). */
export const updateBooking = async (resourceId: number, bookingId: number, body: CreateBookingBody | CreatePeriodicBookingBody, periodic: boolean): Promise<void> => {
  await jsonStrict<unknown>(
    await fetch(`/rbs/resource/${resourceId}/booking/${bookingId}${periodic ? '/periodic' : ''}`, {
      ...base,
      method: 'PUT',
      headers: { ...jsonHeaders, ...xsrfHeader() },
      body: JSON.stringify(body),
    }),
  );
};

/** Valideurs (utilisateurs ou groupes) d'un type de ressource. */
export interface Moderator {
  id?: string;
  username: string;
  type?: string;
}
export const getTypeModerators = async (typeId: number): Promise<Moderator[]> => json<Moderator[]>(await fetch(`/rbs/type/${typeId}/moderators`, base));

/** Plage horaire prédéfinie d'un profil de créneaux d'établissement. */
export interface ProfileSlotDto {
  id?: number;
  name: string;
  startHour: string;
  endHour: string;
}
export const getSlotProfileSlots = async (profileId: string): Promise<{ slots: ProfileSlotDto[] }> => json<{ slots: ProfileSlotDto[] }>(await fetch(`/rbs/slotprofiles/${profileId}/slots`, base));

/** Réservations d'une ressource sur une période (bornes « yyyy-MM-ddTHH:mm:ss » en heure locale). */
export const getResourceBookingsBetween = async (resourceId: number, startAt: string, endAt: string): Promise<Booking[]> =>
  json<Booking[]>(await fetch(`/rbs/resource/${resourceId}/bookings?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`, base));

/** Cours de l'emploi du temps déjà prévus dans une salle sur la période (relais serveur) : avertissement non bloquant. */
export interface EdtCourse {
  startDate: string;
  endDate: string;
}
export const getRoomConflicts = async (structureId: string, startAt: string, endAt: string, room: string): Promise<EdtCourse[]> =>
  json<EdtCourse[]>(await fetch(`/edt/structures/${structureId}/room-conflicts/${startAt}/${endAt}?room=${encodeURIComponent(room)}`, base));

/** Toutes les occurrences d'une série (la liste n'en reçoit que celles de la période affichée). */
export const getSeriesSlots = async (parentBookingId: number): Promise<Booking[]> =>
  json<Booking[]>(await fetch(`/rbs/bookings/full/slots/${parentBookingId}`, base));

// ── Préférence `rbs` du compte (état de l'arbre des ressources), partagée avec l'IHM AngularJS ─────────
/** Lit la préférence entière : elle porte d'autres clés que l'arbre, qu'une écriture ne doit pas effacer. */
export const getRbsPreference = async (): Promise<Record<string, unknown>> => {
  const res = await fetch('/userbook/preference/rbs', base);
  if (!res.ok) return {};
  // L'enveloppe est `{ preference: "<json>" }` — une chaîne, pas un objet.
  const body = (await res.json().catch(() => null)) as { preference?: string | null } | null;
  if (!body?.preference) return {};
  try {
    return (JSON.parse(body.preference) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
};

export const saveRbsPreference = async (preference: Record<string, unknown>): Promise<void> => {
  await fetch('/userbook/preference/rbs', { ...base, method: 'PUT', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify(preference) });
};

// ── Écriture ────────────────────────────────────────────────────────────────
export const createBooking = async (resourceId: number, body: CreateBookingBody): Promise<Booking> =>
  jsonStrict<Booking>(
    await fetch(`/rbs/resource/${resourceId}/booking`, {
      ...base,
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  );

export const createPeriodicBooking = async (
  resourceId: number,
  body: CreatePeriodicBookingBody,
): Promise<Booking> =>
  jsonStrict<Booking>(
    await fetch(`/rbs/resource/${resourceId}/booking/periodic`, {
      ...base,
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  );

// ── Modération ───────────────────────────────────────────────────────────────
/** File des réservations à traiter (droit modérateur `rbs.booking.list.unprocessed`). */
export const getUnprocessedBookings = async (): Promise<Booking[]> =>
  json<Booking[]>(await fetch('/rbs/bookings/unprocessed', base));

/** Valide (status 2) ou refuse (status 3, avec motif) une réservation. */
export const processBooking = async (
  resourceId: number,
  bookingId: number,
  body: ProcessBookingBody,
): Promise<Booking> =>
  json<Booking>(
    await fetch(`/rbs/resource/${resourceId}/booking/${bookingId}/process`, {
      ...base,
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }),
  );

/** Supprime une réservation. `thisAndAfter=false` : uniquement l'occurrence visée. */
export const deleteBooking = async (
  resourceId: number,
  bookingId: number,
  thisAndAfter = false,
): Promise<void> => {
  const res = await fetch(`/rbs/resource/${resourceId}/booking/${bookingId}/${thisAndAfter}`, {
    ...base,
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Gestion des types ────────────────────────────────────────────────────────
export const createType = async (body: CreateTypeBody): Promise<ResourceType> =>
  jsonStrict<ResourceType>(
    await fetch('/rbs/type', { ...base, method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

export const updateType = async (id: number, body: UpdateTypeBody): Promise<ResourceType> =>
  jsonStrict<ResourceType>(
    await fetch(`/rbs/type/${id}`, { ...base, method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

export const deleteType = async (id: number): Promise<void> => {
  const res = await fetch(`/rbs/type/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, errorKey(res.status, await res.text().catch(() => '')));
};

// ── Gestion des ressources ────────────────────────────────────────────────────
export const createResource = async (typeId: number, body: ResourceInput): Promise<Resource> =>
  jsonStrict<Resource>(
    await fetch(`/rbs/type/${typeId}/resource`, { ...base, method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

/**
 * Met à jour une ressource. Le PUT exige `type_id` et `was_available` (ancienne valeur de
 * `is_available`), en plus des champs éditables (cf. jsonschema/updateResource.json).
 */
export const updateResource = async (
  id: number,
  typeId: number,
  wasAvailable: boolean,
  body: ResourceInput,
): Promise<Resource> =>
  jsonStrict<Resource>(
    await fetch(`/rbs/resource/${id}`, {
      ...base,
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ ...body, type_id: typeId, was_available: wasAvailable }),
    }),
  );

export const deleteResource = async (id: number): Promise<void> => {
  const res = await fetch(`/rbs/resource/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, errorKey(res.status, await res.text().catch(() => '')));
};


// ── Notifications (abonnement par ressource ou par type) ──────────────────────────────────────────────────────
/** Identifiants des ressources dont l'usager reçoit les notifications de réservation. */
// `no-store` : sans lui le navigateur peut resservir une liste d'abonnements périmée après un changement.
export const getNotifiedResourceIds = async (): Promise<number[]> => ((await json<Array<{ resource_id: number }>>(await fetch('/rbs/resource/notifications', { ...base, cache: 'no-store' }))) ?? []).map((n) => Number(n.resource_id));
const notifyCall = async (url: string, method: 'POST' | 'DELETE'): Promise<void> => {
  const res = await fetch(url, { ...base, method, headers: { ...jsonHeaders, ...xsrfHeader() }, ...(method === 'POST' ? { body: '{}' } : {}) });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, errorKey(res.status, await res.text().catch(() => '')));
};
export const subscribeResource = (id: number): Promise<void> => notifyCall(`/rbs/resource/notification/add/${id}`, 'POST');
export const unsubscribeResource = (id: number): Promise<void> => notifyCall(`/rbs/resource/notification/remove/${id}`, 'DELETE');
export const subscribeType = (id: number): Promise<void> => notifyCall(`/rbs/type/notification/add/${id}`, 'POST');
export const unsubscribeType = (id: number): Promise<void> => notifyCall(`/rbs/type/notification/remove/${id}`, 'DELETE');

// ── Génération des réservations depuis l'emploi du temps ──────────────────────────────────────────────────────
export interface EdtImportBody {
  /** Début et fin de la période analysée, « yyyy-MM-dd ». */
  startAt: string;
  endAt: string;
  /** Fin des réservations répétées, en secondes Unix. */
  periodicEndDate: number;
  /** Vrai : aperçu, rien n'est créé. */
  dryRun: boolean;
}
export interface EdtImportReport {
  created: Array<{ bookingReason: string }>;
  skippedExisting: Array<{ bookingReason: string }>;
  conflicts: Array<{ bookingReason: string; existingBookings: Array<{ range: string }> }>;
  unmatchedRooms: Array<{ roomLabel: string; occurrences: number; courseLabels: string[] }>;
  obsolete: Array<{ bookingReason: string }>;
}
export const importFromEdt = async (structureId: string, body: EdtImportBody): Promise<EdtImportReport> =>
  jsonStrict<EdtImportReport>(await fetch(`/rbs/structures/${structureId}/import-from-edt`, { ...base, method: 'POST', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify(body) }));

// ── Équipements, affectations, profils de créneaux ─────────────────────────────────────────────────────────────
export const getEquipments = async (schoolId: string): Promise<Equipment[]> => (await json<Equipment[]>(await fetch(`/rbs/equipments/${schoolId}`, base))) ?? [];

export const createEquipment = async (schoolId: string, name: string): Promise<Equipment> =>
  jsonStrict<Equipment>(await fetch('/rbs/equipment', { ...base, method: 'POST', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify({ school_id: schoolId, name }) }));

/** Associe exactement ces équipements à la ressource (remplace la liste précédente). */
export const setResourceEquipment = async (resourceId: number, equipmentIds: number[]): Promise<void> => {
  await jsonStrict<unknown>(await fetch(`/rbs/resource/${resourceId}/equipment`, { ...base, method: 'PUT', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify({ equipmentIds }) }));
};

/** Ressource désignée dans une affectation (matériel mobile ↔ salle) : identifiant et nom suffisent. */
export interface AssignedResource {
  id: number;
  name: string;
}
/** Salles de l'établissement où un matériel mobile peut être affecté (le matériel lui-même exclu). */
export const getAssignmentCandidates = async (schoolId: string, excludeResourceId: number): Promise<AssignedResource[]> =>
  (await json<AssignedResource[]>(await fetch(`/rbs/resources/candidates/${schoolId}/${excludeResourceId}`, base))) ?? [];
export const getAssignments = async (resourceId: number): Promise<AssignedResource[]> => (await json<AssignedResource[]>(await fetch(`/rbs/resource/${resourceId}/assignments`, base))) ?? [];
export const setAssignments = async (resourceId: number, resourceIds: number[]): Promise<void> => {
  await jsonStrict<unknown>(await fetch(`/rbs/resource/${resourceId}/assignments`, { ...base, method: 'PUT', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify({ resourceIds }) }));
};

/** Profils de créneaux d'un établissement (annuaire) : `_id` est ce que porte un type (`slotprofile`). */
export interface SlotProfileDto {
  _id: string;
  name: string;
  slots?: unknown[];
}
export const getSchoolSlotProfiles = async (schoolId: string): Promise<SlotProfileDto[]> =>
  (await json<SlotProfileDto[]>(await fetch(`/rbs/slotprofiles/schools/${schoolId}`, base))) ?? [];

// ── Export ────────────────────────────────────────────────────────────────────
/** Corps de POST /rbs/bookings/export (cf. jsonschema/exportBookings.json). Dates « yyyy-MM-dd ». */
export interface ExportBody {
  startdate: string;
  enddate: string;
  format: 'ICAL' | 'PDF';
  view: 'DAY' | 'WEEK' | 'LIST' | 'NA';
  resourceIds?: number[];
  usertimezone?: string;
}

/** Exporte les réservations et renvoie le fichier (PDF ou iCalendar) sous forme de Blob. */
export const exportBookings = async (body: ExportBody): Promise<Blob> => {
  const res = await fetch('/rbs/bookings/export', {
    ...base,
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
};

// ── Disponibilités ────────────────────────────────────────────────────────────
/**
 * Périodes d'une ressource : le serveur ne renvoie qu'un mode à la fois (`is_unavailability`, faux par défaut), on lit
 * donc les disponibilités ET les indisponibilités. Ignorer les indisponibilités fausserait la quantité disponible.
 */
export const getResourceAvailability = async (resourceId: number): Promise<Availability[]> => {
  const [availabilities, unavailabilities] = await Promise.all([false, true].map(async (flag) => (await json<Availability[]>(await fetch(`/rbs/resource/${resourceId}/availability?is_unavailability=${flag}`, base))) ?? []));
  return [...availabilities, ...unavailabilities];
};

export const createAvailability = async (resourceId: number, body: CreateAvailabilityBody): Promise<Availability> =>
  json<Availability>(
    await fetch(`/rbs/resource/${resourceId}/availability`, { ...base, method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

export const updateAvailability = async (resourceId: number, availabilityId: number, body: CreateAvailabilityBody): Promise<Availability> =>
  jsonStrict<Availability>(
    await fetch(`/rbs/resource/${resourceId}/availability/${availabilityId}`, { ...base, method: 'PUT', headers: { ...jsonHeaders, ...xsrfHeader() }, body: JSON.stringify(body) }),
  );

/** Supprime toutes les périodes d'un type (indisponibilités ou disponibilités) : utile quand la ressource change de mode. */
export const deleteAllAvailabilities = async (resourceId: number, areUnavailabilities: boolean): Promise<void> => {
  const res = await fetch(`/rbs/resource/${resourceId}/availability/all/${areUnavailabilities}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

export const deleteAvailability = async (resourceId: number, availabilityId: number): Promise<void> => {
  const res = await fetch(`/rbs/resource/${resourceId}/availability/${availabilityId}`, { ...base, method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Partage d'un type de ressource (batch, comme forum) ───────────────────────
export const getTypeShare = async (typeId: number): Promise<ShareJson> =>
  json<ShareJson>(await fetch(`/rbs/share/json/${typeId}`, base));

export const shareTypeBatch = async (typeId: number, batch: ShareBatch): Promise<void> => {
  const res = await fetch(`/rbs/share/resource/${typeId}`, { ...base, method: 'PUT', headers: jsonHeaders, body: JSON.stringify(batch) });
  if (!res.ok) throw new Error(String(res.status));
};

export const api = {
  getTypes,
  getResources,
  getBooking,
  getRbsPreference,
  saveRbsPreference,
  getResource,
  getResourceBookings,
  getBookingsInRange,
  getSeriesSlots,
  updateBooking,
  getTypeModerators,
  getSlotProfileSlots,
  getResourceBookingsBetween,
  getRoomConflicts,
  getNotifiedResourceIds,
  subscribeResource,
  unsubscribeResource,
  subscribeType,
  unsubscribeType,
  importFromEdt,
  getEquipments,
  createEquipment,
  setResourceEquipment,
  getAssignmentCandidates,
  getAssignments,
  setAssignments,
  getSchoolSlotProfiles,
  createBooking,
  createPeriodicBooking,
  getUnprocessedBookings,
  processBooking,
  deleteBooking,
  createType,
  updateType,
  deleteType,
  createResource,
  updateResource,
  deleteResource,
  getResourceAvailability,
  createAvailability,
  updateAvailability,
  deleteAllAvailabilities,
  deleteAvailability,
  getTypeShare,
  shareTypeBatch,
  exportBookings,
};
