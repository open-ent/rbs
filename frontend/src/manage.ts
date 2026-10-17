// Gestion des types et des ressources, comme l'IHM AngularJS (controller.ts : types par défaut, délais, formulaire de
// ressource ; models.ts : Resource.toJSON). Logique pure, testée dans manage.test.ts.

import type { CreateTypeBody, Resource, ResourceInput, ResourceType } from './api';
import { PALETTE } from './calendar';

// ── Délais de réservation ───────────────────────────────────────────────────────────────────────────────────────

const DAY = 86400;
export const daysToSeconds = (days: number): number => days * DAY;
export const secondsToDays = (seconds: number): number => seconds / DAY;
/** Délais proposés : de 1 à 30 jours, comme l'AngularJS. */
export const DELAY_DAYS: number[] = Array.from({ length: 30 }, (_, i) => i + 1);

// ── Types de ressource ──────────────────────────────────────────────────────────────────────────────────────────

/** Catégories suggérées d'un type (texte libre côté serveur) : le solveur du planificateur les reconnaît. */
export const CATEGORIES = ['GENERAL', 'GYMNASE', 'LABO_PHYSIQUE_CHIMIE', 'LABO_SVT', 'TECHNO', 'MUSIQUE', 'ARTS', 'CDI', 'AMPHITHEATRE'];

/** Types de salle courants, pour éviter à un établissement de tout ressaisir à la main. */
export const DEFAULT_TYPES: Array<{ name: string; category: string }> = [
  { name: 'Gymnase', category: 'GYMNASE' },
  { name: 'Terrain de sport / Stade', category: 'GYMNASE' },
  { name: 'Laboratoire de Physique-Chimie', category: 'LABO_PHYSIQUE_CHIMIE' },
  { name: 'Laboratoire de SVT', category: 'LABO_SVT' },
  { name: 'CDI', category: 'CDI' },
  { name: 'Amphithéâtre', category: 'AMPHITHEATRE' },
  { name: 'Salle informatique', category: 'TECHNO' },
  { name: 'Salle de musique', category: 'MUSIQUE' },
  { name: "Salle d'arts plastiques", category: 'ARTS' },
];

export interface DefaultChoice {
  name: string;
  category: string;
  alreadyExists: boolean;
  checked: boolean;
  quantity: number;
}

/** Choix proposés à l'écran « types par défaut » : ceux qui existent déjà dans l'établissement sont grisés et décochés. */
export const defaultChoices = (existingNames: string[]): DefaultChoice[] =>
  DEFAULT_TYPES.map((d) => {
    const exists = existingNames.includes(d.name);
    return { ...d, alreadyExists: exists, checked: !exists, quantity: 1 };
  });

/**
 * Types à créer : les choix cochés (plusieurs exemplaires = « Nom 1 », « Nom 2 »…), puis la saisie libre, une ligne par
 * type au format « Nom » ou « Nom - CATEGORIE » (catégorie absente → GENERAL).
 * Ex. Laboratoire de SVT ×2 + « Salle 12 - labo_svt » → [« Laboratoire de SVT 1 », « Laboratoire de SVT 2 », « Salle 12 » (LABO_SVT)].
 */
export function typesToCreate(choices: DefaultChoice[], custom: string): Array<{ name: string; category: string }> {
  const out: Array<{ name: string; category: string }> = [];
  choices.forEach((c) => {
    if (!c.checked || c.alreadyExists) return;
    const qty = Math.max(1, Math.floor(c.quantity) || 1);
    if (qty === 1) out.push({ name: c.name, category: c.category });
    else for (let i = 1; i <= qty; i++) out.push({ name: `${c.name} ${i}`, category: c.category });
  });
  custom.split('\n').forEach((line) => {
    const parts = line.trim().split(' - ');
    const name = parts[0].trim();
    const category = parts.length > 1 && parts[1].trim() ? parts[1].trim().toUpperCase() : 'GENERAL';
    if (name) out.push({ name, category });
  });
  return out;
}

/** Couleur proposée à un nouveau type : la suivante de la palette après celles déjà prises dans l'établissement. */
export function nextTypeColor(types: Array<Pick<ResourceType, 'color'>>): string {
  const used = types.filter((t) => t.color && PALETTE.includes(t.color)).length;
  return PALETTE[used % PALETTE.length];
}

export interface TypeValues {
  name: string;
  validation: boolean;
  category: string;
  color: string;
  extendcolor: boolean;
  slotprofile: string | null;
}

/** Corps de création/modification d'un type. */
export function typeBody(v: TypeValues, schoolId?: string): CreateTypeBody & { category: string; extendcolor: boolean } {
  return {
    name: v.name.trim(),
    validation: v.validation,
    school_id: schoolId ?? '',
    color: v.color,
    extendcolor: v.extendcolor,
    // Le serveur n'accepte pas `null` : un profil non choisi est simplement absent. Catégorie vide → GENERAL, comme l'AngularJS.
    category: v.category.trim() || 'GENERAL',
    ...(v.slotprofile ? { slotprofile: v.slotprofile } : {}),
  };
}

// ── Ressources ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface ResourceValues {
  name: string;
  validation: boolean;
  isAvailable: boolean;
  periodic: boolean;
  hasMinDelay: boolean;
  minDays: number;
  hasMaxDelay: boolean;
  maxDays: number;
  quantity: number;
  isMobile: boolean;
  requiresKey: boolean;
  capacity: string;
  color: string;
  description: string;
}

/** Valeurs de départ du formulaire : celles de la ressource, ou — à la création — celles de son type. */
export function initialValues(resource: Resource | undefined, type: Pick<ResourceType, 'color' | 'validation'>): ResourceValues {
  return {
    name: resource?.name ?? '',
    validation: resource ? resource.validation : type.validation,
    isAvailable: resource ? resource.is_available : true,
    periodic: resource ? resource.periodic_booking : true,
    hasMinDelay: resource?.min_delay != null,
    minDays: resource?.min_delay != null ? Math.max(1, Math.round(secondsToDays(resource.min_delay))) : 1,
    hasMaxDelay: resource?.max_delay != null,
    maxDays: resource?.max_delay != null ? Math.max(1, Math.round(secondsToDays(resource.max_delay))) : 1,
    quantity: resource?.quantity ?? 1,
    isMobile: !!resource?.is_mobile,
    requiresKey: !!resource?.requires_key,
    capacity: resource?.capacity != null ? String(resource.capacity) : '',
    color: resource?.color ?? type.color ?? PALETTE[0],
    description: resource?.description ?? '',
  };
}

/**
 * Corps du serveur. Un local (salle, gymnase…) est unique : sa quantité est figée à 1 et sa capacité d'accueil se
 * saisit ; un matériel mobile a une quantité et pas de capacité. Délais non cochés : champs absents.
 */
export function resourceBody(v: ResourceValues, equipmentIds?: number[]): ResourceInput {
  const capacity = v.capacity.trim() === '' ? null : Math.max(0, Math.floor(Number(v.capacity)) || 0);
  return {
    name: v.name.trim(),
    description: v.description,
    periodic_booking: v.periodic,
    is_available: v.isAvailable,
    validation: v.validation,
    quantity: v.isMobile ? Math.max(1, Math.floor(v.quantity) || 1) : 1,
    color: v.color,
    capacity: v.isMobile ? null : capacity,
    is_mobile: v.isMobile,
    requires_key: v.requiresKey,
    ...(v.hasMinDelay ? { min_delay: daysToSeconds(v.minDays) } : {}),
    ...(v.hasMaxDelay ? { max_delay: daysToSeconds(v.maxDays) } : {}),
    // À la création seulement : une ressource existante passe par la route dédiée des équipements.
    ...(equipmentIds && equipmentIds.length ? { equipmentIds } : {}),
  };
}

/** Libellé d'un délai (« 3 jours ») ou `null` quand il n'y en a pas. */
export const delayLabel = (seconds: number | null | undefined): number | null => (seconds ? secondsToDays(seconds) : null);
