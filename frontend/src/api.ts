// Client REST du module RBS (réservation de ressources) — cookies de session ENT, même origine.
// Mêmes endpoints que la version AngularJS (backend Java inchangé).

/** Type de ressource (ex. « Salles »). */
export interface ResourceType {
  id: number;
  name: string;
  validation: boolean;
  school_id: string;
  color?: string | null;
  slotprofile?: string | null;
  shared?: unknown[];
}

/** Ressource réservable (ex. « Salle 101 »). */
export interface Resource {
  id: number;
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
  shared?: unknown[];
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
}
/** Corps de mise à jour d'un type (school_id non requis). */
export interface UpdateTypeBody {
  name: string;
  validation: boolean;
  color: string;
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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };
const jsonHeaders = { 'Content-Type': 'application/json' };

// ── Lecture ────────────────────────────────────────────────────────────────
export const getTypes = async (): Promise<ResourceType[]> =>
  json<ResourceType[]>(await fetch('/rbs/types', base));

export const getResources = async (): Promise<Resource[]> =>
  json<Resource[]>(await fetch('/rbs/resources', base));

export const getResource = async (id: number): Promise<Resource> =>
  json<Resource>(await fetch(`/rbs/resource/${id}`, base));

export const getResourceBookings = async (id: number): Promise<Booking[]> =>
  json<Booking[]>(await fetch(`/rbs/resource/${id}/bookings`, base));

// ── Écriture ────────────────────────────────────────────────────────────────
export const createBooking = async (resourceId: number, body: CreateBookingBody): Promise<Booking> =>
  json<Booking>(
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
  json<Booking>(
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
  json<ResourceType>(
    await fetch('/rbs/type', { ...base, method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

export const updateType = async (id: number, body: UpdateTypeBody): Promise<ResourceType> =>
  json<ResourceType>(
    await fetch(`/rbs/type/${id}`, { ...base, method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

export const deleteType = async (id: number): Promise<void> => {
  const res = await fetch(`/rbs/type/${id}`, { ...base, method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Gestion des ressources ────────────────────────────────────────────────────
export const createResource = async (typeId: number, body: ResourceInput): Promise<Resource> =>
  json<Resource>(
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
  json<Resource>(
    await fetch(`/rbs/resource/${id}`, {
      ...base,
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ ...body, type_id: typeId, was_available: wasAvailable }),
    }),
  );

export const deleteResource = async (id: number): Promise<void> => {
  const res = await fetch(`/rbs/resource/${id}`, { ...base, method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

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
export const getResourceAvailability = async (resourceId: number): Promise<Availability[]> =>
  json<Availability[]>(await fetch(`/rbs/resource/${resourceId}/availability`, base));

export const createAvailability = async (resourceId: number, body: CreateAvailabilityBody): Promise<Availability> =>
  json<Availability>(
    await fetch(`/rbs/resource/${resourceId}/availability`, { ...base, method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }),
  );

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
  getResource,
  getResourceBookings,
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
  deleteAvailability,
  getTypeShare,
  shareTypeBatch,
  exportBookings,
};
