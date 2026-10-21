import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api, ApiError, Availability, Booking, Resource, ResourceType } from '../api';
import {
  atTime,
  buildBody,
  checkForm,
  defaultDays,
  firstOccurrenceDate,
  Occurrence,
  occurrenceList,
  periodicSummary,
  quantityAvailableAt,
  resourceQuantityAt,
  selectedProfileSlots,
  seriesQuantityAvailable,
  sortProfileSlots,
  WEEK_ORDER,
} from '../bookingForm';
import { useRbsContext } from '../hooks/useRbsContext';
import { dateLocale } from '../locale';
import { rightsOn } from '../rights';
import { parseBackendDate } from '../utils';

const IANA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
type Step = 'resource' | 'slot' | 'periodic';

const pad = (n: number) => String(n).padStart(2, '0');
const dayValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const localIso = (d: Date) => `${dayValue(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const fromDayValue = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
/** Texte brut d'une description saisie en HTML : jamais de balise interprétée. */
const plain = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

/** Prochaine heure pleine entre 8h et 19h (sinon 8h le lendemain) : début proposé quand aucun créneau n'est cliqué. */
function suggestedStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  if (d.getHours() < 8) d.setHours(8);
  if (d.getHours() > 19) {
    d.setDate(d.getDate() + 1);
    d.setHours(8);
  }
  return d;
}

/**
 * Formulaire de réservation (création et modification), parité IHM AngularJS : trois étapes repliables — 1 ressource
 * (établissement › type › ressource, description, valideurs), 2 créneau (disponibilités de la ressource, date, horaires
 * libres ou plages prédéfinies du type, quantité disponible, motif, réservation périodique) et 3 périodicité (toutes
 * les n semaines, jours, fin par occurrences ou par date, résumé). Avertissements : conflit avec l'emploi du temps,
 * quantité insuffisante, délais de réservation (refus du serveur, expliqué à l'écran).
 */
export function BookingForm() {
  const { t } = useTranslation(['rbs', 'common']);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ctx = useRbsContext();
  const { bookingId } = useParams();
  const editId = bookingId ? Number(bookingId) : null;
  const [params] = useSearchParams();

  const typesQuery = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const types = typesQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];
  const editQuery = useQuery({ queryKey: ['rbs', 'booking', String(editId)], queryFn: () => api.getBooking(editId as number), enabled: editId !== null });
  const seriesQuery = useQuery({
    queryKey: ['rbs', 'series', editId],
    queryFn: () => api.getSeriesSlots(editId as number),
    enabled: !!editQuery.data?.is_periodic,
  });

  // ── État du formulaire ────────────────────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('resource');
  const [structureId, setStructureId] = useState('');
  const [typeId, setTypeId] = useState(0);
  const [resourceId, setResourceId] = useState(0);
  const [periodic, setPeriodic] = useState(false);
  const [date, setDate] = useState(() => dayValue(suggestedStart()));
  const [startTime, setStartTime] = useState(() => timeValue(suggestedStart()));
  const [endTime, setEndTime] = useState(() => {
    const d = suggestedStart();
    d.setHours(d.getHours() + 1);
    return timeValue(d);
  });
  const [firstSlot, setFirstSlot] = useState(0);
  const [lastSlot, setLastSlot] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [periodicity, setPeriodicity] = useState(1);
  const [days, setDays] = useState<boolean[]>(() => defaultDays(suggestedStart()));
  const [byOccurrences, setByOccurrences] = useState(true);
  const [occurrences, setOccurrences] = useState(1);
  const [until, setUntil] = useState(() => dayValue(suggestedStart()));
  const [errors, setErrors] = useState<string[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [initialised, setInitialised] = useState(false);

  // ── Catalogue réservable ──────────────────────────────────────────────────────────────────────────────
  const typeById = useMemo(() => new Map(types.map((x) => [x.id, x])), [types]);
  const resourceById = useMemo(() => new Map(resources.map((x) => [x.id, x])), [resources]);
  const userStructures = ctx.structures;
  const detachedName = t('rbs.structure.detached', { defaultValue: 'Autres établissements' });

  /** Types rangés par établissement de l'usager ; les types d'établissements tiers vont ensemble dans « Autres établissements ». */
  const structures = useMemo(() => {
    const ids = new Set(userStructures.map((s) => s.id));
    const groups = userStructures.map((s) => ({ id: s.id, name: s.name, types: types.filter((x) => x.school_id === s.id) }));
    const others = types.filter((x) => !ids.has(x.school_id));
    return [...groups, ...(others.length ? [{ id: 'DETACHED', name: detachedName, types: others }] : [])].filter((s) => s.types.length > 0);
  }, [userStructures, types, detachedName]);
  const structure = structures.find((s) => s.id === structureId);
  const type: ResourceType | undefined = typeById.get(typeId);
  const typeResources = useMemo(() => resources.filter((r) => r.type_id === typeId), [resources, typeId]);

  // Disponibilités des ressources du type : une ressource fermée par défaut n'est réservable que si elle a une disponibilité.
  const rulesQueries = useQueries({ queries: typeResources.map((r) => ({ queryKey: ['rbs', 'availability', r.id], queryFn: () => api.getResourceAvailability(r.id), staleTime: 30_000 })) });
  const rulesOf = (r: Resource): Availability[] | undefined => rulesQueries[typeResources.indexOf(r)]?.data;
  const bookable = (r: Resource): boolean => {
    const rights = type ? rightsOn(type, ctx.me, r) : undefined;
    const rules = rulesOf(r);
    // Une ressource fermée par défaut n'est réservable que si elle a au moins une période de DISPONIBILITÉ.
    return !!rights?.contrib && (r.is_available || (rules ?? []).some((x) => !x.is_unavailability)) && (!periodic || r.periodic_booking);
  };
  const bookableResources = typeResources.filter(bookable);
  const resource = resourceById.get(resourceId);
  const rules = resource ? (rulesOf(resource) ?? []) : [];

  // ── Initialisation ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialised || !typesQuery.isSuccess || !resourcesQuery.isSuccess || !ctx.ready) return;
    if (editId !== null) {
      const b = editQuery.data;
      if (!b) return;
      if (b.is_periodic && !seriesQuery.isSuccess) return;
      const res = resourceById.get(b.resource_id);
      const ty = res ? typeById.get(res.type_id) : undefined;
      if (!res || !ty) return;
      const first = b.is_periodic ? [...(seriesQuery.data ?? [])].sort((x, y) => x.id - y.id)[0] : undefined;
      const start = parseBackendDate((first ?? b).start_date);
      const end = parseBackendDate((first ?? b).end_date);
      const motherStart = parseBackendDate(b.start_date);
      const s = structures.find((x) => x.types.some((y) => y.id === ty.id));
      setStructureId(s?.id ?? '');
      setTypeId(ty.id);
      setResourceId(res.id);
      setPeriodic(b.is_periodic);
      setDate(dayValue(b.is_periodic ? motherStart : start));
      setStartTime(timeValue(start));
      setEndTime(timeValue(end));
      setQuantity(b.quantity);
      setReason(b.booking_reason ?? '');
      if (b.is_periodic) {
        setPeriodicity(b.periodicity ?? 1);
        setDays(Array.from({ length: 7 }, (_, i) => b.days?.[i] === '1'));
        setByOccurrences(!!b.occurrences && b.occurrences > 0);
        setOccurrences(b.occurrences && b.occurrences > 0 ? b.occurrences : 1);
        setUntil(dayValue(parseBackendDate(b.end_date)));
      }
      setStep('slot');
      setInitialised(true);
      return;
    }
    // Création : ressource demandée par l'adresse (créneau cliqué dans le calendrier), sinon la première réservable.
    const wanted = resourceById.get(Number(params.get('resource')));
    const wantedType = wanted ? typeById.get(wanted.type_id) : undefined;
    const s = wantedType ? structures.find((x) => x.types.some((y) => y.id === wantedType.id)) : structures[0];
    const ty = wantedType ?? s?.types.find((x) => resources.some((r) => r.type_id === x.id)) ?? s?.types[0];
    if (!s || !ty) {
      setInitialised(true);
      return;
    }
    setStructureId(s.id);
    setTypeId(ty.id);
    if (wanted) setResourceId(wanted.id);
    const startParam = params.get('start');
    const endParam = params.get('end');
    if (startParam) {
      const st = new Date(startParam);
      if (!Number.isNaN(st.getTime())) {
        setDate(dayValue(st));
        setStartTime(timeValue(st));
        setDays(defaultDays(st));
        setUntil(dayValue(st));
        const en = endParam ? new Date(endParam) : new Date(st.getTime() + 3600_000);
        setEndTime(timeValue(Number.isNaN(en.getTime()) ? new Date(st.getTime() + 3600_000) : en));
      }
    }
    setInitialised(true);
  }, [initialised, typesQuery.isSuccess, resourcesQuery.isSuccess, ctx.ready, editId, editQuery.data, seriesQuery.isSuccess, seriesQuery.data, resourceById, typeById, structures, resources, params]);

  // Ressource par défaut : la première réservable du type, tant qu'aucune n'est choisie (ou que la choisie ne l'est plus).
  useEffect(() => {
    if (!initialised || editId !== null) return;
    if (resourceId && bookableResources.some((r) => r.id === resourceId)) return;
    // On attend les disponibilités avant de renoncer à une ressource fermée par défaut.
    if (resourceId && rulesQueries.some((q) => q.isLoading)) return;
    setResourceId(bookableResources[0]?.id ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialised, editId, typeId, periodic, bookableResources.map((r) => r.id).join(','), rulesQueries.map((q) => q.isLoading).join(',')]);

  const moderators = useQuery({ queryKey: ['rbs', 'moderators', typeId], queryFn: () => api.getTypeModerators(typeId), enabled: !!typeId && !!type?.validation });
  const profile = useQuery({ queryKey: ['rbs', 'slotprofile', type?.slotprofile], queryFn: () => api.getSlotProfileSlots(type!.slotprofile as string), enabled: !!type?.slotprofile });
  const profileSlots = useMemo(() => sortProfileSlots(profile.data?.slots ?? []), [profile.data]);
  const withProfile = profileSlots.length > 0;

  // À l'ouverture d'un type à plages prédéfinies : plage dont l'horaire correspond (modification), sinon la première.
  useEffect(() => {
    if (!withProfile) return;
    const i = profileSlots.findIndex((s) => s.startHour.slice(0, 5) === startTime);
    setFirstSlot(i >= 0 ? i : 0);
    setLastSlot(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withProfile, typeId, initialised]);

  // ── Créneau saisi → occurrences, quantité ──────────────────────────────────────────────────────────────
  const day = useMemo(() => fromDayValue(date), [date]);
  const chosen = withProfile ? selectedProfileSlots(profileSlots, firstSlot, lastSlot) : null;
  const start = useMemo(() => (chosen?.length ? atTime(day, chosen[0].startHour) : atTime(day, startTime)), [chosen, day, startTime]);
  const end = useMemo(() => (chosen?.length ? atTime(day, chosen[chosen.length - 1].endHour) : atTime(day, endTime)), [chosen, day, endTime]);
  const firstDay = periodic ? firstOccurrenceDate(day, days) : day;
  const baseStart = useMemo(() => new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate(), start.getHours(), start.getMinutes()), [firstDay, start]);
  const baseEnd = useMemo(() => new Date(baseStart.getTime() + (end.getTime() - start.getTime())), [baseStart, start, end]);
  const occList: Occurrence[] = useMemo(() => {
    if (!periodic) return [{ start, end }];
    const limit = byOccurrences ? { occurrences: Math.max(1, occurrences) } : { until: fromDayValue(until) };
    return occurrenceList(baseStart, baseEnd, days, periodicity, limit);
  }, [periodic, start, end, baseStart, baseEnd, days, periodicity, byOccurrences, occurrences, until]);

  const window = useMemo(() => {
    if (occList.length === 0) return null;
    const lo = occList.reduce((m, o) => (o.start < m ? o.start : m), occList[0].start);
    const hi = occList.reduce((m, o) => (o.end > m ? o.end : m), occList[0].end);
    return { from: localIso(lo), to: localIso(hi) };
  }, [occList]);
  const bookingsQuery = useQuery({
    queryKey: ['rbs', 'resource-window', resourceId, window?.from, window?.to],
    queryFn: () => api.getResourceBookingsBetween(resourceId, window!.from, window!.to),
    enabled: !!resourceId && !!window,
  });
  const others: Booking[] = bookingsQuery.data ?? [];
  const available = resource
    ? periodic
      ? seriesQuantityAvailable(occList, resource, rules, others, editId ?? undefined)
      : quantityAvailableAt(occList[0], resource, rules, others, editId ?? undefined)
    : 0;
  const total = resource && occList[0] ? resourceQuantityAt(occList[0], resource, rules) : 0;

  // Quantité saisie ramenée dans les limites dès que le disponible change (au plus ce qui reste, au moins 1 s'il en reste).
  useEffect(() => {
    if (available > 0 && quantity > available) setQuantity(available);
  }, [available, quantity]);

  const edtConflict = useQuery({
    queryKey: ['rbs', 'edt-conflict', structureId, resource?.name, localIso(start), localIso(end)],
    queryFn: () => api.getRoomConflicts(structureId, localIso(start), localIso(end), resource!.name),
    enabled: !!structureId && structureId !== 'DETACHED' && !!resource && !periodic && end > start,
    retry: false,
  });
  const hasEdtConflict = (edtConflict.data?.length ?? 0) > 0;
  const weekStart = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const schedule = useQuery({
    queryKey: ['rbs', 'mini-schedule', structureId, resourceId, dayValue(weekStart)],
    queryFn: async () => {
      const [courses, bookings] = await Promise.all([
        structureId && structureId !== 'DETACHED' && resource ? api.getRoomConflicts(structureId, localIso(weekStart), localIso(weekEnd), resource.name): Promise.resolve([]),
        api.getResourceBookingsBetween(resourceId, localIso(weekStart), localIso(weekEnd)),
      ]);
      const rows = [
        ...courses.map((c) => ({ source: 'edt' as const, start: new Date(c.startDate.replace(' ', 'T')), end: new Date(c.endDate.replace(' ', 'T')), label: t('rbs.roomSchedule.source.edt', { defaultValue: 'Emploi du temps' }) })),
        ...bookings.filter((b) => b.status !== 3).map((b) => ({ source: 'rbs' as const, start: parseBackendDate(b.start_date), end: parseBackendDate(b.end_date), label: b.booking_reason || t('rbs.roomSchedule.source.rbs', { defaultValue: 'Réservation' }) })),
      ];
      return rows.sort((a, b) => a.start.getTime() - b.start.getTime());
    },
    enabled: showSchedule && !!resourceId,
    retry: false,
  });

  // ── Résumés ───────────────────────────────────────────────────────────────────────────────────────────
  const locale = dateLocale();
  const tr = (key: string) => t(key, { defaultValue: key });
  const summary = periodic
    ? periodicSummary({ days, periodicity, byOccurrences, occurrences, endDateLabel: fromDayValue(until).toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) }, tr)
    : null;

  // ── Enregistrement ────────────────────────────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const slotList = chosen?.length ? chosen.map((s) => ({ start: atTime(baseStart, s.startHour), end: atTime(baseStart, s.endHour) })) : [{ start: baseStart, end: baseEnd }];
      const body = buildBody({
        reason,
        quantity,
        iana: IANA,
        slots: slotList,
        ...(periodic ? { periodic: { periodicity, days, byOccurrences, occurrences, until: fromDayValue(until) } } : {}),
      });
      if (editId !== null) await api.updateBooking(resource!.id, editId, body, periodic);
      else if (periodic) await api.createPeriodicBooking(resource!.id, body as Parameters<typeof api.createPeriodicBooking>[1]);
      else await api.createBooking(resource!.id, body as Parameters<typeof api.createBooking>[1]);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['rbs'] });
      navigate('/');
    },
    onError: (e) => setErrors([e instanceof ApiError ? e.key : 'rbs.error.technical']),
  });

  const submit = () => {
    const found = checkForm({ start: baseStart, end: baseEnd, periodic, days, quantity, available });
    if (withProfile && !chosen) found.push('rbs.booking.invalid.slots');
    setErrors(found);
    if (found.length === 0 && resource) save.mutate();
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────────────────────────────────
  if (!initialised) return <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>;
  if (editId !== null && !editQuery.data) {
    return (
      <div className="alert alert-warning" role="alert">
        {t('rbs.booking.notfound', { defaultValue: "Cette réservation n'existe plus ou vous n'y avez pas accès." })} <Link to="/">{t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link>
      </div>
    );
  }

  const stepTitle = (id: Step, picked: ReactNode, pick: string) => (
    <h2 style={{ fontSize: 18, cursor: 'pointer' }} className="mb-0" onClick={() => setStep(id)}>
      {step === id ? pick : picked}
    </h2>
  );
  const errorList = errors.length > 0 && (
    <div role="alert" data-form-errors>
      {errors.map((e) => (
        <div key={e} className="alert alert-warning mb-8">
          {t(e, { defaultValue: e })}
        </div>
      ))}
    </div>
  );
  const quantityWrong = !quantity || quantity > available;
  const editing = editId !== null;
  const dayName = (n: number) => t(`rbs.booking.edit.period.days.${n}`, { defaultValue: String(n) });

  return (
    <div data-booking-form>
      <p>
        <Link to="/">← {t('rbs.back', { defaultValue: 'Retour au calendrier' })}</Link>
      </p>
      <h1 className="mb-16">{t('rbs.booking.new', { defaultValue: 'Nouvelle réservation' })}</h1>

      {/* 1. Ressource */}
      <section className="card mb-12" data-step="resource">
        <div className="p-16" style={{ borderBottom: step === 'resource' ? '1px solid #eee' : 'none' }}>
          {stepTitle(
            'resource',
            <>
              {t('rbs.header.resource.picked', { defaultValue: '1 - Ressource : ' })}
              <span className="float-end">{type && resource ? `${type.name} - ${resource.name}` : t('rbs.booking.no.resource', { defaultValue: 'Aucune ressource' })}</span>
            </>,
            t('rbs.header.resource.pick', { defaultValue: '1 - Choisir une ressource' }),
          )}
        </div>
        {step === 'resource' && (
          <div className="p-16">
            {editing ? (
              <>
                <FieldRow label={t('rbs.booking.edit.type.label', { defaultValue: 'Type de ressource' })}>
                  <input className="form-control" disabled value={type?.name ?? ''} readOnly />
                </FieldRow>
                <FieldRow label={t('rbs.booking.edit.resource.label', { defaultValue: 'Ressource' })}>
                  <input className="form-control" disabled value={resource?.name ?? ''} readOnly />
                </FieldRow>
              </>
            ) : (
              <>
                <FieldRow label={t('rbs.booking.edit.structure.label', { defaultValue: 'Établissement' })} htmlFor="rbs-bf-structure">
                  {structures.length > 0 ? (
                    <select
                      id="rbs-bf-structure"
                      className="form-select"
                      value={structureId}
                      onChange={(e) => {
                        const s = structures.find((x) => x.id === e.target.value);
                        setStructureId(e.target.value);
                        const first = s?.types.find((x) => resources.some((r) => r.type_id === x.id)) ?? s?.types[0];
                        setTypeId(first?.id ?? 0);
                        setResourceId(0);
                      }}
                    >
                      {structures.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="alert alert-warning mb-0">{t('rbs.booking.warning.no.structure', { defaultValue: 'Aucun établissement disponible à la réservation' })}</div>
                  )}
                </FieldRow>
                {structure && (
                  <FieldRow label={t('rbs.booking.edit.type.label', { defaultValue: 'Type de ressource' })} htmlFor="rbs-bf-type">
                    {structure.types.length > 0 ? (
                      <select
                        id="rbs-bf-type"
                        className="form-select"
                        value={typeId}
                        onChange={(e) => {
                          setTypeId(Number(e.target.value));
                          setResourceId(0);
                        }}
                      >
                        {[...structure.types]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <div className="alert alert-warning mb-0">{t('rbs.booking.warning.no.types', { defaultValue: 'Aucun type de ressources disponible à la réservation pour cet établissement' })}</div>
                    )}
                  </FieldRow>
                )}
                {type && (
                  <FieldRow label={t('rbs.booking.edit.resource.label', { defaultValue: 'Ressource' })} htmlFor="rbs-bf-resource">
                    {bookableResources.length > 0 ? (
                      <select id="rbs-bf-resource" className="form-select" value={resourceId} onChange={(e) => setResourceId(Number(e.target.value))}>
                        {bookableResources.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="alert alert-warning mb-0">{t('rbs.booking.warning.no.resources', { defaultValue: 'Aucune ressource disponible à la réservation pour ce type' })}</div>
                    )}
                  </FieldRow>
                )}
              </>
            )}
            {errorList}
            {resource &&
              (resource.description ? <p data-resource-description style={{ whiteSpace: 'pre-wrap' }}>{plain(resource.description)}</p> : <p className="text-muted">{t('rbs.booking.edit.description.empty', { defaultValue: "Cette ressource n'a pas de description renseignée." })}</p>)}
            {type && (
              <p data-moderators>
                {type.validation ? (
                  <>
                    <strong>{t('rbs.booking.details.moderators', { defaultValue: 'Valideur(s) :' })}</strong>{' '}
                    {(moderators.data ?? []).map((m, i, all) => (
                      <span key={`${m.id}-${i}`}>
                        {m.username}
                        {m.type ? <em className="small"> ({m.type})</em> : null}
                        {i < all.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </>
                ) : (
                  <strong>{t('rbs.booking.details.no.validation', { defaultValue: "Il n'y a pas de validation sur ce type de resource" })}</strong>
                )}
              </p>
            )}
            <div className="d-flex justify-content-end">
              <button type="button" className="btn btn-primary" disabled={!resource} onClick={() => setStep('slot')}>
                {t('rbs.next', { defaultValue: 'Suivant' })}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2. Créneau */}
      <section className="card mb-12" data-step="slot">
        <div className="p-16" style={{ borderBottom: step === 'slot' ? '1px solid #eee' : 'none' }}>
          {stepTitle(
            'slot',
            <>
              {t('rbs.header.booking.picked', { defaultValue: '2 - Créneau : ' })}
              <span className="float-end">
                {periodic
                  ? `${t('rbs.booking.details.header.from.periodic', { defaultValue: 'A partir du' })} ${day.toLocaleDateString(locale)} ${t('rbs.booking.details.header.at', { defaultValue: 'à' })} ${timeValue(start)}`
                  : `${t('rbs.booking.details.header.from', { defaultValue: 'Du' })} ${day.toLocaleDateString(locale)} ${t('rbs.booking.details.header.at', { defaultValue: 'à' })} ${timeValue(start)} ${t('rbs.booking.details.header.to', { defaultValue: 'au' })} ${day.toLocaleDateString(locale)} ${t('rbs.booking.details.header.at', { defaultValue: 'à' })} ${timeValue(end)}`}
              </span>
            </>,
            t('rbs.header.booking.pick', { defaultValue: '2 - Choisir un créneau' }),
          )}
        </div>
        {step === 'slot' && resource && (
          <div className="p-16">
            <RulesNotice resource={resource} rules={rules} t={t} />
            <FieldRow label={t('rbs.booking.edit.date.label', { defaultValue: 'Date de réservation : ' })} htmlFor="rbs-bf-date">
              <input
                id="rbs-bf-date"
                type="date"
                className="form-control"
                style={{ width: 190 }}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value) {
                    const d = fromDayValue(e.target.value);
                    if (fromDayValue(until) < d) setUntil(e.target.value);
                    if (periodic && !editing) setDays((prev) => (prev.some(Boolean) ? prev : defaultDays(d)));
                  }
                }}
              />
            </FieldRow>

            {withProfile ? (
              <FieldRow label={t('rbs.booking.edit.slot.label', { defaultValue: 'Horaires prédéfinis :' })}>
                <div className="d-flex align-items-center gap-8 flex-wrap">
                  <select aria-label={t('rbs.booking.details.header.from', { defaultValue: 'Du' })} className="form-select" style={{ width: 'auto' }} value={firstSlot} onChange={(e) => setFirstSlot(Number(e.target.value))}>
                    {profileSlots.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name} - {t('rbs.booking.details.header.from', { defaultValue: 'De' })} {s.startHour.slice(0, 5)}
                      </option>
                    ))}
                  </select>
                  <span>{t('rbs.booking.details.header.at', { defaultValue: 'à' })}</span>
                  <select aria-label={t('rbs.booking.details.header.to', { defaultValue: 'au' })} className="form-select" style={{ width: 'auto' }} value={lastSlot} onChange={(e) => setLastSlot(Number(e.target.value))}>
                    {profileSlots.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name} - {t('rbs.booking.edit.end.hour', { defaultValue: 'À' })} {s.endHour.slice(0, 5)}
                      </option>
                    ))}
                  </select>
                </div>
              </FieldRow>
            ) : (
              <FieldRow label={t('rbs.booking.edit.time.label', { defaultValue: 'Horaire de réservation : ' })}>
                <div className="d-flex align-items-center gap-8">
                  <label htmlFor="rbs-bf-start">{t('rbs.booking.from', { defaultValue: 'de' })}</label>
                  <input id="rbs-bf-start" type="time" step={300} className="form-control" style={{ width: 130 }} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <label htmlFor="rbs-bf-end">{t('rbs.booking.to', { defaultValue: 'à' })}</label>
                  <input id="rbs-bf-end" type="time" step={300} className="form-control" style={{ width: 130 }} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </FieldRow>
            )}

            <div className="mb-8" data-quantity-info>
              {available <= 0 ? (
                <strong>{t('rbs.booking.edit.quantity.none', { defaultValue: 'Il n’y a plus de ressource disponible pour ce créneau' })}</strong>
              ) : (
                <>
                  {t('rbs.booking.edit.quantity.availability.thereis', { defaultValue: 'Il y a ' })}
                  <strong>{available}</strong>
                  {t('rbs.booking.edit.quantity.availability.on', { defaultValue: ' sur ' })}
                  <strong>{total}</strong> {t('rbs.booking.edit.quantity.availability.text', { defaultValue: 'ressources disponibles pour cette période' })}
                </>
              )}
            </div>
            <FieldRow label={t('rbs.booking.edit.quantity.label', { defaultValue: 'Quantité' })} htmlFor="rbs-bf-qty">
              <input
                id="rbs-bf-qty"
                type="number"
                className="form-control"
                style={{ width: 100 }}
                min={1}
                max={Math.max(1, available)}
                disabled={available <= 0}
                value={available <= 0 ? 0 : quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
              />
            </FieldRow>

            {edtConflict.isError && (
              <div className="alert alert-warning" role="alert" data-edt-conflict-error>
                {t('rbs.edt.room.conflict.error', { defaultValue: "La vérification avec l'emploi du temps a échoué : un cours peut déjà occuper cette salle sur ce créneau." })}
              </div>
            )}
            {hasEdtConflict && (
              <div className="alert alert-warning" data-edt-conflict>
                {t('rbs.edt.room.conflict.warning', { defaultValue: 'Un cours est déjà prévu dans [[room]] sur ce créneau, d\'après l\'emploi du temps.', room: resource.name }).replace('{{room}}', resource.name)}
              </div>
            )}
            <div className="mb-12">
              <button type="button" className="btn btn-link p-0" aria-expanded={showSchedule} title={t('rbs.roomSchedule.help', { defaultValue: '' })} onClick={() => setShowSchedule(!showSchedule)}>
                {t('rbs.roomSchedule.check', { defaultValue: 'Vérifier les disponibilités de la ressource' })}
              </button>
              {showSchedule && (
                <div data-mini-schedule className="mt-8">
                  {schedule.isLoading && <p className="text-muted">{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
                  {schedule.isError && <p className="text-danger" role="alert" data-schedule-error>{t('rbs.roomSchedule.error', { defaultValue: "Impossible de vérifier les disponibilités : la ressource n'est peut-être pas libre." })}</p>}
                  {schedule.data && schedule.data.length === 0 && <p className="text-muted">{t('rbs.roomSchedule.empty', { defaultValue: 'Aucun créneau occupé cette semaine pour cette ressource.' })}</p>}
                  {schedule.data && schedule.data.length > 0 && (
                    <table className="table table-sm">
                      <tbody>
                        {schedule.data.map((row, i) => (
                          <tr key={i}>
                            <td>{row.start.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' })}</td>
                            <td>
                              {timeValue(row.start)} - {timeValue(row.end)}
                            </td>
                            <td>{row.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            <div className="form-check mb-12">
              <input
                id="rbs-bf-periodic"
                type="checkbox"
                className="form-check-input"
                checked={periodic}
                disabled={editing || (!resource.periodic_booking && !periodic)}
                onChange={(e) => {
                  setPeriodic(e.target.checked);
                  if (e.target.checked) setDays((prev) => (prev.some(Boolean) ? prev : defaultDays(day)));
                }}
              />
              <label htmlFor="rbs-bf-periodic" className="form-check-label">
                {t('rbs.booking.edit.periodic_booking.label', { defaultValue: 'Réservation périodique' })}
              </label>
              {!resource.periodic_booking && !editing && <span className="text-muted small ms-8">{t('rbs.booking.edit.periodic_booking.false', { defaultValue: 'Non' })}</span>}
            </div>

            <textarea
              className="form-control mb-12"
              rows={3}
              aria-label={t('rbs.booking.edit.reason.label', { defaultValue: 'Motif de la réservation' })}
              placeholder={t('rbs.booking.edit.reason.label', { defaultValue: 'Motif de la réservation' })}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {errorList}
            {editing && periodic && <div className="alert alert-warning">{t('rbs.booking.warning.periodic', { defaultValue: 'Attention, vous allez modifier l’ensemble des créneaux de la réservation périodique' })}</div>}
            <div className="d-flex justify-content-end gap-8">
              {periodic ? (
                <button type="button" className="btn btn-primary" onClick={() => setStep('periodic')}>
                  {t('rbs.next', { defaultValue: 'Suivant' })}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={submit}>
                  {save.isPending ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.save', { defaultValue: 'Enregistrer' })}
                </button>
              )}
              <Link to="/" className="btn btn-secondary">
                {t('rbs.cancel', { defaultValue: 'Annuler' })}
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* 3. Périodicité */}
      {periodic && (
        <section className="card mb-12" data-step="periodic">
          <div className="p-16" style={{ borderBottom: step === 'periodic' ? '1px solid #eee' : 'none' }}>
            {stepTitle(
              'periodic',
              <>
                {t('rbs.header.periodic.picked', { defaultValue: '3 - Périodicité : ' })}
                <span className="float-end">{summary?.short}</span>
              </>,
              t('rbs.header.periodic.pick', { defaultValue: '3 - Configurer la périodicité' }),
            )}
          </div>
          {step === 'periodic' && (
            <div className="p-16">
              <div className="d-flex align-items-center gap-8 mb-12">
                <label htmlFor="rbs-bf-periodicity">{t('rbs.booking.edit.period.label', { defaultValue: 'Répéter toutes les ' })}</label>
                <select id="rbs-bf-periodicity" className="form-select" style={{ width: 80 }} value={periodicity} onChange={(e) => setPeriodicity(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>{t('rbs.booking.edit.period.unit', { defaultValue: 'semaines' })}</span>
              </div>
              <div className="d-flex gap-12 flex-wrap mb-12" role="group" aria-label={t('rbs.booking.days', { defaultValue: 'Jours' })}>
                {WEEK_ORDER.map((n) => (
                  <label key={n} className="d-flex align-items-center gap-4">
                    <input type="checkbox" checked={days[n]} onChange={() => setDays((prev) => prev.map((v, i) => (i === n ? !v : v)))} />
                    {dayName(n)}
                  </label>
                ))}
              </div>
              <p className="mb-4">
                <strong>{t('rbs.booking.edit.period.end.label', { defaultValue: 'Fin du créneau périodique' })}</strong>
              </p>
              <div className="d-flex align-items-center gap-8 mb-8">
                <input id="rbs-bf-by-occ" type="radio" name="rbs-bf-end" checked={byOccurrences} onChange={() => setByOccurrences(true)} />
                <label htmlFor="rbs-bf-by-occ">{t('rbs.booking.edit.period.end.after', { defaultValue: 'après' })}</label>
                <select aria-label={t('rbs.booking.edit.period.end.occurrences', { defaultValue: 'occurrences' })} className="form-select" style={{ width: 90 }} value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value))}>
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>{t('rbs.booking.edit.period.end.occurrences', { defaultValue: 'occurrences' })}</span>
              </div>
              <div className="d-flex align-items-center gap-8 mb-12">
                <input id="rbs-bf-by-date" type="radio" name="rbs-bf-end" checked={!byOccurrences} onChange={() => setByOccurrences(false)} />
                <label htmlFor="rbs-bf-by-date">{t('rbs.booking.edit.period.end.on', { defaultValue: 'le' })}</label>
                <input type="date" aria-label={t('rbs.booking.edit.period.end.on', { defaultValue: 'le' })} className="form-control" style={{ width: 190 }} min={date} value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
              <hr />
              <p className="mb-4">
                <strong>{t('rbs.booking.edit.period.summary', { defaultValue: 'Résumé :' })}</strong>
              </p>
              {summary?.error && <p className="text-warning">{summary.error}</p>}
              <p data-periodic-summary>{summary?.summary}</p>
              {quantityWrong && <div className="alert alert-warning">{t('rbs.booking.edit.period.warning.quantity', { defaultValue: 'Pas assez de ressource disponible sur un ou plusieurs des créneaux demandés' })}</div>}
              {errorList}
              <div className="d-flex justify-content-end gap-8">
                <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={submit}>
                  {save.isPending ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.save', { defaultValue: 'Enregistrer' })}
                </button>
                <Link to="/" className="btn btn-secondary">
                  {t('rbs.cancel', { defaultValue: 'Annuler' })}
                </Link>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="d-flex align-items-center gap-12 mb-12 flex-wrap">
      <label htmlFor={htmlFor} style={{ minWidth: 200 }} className="mb-0">
        {label}
      </label>
      <div style={{ flex: 1, minWidth: 220 }}>{children}</div>
    </div>
  );
}

/** Rappel des périodes (in)disponibles de la ressource, avec leurs jours et leur quantité. */
function RulesNotice({ resource, rules, t }: { resource: Resource; rules: Availability[]; t: (k: string, o?: Record<string, unknown>) => string }) {
  const shown = rules.filter((r) => (resource.is_available ? r.is_unavailability : !r.is_unavailability));
  if (shown.length === 0) return null;
  const letters = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return (
    <div className="mb-12" data-availability-rules>
      <p className="mb-4">
        {t('rbs.booking.edit.availabilities.resource.is', { defaultValue: 'La ressource est' })}{' '}
        <strong>{resource.is_available ? t('rbs.booking.edit.availabilities.unavailable', { defaultValue: 'indisponible' }) : t('rbs.booking.edit.availabilities.available', { defaultValue: 'disponible' })}</strong>
        {t('rbs.booking.edit.availabilities.timeslots', { defaultValue: ' sur les créneaux suivants :' })}
      </p>
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('rbs.resource.edit.tab.date.start', { defaultValue: 'Date début' })}</th>
            <th>{t('rbs.resource.edit.tab.timeslot', { defaultValue: 'Créneau' })}</th>
            <th>{t('rbs.resource.edit.tab.days', { defaultValue: 'Jours' })}</th>
            <th>{resource.is_available ? t('rbs.booking.edit.availabilities.tab.unavailable', { defaultValue: 'Quantité indisponible' }) : t('rbs.booking.edit.availabilities.tab.available', { defaultValue: 'Quantité disponible' })}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>
                {t('rbs.resource.edit.available.date.from', { defaultValue: 'Du ' })}
                {r.start_date.slice(0, 10).split('-').reverse().join('/')} {t('rbs.resource.edit.available.date.to', { defaultValue: 'Au ' })}
                {r.end_date.slice(0, 10).split('-').reverse().join('/')}
              </td>
              <td>
                {t('rbs.resource.edit.available.time.from', { defaultValue: 'De ' })}
                {r.start_time.slice(0, 5)} {t('rbs.resource.edit.available.time.at', { defaultValue: 'À ' })}
                {r.end_time.slice(0, 5)}
              </td>
              <td>
                {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                  <span key={n} className="me-4" style={{ fontWeight: r.days[n] === '1' ? 700 : 400, color: r.days[n] === '1' ? (resource.is_available ? '#c62828' : '#2e7d32') : '#aaa' }}>
                    {t(`rbs.resource.edit.available.days.${letters[n]}`, { defaultValue: letters[n][0].toUpperCase() })}
                  </span>
                ))}
              </td>
              <td>{r.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BookingForm;
