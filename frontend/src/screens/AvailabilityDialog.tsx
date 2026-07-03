import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { bitstringToDayLabels, dateInputToUnix, formatDateOnly, shortTime, timeInputToSeconds } from '../utils';
import { Modal } from './Modal';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
const DAYS = [
  { idx: 1, label: 'Lun' },
  { idx: 2, label: 'Mar' },
  { idx: 3, label: 'Mer' },
  { idx: 4, label: 'Jeu' },
  { idx: 5, label: 'Ven' },
  { idx: 6, label: 'Sam' },
  { idx: 0, label: 'Dim' },
];

/** Gestion des disponibilités / indisponibilités d'une ressource. */
export function AvailabilityDialog({ resourceId, onClose }: { resourceId: number; onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const key = ['rbs', 'resource', resourceId, 'availability'];

  const query = useQuery({ queryKey: key, queryFn: () => api.getResourceAvailability(resourceId) });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [days, setDays] = useState<boolean[]>(Array(7).fill(false));
  const [quantity, setQuantity] = useState(1);
  const [isUnavailability, setIsUnavailability] = useState(false);
  const [formError, setFormError] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      api.createAvailability(resourceId, {
        resource_id: resourceId,
        is_unavailability: isUnavailability,
        start_date: dateInputToUnix(startDate),
        end_date: dateInputToUnix(endDate),
        start_time: timeInputToSeconds(startTime),
        end_time: timeInputToSeconds(endTime),
        iana: IANA,
        days,
        quantity,
      }),
    onSuccess: () => {
      setStartDate('');
      setEndDate('');
      setDays(Array(7).fill(false));
      setFormError('');
      invalidate();
    },
    onError: () => setFormError(t('rbs.error', { defaultValue: 'Une erreur est survenue.' })),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteAvailability(resourceId, id),
    onSuccess: invalidate,
  });

  const toggleDay = (i: number) => setDays((p) => p.map((v, k) => (k === i ? !v : v)));

  const onAdd = () => {
    if (!startDate || !endDate || !days.some(Boolean)) {
      setFormError(t('rbs.availability.incomplete', { defaultValue: 'Renseignez les dates et au moins un jour.' }));
      return;
    }
    createMut.mutate();
  };

  const list = query.data ?? [];

  return (
    <Modal title={t('rbs.availability.title', { defaultValue: 'Disponibilités de la ressource' })} onClose={onClose}>
      {/* Liste existante */}
      {query.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {!query.isLoading && list.length === 0 && (
        <p className="text-muted">
          {t('rbs.availability.empty', { defaultValue: 'Aucune plage définie : la ressource est réservable en permanence.' })}
        </p>
      )}
      {list.length > 0 && (
        <ul className="list-unstyled mb-16">
          {list.map((a) => (
            <li key={a.id} className="py-8 border-bottom d-flex justify-content-between align-items-center">
              <span>
                <span className={`badge ${a.is_unavailability ? 'bg-danger' : 'bg-success'} me-8`}>
                  {a.is_unavailability
                    ? t('rbs.availability.unavailable', { defaultValue: 'Indispo' })
                    : t('rbs.availability.available', { defaultValue: 'Dispo' })}
                </span>
                {formatDateOnly(a.start_date)} → {formatDateOnly(a.end_date)} · {shortTime(a.start_time)}–{shortTime(a.end_time)} ·{' '}
                {bitstringToDayLabels(a.days)}
              </span>
              <button
                type="button"
                className="btn btn-link p-0 text-danger"
                aria-label={t('rbs.delete', { defaultValue: 'Supprimer' })}
                onClick={() => deleteMut.mutate(a.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ajout */}
      <h3 style={{ fontSize: 16 }} className="mb-8">
        {t('rbs.availability.add', { defaultValue: 'Ajouter une plage' })}
      </h3>
      <div className="d-flex gap-8 flex-wrap mb-8">
        <div>
          <label htmlFor="av-sd" className="form-label">{t('rbs.availability.from', { defaultValue: 'Du' })}</label>
          <input id="av-sd" type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="av-ed" className="form-label">{t('rbs.availability.to', { defaultValue: 'Au' })}</label>
          <input id="av-ed" type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="av-st" className="form-label">{t('rbs.availability.starttime', { defaultValue: 'De' })}</label>
          <input id="av-st" type="time" className="form-control" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="av-et" className="form-label">{t('rbs.availability.endtime', { defaultValue: 'À' })}</label>
          <input id="av-et" type="time" className="form-control" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
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
      <div className="d-flex gap-16 align-items-center mb-8">
        <div style={{ maxWidth: 120 }}>
          <label htmlFor="av-qty" className="form-label">{t('rbs.booking.quantity', { defaultValue: 'Quantité' })}</label>
          <input id="av-qty" type="number" min={1} className="form-control" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="form-check mt-24">
          <input id="av-unavail" type="checkbox" className="form-check-input" checked={isUnavailability} onChange={(e) => setIsUnavailability(e.target.checked)} />
          <label htmlFor="av-unavail" className="form-check-label">
            {t('rbs.availability.isunavailable', { defaultValue: 'Plage d’indisponibilité' })}
          </label>
        </div>
      </div>

      {formError && (
        <div className="alert alert-warning" role="alert">
          {formError}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8 mt-12">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('rbs.close', { defaultValue: 'Fermer' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={createMut.isPending} onClick={onAdd}>
          {t('rbs.availability.add', { defaultValue: 'Ajouter une plage' })}
        </button>
      </div>
    </Modal>
  );
}

export default AvailabilityDialog;
