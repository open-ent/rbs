import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api, BOOKING_STATUS, Booking } from '../api';
import { formatDateTime } from '../utils';

/**
 * File de modération : réservations en attente sur les ressources dont l'utilisateur
 * est modérateur (`GET /rbs/bookings/unprocessed`). Valider (status 2) ou refuser
 * (status 3 + motif) via `PUT /rbs/resource/:id/booking/:bookingId/process`.
 */
export function Moderation() {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const key = ['rbs', 'bookings', 'unprocessed'];

  const query = useQuery({ queryKey: key, queryFn: api.getUnprocessedBookings, retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refusalReason, setRefusalReason] = useState('');

  const processMut = useMutation({
    mutationFn: ({ b, status, reason }: { b: Booking; status: number; reason?: string }) =>
      api.processBooking(b.resource_id, b.id, { status, ...(reason ? { refusal_reason: reason } : {}) }),
    onSuccess: () => {
      setRefusingId(null);
      setRefusalReason('');
      invalidate();
    },
  });

  const bookings = query.data ?? [];

  return (
    <div>
      <p>
        <Link to="/">← {t('rbs.back.to.resources', { defaultValue: 'Retour aux ressources' })}</Link>
      </p>
      <h1 className="mb-16">{t('rbs.moderation.title', { defaultValue: 'Modération des réservations' })}</h1>

      {query.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {query.isError && (
        <div className="alert alert-info" role="alert">
          {t('rbs.moderation.forbidden', { defaultValue: 'Vous n’êtes modérateur d’aucune ressource.' })}
        </div>
      )}
      {!query.isLoading && !query.isError && bookings.length === 0 && (
        <p className="text-muted">
          {t('rbs.moderation.empty', { defaultValue: 'Aucune réservation en attente de traitement.' })}
        </p>
      )}

      {bookings.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('rbs.booking.reason', { defaultValue: 'Motif' })}</th>
              <th>{t('rbs.booking.owner', { defaultValue: 'Demandeur' })}</th>
              <th>{t('rbs.booking.start', { defaultValue: 'Début' })}</th>
              <th>{t('rbs.booking.end', { defaultValue: 'Fin' })}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.booking_reason}</td>
                <td>{b.owner_name ?? ''}</td>
                <td>{formatDateTime(b.start_date)}</td>
                <td>{formatDateTime(b.end_date)}</td>
                <td className="text-end">
                  {refusingId === b.id ? (
                    <div className="d-flex gap-8 align-items-center justify-content-end">
                      <input
                        type="text"
                        className="form-control"
                        style={{ maxWidth: 240 }}
                        value={refusalReason}
                        onChange={(e) => setRefusalReason(e.target.value)}
                        placeholder={t('rbs.moderation.reason.placeholder', { defaultValue: 'Motif du refus' })}
                        aria-label={t('rbs.moderation.reason', { defaultValue: 'Motif du refus' })}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={processMut.isPending}
                        onClick={() => processMut.mutate({ b, status: BOOKING_STATUS.REFUSED, reason: refusalReason.trim() })}
                      >
                        {t('rbs.moderation.confirm.refuse', { defaultValue: 'Confirmer le refus' })}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setRefusingId(null)}>
                        {t('rbs.cancel', { defaultValue: 'Annuler' })}
                      </button>
                    </div>
                  ) : (
                    <div className="d-flex gap-8 justify-content-end">
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={processMut.isPending}
                        onClick={() => processMut.mutate({ b, status: BOOKING_STATUS.VALIDATED })}
                      >
                        {t('rbs.moderation.validate', { defaultValue: 'Valider' })}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => {
                          setRefusalReason('');
                          setRefusingId(b.id);
                        }}
                      >
                        {t('rbs.moderation.refuse', { defaultValue: 'Refuser' })}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Moderation;
