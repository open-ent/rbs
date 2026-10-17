import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, Booking } from '../api';
import { isOver, STATUS } from '../bookingActions';
import { canAct, isPast } from '../bookingList';
import { seriesStatus } from '../bookingList';
import { bookingColor, typeColors } from '../calendar';
import { ActionDialog, ActionKind } from '../components/ActionDialogs';
import { StatusIcon } from '../components/CalendarParts';
import { useRbsContext } from '../hooks/useRbsContext';
import { dateLocale } from '../locale';
import { rightsOn } from '../rights';
import { formatDateTime, parseBackendDate } from '../utils';

/** Date longue (« mardi 20 octobre 2026 - 10h00 »), dans la langue de la session. */
function longDate(iso?: string | null): string {
  if (!iso) return '';
  const d = parseBackendDate(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} - ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Texte brut d'un champ saisi en HTML (description, motif de refus) : jamais de balise interprétée. */
const plain = (html?: string | null): string => (html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : '');

/**
 * Détail d'une réservation (parité IHM AngularJS), ouvert par le calendrier, la liste ou une adresse
 * (`#/booking/12`, ou `#/booking/12/2026-10-20` pour une occurrence de série) : la demande (dates, demandeur, motif),
 * la ressource, et le traitement (en attente de qui, validée ou refusée par qui, motif du refus) ; pour une série, le
 * tableau de ses créneaux (l'occurrence ouverte repérée d'une *). Actions : modifier, supprimer (une occurrence ou toute
 * la série), valider, refuser — selon les droits et tant que la réservation n'est pas terminée.
 */
export function BookingDetail() {
  const { t } = useTranslation(['rbs', 'common']);
  const navigate = useNavigate();
  const ctx = useRbsContext();
  const { bookingId } = useParams();
  const [dialog, setDialog] = useState<null | { kind: ActionKind; bookings: Booking[]; context?: Booking[] }>(null);
  const [openRefusal, setOpenRefusal] = useState<Set<number>>(new Set());

  const booking = useQuery({ queryKey: ['rbs', 'booking', bookingId], queryFn: () => api.getBooking(Number(bookingId)), enabled: !!bookingId });
  const b = booking.data ?? null;
  // Une occurrence s'ouvre avec sa série : la mère porte la périodicité, les occurrences le détail créneau par créneau.
  const rootId = b ? (b.parent_booking_id ?? b.id) : 0;
  const root = useQuery({ queryKey: ['rbs', 'booking', String(rootId)], queryFn: () => api.getBooking(rootId), enabled: !!b && b.parent_booking_id != null });
  const mother = b && b.parent_booking_id != null ? (root.data ?? null) : b;
  const series = useQuery({ queryKey: ['rbs', 'series', rootId], queryFn: () => api.getSeriesSlots(rootId), enabled: !!mother?.is_periodic });
  const types = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resources = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const resource = (resources.data ?? []).find((r) => r.id === b?.resource_id);
  const type = (types.data ?? []).find((x) => x.id === resource?.type_id);
  const moderators = useQuery({ queryKey: ['rbs', 'moderators', type?.id], queryFn: () => api.getTypeModerators(type!.id), enabled: !!type?.validation });

  const slots = useMemo(() => [...(series.data ?? [])].sort((x, y) => parseBackendDate(x.start_date).getTime() - parseBackendDate(y.start_date).getTime()), [series.data]);
  const colors = useMemo(() => typeColors(types.data ?? []), [types.data]);
  const resourceMap = useMemo(() => new Map((resources.data ?? []).map((r) => [r.id, r])), [resources.data]);

  if (booking.isLoading) return <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>;
  if (booking.isError || !b) {
    // Réponse vide : réservation inexistante ou non accessible.
    return (
      <div className="alert alert-warning" role="alert">
        {t('rbs.booking.notfound', { defaultValue: "Cette réservation n'existe plus ou vous n'y avez pas accès." })} <Link to="/">{t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link>
      </div>
    );
  }

  const isSeries = !!mother?.is_periodic;
  const status = isSeries ? seriesStatus(mother!, slots) : b.status;
  const rights = type && resource ? rightsOn(type, ctx.me, resource) : { contrib: false, process: false, manage: false };
  const mayAct = canAct(b, ctx.me.userId, rights);
  const color = bookingColor(b, resourceMap, colors);
  const nameOf = () => resource?.name ?? '';
  const refused = slots.filter((s) => s.status === STATUS.REFUSED).length;
  const validated = slots.filter((s) => s.status === STATUS.VALIDATED).length;
  const targets = isSeries ? slots : [b];
  const pending = targets.filter((x) => x.status === STATUS.CREATED && !isOver(x));
  const done = () => {
    setDialog(null);
    navigate('/');
  };
  const open = (kind: ActionKind) => {
    if (kind === 'delete') {
      // Série ouverte par sa mère : toute la série. Occurrence ouverte : cette occurrence ou la suite.
      if (b.parent_booking_id != null) return setDialog({ kind: 'delete-occurrence', bookings: [b], context: slots });
      return setDialog({ kind: 'delete', bookings: [b], context: isSeries ? slots : undefined });
    }
    setDialog({ kind, bookings: pending, context: isSeries ? slots : undefined });
  };
  const dateLabel = (key: string, defaultValue: string) => t(key, { defaultValue });

  const section = (title: string, aside: string | undefined, body: React.ReactNode, id: string) => (
    <section className="card mb-12" data-detail-section={id}>
      <div className="p-16" style={{ borderBottom: '1px solid #eee' }}>
        <h2 style={{ fontSize: 18 }} className="mb-0">
          {title}
          {aside && <span className="float-end">{aside}</span>}
        </h2>
      </div>
      <div className="p-16">{body}</div>
    </section>
  );
  const field = (label: string, value: React.ReactNode) => (
    <div className="mb-8">
      <strong className="d-block">{label}</strong>
      <div>{value}</div>
    </div>
  );
  const placeholder = (key: string, defaultValue: string) => <span className="text-muted">{t(key, { defaultValue })}</span>;

  return (
    <div data-booking-detail>
      <p>
        <Link to="/">← {t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link>
      </p>
      {dialog && (
        <ActionDialog
          kind={dialog.kind}
          bookings={dialog.bookings}
          current={b.parent_booking_id != null ? b : undefined}
          context={dialog.context}
          resourceName={nameOf}
          colorOf={() => color}
          resourceOf={() => resource}
          canTreat={(x) => canAct(x, ctx.me.userId, rights)}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      <h1 className="mb-16">{t('rbs.booking.title', { defaultValue: 'Demande de réservation' })}</h1>

      {section(
        t('rbs.booking.title.booking', { defaultValue: 'Détails de la demande : ' }),
        isSeries ? `${t('rbs.booking.details.header.periodic', { defaultValue: 'Périodique, début le' })} ${formatDateTime((slots[0] ?? b).start_date)}` : `${t('rbs.booking.details.header.from', { defaultValue: 'Du' })} ${formatDateTime(b.start_date)} ${t('rbs.booking.details.header.to', { defaultValue: 'au' })} ${formatDateTime(b.end_date)}`,
        <>
          <div className="row">
            <div className="col-md-6">{field(dateLabel('rbs.booking.details.start.label', 'Date et heure de début'), longDate(b.start_date))}</div>
            <div className="col-md-6">{field(dateLabel('rbs.booking.details.end.label', 'Date et heure de fin'), longDate(b.end_date))}</div>
          </div>
          <div className="row">
            <div className="col-md-6">{field(dateLabel('rbs.booking.details.owner.label', 'Demandeur'), b.owner_name ?? '')}</div>
            <div className="col-md-6">{field(dateLabel('rbs.booking.details.created.label', 'Date de demande'), longDate(b.created))}</div>
          </div>
          {field(dateLabel('rbs.booking.details.reason', 'Motif de réservation'), b.booking_reason ? b.booking_reason : placeholder('rbs.booking.details.reason.empty', 'Non renseigné'))}
        </>,
        'booking',
      )}

      {section(
        t('rbs.booking.title.resource', { defaultValue: 'Ressource concernée : ' }),
        type && resource ? `${type.name} - ${resource.name}` : undefined,
        <>
          <div className="row">
            <div className="col-md-4">{field(dateLabel('rbs.booking.details.type.label', 'Type de ressource'), type?.name ?? '')}</div>
            <div className="col-md-4">{field(dateLabel('rbs.booking.details.resource.label', 'Ressource'), resource?.name ?? '')}</div>
            <div className="col-md-4">{field(dateLabel('rbs.booking.details.quantity', 'Quantité'), b.quantity)}</div>
          </div>
          {field(dateLabel('rbs.booking.details.description.label', 'Description de la ressource'), resource?.description ? <span style={{ whiteSpace: 'pre-wrap' }}>{plain(resource.description)}</span> : placeholder('rbs.booking.details.description.empty', 'Cette ressource n’a pas de description renseignée.'))}
        </>,
        'resource',
      )}

      {isSeries
        ? section(
            t('rbs.booking.title.periodic', { defaultValue: 'Créneaux réservés : ' }),
            `${slots.length} ${slots.length > 1 ? t('rbs.booking.details.header.slots.many', { defaultValue: 'créneaux' }) : t('rbs.booking.details.header.slots.one', { defaultValue: 'créneau' })} - ${validated} ${validated > 1 ? t('rbs.booking.details.header.validated.many', { defaultValue: 'validés' }) : t('rbs.booking.details.header.validated.one', { defaultValue: 'validé' })} - ${refused} ${refused > 1 ? t('rbs.booking.details.header.refused.many', { defaultValue: 'refusés' }) : t('rbs.booking.details.header.refused.one', { defaultValue: 'refusé' })}`,
            <>
              {slots.some((s) => s.status === STATUS.SUSPENDED) && (
                <div className="alert alert-warning">
                  {t('rbs.booking.details.suspended.timeslot', { defaultValue: 'La ressource est indisponible sur un ou plusieurs créneaux demandés. Tous les créneaux de la réservation périodique ont été suspendus.' })}
                  <br />
                  {t('rbs.booking.details.suspended.slots', { defaultValue: 'Les créneaux resteront à l’état suspendu tant que la ressource sera indisponible.' })}
                </div>
              )}
              <table className="table table-sm" data-series-table>
                <thead>
                  <tr>
                    <th>{t('rbs.booking.headers.nb', { defaultValue: 'Créneau' })}</th>
                    <th>{t('rbs.booking.headers.start_date', { defaultValue: 'Date de début' })}</th>
                    <th>{t('rbs.booking.headers.end_date', { defaultValue: 'Date de fin' })}</th>
                    <th>{t('rbs.booking.headers.moderator', { defaultValue: 'Traité par' })}</th>
                    <th>{t('rbs.booking.headers.status', { defaultValue: 'État' })}</th>
                  </tr>
                </thead>
                {slots.map((slot, i) => (
                  <tbody key={slot.id} data-slot-row={slot.id}>
                    <tr>
                      <td>
                        {i + 1} {slot.id === b.id && <em style={{ color: 'red' }}>*</em>}
                      </td>
                      <td>{formatDateTime(slot.start_date)}</td>
                      <td>{formatDateTime(slot.end_date)}</td>
                      <td>{(slot as Booking & { moderator_name?: string }).moderator_name ?? ''}</td>
                      <td>
                        <StatusIcon status={slot.status} />{' '}
                        {slot.status === STATUS.REFUSED ? (
                          <button
                            type="button"
                            className="btn btn-link p-0"
                            aria-expanded={openRefusal.has(slot.id)}
                            onClick={() => setOpenRefusal((prev) => (prev.has(slot.id) ? new Set([...prev].filter((x) => x !== slot.id)) : new Set(prev).add(slot.id)))}
                          >
                            {t('rbs.booking.status.refused', { defaultValue: 'Refusée' })}
                          </button>
                        ) : slot.status === STATUS.VALIDATED ? (
                          t('rbs.booking.status.validated', { defaultValue: 'Validée' })
                        ) : slot.status === STATUS.SUSPENDED ? (
                          t('rbs.booking.status.suspended', { defaultValue: 'Suspendue' })
                        ) : (
                          t('rbs.booking.status.created', { defaultValue: 'En attente' })
                        )}
                      </td>
                    </tr>
                    {openRefusal.has(slot.id) && (
                      <tr>
                        <td />
                        <td colSpan={4}>{slot.refusal_reason ? plain(slot.refusal_reason) : placeholder('rbs.booking.details.refused.reason.empty', 'Non renseigné')}</td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </table>
              <p className="text-muted">
                <em style={{ color: 'red' }}>*</em> {t('rbs.booking.periodic.delete.details', { defaultValue: 'Le créneau sélectionné' })}
              </p>
              {pending.length > 0 && <Pending moderators={moderators.data} t={t} />}
            </>,
            'process',
          )
        : section(
            t('rbs.booking.title.process', { defaultValue: 'Traitement de la demande : ' }),
            statusText(status, t),
            <>
              {status === STATUS.SUSPENDED && <div className="alert alert-warning">{t('rbs.booking.details.suspended.booking', { defaultValue: 'Votre demande de réservation restera suspendue tant que la ressource sera indisponible. Lorsque celle-ci sera à nouveau disponible, votre demande sera re-soumise à validation' })}</div>}
              {status === STATUS.CREATED && <Pending moderators={moderators.data} t={t} />}
              {status === STATUS.VALIDATED && (
                <div className="row">
                  <div className="col-md-6">
                    {type?.validation
                      ? field(dateLabel('rbs.booking.details.validated.moderator.label', 'Validé par'), (b as Booking & { moderator_name?: string }).moderator_name ?? '')
                      : field(dateLabel('rbs.booking.details.validated.auto', 'Validation automatique'), '')}
                  </div>
                  <div className="col-md-6">{field(dateLabel('rbs.booking.details.validated.date.label', 'Date de validation'), longDate(b.modified))}</div>
                </div>
              )}
              {status === STATUS.REFUSED && (
                <>
                  <div className="row">
                    <div className="col-md-6">{field(dateLabel('rbs.booking.details.refused.moderator.label', 'Refusé par'), (b as Booking & { moderator_name?: string }).moderator_name ?? '')}</div>
                    <div className="col-md-6">{field(dateLabel('rbs.booking.details.refused.date.label', 'Date de refus'), longDate(b.modified))}</div>
                  </div>
                  {field(dateLabel('rbs.booking.details.refused.reason', 'Motif de refus'), b.refusal_reason ? plain(b.refusal_reason) : placeholder('rbs.booking.details.refused.reason.empty', 'Non renseigné'))}
                </>
              )}
            </>,
            'process',
          )}

      {!isOver(b) && !isPast(b) && (
        <div className="d-flex justify-content-end gap-8 mt-16" data-detail-actions>
          {rights.process && pending.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => open('refuse')}>
                {t('rbs.booking.refuse', { defaultValue: 'Refuser' })}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => open('validate')}>
                {t('rbs.booking.validate', { defaultValue: 'Valider' })}
              </button>
            </>
          )}
          {mayAct && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => open('delete')}>
                {t('rbs.list.remove', { defaultValue: 'Supprimer' })}
              </button>
              <button type="button" className="btn btn-primary" disabled={!resource?.is_available} onClick={() => navigate(`/booking/${rootId}/edit`)}>
                {t('rbs.list.edit', { defaultValue: 'Modifier' })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function statusText(status: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (status) {
    case STATUS.VALIDATED:
      return t('rbs.booking.status.validated', { defaultValue: 'Validée' });
    case STATUS.REFUSED:
      return t('rbs.booking.status.refused', { defaultValue: 'Refusée' });
    case STATUS.SUSPENDED:
      return t('rbs.booking.status.suspended', { defaultValue: 'Suspendue' });
    default:
      return t('rbs.booking.status.created', { defaultValue: 'En attente' });
  }
}

/** « En attente de validation par » + valideurs du type. */
function Pending({ moderators, t }: { moderators?: Array<{ username: string }>; t: (k: string, o?: Record<string, unknown>) => string }) {
  return (
    <p data-pending>
      {t('rbs.booking.details.pending', { defaultValue: 'En attente de validation par' })} {(moderators ?? []).map((m) => m.username).join(', ')}
    </p>
  );
}

export default BookingDetail;
