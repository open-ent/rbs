// Périodes de disponibilité / d'indisponibilité d'une ressource (formulaire de ressource), comme l'IHM AngularJS
// (utilities/availability.util.ts : contrôles ; controller.ts : saveAvailability, confirmDeleteAvailability).
// Logique pure, testée dans availabilityForm.test.ts.

import type { Availability, Booking, CreateAvailabilityBody } from './api';
import { planTreatment, TreatmentPlan } from './bookingActions';
import type { ResourceQuantity } from './bookingForm';

/** Valeurs saisies d'une période : dates « yyyy-MM-dd », heures « HH:mm », jours (index 0 = dimanche). */
export interface AvailabilityValues {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  days: boolean[];
  quantity: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Période vide proposée : de demain à dans une semaine, de l'heure courante à l'heure suivante, aucun jour. */
export function emptyValues(now = new Date()): AvailabilityValues {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
  return { startDate: dayValue(start), endDate: dayValue(end), startTime: '08:00', endTime: '18:00', days: Array(7).fill(false), quantity: 1 };
}

/** Valeurs d'une période du serveur (dates ISO, heures « HH:mm:ss », jours en bitstring). */
export const fromAvailability = (a: Availability): AvailabilityValues => ({
  startDate: a.start_date.slice(0, 10),
  endDate: a.end_date.slice(0, 10),
  startTime: a.start_time.slice(0, 5),
  endTime: a.end_time.slice(0, 5),
  days: Array.from({ length: 7 }, (_, i) => a.days[i] === '1'),
  quantity: a.quantity,
});

/**
 * Erreurs de saisie, par clé i18n : début dans le passé (jour), début et fin le même jour, fin avant début, heures
 * égales ou inversées, aucun jour coché. (Comme l'AngularJS, une période tient sur au moins deux dates distinctes.)
 */
export function checkAvailability(v: AvailabilityValues, now = new Date()): string[] {
  const errors: string[] = [];
  if (v.startDate < dayValue(now)) errors.push('rbs.availability.invalid.date.past');
  if (v.startDate === v.endDate) errors.push('rbs.availability.invalid.date.equals');
  if (v.startDate > v.endDate) errors.push('rbs.availability.invalid.date.switched');
  if (v.startTime === v.endTime) errors.push('rbs.availability.invalid.time.equals');
  if (v.startTime > v.endTime) errors.push('rbs.availability.invalid.time.switched');
  if (!v.days.some(Boolean)) errors.push('rbs.availability.invalid.days.empty');
  return errors;
}

/**
 * Heure du serveur : un horodatage Unix dont l'heure LOCALE (fuseau `iana`) est celle saisie — pas des secondes depuis
 * minuit. Le serveur en tire l'heure « HH:mm » à stocker ; on prend aujourd'hui comme jour de référence, comme l'AngularJS.
 * Ex. « 05:00 » à Paris → l'horodatage d'aujourd'hui 05:00 (3h00 UTC en été), relu « 05:00 ».
 */
const clock = (hhmm: string, today = new Date()): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate(), h || 0, m || 0).getTime() / 1000);
};
const unixDay = (v: string): number => {
  const [y, m, d] = v.split('-').map(Number);
  return Math.floor(new Date(y, (m || 1) - 1, d || 1).getTime() / 1000);
};

/** Corps du serveur : dates et heures en horodatages Unix (voir `clock`). */
export function availabilityBody(resourceId: number, isUnavailability: boolean, v: AvailabilityValues, iana: string): CreateAvailabilityBody {
  return {
    resource_id: resourceId,
    is_unavailability: isUnavailability,
    start_date: unixDay(v.startDate),
    end_date: unixDay(v.endDate),
    start_time: clock(v.startTime),
    end_time: clock(v.endTime),
    iana,
    days: v.days,
    quantity: v.quantity,
  };
}

/** Période du serveur correspondant à ces valeurs (pour évaluer les conflits avant d'enregistrer). */
export function toAvailability(id: number, resourceId: number, isUnavailability: boolean, v: AvailabilityValues): Availability {
  return {
    id,
    resource_id: resourceId,
    start_date: `${v.startDate}T00:00:00.000`,
    end_date: `${v.endDate}T00:00:00.000`,
    start_time: `${v.startTime}:00`,
    end_time: `${v.endTime}:00`,
    days: v.days.map((d) => (d ? '1' : '0')).join(''),
    quantity: v.quantity,
    is_unavailability: isUnavailability,
  };
}

/**
 * Réservations que l'enregistrement (ou la suppression) d'une période mettrait en conflit : on rejoue le plan de
 * traitement avec la liste de périodes d'après (`after`). Elles seraient suspendues, aux gestionnaires de trancher.
 */
export function conflictsAfterChange(bookings: Booking[], resource: ResourceQuantity, after: Availability[], now = new Date()): TreatmentPlan {
  return planTreatment(bookings, resource, after, undefined, now);
}

/** Périodes après enregistrement d'une période (ajout, ou remplacement de celle de même identifiant). */
export const rulesAfterSave = (rules: Availability[], saved: Availability): Availability[] => [...rules.filter((r) => r.id !== saved.id), saved];
/** Périodes après suppression d'une période. */
export const rulesAfterDelete = (rules: Availability[], id: number): Availability[] => rules.filter((r) => r.id !== id);
