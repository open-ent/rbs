import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { api, Slot } from '../api';
import { formatDateTime, localInputToUnix, statusBadgeClass, statusLabel } from '../utils';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

/** Jours de la semaine, dans l'ordre d'affichage FR (lundi→dimanche), avec l'index backend (0=dimanche). */
const DAYS = [
  { idx: 1, label: 'Lun' },
  { idx: 2, label: 'Mar' },
  { idx: 3, label: 'Mer' },
  { idx: 4, label: 'Jeu' },
  { idx: 5, label: 'Ven' },
  { idx: 6, label: 'Sam' },
  { idx: 0, label: 'Dim' },
];

/** Détail d'une ressource : infos, liste des réservations, création (simple ou périodique). */
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

  // Champs communs
  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [formError, setFormError] = useState('');
  // Périodique
  const [periodic, setPeriodic] = useState(false);
  const [periodicity, setPeriodicity] = useState(1);
  const [days, setDays] = useState<boolean[]>(Array(7).fill(false));
  const [endMode, setEndMode] = useState<'date' | 'occurrences'>('occurrences');
  const [periodicEnd, setPeriodicEnd] = useState('');
  const [occurrences, setOccurrences] = useState(1);

  const resetForm = () => {
    setReason('');
    setStart('');
    setEnd('');
    setQuantity(1);
    setPeriodic(false);
    setPeriodicity(1);
    setDays(Array(7).fill(false));
    setEndMode('occurrences');
    setPeriodicEnd('');
    setOccurrences(1);
    setFormError('');
  };

  const createMut = useMutation({
    mutationFn: () => {
      const slot: Slot = {
        start_date: localInputToUnix(start),
        end_date: localInputToUnix(end),
        iana: IANA,
      };
      if (!periodic) {
        return api.createBooking(id, { booking_reason: reason.trim(), quantity, slots: [slot] });
      }
      return api.createPeriodicBooking(id, {
        booking_reason: reason.trim(),
        quantity,
        slots: [slot],
        periodicity,
        days,
        iana: IANA,
        ...(endMode === 'date'
          ? { periodic_end_date: localInputToUnix(`${periodicEnd}T23:59`) }
          : { occurrences }),
      });
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
    onError: () =>
      setFormError(t('rbs.booking.error', { defaultValue: 'La réservation a échoué (créneau indisponible ou invalide).' })),
  });

  const deleteMut = useMutation({
    mutationFn: (bookingId: number) => api.deleteBooking(id, bookingId),
    onSuccess: invalidate,
  });

  const toggleDay = (dayIdx: number) =>
    setDays((prev) => prev.map((v, i) => (i === dayIdx ? !v : v)));

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
    if (periodic) {
      if (!days.some(Boolean)) {
        setFormError(t('rbs.booking.nodays', { defaultValue: 'Sélectionnez au moins un jour de la semaine.' }));
        return;
      }
      if (endMode === 'date' && !periodicEnd) {
        setFormError(t('rbs.booking.noend', { defaultValue: 'Renseignez une date de fin de périodicité.' }));
        return;
      }
    }
    setFormError('');
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

      {/* Formulaire de réservation (simple ou périodique) */}
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

        {/* Périodicité (si la ressource l'autorise) */}
        {resource?.periodic_booking && (
          <div className="mt-12">
            <div className="form-check">
              <input
                id="rbs-periodic"
                type="checkbox"
                className="form-check-input"
                checked={periodic}
                onChange={(e) => setPeriodic(e.target.checked)}
              />
              <label htmlFor="rbs-periodic" className="form-check-label">
                {t('rbs.booking.periodic', { defaultValue: 'Réservation périodique' })}
              </label>
            </div>

            {periodic && (
              <div className="ms-16 mt-8">
                <div className="d-flex align-items-center gap-8 mb-8">
                  <label htmlFor="rbs-periodicity" className="form-label m-0">
                    {t('rbs.booking.every', { defaultValue: 'Toutes les' })}
                  </label>
                  <input
                    id="rbs-periodicity"
                    type="number"
                    min={1}
                    className="form-control"
                    style={{ width: 80 }}
                    value={periodicity}
                    onChange={(e) => setPeriodicity(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span>{t('rbs.booking.weeks', { defaultValue: 'semaine(s)' })}</span>
                </div>

                <div className="mb-8">
                  <span className="form-label d-block">{t('rbs.booking.days', { defaultValue: 'Jours' })}</span>
                  <div className="d-flex gap-8 flex-wrap">
                    {DAYS.map((d) => (
                      <label key={d.idx} className="d-flex align-items-center gap-4">
                        <input type="checkbox" checked={days[d.idx]} aria-label={d.label} onChange={() => toggleDay(d.idx)} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="d-flex align-items-center gap-16 flex-wrap">
                  <label className="d-flex align-items-center gap-4">
                    <input type="radio" name="rbs-endmode" checked={endMode === 'occurrences'} onChange={() => setEndMode('occurrences')} />
                    {t('rbs.booking.after', { defaultValue: 'Après' })}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="form-control"
                    style={{ width: 90 }}
                    disabled={endMode !== 'occurrences'}
                    value={occurrences}
                    aria-label={t('rbs.booking.occurrences', { defaultValue: 'Nombre d’occurrences' })}
                    onChange={(e) => setOccurrences(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span>{t('rbs.booking.occurrences.unit', { defaultValue: 'occurrence(s)' })}</span>

                  <label className="d-flex align-items-center gap-4">
                    <input type="radio" name="rbs-endmode" checked={endMode === 'date'} onChange={() => setEndMode('date')} />
                    {t('rbs.booking.until', { defaultValue: "Jusqu'au" })}
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    style={{ width: 170 }}
                    disabled={endMode !== 'date'}
                    value={periodicEnd}
                    aria-label={t('rbs.booking.enddate', { defaultValue: 'Date de fin' })}
                    onChange={(e) => setPeriodicEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

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
