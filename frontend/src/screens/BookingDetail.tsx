import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import { formatDateTime, statusBadgeClass, statusLabel } from '../utils';

/**
 * Ouverture d'une réservation par son adresse (`#/booking/12`, ou `#/booking/12/2026-10-20` pour une occurrence
 * d'une série), comme l'IHM AngularJS : lien reçu par notification ou par mail. Lecture seule pour l'instant ; les
 * actions (modifier, supprimer, valider) arrivent avec le détail complet d'une réservation.
 */
export function BookingDetail() {
  const { t } = useTranslation(['rbs', 'common']);
  const { bookingId } = useParams();
  const booking = useQuery({ queryKey: ['rbs', 'booking', bookingId], queryFn: () => api.getBooking(Number(bookingId)), enabled: !!bookingId });
  const resources = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const resource = (resources.data ?? []).find((r) => r.id === booking.data?.resource_id);

  if (booking.isLoading) return <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>;
  if (booking.isError || !booking.data) {  // réponse vide : réservation inexistante ou non accessible
    return (
      <div className="alert alert-warning" role="alert">
        {t('rbs.booking.notfound', { defaultValue: "Cette réservation n'existe plus ou vous n'y avez pas accès." })}{' '}
        <Link to="/">{t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link>
      </div>
    );
  }
  const b = booking.data;
  return (
    <div data-booking-detail>
      <p><Link to="/">← {t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link></p>
      <h1 className="mb-16">{resource?.name ?? t('rbs.booking.title', { defaultValue: 'Réservation' })}</h1>
      <dl className="row">
        <dt className="col-sm-3">{t('rbs.booking.reason', { defaultValue: 'Motif' })}</dt>
        <dd className="col-sm-9">{b.booking_reason}</dd>
        <dt className="col-sm-3">{t('rbs.booking.start', { defaultValue: 'Début' })}</dt>
        <dd className="col-sm-9">{formatDateTime(b.start_date)}</dd>
        <dt className="col-sm-3">{t('rbs.booking.end', { defaultValue: 'Fin' })}</dt>
        <dd className="col-sm-9">{formatDateTime(b.end_date)}</dd>
        <dt className="col-sm-3">{t('rbs.booking.owner', { defaultValue: 'Demandeur' })}</dt>
        <dd className="col-sm-9">{b.owner_name ?? ''}</dd>
        <dt className="col-sm-3">{t('rbs.booking.status', { defaultValue: 'Statut' })}</dt>
        <dd className="col-sm-9"><span className={statusBadgeClass(b.status)}>{statusLabel(b.status)}</span></dd>
        {b.refusal_reason && (
          <>
            <dt className="col-sm-3">{t('rbs.booking.refusal', { defaultValue: 'Motif du refus' })}</dt>
            <dd className="col-sm-9">{b.refusal_reason}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export default BookingDetail;
