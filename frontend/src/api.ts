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

export const api = {
  getTypes,
  getResources,
  getResource,
  getResourceBookings,
  createBooking,
  deleteBooking,
};
