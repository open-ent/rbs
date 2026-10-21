import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Availability, Booking, Resource } from '../api';
import { AvailabilityValues, availabilityBody, checkAvailability, conflictsAfterChange, emptyValues, fromAvailability, rulesAfterDelete, rulesAfterSave, toAvailability } from '../availabilityForm';
import { treatResource } from '../bookingTreatment';
import { WEEK_ORDER } from '../bookingForm';
import { Modal } from '../screens/Modal';
import { formatDateTime } from '../utils';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Props {
  /** Ressource enregistrée (la saisie de périodes exige qu'elle existe). */
  resource: Resource;
  /** Mode choisi dans le formulaire (pas encore forcément enregistré) : décide si l'on saisit des disponibilités ou des indisponibilités. */
  isAvailable: boolean;
  /** Quantité choisie dans le formulaire : plafond d'une période. */
  quantity: number;
  canTreat: (b: Booking) => boolean;
}

type Pending = { kind: 'save'; editingId: number | null; values: AvailabilityValues } | { kind: 'delete'; rule: Availability };

/**
 * Périodes de disponibilité (ressource fermée par défaut) ou d'indisponibilité (ressource ouverte par défaut), dans le
 * formulaire d'une ressource, comme l'AngularJS : tableau (dates, créneau horaire, jours, quantité), ajout, modification
 * en ligne, suppression avec confirmation. Quand une période mettrait des réservations en conflit, elles sont listées
 * et seraient suspendues : l'usager confirme, puis la ressource est réévaluée.
 */
export function AvailabilityPanel({ resource, isAvailable, quantity, canTreat }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const rulesQuery = useQuery({ queryKey: ['rbs', 'availability', resource.id], queryFn: () => api.getResourceAvailability(resource.id) });
  const bookingsQuery = useQuery({ queryKey: ['rbs', 'resource', resource.id, 'bookings'], queryFn: () => api.getResourceBookings(resource.id) });
  // Seules les périodes du mode courant sont éditées : indisponibilités si la ressource est ouverte, sinon disponibilités.
  const rules = (rulesQuery.data ?? []).filter((r) => r.is_unavailability === isAvailable);
  const all = rulesQuery.data ?? [];

  const [values, setValues] = useState<AvailabilityValues>(() => emptyValues());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<{ action: Pending; conflicts: Booking[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const model = { quantity: Math.max(1, quantity), is_available: isAvailable };
  const reset = () => {
    setValues(emptyValues());
    setEditingId(null);
    setErrors([]);
  };

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['rbs', 'availability', resource.id] }), qc.invalidateQueries({ queryKey: ['rbs', 'resource', resource.id, 'bookings'] }), qc.invalidateQueries({ queryKey: ['rbs', 'agenda'] })]);
  };

  /** Écrit la période puis réévalue les réservations de la ressource (suspension des conflits, reprise des autres). */
  const apply = async (action: Pending) => {
    setBusy(true);
    try {
      if (action.kind === 'save') {
        const body = availabilityBody(resource.id, isAvailable, action.values, IANA);
        if (action.editingId != null) await api.updateAvailability(resource.id, action.editingId, body);
        else await api.createAvailability(resource.id, body);
      } else {
        await api.deleteAvailability(resource.id, action.rule.id);
      }
      await refresh();
      await treatResource({ ...resource, quantity: model.quantity, is_available: isAvailable }, canTreat);
      await refresh();
      setPending(null);
      reset();
    } catch (e) {
      setErrors([e instanceof Error && e.message ? 'rbs.error.technical' : 'rbs.error.technical']);
    } finally {
      setBusy(false);
    }
  };

  const bookings = bookingsQuery.data ?? [];
  const submit = async () => {
    const found = checkAvailability(values);
    setErrors(found);
    if (found.length) return;
    const saved = toAvailability(editingId ?? -1, resource.id, isAvailable, values);
    const plan = conflictsAfterChange(bookings, model, rulesAfterSave(all, saved));
    const action: Pending = { kind: 'save', editingId, values };
    if (plan.suspend.length > 0) setPending({ action, conflicts: plan.suspend });
    else await apply(action);
  };
  const askDelete = async (rule: Availability) => {
    const plan = conflictsAfterChange(bookings, model, rulesAfterDelete(all, rule.id));
    const action: Pending = { kind: 'delete', rule };
    setPending({ action, conflicts: plan.suspend });
  };
  const edit = (rule: Availability) => {
    setEditingId(rule.id);
    setValues(fromAvailability(rule));
    setErrors([]);
  };

  const setDay = (n: number) => setValues((v) => ({ ...v, days: v.days.map((d, i) => (i === n ? !d : d)) }));
  const headerQuantity = isAvailable ? t('rbs.resource.edit.tab.quantity.unavailability', { defaultValue: 'Quantité rendue indisponible' }) : t('rbs.resource.edit.tab.quantity.availability', { defaultValue: 'Quantité rendue disponible' });
  const dayLetter = (n: number) => t(`rbs.resource.edit.available.days.${DAY_KEYS[n]}`, { defaultValue: DAY_KEYS[n][0].toUpperCase() });
  const color = isAvailable ? '#c62828' : '#2e7d32';
  const day = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

  const form = (
    <tr data-availability-form={editingId ?? 'new'}>
      <td>
        <div className="d-flex gap-8 flex-wrap">
          <label className="d-flex align-items-center gap-4">
            {t('rbs.resource.edit.available.date.from', { defaultValue: 'Du ' })}
            <input type="date" aria-label={t('rbs.availability.from', { defaultValue: 'Du' })} value={values.startDate} onChange={(e) => setValues({ ...values, startDate: e.target.value })} />
          </label>
          <label className="d-flex align-items-center gap-4">
            {t('rbs.resource.edit.available.date.to', { defaultValue: 'Au ' })}
            <input type="date" aria-label={t('rbs.availability.to', { defaultValue: 'Au' })} value={values.endDate} onChange={(e) => setValues({ ...values, endDate: e.target.value })} />
          </label>
        </div>
      </td>
      <td>
        <div className="d-flex gap-8 flex-wrap">
          <label className="d-flex align-items-center gap-4">
            {t('rbs.resource.edit.available.time.from', { defaultValue: 'De ' })}
            <input type="time" aria-label={t('rbs.availability.time.from', { defaultValue: 'Heure de début' })} value={values.startTime} onChange={(e) => setValues({ ...values, startTime: e.target.value })} />
          </label>
          <label className="d-flex align-items-center gap-4">
            {t('rbs.resource.edit.available.time.at', { defaultValue: 'À ' })}
            <input type="time" aria-label={t('rbs.availability.time.to', { defaultValue: 'Heure de fin' })} value={values.endTime} onChange={(e) => setValues({ ...values, endTime: e.target.value })} />
          </label>
        </div>
      </td>
      <td>
        <div className="d-flex gap-8 flex-wrap" role="group" aria-label={t('rbs.resource.edit.tab.days', { defaultValue: 'Jours' })}>
          {WEEK_ORDER.map((n) => (
            <label key={n} className="d-flex align-items-center gap-4" style={{ color }}>
              <input type="checkbox" checked={values.days[n]} onChange={() => setDay(n)} aria-label={t(`rbs.booking.edit.period.days.${n}`, { defaultValue: DAY_KEYS[n] })} />
              {dayLetter(n)}
            </label>
          ))}
        </div>
      </td>
      <td>
        <input type="number" min={1} max={model.quantity} style={{ width: 70 }} aria-label={headerQuantity} value={values.quantity} onChange={(e) => setValues({ ...values, quantity: Math.min(model.quantity, Math.max(1, Number(e.target.value) || 1)) })} /> / {model.quantity}
      </td>
      <td className="text-nowrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>
          {editingId != null ? t('rbs.save', { defaultValue: 'Enregistrer' }) : t('rbs.availability.add.button', { defaultValue: 'Ajouter' })}
        </button>{' '}
        {editingId != null && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
            {t('rbs.cancel', { defaultValue: 'Annuler' })}
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div data-availability-panel className="mt-8">
      {pending && (
        <Modal
          title={
            pending.action.kind === 'delete'
              ? isAvailable
                ? t('rbs.unavailability.delete.title', { defaultValue: "Suppression d'un indisponibilité" })
                : t('rbs.availability.delete.title', { defaultValue: 'Suppression de disponibilité' })
              : isAvailable
                ? t('rbs.unavailability.save.title', { defaultValue: "Modification d'une indisponibilité" })
                : t('rbs.availability.save.title', { defaultValue: "Modification d'une disponibilité" })
          }
          onClose={() => !busy && setPending(null)}
        >
          <div data-availability-confirm>
            {pending.action.kind === 'delete' && <p>{t('rbs.availability.delete.confirmation', { defaultValue: 'Êtes vous sûrs de vouloir supprimer cette période ?' })}</p>}
            {pending.conflicts.length > 0 && (
              <>
                <p>
                  <strong>{t('rbs.availability.save.warning', { defaultValue: 'Attention' })}</strong> — {t('rbs.booking.suspended', { defaultValue: 'Cela entrainera la suspension des réservations concernées.' })} {t('rbs.booking.manager.decision', { defaultValue: 'Les gestionnaires devront définir les réservations à conserver.' })}
                </p>
                <p>{t('rbs.availability.save.conflicting.bookings', { defaultValue: 'Réservations concernées :' })}</p>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t('rbs.resource.edit.tab.owner', { defaultValue: 'Propriétaire' })}</th>
                      <th>{t('rbs.resource.edit.tab.date.start', { defaultValue: 'Date début' })}</th>
                      <th>{t('rbs.resource.edit.tab.date.end', { defaultValue: 'Date fin' })}</th>
                      <th>{t('rbs.resource.edit.tab.quantity', { defaultValue: 'Quantité' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.conflicts.map((b) => (
                      <tr key={b.id}>
                        <td>{b.owner_name}</td>
                        <td>{formatDateTime(b.start_date)}</td>
                        <td>{formatDateTime(b.end_date)}</td>
                        <td>{b.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPending(null)}>
              {t('rbs.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => apply(pending.action)}>
              {pending.action.kind === 'delete' ? t('rbs.delete', { defaultValue: 'Supprimer' }) : t('rbs.save', { defaultValue: 'Enregistrer' })}
            </button>
          </div>
        </Modal>
      )}
      {rules.length > 0 && (
        <p className="mb-4">
          {t('rbs.booking.edit.availabilities.resource.is', { defaultValue: 'La ressource est' })}{' '}
          <strong>{isAvailable ? t('rbs.booking.edit.availabilities.unavailable', { defaultValue: 'indisponible' }) : t('rbs.booking.edit.availabilities.available', { defaultValue: 'disponible' })}</strong>
          {t('rbs.booking.edit.availabilities.timeslots', { defaultValue: ' sur les créneaux suivants :' })}
        </p>
      )}
      <table className="table table-sm" data-availability-table>
        <thead>
          <tr>
            <th>{t('rbs.resource.edit.tab.date.start', { defaultValue: 'Date début' })}</th>
            <th>{t('rbs.resource.edit.tab.timeslot', { defaultValue: 'Créneau' })}</th>
            <th>{t('rbs.resource.edit.tab.days', { defaultValue: 'Jours' })}</th>
            <th>{headerQuantity}</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rules.map((r) =>
            editingId === r.id ? (
              <FragmentRow key={r.id}>{form}</FragmentRow>
            ) : (
              <tr key={r.id} data-availability-row={r.id}>
                <td>
                  {t('rbs.resource.edit.available.date.from', { defaultValue: 'Du ' })}
                  {day(r.start_date)} {t('rbs.resource.edit.available.date.to', { defaultValue: 'Au ' })}
                  {day(r.end_date)}
                </td>
                <td>
                  {t('rbs.resource.edit.available.time.from', { defaultValue: 'De ' })}
                  {r.start_time.slice(0, 5)} {t('rbs.resource.edit.available.time.at', { defaultValue: 'À ' })}
                  {r.end_time.slice(0, 5)}
                </td>
                <td>
                  {WEEK_ORDER.map((n) => (
                    <span key={n} className="me-4" style={{ fontWeight: r.days[n] === '1' ? 700 : 400, color: r.days[n] === '1' ? color : '#aaa' }}>
                      {dayLetter(n)}
                    </span>
                  ))}
                </td>
                <td>
                  {r.quantity} / {model.quantity}
                </td>
                <td className="text-nowrap">
                  <button type="button" className="btn btn-link p-0 me-8" onClick={() => edit(r)}>
                    {t('rbs.list.edit', { defaultValue: 'Modifier' })}
                  </button>
                  <button type="button" className="btn btn-link p-0 text-danger" onClick={() => askDelete(r)}>
                    {t('rbs.delete', { defaultValue: 'Supprimer' })}
                  </button>
                </td>
              </tr>
            ),
          )}
          {editingId == null && form}
        </tbody>
      </table>
      {errors.length > 0 && (
        <div role="alert" data-availability-errors>
          {errors.map((e) => (
            <div key={e} className="alert alert-warning mb-8">
              {t(e, { defaultValue: e })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sert à clef une ligne de formulaire insérée dans la liste (React exige une clef sur les éléments répétés). */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default AvailabilityPanel;
