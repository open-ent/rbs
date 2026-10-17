// Logique pure du formulaire de réservation, comme l'IHM AngularJS (directives/booking-form/booking-form.ts,
// utilities/availability.util.ts, utilities/booking.util.ts). Aucune dépendance à React : testée dans
// bookingForm.test.ts.

import type { Availability, Booking, CreateBookingBody, CreatePeriodicBookingBody, Slot } from './api';
import { parseBackendDate } from './utils';

// ── Jours de la série ───────────────────────────────────────────────────────────────────────────────────────────

/** Jours dans l'ordre d'affichage (lundi→dimanche) avec leur numéro de semaine (0 = dimanche), comme `model.periods.days`. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Jours cochés par défaut : celui de la date de début (dimanche = index 0, comme le corps du serveur). */
export function defaultDays(start: Date): boolean[] {
  const days = Array(7).fill(false);
  days[start.getDay()] = true;
  return days;
}

/** Prochaine date, à partir de `start` incluse, tombant un jour coché : la série ne commence pas un jour non coché. */
export function firstOccurrenceDate(start: Date, days: boolean[]): Date {
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (days[d.getDay()]) return d;
  }
  return start;
}

// ── Résumé de la périodicité ────────────────────────────────────────────────────────────────────────────────────

/** Traducteur de clés ENT (« rbs.period.days.1 » → « lundi »). */
export type Tr = (key: string) => string;

interface PeriodDay {
  number: number;
  value: boolean;
}

/** Plages de jours lisibles : « Du lundi au mercredi, le vendredi » (port de `summaryBuildDays` / `summaryWriteRange`). */
function summaryDays(days: PeriodDay[], tr: Tr): string {
  let summary: string | undefined;
  let startBuffer: number | undefined;
  let lastIndex = days.length - 1;
  const writeRange = (first: PeriodDay, last: PeriodDay): void => {
    const d = (x: PeriodDay) => tr(`rbs.period.days.${x.number}`);
    if (first.number === last.number) {
      summary = summary === undefined ? ` ${tr('rbs.period.days.one.start')} ${d(first)}` : `${summary}${tr('rbs.period.days.one.continue')} ${d(first)}`;
    } else if (first.number + 1 === last.number || first.number - 6 === last.number) {
      const two = `${d(first)} ${tr('rbs.period.days.one.continue')} ${d(last)}`;
      summary = summary === undefined ? ` ${tr('rbs.period.days.one.start')} ${two}` : `${summary}${tr('rbs.period.days.one.continue')} ${two}`;
    } else {
      const range = `${d(first)} ${tr('rbs.period.days.range.to')} ${d(last)}`;
      summary = summary === undefined ? ` ${tr('rbs.period.days.range.start')} ${range}` : `${summary}${tr('rbs.period.days.range.continue')} ${range}`;
    }
  };
  // Lundi et dimanche cochés : la plage ne démarre pas au lundi, on cherche son vrai début en remontant.
  if (days[0].value && days[days.length - 1].value) {
    for (let k = days.length; k > 0; k--) {
      if (!days[k - 1].value) {
        lastIndex = k - 1;
        break;
      }
    }
    startBuffer = lastIndex + 1;
  }
  for (let i = 0; i <= lastIndex; i++) {
    if (startBuffer === undefined && days[i].value) startBuffer = i;
    if (startBuffer !== undefined) {
      if (i === lastIndex && days[lastIndex].value) {
        writeRange(days[startBuffer], days[lastIndex]);
        break;
      }
      if (!days[i].value) {
        writeRange(days[startBuffer], days[i - 1]);
        startBuffer = undefined;
      }
    }
  }
  return summary ?? '';
}

/** Les clés ENT portent leurs propres espaces (« Du », « , le ») : on ramène à des espaces simples, sans espace avant une virgule. */
const tidy = (text: string): string => text.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

export interface PeriodicInput {
  /** 7 booléens, index 0 = dimanche. */
  days: boolean[];
  periodicity: number;
  byOccurrences: boolean;
  occurrences: number;
  /** Date de fin lisible (« lundi 22 juin 2027 »), utilisée quand on termine à une date. */
  endDateLabel: string;
}

/**
 * Phrases de résumé d'une série, comme l'AngularJS. `summary` pour le corps de l'étape, `short` pour son titre replié ;
 * `error` quand aucun jour n'est coché.
 * Ex. lundi-mercredi, chaque semaine, 10 occurrences → « Du lundi au mercredi, chaque semaine, pour 10 occurrences ».
 */
export function periodicSummary(input: PeriodicInput, tr: Tr): { summary: string; short: string; error?: string } {
  const ordered: PeriodDay[] = WEEK_ORDER.map((n) => ({ number: n, value: !!input.days[n] }));
  const selected = ordered.filter((d) => d.value).length;
  let summary = '';
  let short = tr('rbs.period.days.some');
  if (selected === 0) return { summary: '', short, error: tr('rbs.period.error.nodays') };
  if (selected === 7) {
    summary = tr('rbs.period.days.all');
    short = summary;
  } else {
    summary = summaryDays(ordered, tr);
  }
  let tail = ', ';
  tail += input.periodicity === 1 ? `${tr('rbs.period.weeks.all')}, ` : `${tr('rbs.period.weeks.partial')} ${tr(`rbs.period.weeks.${input.periodicity}`)}, `;
  tail += input.byOccurrences
    ? `${tr('rbs.period.occurences.for')} ${input.occurrences} ${tr(`rbs.period.occurences.slots.${input.occurrences > 1 ? 'many' : 'one'}`)}`
    : `${tr('rbs.period.date.until')} ${input.endDateLabel}`;
  summary = tidy(`${summary}${tail}`.toLowerCase());
  summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  return { summary, short: tidy(`${short}${tail}`) };
}

// ── Occurrences d'une série ─────────────────────────────────────────────────────────────────────────────────────

export interface Occurrence {
  start: Date;
  end: Date;
}

/**
 * Occurrences d'une série : à partir de `start` (même durée à chaque fois), les jours cochés de chaque semaine retenue
 * (une semaine sur `periodicity`), jusqu'à `occurrences` occurrences ou jusqu'à la date de fin incluse.
 * Ex. lundi+jeudi, chaque semaine, 3 occurrences à partir du lundi 5/10 → 5/10, 8/10, 12/10.
 */
export function occurrenceList(start: Date, end: Date, days: boolean[], periodicity: number, limit: { occurrences: number } | { until: Date }): Occurrence[] {
  const out: Occurrence[] = [];
  if (!days.some(Boolean)) return out;
  const duration = end.getTime() - start.getTime();
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  monday.setDate(monday.getDate() - ((start.getDay() + 6) % 7));
  const untilTime = 'until' in limit ? new Date(limit.until.getFullYear(), limit.until.getMonth(), limit.until.getDate(), 23, 59, 59).getTime() : 0;
  const stop = (o: Occurrence) => ('occurrences' in limit ? out.length >= limit.occurrences : o.start.getTime() > untilTime);
  for (let week = 0; week < 520; week++) {
    for (const dow of WEEK_ORDER) {
      if (!days[dow]) continue;
      const day = new Date(monday);
      day.setDate(monday.getDate() + week * 7 * Math.max(1, periodicity) + ((dow + 6) % 7));
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes());
      if (s < start) continue;
      const occ = { start: s, end: new Date(s.getTime() + duration) };
      if (stop(occ)) return out;
      out.push(occ);
    }
  }
  return out;
}

// ── Quantité disponible ─────────────────────────────────────────────────────────────────────────────────────────

/** Caractéristiques de la ressource utiles au calcul. */
export interface ResourceQuantity {
  quantity: number;
  is_available: boolean;
}

const ymd = (d: Date): string => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ruleDay = (iso: string): string => iso.slice(0, 10).replace(/-/g, '/');
const ruleTime = (t: string): string => t.slice(0, 5);

/** Une des journées couvertes par l'occurrence est-elle un jour coché de la règle (bitstring, index 0 = dimanche) ? */
function onCheckedDay(occ: Occurrence, rule: Availability): boolean {
  const last = new Date(occ.end.getFullYear(), occ.end.getMonth(), occ.end.getDate());
  for (let d = new Date(occ.start.getFullYear(), occ.start.getMonth(), occ.start.getDate()); d <= last; d.setDate(d.getDate() + 1)) {
    if (rule.days[d.getDay()] === '1') return true;
  }
  return false;
}

/** L'occurrence chevauche-t-elle la période d'une indisponibilité (jours, dates et heures) ? */
const overlapsRule = (occ: Occurrence, rule: Availability, now: Date): boolean =>
  occ.start > now && onCheckedDay(occ, rule) && ymd(occ.start) <= ruleDay(rule.end_date) && hm(occ.start) < ruleTime(rule.end_time) && ymd(occ.end) >= ruleDay(rule.start_date) && hm(occ.end) > ruleTime(rule.start_time);

/** L'occurrence est-elle entièrement couverte par la période d'une disponibilité ? */
const coveredByRule = (occ: Occurrence, rule: Availability, now: Date): boolean =>
  occ.start > now && onCheckedDay(occ, rule) && ymd(occ.start) >= ruleDay(rule.start_date) && hm(occ.start) >= ruleTime(rule.start_time) && ymd(occ.end) <= ruleDay(rule.end_date) && hm(occ.end) <= ruleTime(rule.end_time);

/**
 * Quantité de la ressource sur ce créneau : si elle est disponible par défaut, sa quantité moins les indisponibilités
 * qui le chevauchent ; sinon, la somme des disponibilités qui le couvrent (plafonnées à sa quantité).
 */
export function resourceQuantityAt(occ: Occurrence, resource: ResourceQuantity, rules: Availability[], now = new Date()): number {
  if (resource.is_available) {
    return rules.filter((r) => r.is_unavailability && overlapsRule(occ, r, now)).reduce((q, r) => q - r.quantity, resource.quantity);
  }
  return rules.filter((r) => !r.is_unavailability && coveredByRule(occ, r, now)).reduce((q, r) => q + Math.min(resource.quantity, r.quantity), 0);
}

const overlaps = (a: Occurrence, b: Occurrence): boolean => ymdhms(a.start) < ymdhms(b.end) && ymdhms(a.end) > ymdhms(b.start);
const ymdhms = (d: Date): number => d.getTime();
const asOccurrence = (b: Booking): Occurrence => ({ start: parseBackendDate(b.start_date), end: parseBackendDate(b.end_date) });

/**
 * Quantité déjà prise par les réservations qui chevauchent le créneau : la plus forte somme simultanée (une réservation
 * plus celles qui la chevauchent aussi et chevauchent le créneau). Réservations refusées, mères de série et déjà
 * commencées ignorées ; `exceptId` : la réservation en cours de modification, et ses occurrences, ne comptent pas.
 */
export function bookingsQuantityUsed(occ: Occurrence, bookings: Booking[], exceptId?: number, now = new Date()): number {
  const counted = (b: Booking) => !b.is_periodic && b.status !== 3 && !!b.quantity && asOccurrence(b).start > now && b.id !== exceptId && b.parent_booking_id !== exceptId;
  const siblings = bookings.filter((b) => counted(b) && overlaps(occ, asOccurrence(b)));
  let used = 0;
  siblings.forEach((s) => {
    const sOcc = asOccurrence(s);
    const local = bookings
      .filter((l) => counted(l) && l.id !== s.id && overlaps(asOccurrence(l), sOcc) && overlaps(asOccurrence(l), occ))
      .reduce((sum, l) => sum + l.quantity, s.quantity);
    used = Math.max(used, local);
  });
  return used;
}

/** Quantité encore disponible sur un créneau : celle de la ressource moins celle déjà prise (jamais négative). */
export function quantityAvailableAt(occ: Occurrence, resource: ResourceQuantity, rules: Availability[], bookings: Booking[], exceptId?: number, now = new Date()): number {
  if (!resource.quantity || resource.quantity <= 0 || occ.start <= now || occ.start.getTime() === occ.end.getTime()) return 0;
  const free = resourceQuantityAt(occ, resource, rules, now) - bookingsQuantityUsed(occ, bookings, exceptId, now);
  return free > 0 ? free : 0;
}

/** Pour une série, la plus petite quantité disponible parmi ses occurrences. */
export function seriesQuantityAvailable(occurrences: Occurrence[], resource: ResourceQuantity, rules: Availability[], bookings: Booking[], exceptId?: number, now = new Date()): number {
  if (occurrences.length === 0) return 0;
  return Math.min(...occurrences.map((o) => quantityAvailableAt(o, resource, rules, bookings, exceptId, now)));
}

// ── Validation et corps de la requête ───────────────────────────────────────────────────────────────────────────

export interface FormCheck {
  start: Date;
  end: Date;
  periodic: boolean;
  days: boolean[];
  /** Quantité saisie. */
  quantity: number;
  /** Quantité disponible sur le créneau (ou la série). */
  available: number;
}

/**
 * Erreurs de saisie, par clé i18n du module : début dans le passé, début = fin, fin avant début, aucun jour coché pour
 * une série, quantité nulle ou supérieure au disponible.
 */
export function checkForm(f: FormCheck, now = new Date()): string[] {
  const errors: string[] = [];
  if (f.start < now) errors.push('rbs.booking.invalid.datetimes.past');
  if (f.start.getTime() === f.end.getTime()) errors.push('rbs.booking.invalid.datetimes.equals');
  else if (f.end < f.start) errors.push('rbs.booking.invalid.datetimes.switched');
  if (f.periodic && !f.days.some(Boolean)) errors.push('rbs.booking.missing.days');
  // Un créneau passé ou sans durée n'a aucune quantité disponible : le dire en plus noierait la vraie cause.
  if (errors.length === 0) {
    if (!f.quantity || f.quantity < 1) errors.push('rbs.booking.edit.quantity.null');
    else if (f.quantity > f.available) errors.push('rbs.booking.edit.quantity.none');
  }
  return errors;
}

const unix = (d: Date): number => Math.floor(d.getTime() / 1000);

export interface BodyInput {
  reason: string;
  quantity: number;
  iana: string;
  /** Un créneau par plage horaire prédéfinie retenue, ou un seul créneau libre. */
  slots: Array<{ start: Date; end: Date }>;
  periodic?: {
    periodicity: number;
    days: boolean[];
    byOccurrences: boolean;
    occurrences: number;
    until: Date;
  };
}

/** Corps de la création (POST) ou de la modification (PUT) : simple, ou périodique avec fin par occurrences ou par date. */
export function buildBody(input: BodyInput): CreateBookingBody | CreatePeriodicBookingBody {
  const slots: Slot[] = input.slots.map((s) => ({ start_date: unix(s.start), end_date: unix(s.end), iana: input.iana }));
  const base = { booking_reason: input.reason.trim(), quantity: input.quantity, slots };
  if (!input.periodic) return base;
  const p = input.periodic;
  const until = new Date(p.until.getFullYear(), p.until.getMonth(), p.until.getDate(), input.slots[0].end.getHours(), input.slots[0].end.getMinutes());
  return {
    ...base,
    periodicity: p.periodicity,
    days: p.days,
    iana: input.iana,
    ...(p.byOccurrences ? { occurrences: p.occurrences } : { periodic_end_date: unix(until) }),
  };
}

// ── Plages horaires prédéfinies ─────────────────────────────────────────────────────────────────────────────────

export interface ProfileSlot {
  id?: number;
  name: string;
  startHour: string;
  endHour: string;
}

/** Plages triées par heure de début. */
export const sortProfileSlots = (slots: ProfileSlot[]): ProfileSlot[] => [...slots].sort((a, b) => a.startHour.localeCompare(b.startHour));

/** Plages comprises entre la première et la dernière choisies (indices dans la liste triée, inclus) ; `null` si l'ordre est inversé. */
export function selectedProfileSlots(sorted: ProfileSlot[], first: number, last: number): ProfileSlot[] | null {
  if (first < 0 || last < 0 || first > last) return null;
  return sorted.slice(first, last + 1);
}

/** Date locale + « HH:mm » → Date. */
export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
}

// ── Erreurs du serveur ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Clé i18n d'une réponse d'erreur : le serveur envoie `{ error: "<clé>" }` quand il sait la cause (délai minimum,
 * ressource indisponible…) ; sinon on retombe sur le statut (401, 404, 409). Ex. 409 sans corps → `rbs.error.conflict`.
 */
export function errorKey(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string' && parsed.error) return parsed.error;
  } catch {
    // corps non JSON : on retombe sur le statut
  }
  if (status === 401) return 'rbs.error.unauthorized';
  if (status === 404) return 'rbs.error.notfound';
  if (status === 409) return 'rbs.error.conflict';
  return 'rbs.error.unknown';
}
