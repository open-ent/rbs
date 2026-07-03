import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import { formatDateTime, localInputToUnix, statusBadgeClass, statusLabel } from '../utils';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

/** Détail d'une ressource : informations, liste des réservations, création d'une réservation simple. */
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

  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [formError, setFormError] = useState('');

  const createMut = useMutation({
    mutationFn: () => {
      const startUnix = localInputToUnix(start);
      const endUnix = localInputToUnix(end);
      return api.createBooking(id, {
        booking_reason: reason.trim(),
        quantity,
        slots: [{ start_date: startUnix, end_date: endUnix, iana: IANA }],
      });
    },
    onSuccess: () => {
      setReason('');
      setStart('');
      setEnd('');
      setQuantity(1);
      setFormError('');
      invalidate();
    },
    onError: () => setFormError(t('rbs.booking.error', { defaultValue: 'La réservation a échoué (créneau indisponible ou invalide).' })),
  });

  const deleteMut = useMutation({
    mutationFn: (bookingId: number) => api.deleteBooking(id, bookingId),
    onSuccess: invalidate,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const su = localInputToUnix(start);
    const eu = localInputToUnix(end);
    if (!reason.trim() || Number.isNaN(su) || Number.isNaN(eu)) {
      setFormError(t('rbs.booking.incomplete', { defaultValue: 'Renseignez un motif et des dates valides.' }));
      return;
    }
    if (eu <= su) {
      setFormError(t('rbs.booking.badrange', { defaultValue: 'La date de fin doit être postérieure au début.' }));
      return;
    }
    createMut.mutate();
  };

  const resource = resourceQuery.data;
  const bookings = bookingsQuery.data ?? [];

  return (
    <div>
      <p>
        <Link to="/">← {t('rbs.back.to.resources', { defaultValue: 'Retour aux ressources' })}</Link>
      </p>

      {resourceQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {resource && (
        <>
          <div className="d-flex align-items-center gap-8 mb-4">
            <span
              aria-hidden
              style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: resource.color ?? '#4bafd5' }}
            />
            <h1 className="m-0">{resource.name}</h1>
          </div>
          {resource.description && <p className="text-muted">{resource.description}</p>}
          {resource.validation && (
            <div className="alert alert-info" role="alert">
              {t('rbs.validation.info', { defaultValue: 'Les réservations de cette ressource sont soumises à validation.' })}
            </div>
          )}
        </>
      )}

      {/* Formulaire de réservation simple */}
      <form className="card p-16 my-16" onSubmit={onSubmit}>
        <h2 style={{ fontSize: 18 }} className="mb-12">
          {t('rbs.booking.new', { defaultValue: 'Réserver' })}
        </h2>
        <div className="mb-8">
          <label htmlFor="rbs-reason" className="form-label">
            {t('rbs.booking.reason', { defaultValue: 'Motif' })}
          </label>
          <input
            id="rbs-reason"
            type="text"
            className="form-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('rbs.booking.reason.placeholder', { defaultValue: 'Motif de la réservation' })}
          />
        </div>
        <div className="d-flex gap-16 flex-wrap">
          <div>
            <label htmlFor="rbs-start" className="form-label">
              {t('rbs.booking.start', { defaultValue: 'Début' })}
            </label>
            <input id="rbs-start" type="datetime-local" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rbs-end" className="form-label">
              {t('rbs.booking.end', { defaultValue: 'Fin' })}
            </label>
            <input id="rbs-end" type="datetime-local" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rbs-qty" className="form-label">
              {t('rbs.booking.quantity', { defaultValue: 'Quantité' })}
            </label>
            <input
              id="rbs-qty"
              type="number"
              min={1}
              max={resource?.quantity ?? 1}
              className="form-control"
              style={{ width: 100 }}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
        </div>
        {formError && (
          <div className="alert alert-warning mt-12 mb-0" role="alert">
            {formError}
          </div>
        )}
        <div className="mt-12">
          <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>
            {t('rbs.booking.submit', { defaultValue: 'Réserver' })}
          </button>
        </div>
      </form>

      {/* Liste des réservations */}
      <h2 style={{ fontSize: 18 }} className="mb-12">
        {t('rbs.bookings.title', { defaultValue: 'Réservations' })}
      </h2>
      {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {!bookingsQuery.isLoading && bookings.length === 0 && (
        <p className="text-muted">{t('rbs.bookings.empty', { defaultValue: 'Aucune réservation pour cette ressource.' })}</p>
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
                <td>{b.booking_reason}</td>
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
