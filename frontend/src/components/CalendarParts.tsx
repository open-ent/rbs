import { KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Booking } from '../api';
import { isPeriodic, StatusKind, statusKind } from '../calendar';
import { dateLocale } from '../locale';
import { parseBackendDate } from '../utils';

/** Pastille de statut : la couleur ne porte jamais seule l'information, le libellé est lu par les lecteurs d'écran. */
const STATUS_ICON: Record<StatusKind, { symbol: string; color: string }> = {
  pending: { symbol: '◔', color: '#FF8500' },
  validated: { symbol: '✔', color: '#2e7d32' },
  refused: { symbol: '✖', color: '#c62828' },
  suspended: { symbol: '❚❚', color: '#b58900' },
  partial: { symbol: '◐', color: '#1565c0' },
};

/** Libellés de statut : mêmes clés que l'IHM AngularJS (info-bulle du calendrier). */
function useStatusLabels() {
  const { t } = useTranslation(['rbs', 'common']);
  return (kind: StatusKind): string =>
    ({
      pending: t('rbs.boooking.status.awaiting.validation', { defaultValue: 'En attente de validation' }),
      validated: t('rbs.booking.status.validated', { defaultValue: 'Validée' }),
      refused: t('rbs.booking.status.refused', { defaultValue: 'Refusée' }),
      suspended: t('rbs.booking.status.suspended', { defaultValue: 'Suspendue' }),
      partial: t('rbs.booking.status.partial', { defaultValue: 'Partiellement validée' }),
    })[kind];
}

export function StatusIcon({ status, light = false }: { status: number; light?: boolean }) {
  const label = useStatusLabels()(statusKind(status));
  const icon = STATUS_ICON[statusKind(status)];
  return (
    <span role="img" aria-label={label} title={label} data-status={statusKind(status)} style={{ color: light ? '#fff' : icon.color, marginRight: 4, fontSize: 11 }}>
      {icon.symbol}
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** « 20/10 09h30 », comme l'info-bulle de l'AngularJS. */
const stamp = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`;

/** Fiche affichée au survol ou au focus d'une réservation du calendrier. */
export function BookingTooltip({ booking, resourceName, color }: { booking: Booking; resourceName: string; color: string }) {
  const { t } = useTranslation(['rbs', 'common']);
  const label = useStatusLabels()(statusKind(booking.status));
  const start = parseBackendDate(booking.start_date);
  const end = parseBackendDate(booking.end_date);
  return (
    <div role="tooltip" className="bg-white shadow rounded" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, minWidth: 220, maxWidth: 300, border: '1px solid #ddd', textAlign: 'left', color: '#222' }}>
      <div style={{ background: color, color: '#fff', padding: '6px 10px', fontWeight: 700, borderRadius: '4px 4px 0 0' }}>{resourceName}</div>
      <div style={{ padding: '8px 10px', fontSize: 13 }}>
        <div>
          {stamp(start)} <span style={{ color: '#FF8500' }}>—</span> {stamp(end)}
        </div>
        {isPeriodic(booking) && <div className="text-muted">{t('rbs.booking.periodic', { defaultValue: 'Réservation périodique' })}</div>}
        <div>
          {t('rbs.booking.details.quantity', { defaultValue: 'Quantité' })} : {booking.quantity}
        </div>
        {booking.owner_name && (
          <div>
            {t('rbs.by', { defaultValue: 'par' })} {booking.owner_name}
          </div>
        )}
        {booking.booking_reason && <div className="mt-4">{booking.booking_reason}</div>}
        <div className="mt-4" style={{ fontWeight: 600 }}>
          <StatusIcon status={booking.status} /> {label}
        </div>
      </div>
    </div>
  );
}

/**
 * Réservation dans le calendrier : bloc coloré (couleur de la ressource), icône de statut et de série, ressource et
 * demandeur ; info-bulle au survol et au clavier, ouverture du détail au clic ou à la touche Entrée.
 * `compact` : ligne unique de la vue mois (« ressource - demandeur »).
 */
export function CalendarItem({
  booking,
  resourceName,
  color,
  compact = false,
  onOpen,
  style,
}: {
  booking: Booking;
  resourceName: string;
  color: string;
  compact?: boolean;
  onOpen: (booking: Booking) => void;
  style?: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const { t } = useTranslation(['rbs', 'common']);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(booking);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-booking-id={booking.id}
      aria-label={`${resourceName}${booking.owner_name ? ` - ${booking.owner_name}` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(booking);
      }}
      onKeyDown={onKey}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: compact ? 'relative' : 'absolute',
        background: color,
        color: '#fff',
        borderRadius: 3,
        padding: compact ? '1px 4px' : '2px 4px',
        fontSize: 11,
        lineHeight: 1.25,
        overflow: hover ? 'visible' : 'hidden',
        cursor: 'pointer',
        marginBottom: compact ? 2 : 0,
        whiteSpace: compact ? 'nowrap' : 'normal',
        textOverflow: 'ellipsis',
        zIndex: hover ? 10 : 1,
        boxShadow: '0 0 0 1px rgba(255,255,255,.7)',
        ...style,
      }}
    >
      <StatusIcon status={booking.status} light />
      {isPeriodic(booking) && (
        <span role="img" aria-label={t('rbs.booking.periodic', { defaultValue: 'Réservation périodique' })} title={t('rbs.booking.periodic', { defaultValue: 'Réservation périodique' })} style={{ marginRight: 4 }}>
          ↻
        </span>
      )}
      {compact ? (
        <span>
          {resourceName}
          {booking.owner_name ? ` - ${booking.owner_name}` : ''}
        </span>
      ) : (
        <>
          <strong>{resourceName}</strong>
          {booking.owner_name && <div>{booking.owner_name}</div>}
        </>
      )}
      {hover && <BookingTooltip booking={booking} resourceName={resourceName} color={color} />}
    </div>
  );
}

/** Libellé d'une journée (« lundi 20/10 »), dans la langue de la session. */
export const dayHeading = (d: Date): { weekday: string; date: string } => ({
  weekday: d.toLocaleDateString(dateLocale(), { weekday: 'long' }),
  date: d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' }),
});
