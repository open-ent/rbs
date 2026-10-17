// Traitement automatique des réservations d'une ressource après un changement de capacité (suppression d'une
// réservation, quantité ou disponibilité modifiée) : exécute le plan calculé par `planTreatment` (bookingActions.ts)
// côté serveur, comme l'IHM AngularJS (controller.ts#treatBookings : suspendre les conflits, re-soumettre les autres).

import { api, Booking, Resource } from './api';
import { planTreatment, STATUS } from './bookingActions';

/**
 * Met à jour l'état des réservations à venir de la ressource et renvoie le nombre de réservations modifiées.
 * `canTreat` : on ne touche qu'aux réservations sur lesquelles l'usager a la main (les siennes, ou celles qu'il valide).
 * Échecs individuels ignorés : le traitement est une commodité, il ne doit jamais empêcher l'action qui l'a déclenché.
 */
export async function treatResource(resource: Resource, canTreat: (b: Booking) => boolean, exceptId?: number): Promise<number> {
  const [bookings, rules] = await Promise.all([api.getResourceBookings(resource.id), api.getResourceAvailability(resource.id)]);
  const plan = planTreatment(bookings, resource, rules, exceptId);
  const back = resource.validation ? STATUS.CREATED : STATUS.VALIDATED;
  const jobs = [...plan.suspend.filter(canTreat).map((b) => ({ b, status: STATUS.SUSPENDED as number })), ...plan.resubmit.filter(canTreat).map((b) => ({ b, status: back as number }))];
  const results = await Promise.allSettled(jobs.map(({ b, status }) => api.processBooking(resource.id, b.id, { status })));
  return results.filter((r) => r.status === 'fulfilled').length;
}
