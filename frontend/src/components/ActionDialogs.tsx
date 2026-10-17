import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, Booking, Resource } from '../api';
import { StatusIcon } from './CalendarParts';
import { treatResource } from '../bookingTreatment';
import { isPeriodic } from '../calendar';
import { Modal } from '../screens/Modal';
import { formatDateTime } from '../utils';

export type ActionKind = 'delete' | 'delete-occurrence' | 'validate' | 'refuse';

interface Props {
  kind: ActionKind;
  /** Réservations concernées (déjà filtrées : à venir, sur lesquelles l'usager peut agir). */
  bookings: Booking[];
  /** Pour `delete-occurrence` : l'occurrence visée, repérée d'une * dans le tableau. */
  current?: Booking;
  /** Lignes du tableau si elles diffèrent des réservations traitées (ex. toute la série, dont on ne supprime que la suite). */
  context?: Booking[];
  resourceName: (b: Booking) => string;
  colorOf: (b: Booking) => string;
  resourceOf: (b: Booking) => Resource | undefined;
  /** Peut-on retoucher cette réservation lors du traitement automatique (la sienne, ou une que l'on valide) ? */
  canTreat: (b: Booking) => boolean;
  onClose: () => void;
  /** Appelée une fois l'action faite (au moins une réservation traitée) : rafraîchir et vider la sélection. */
  onDone: () => void;
}

const TITLE: Record<ActionKind, [string, string]> = {
  delete: ['rbs.booking.delete.confirm.one', 'Suppression de la réservation'],
  'delete-occurrence': ['rbs.booking.delete.confirm.one', 'Suppression de la réservation'],
  validate: ['rbs.booking.validate.one', 'Valider la réservation ?'],
  refuse: ['rbs.booking.refuse.one', 'Refuser la réservation ?'],
};

/**
 * Fenêtre de confirmation d'une action sur des réservations (parité IHM AngularJS) : tableau des réservations
 * concernées puis action — suppression (avec, pour une occurrence de série, le choix « cette occurrence » / « tout
 * supprimer » à partir de celle-ci), validation, ou refus avec motif. Les erreurs de chaque réservation sont listées ;
 * après une suppression, les réservations de la ressource sont réévaluées (suspension des conflits, reprise des autres).
 */
export function ActionDialog({ kind, bookings, current, context, resourceName, colorOf, resourceOf, canTreat, onClose, onDone }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const many = bookings.length > 1;
  const sorted = [...(context ?? bookings)].sort((a, b) => a.id - b.id);

  const run = async (job: (b: Booking) => Promise<unknown>, after?: () => Promise<void>) => {
    setProcessing(true);
    setErrors([]);
    const results = await Promise.allSettled(bookings.map(job));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason instanceof ApiError ? r.reason.key : 'rbs.error.technical'));
    if (results.some((r) => r.status === 'fulfilled')) {
      try {
        await after?.();
      } catch {
        // le traitement automatique est une commodité : jamais bloquant
      }
      await qc.invalidateQueries({ queryKey: ['rbs'] });
    }
    setProcessing(false);
    if (failed.length === 0) onDone();
    else setErrors([...new Set(failed)]);
  };

  /** Ressources dont des réservations ont disparu : on les réévalue une fois chacune. */
  const treatAfterDelete = async () => {
    const resources = [...new Map(bookings.map((b) => [b.resource_id, resourceOf(b)])).values()].filter((r): r is Resource => !!r);
    await Promise.all(resources.map((r) => treatResource(r, canTreat, undefined)));
  };

  const doDelete = (thisAndAfter: boolean) => run((b) => api.deleteBooking(b.resource_id, b.id, thisAndAfter), treatAfterDelete);
  const doValidate = () => run((b) => api.processBooking(b.resource_id, b.id, { status: 2 }));
  const doRefuse = () => run((b) => api.processBooking(b.resource_id, b.id, { status: 3, refusal_reason: reason.trim() }));

  const title = many && (kind === 'delete' || kind === 'validate' || kind === 'refuse')
    ? kind === 'delete'
      ? t('rbs.booking.delete.confirm.multi', { defaultValue: 'Suppression des réservations sélectionnées' })
      : kind === 'validate'
        ? t('rbs.booking.validate.multi', { defaultValue: 'Valider les [[count]] réservations sélectionnées ?', count: bookings.length })
        : t('rbs.booking.refuse.multi', { defaultValue: 'Refuser les [[count]] réservations sélectionnées ?', count: bookings.length })
    : t(TITLE[kind][0], { defaultValue: TITLE[kind][1] });

  return (
    <Modal title={title} onClose={processing ? () => undefined : onClose}>
      <div data-action-dialog={kind} style={{ maxHeight: '50vh', overflow: 'auto' }}>
        <table className="table table-sm">
          <thead>
            <tr>
              <th aria-hidden />
              <th>{t('rbs.booking.headers.owner', { defaultValue: 'Demandeur' })}</th>
              <th>{t('rbs.booking.headers.resource', { defaultValue: 'Ressource' })}</th>
              <th>{t('rbs.booking.headers.start_date', { defaultValue: 'Date de début' })}</th>
              <th>{t('rbs.booking.headers.end_date', { defaultValue: 'Date de fin' })}</th>
              {(kind === 'delete' || kind === 'delete-occurrence') && <th>{t('rbs.booking.headers.status', { defaultValue: 'État' })}</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  {t('rbs.bookings.selected.empty', { defaultValue: 'Aucune réservation sélectionnée' })}
                </td>
              </tr>
            )}
            {sorted.map((b) => (
              <tr key={b.id} data-action-row={b.id}>
                <td style={{ background: colorOf(b), width: 8, padding: 0 }}>{current?.id === b.id && <span style={{ color: '#fff' }}>*</span>}</td>
                <td>
                  {isPeriodic(b) && <span aria-hidden>↻ </span>}
                  {b.owner_name}
                </td>
                <td>{resourceName(b)}</td>
                <td>{formatDateTime(b.start_date)}</td>
                <td>{formatDateTime(b.end_date)}</td>
                {(kind === 'delete' || kind === 'delete-occurrence') && (
                  <td>
                    <StatusIcon status={b.status} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {kind === 'delete-occurrence' && (
          <p className="text-muted">
            <em style={{ color: 'red' }}>*</em> {t('rbs.booking.periodic.delete.details', { defaultValue: 'Le créneau sélectionné' })}
          </p>
        )}
        {kind === 'refuse' && (
          <div className="mb-8">
            <label htmlFor="rbs-refuse-reason" className="form-label">
              {t('rbs.booking.refuse.reason.label', { defaultValue: 'Motif de refus' })}
            </label>
            <textarea id="rbs-refuse-reason" className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </div>
      {errors.length > 0 && (
        <div role="alert" data-action-errors>
          {errors.map((e) => (
            <div key={e} className="alert alert-warning mb-8">
              {t(e, { defaultValue: e })}
            </div>
          ))}
        </div>
      )}
      <div className="d-flex justify-content-end gap-8 mt-12">
        <button type="button" className="btn btn-secondary" disabled={processing} onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        {processing ? (
          <button type="button" className="btn btn-primary" disabled>
            {kind === 'delete' || kind === 'delete-occurrence' ? t('rbs.deleting', { defaultValue: 'Suppression en cours' }) : t('rbs.processing', { defaultValue: 'Enregistrement en cours' })}
          </button>
        ) : (
          <>
            {kind === 'delete' && (
              <button type="button" className="btn btn-primary" disabled={bookings.length === 0} onClick={() => doDelete(false)}>
                {t('rbs.delete', { defaultValue: 'Supprimer' })}
              </button>
            )}
            {kind === 'delete-occurrence' && (
              <>
                <button type="button" className="btn btn-primary" disabled={bookings.length === 0} onClick={() => doDelete(false)}>
                  {t('rbs.booking.periodic.delete.this_occurrence', { defaultValue: 'Supprimer' })}
                </button>
                <button type="button" className="btn btn-primary" disabled={bookings.length === 0} onClick={() => doDelete(true)}>
                  {t('rbs.booking.periodic.delete.this_and_future_occurrence', { defaultValue: 'Tout supprimer' })}
                </button>
              </>
            )}
            {kind === 'validate' && (
              <button type="button" className="btn btn-primary" disabled={bookings.length === 0} onClick={doValidate}>
                {t('rbs.validate', { defaultValue: 'Valider' })}
              </button>
            )}
            {kind === 'refuse' && (
              <button type="button" className="btn btn-danger" disabled={bookings.length === 0} onClick={doRefuse}>
                {t('rbs.refuse', { defaultValue: 'Refuser' })}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default ActionDialog;
