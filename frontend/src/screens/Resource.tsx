import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import { formatDateTime, statusBadgeClass, statusLabel } from '../utils';
import { AvailabilityDialog } from './AvailabilityDialog';

/** Détail d'une ressource : infos, liste des réservations ; la réservation passe par le formulaire complet. */
export function Resource() {
  const { resourceId = '' } = useParams();
  const id = Number(resourceId);
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const bookingsKey = ['rbs', 'resource', id, 'bookings'];

  const resourceQuery = useQuery({
    queryKey: ['rbs', 'resource', id],
    queryFn: () => api.getResource(id),
    enabled: !!id,
  });
  const bookingsQuery = useQuery({
    queryKey: bookingsKey,
    queryFn: () => api.getResourceBookings(id),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: bookingsKey });

  const [showAvailability, setShowAvailability] = useState(false);

  const deleteMut = useMutation({
    mutationFn: (bookingId: number) => api.deleteBooking(id, bookingId),
    onSuccess: invalidate,
  });

  const resource = resourceQuery.data;
  const bookings = bookingsQuery.data ?? [];

  return (
    <div>
      {showAvailability && <AvailabilityDialog resourceId={id} onClose={() => setShowAvailability(false)} />}
      <p>
        <Link to="/">← {t('rbs.back.to.resources', { defaultValue: 'Retour aux ressources' })}</Link>
      </p>

      {resourceQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {resource && (
        <>
          <div className="d-flex align-items-center justify-content-between gap-8 mb-4">
            <div className="d-flex align-items-center gap-8">
              <span
                aria-hidden
                style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: resource.color ?? '#4bafd5' }}
              />
              <h1 className="m-0">{resource.name}</h1>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAvailability(true)}>
              {t('rbs.availability.title', { defaultValue: 'Disponibilités' })}
            </button>
          </div>
          {resource.description && <p className="text-muted">{resource.description}</p>}
          {resource.validation && (
            <div className="alert alert-info" role="alert">
              {t('rbs.validation.info', { defaultValue: 'Les réservations de cette ressource sont soumises à validation.' })}
            </div>
          )}
        </>
      )}

      {/* La réservation passe par le formulaire complet (ressource préchoisie) */}
      <p className="my-16">
        <Link to={`/booking/new?resource=${id}`} className="btn btn-primary">
          {t('rbs.booking.new', { defaultValue: 'Nouvelle réservation' })}
        </Link>
      </p>

      {/* Liste des réservations */}
      <h2 style={{ fontSize: 18 }} className="mb-12">
        {t('rbs.bookings.title', { defaultValue: 'Réservations' })}
      </h2>
      {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {!bookingsQuery.isLoading && bookings.length === 0 && (
        <p className="text-muted">{t('rbs.bookings.none', { defaultValue: 'Aucune réservation pour cette ressource.' })}</p>
      )}
      {bookings.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('rbs.booking.reason', { defaultValue: 'Motif' })}</th>
              <th>{t('rbs.booking.start', { defaultValue: 'Début' })}</th>
              <th>{t('rbs.booking.end', { defaultValue: 'Fin' })}</th>
              <th>{t('rbs.booking.status', { defaultValue: 'Statut' })}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.booking_reason}
                  {b.is_periodic && (
                    <span className="badge bg-light text-dark ms-8">
                      {t('rbs.booking.periodic.short', { defaultValue: 'Périodique' })}
                    </span>
                  )}
                </td>
                <td>{formatDateTime(b.start_date)}</td>
                <td>{formatDateTime(b.end_date)}</td>
                <td>
                  <span className={statusBadgeClass(b.status)}>{statusLabel(b.status)}</span>
                </td>
                <td className="text-end">
                  <button
                    type="button"
                    className="btn btn-link p-0 text-danger"
                    onClick={() => {
                      if (window.confirm(t('rbs.booking.confirm.delete', { defaultValue: 'Annuler cette réservation ?' })))
                        deleteMut.mutate(b.id);
                    }}
                  >
                    {t('rbs.delete', { defaultValue: 'Annuler' })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Resource;
