import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { api, Booking } from '../api';
import { bookingColor, dayBookings, isSeriesParent, daySegments, isPastSlot, monthGrid, slotStart, splitMore, toLocalInput, typeColors, visibleHours } from '../calendar';
import { BookingListView } from '../components/BookingListView';
import { CalendarItem, dayHeading } from '../components/CalendarParts';
import { ResourceTree } from '../components/ResourceTree';
import { useNotifications } from '../hooks/useNotifications';
import { useRbsContext } from '../hooks/useRbsContext';
import { useResourceTree } from '../hooks/useResourceTree';
import { dateLocale } from '../locale';
import { canAct } from '../bookingList';
import { rightsOn } from '../rights';
import { startOfWeek, weekDays, yyyymmdd } from '../utils';
import { ExportDialog } from './ExportDialog';
import { Modal } from './Modal';

type View = 'day' | 'week' | 'month' | 'list';

/** Hauteur de l'en-tête des jours (nom + date sur deux lignes, police du thème comprise), en pixels. */
const HEADER_PX = 56;
/** Hauteur d'une heure dans la grille, en pixels. */
const HOUR_PX = 48;
/** Réservations visibles par case du mois avant « voir plus ». */
const MONTH_MAX = 3;

/**
 * Calendrier des réservations (parité IHM AngularJS) : vues Jour / Semaine (lundi→dimanche) / Mois, réservations
 * colorées comme leur ressource, icône de statut (attente, validée, refusée, suspendue, partielle) et de série,
 * info-bulle au survol, clic sur une réservation → détail, clic sur un créneau libre → nouvelle réservation, case
 * du mois trop remplie → « voir plus ». Filtres « Mes réservations » et, pour qui valide, « À traiter ».
 */
export function Agenda({ moderation = false }: { moderation?: boolean } = {}) {
  const { t } = useTranslation(['rbs', 'common']);
  const navigate = useNavigate();
  const ctx = useRbsContext();
  const [view, setView] = useState<View>(moderation ? 'list' : 'week');
  const [cursor, setCursor] = useState(() => new Date());
  const [exporting, setExporting] = useState(false);
  const [mine, setMine] = useState(false);
  const [toProcess, setToProcess] = useState(moderation);
  const [more, setMore] = useState<{ day: Date; items: Booking[] } | null>(null);
  const [slotChoice, setSlotChoice] = useState<Date | null>(null);
  const [notice, setNotice] = useState('');
  // Vue liste : sélection (cases à cocher) et filtre de date à date, qui remplace la semaine affichée.
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [dateFilter, setDateFilter] = useState<{ from: string; to: string } | null>(null);

  // Lu au rendu et non à l'import : la locale n'est posée qu'une fois la session chargée.
  const locale = dateLocale();

  const monday = useMemo(() => startOfWeek(cursor), [cursor]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const weeks = useMemo(() => monthGrid(cursor), [cursor]);

  // Bornes de chargement selon la vue (mois = semaines entières affichées).
  const { start, end } = useMemo(() => {
    if (view === 'month') return { start: yyyymmdd(weeks[0][0]), end: yyyymmdd(weeks[weeks.length - 1][6]) };
    if (view === 'day') return { start: yyyymmdd(cursor), end: yyyymmdd(cursor) };
    if (view === 'list' && dateFilter?.from && dateFilter.to && dateFilter.from <= dateFilter.to) return { start: dateFilter.from, end: dateFilter.to };
    return { start: yyyymmdd(monday), end: yyyymmdd(days[6]) };
  }, [view, cursor, monday, days, weeks, dateFilter]);

  const tree = useResourceTree();
  const notif = useNotifications();
  const allRules = useQuery({ queryKey: ['rbs', 'availability-all'], queryFn: api.getAllAvailabilities, staleTime: 60_000 });
  const unavailable = useMemo(() => {
    const open = new Set((allRules.data ?? []).filter((a) => !a.is_unavailability).map((a) => a.resource_id));
    return new Set(tree.resources.filter((r) => !r.is_available && !open.has(r.id)).map((r) => r.id));
  }, [allRules.data, tree.resources]);
  const bookingsQuery = useQuery({ queryKey: ['rbs', 'agenda', start, end], queryFn: () => api.getBookingsInRange(start, end) });
  // Demandes que l'usager peut traiter, y compris hors de la période affichée côté serveur : on ne garde que celles visibles.
  const unprocessedQuery = useQuery({ queryKey: ['rbs', 'unprocessed'], queryFn: api.getUnprocessedBookings, enabled: ctx.can.validator && (toProcess || moderation) });

  const resources = useMemo(() => new Map(tree.resources.map((r) => [r.id, r])), [tree.resources]);
  const colors = useMemo(() => typeColors(tree.types), [tree.types]);
  const selected = useMemo(() => new Set(tree.selectedIds), [tree.selectedIds]);
  const unprocessedIds = useMemo(() => new Set((unprocessedQuery.data ?? []).map((b) => b.id)), [unprocessedQuery.data]);

  /** Filtres de la barre (« mes réservations », « à traiter »). */
  const passes = (b: Booking) => (!mine || b.owner === ctx.me.userId) && (!toProcess || unprocessedIds.has(b.id));
  // Modération : toutes les demandes à traiter, sans fenêtre de dates (comme l'AngularJS) ; sinon la période affichée.
  const source = moderation ? (unprocessedQuery.data ?? []) : (bookingsQuery.data ?? []);
  const inSelection = source.filter((b) => selected.has(b.resource_id));
  // Le calendrier ne dessine jamais la mère d'une série (elle couvre toute la période) ; la liste la montre.
  const bookings = inSelection.filter((b) => !isSeriesParent(b) && passes(b));
  const nameOf = (b: Booking) => resources.get(b.resource_id)?.name ?? '';
  const colorOf = (b: Booking) => bookingColor(b, resources, colors);

  /** Détail d'une réservation ; une occurrence de série s'ouvre avec sa date (`#/booking/12/2026-10-20`). */
  const open = (b: Booking) => {
    setMore(null);
    navigate(b.parent_booking_id != null ? `/booking/${b.id}/${b.start_date.slice(0, 10)}` : `/booking/${b.id}`);
  };
  const rightsOfBooking = (b: Booking) => {
    const resource = resources.get(b.resource_id);
    const type = resource && tree.types.find((x) => x.id === resource.type_id);
    const rights = type && resource ? rightsOn(type, ctx.me, resource) : undefined;
    return { process: !!rights?.process, manage: !!rights?.manage };
  };

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week' || view === 'list') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const periodLabel =
    view === 'day'
      ? cursor.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : view === 'month'
        ? cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
        : `${days[0].toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} – ${days[6].toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  const shiftLabels: Record<View, [string, string]> = {
    day: [t('rbs.agenda.prevday', { defaultValue: 'Jour précédent' }), t('rbs.agenda.nextday', { defaultValue: 'Jour suivant' })],
    week: [t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' }), t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })],
    list: [t('rbs.agenda.prev', { defaultValue: 'Semaine précédente' }), t('rbs.agenda.next', { defaultValue: 'Semaine suivante' })],
    month: [t('rbs.agenda.prevmonth', { defaultValue: 'Mois précédent' }), t('rbs.agenda.nextmonth', { defaultValue: 'Mois suivant' })],
  };

  /**
   * Clic sur un créneau libre : nouvelle réservation sur la ressource cochée (ou à choisir parmi les cochées),
   * début prérempli. Pas de réservation dans le passé, comme l'AngularJS.
   */
  const clickSlot = (start: Date) => {
    setNotice('');
    if (isPastSlot(start)) {
      setNotice(t('rbs.booking.invalid.datetimes.past', { defaultValue: 'La date de début de réservation ne peut pas être dans le passé.' }));
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) {
      setNotice(t('rbs.agenda.pickresource', { defaultValue: 'Cochez une ressource dans la liste pour la réserver.' }));
      return;
    }
    if (ids.length === 1) goBook(ids[0], start);
    else setSlotChoice(start);
  };
  const goBook = (resourceId: number, start: Date) => {
    const endDate = new Date(start);
    endDate.setHours(endDate.getHours() + 1);
    setSlotChoice(null);
    navigate(`/booking/new?resource=${resourceId}&start=${encodeURIComponent(toLocalInput(start))}&end=${encodeURIComponent(toLocalInput(endDate))}`);
  };

  /** Grille horaire × jours (vues jour et semaine) : une colonne par jour, réservations positionnées à la minute. */
  const grid = (cols: Date[]) => {
    const segments = cols.map((d) => daySegments(bookings, d));
    const { from, to } = visibleHours(segments.flat());
    const hours = Array.from({ length: to - from }, (_, i) => from + i);
    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', minWidth: cols.length > 1 ? 780 : 320 }} data-calendar-grid={view}>
          <div style={{ width: 52, flex: 'none' }}>
            <div style={{ height: HEADER_PX }} />
            {hours.map((h) => (
              <div key={h} className="text-muted" style={{ height: HOUR_PX, fontSize: 12, textAlign: 'right', paddingRight: 6 }}>
                {String(h).padStart(2, '0')}h
              </div>
            ))}
          </div>
          {cols.map((day, di) => {
            const heading = dayHeading(day);
            const today = yyyymmdd(day) === yyyymmdd(new Date());
            return (
              <div key={di} style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #e3e3e3' }} data-day={yyyymmdd(day)}>
                <div className="text-center" style={{ height: HEADER_PX, background: today ? '#fff3e0' : '#e8f5e9', textTransform: 'capitalize', fontWeight: 600, paddingTop: 4 }}>
                  {heading.weekday}
                  <br />
                  <span className="text-muted" style={{ fontWeight: 400 }}>
                    {heading.date}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      role="button"
                      tabIndex={-1}
                      aria-label={t('rbs.agenda.book.slot', { defaultValue: 'Réserver le [[date]] à [[hour]]h', date: heading.date, hour: h })}
                      data-slot={`${yyyymmdd(day)}T${String(h).padStart(2, '0')}`}
                      onClick={() => clickSlot(slotStart(day, h * 60))}
                      style={{ height: HOUR_PX, borderTop: '1px solid #eee', cursor: 'cell' }}
                    />
                  ))}
                  {segments[di].map((s) => (
                    <CalendarItem
                      key={`${s.booking.id}-${di}`}
                      booking={s.booking}
                      resourceName={nameOf(s.booking)}
                      color={colorOf(s.booking)}
                      onOpen={open}
                      style={{
                        top: ((s.startMin - from * 60) / 60) * HOUR_PX,
                        height: Math.max(24, ((s.endMin - s.startMin) / 60) * HOUR_PX - 1),
                        left: `${(s.col / s.cols) * 100}%`,
                        width: `calc(${100 / s.cols}% - 2px)`,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /** Vue mois : semaines (lignes) × jours (colonnes), réservations en ligne ; au-delà de la limite, « voir plus ». */
  const monthView = () => (
    <div style={{ overflowX: 'auto' }}>
      <table className="table table-bordered mb-0" style={{ minWidth: 780, tableLayout: 'fixed' }} data-calendar-grid="month">
        <thead>
          <tr>
            {weeks[0].map((d, i) => (
              <th key={i} className="text-center" style={{ background: '#e8f5e9', textTransform: 'capitalize' }}>
                {d.toLocaleDateString(locale, { weekday: 'long' })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const list = dayBookings(bookings, day);
                const { shown, more: rest } = splitMore(list, MONTH_MAX);
                return (
                  <td
                    key={di}
                    data-day={yyyymmdd(day)}
                    onClick={() => clickSlot(slotStart(day, 9 * 60))}
                    style={{ height: 104, verticalAlign: 'top', padding: 4, background: inMonth ? undefined : '#f6f6f6', cursor: 'cell' }}
                  >
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {day.getDate()}
                    </div>
                    {shown.map((b) => (
                      <CalendarItem key={b.id} booking={b} resourceName={nameOf(b)} color={colorOf(b)} compact onOpen={open} />
                    ))}
                    {rest.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-link p-0"
                        style={{ fontSize: 11 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMore({ day, items: list });
                        }}
                      >
                        +{rest.length} {t('rbs.bookings.more.link', { defaultValue: 'voir plus' })}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const selectedResources = [...selected].map((id) => resources.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <div>
      {exporting && <ExportDialog selectedIds={[...selected]} allIds={tree.resources.map((r) => r.id)} onClose={() => setExporting(false)} />}
      {more && (
        <Modal title={t('rbs.agenda.more.title', { defaultValue: '[[count]] réservations — [[day]]', count: more.items.length, day: more.day.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' }) })} onClose={() => setMore(null)}>
          <div data-more-items>
            {more.items.map((b) => (
              <CalendarItem key={b.id} booking={b} resourceName={nameOf(b)} color={colorOf(b)} compact onOpen={open} />
            ))}
          </div>
        </Modal>
      )}
      {slotChoice && (
        <SlotChooser
          start={slotChoice}
          resources={selectedResources.map((r) => ({ id: r.id, name: r.name }))}
          onBook={(id) => goBook(id, slotChoice)}
          onClose={() => setSlotChoice(null)}
        />
      )}
      <div className="d-flex align-items-center justify-content-between mb-16 flex-wrap gap-8">
        <h1 className="m-0">{moderation ? t('rbs.moderation.title', { defaultValue: 'Modération' }) : t('rbs.agenda.title', { defaultValue: 'Réservation de ressources' })}</h1>
        <div className="d-flex gap-8">
          <Link to="/booking/new" className="btn btn-primary">
            {t('rbs.new.booking', { defaultValue: 'Nouvelle réservation' })}
          </Link>
          <Link to="/resources" className="btn btn-secondary">
            {t('rbs.manage.resources', { defaultValue: 'Gérer les ressources' })}
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setExporting(true)}>
            {t('rbs.export.title', { defaultValue: 'Exporter' })}
          </button>
          <Link to="/moderation" className="btn btn-secondary">
            {t('rbs.moderation.title', { defaultValue: 'Modération des réservations' })}
          </Link>
        </div>
      </div>

      <div className="d-flex gap-16" style={{ alignItems: 'flex-start' }}>
        {/* Panneau latéral : arbre établissement › type › ressource, cases à cocher, état mémorisé (comme l'AngularJS) */}
        <aside style={{ minWidth: 230 }} aria-label={t('rbs.agenda.resources', { defaultValue: 'Ressources' })}>
          <strong>{t('rbs.agenda.resources', { defaultValue: 'Ressources' })}</strong>
          <div className="mt-8">
            {tree.ready ? (
              <ResourceTree
                tree={tree.tree}
                onStructure={tree.toggleStructure}
                onType={tree.toggleType}
                onResource={tree.toggleResource}
                onExpandStructure={tree.toggleExpandStructure}
                onExpandType={tree.toggleExpandType}
                unavailable={unavailable}
                notifications={{ stateOf: notif.stateOf, notified: notif.notified, onType: notif.toggleType, onResource: notif.toggleResource }}
              />
            ) : (
              <p className="text-muted" style={{ fontSize: 13 }}>
                {t('rbs.loading', { defaultValue: 'Chargement…' })}
              </p>
            )}
          </div>
        </aside>

        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          {/* Barre : vue + filtres + navigation */}
          <div className="d-flex align-items-center justify-content-between mb-12 flex-wrap gap-8">
            <div className="d-flex align-items-center gap-12 flex-wrap">
              {!moderation && (
              <div className="btn-group" role="group" aria-label={t('rbs.agenda.views', { defaultValue: 'Vues' })}>
                {(['day', 'week', 'month', 'list'] as View[]).map((v) => (
                  <button key={v} type="button" className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === v} onClick={() => setView(v)}>
                    {v === 'day' ? t('rbs.view.day', { defaultValue: 'Jour' }) : v === 'week' ? t('rbs.view.week', { defaultValue: 'Semaine' }) : v === 'month' ? t('rbs.view.month', { defaultValue: 'Mois' }) : t('rbs.view.list', { defaultValue: 'Liste' })}
                  </button>
                ))}
              </div>
              )}
              <label className="d-flex align-items-center gap-4" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
                {t('rbs.selector.mine', { defaultValue: 'Mes réservations' })}
              </label>
              {ctx.can.validator && (
                <label className="d-flex align-items-center gap-4" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={toProcess} onChange={(e) => setToProcess(e.target.checked)} />
                  {t('rbs.selector.unprocessed', { defaultValue: 'À traiter' })}
                </label>
              )}
            </div>
            {!moderation && <div className="d-flex align-items-center gap-12">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCursor(new Date())}>
                {t('rbs.agenda.today', { defaultValue: "Aujourd'hui" })}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)} aria-label={shiftLabels[view][0]}>
                ←
              </button>
              <strong style={{ minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>{periodLabel}</strong>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(1)} aria-label={shiftLabels[view][1]}>
                →
              </button>
            </div>}
          </div>

          {notice && (
            <div className="alert alert-warning" role="alert">
              {notice}
            </div>
          )}
          {bookingsQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
          {bookingsQuery.isError && (
            <div className="alert alert-warning" role="alert">
              {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
            </div>
          )}

          {view === 'list' && !moderation && (
            <div className="d-flex align-items-center gap-12 flex-wrap mb-8" style={{ fontSize: 13 }}>
              <label className="d-flex align-items-center gap-4">
                <input
                  type="checkbox"
                  checked={!!dateFilter}
                  onChange={(e) => setDateFilter(e.target.checked ? { from: yyyymmdd(monday), to: yyyymmdd(days[6]) } : null)}
                />
                {t('rbs.selector.dates', { defaultValue: 'Filtrer de date à date' })}
              </label>
              {dateFilter && (
                <>
                  <label className="d-flex align-items-center gap-4">
                    {t('rbs.filters.date.from', { defaultValue: 'Du' })}
                    <input type="date" value={dateFilter.from} max={dateFilter.to} onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })} />
                  </label>
                  <label className="d-flex align-items-center gap-4">
                    {t('rbs.filters.date.to', { defaultValue: 'au' })}
                    <input type="date" value={dateFilter.to} min={dateFilter.from} onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })} />
                  </label>
                </>
              )}
              {selection.size > 0 && (
                <span data-selection-bar>
                  {t('rbs.list.selected', { defaultValue: '[[count]] sélectionnée(s)', count: selection.size })}{' '}
                  <button type="button" className="btn btn-link p-0" onClick={() => setSelection(new Set())}>
                    {t('rbs.list.clear', { defaultValue: 'Tout désélectionner' })}
                  </button>
                </span>
              )}
            </div>
          )}
          {view === 'list' && (
            <BookingListView
              bookings={inSelection}
              keep={passes}
              resourceName={nameOf}
              colorOf={colorOf}
              userId={ctx.me.userId}
              rightsOf={rightsOfBooking}
              selected={selection}
              onSelect={setSelection}
              onOpen={open}
              resourceOf={(b) => resources.get(b.resource_id)}
              canTreat={(b) => canAct(b, ctx.me.userId, rightsOfBooking(b))}
              onEdit={(b) => navigate(`/booking/${b.id}/edit`)}
            />
          )}
          {view === 'day' && grid([cursor])}
          {view === 'week' && grid(days)}
          {view === 'month' && monthView()}
        </div>
      </div>
    </div>
  );
}

/** Choix de la ressource quand plusieurs sont cochées et qu'on clique un créneau libre. */
function SlotChooser({ start, resources, onBook, onClose }: { start: Date; resources: Array<{ id: number; name: string }>; onBook: (id: number) => void; onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const [id, setId] = useState(resources[0]?.id ?? 0);
  return (
    <Modal title={t('rbs.agenda.book.title', { defaultValue: 'Réserver ce créneau' })} onClose={onClose}>
      <p className="text-muted">{start.toLocaleString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
      <label htmlFor="rbs-slot-resource" className="d-block mb-8">
        {t('rbs.agenda.book.resource', { defaultValue: 'Ressource à réserver' })}
      </label>
      <select id="rbs-slot-resource" className="form-select mb-16" value={id} onChange={(e) => setId(Number(e.target.value))}>
        {resources.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onBook(id)}>
          {t('rbs.agenda.book.go', { defaultValue: 'Réserver' })}
        </button>
      </div>
    </Modal>
  );
}

export default Agenda;
