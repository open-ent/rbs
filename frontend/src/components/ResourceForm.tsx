import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, AssignedResource, Booking, Equipment, Resource, ResourceType } from '../api';
import { availabilityBody, fromAvailability } from '../availabilityForm';
import { planTreatment } from '../bookingActions';
import { treatResource } from '../bookingTreatment';
import { DELAY_DAYS, initialValues, resourceBody, ResourceValues } from '../manage';
import { Modal } from '../screens/Modal';
import { formatDateTime } from '../utils';
import { AvailabilityPanel } from './AvailabilityPanel';
import { DescriptionEditor } from './DescriptionEditor';

const HINT_STYLE = { fontStyle: 'italic', color: '#767676' } as const;

interface Props {
  /** Type où la ressource est créée ou se trouve. */
  type: ResourceType;
  /** Types où l'usager peut gérer des ressources (changement de type d'une ressource existante). */
  manageable: ResourceType[];
  /** `undefined` = création. */
  resource?: Resource;
  structureName: string;
  canTreat: (b: Booking) => boolean;
  onClose: () => void;
}

/**
 * Formulaire d'une ressource (création et modification), parité IHM AngularJS : type, nom, validation, disponibilité par
 * défaut, périodique, intervalles minimum et maximum de réservation, quantité (figée à 1 pour un local), matériel mobile,
 * clé, capacité d'accueil, équipements du catalogue (dont création d'un équipement), affectation du matériel mobile à des
 * salles, périodes de disponibilité ou d'indisponibilité, couleur et description riche. Réduire la quantité ou fermer la
 * ressource met des réservations en conflit : elles sont listées avant enregistrement, puis suspendues.
 */
export function ResourceForm({ type: initialType, manageable, resource, structureName, canTreat, onClose }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const editing = !!resource;

  const [typeId, setTypeId] = useState(initialType.id);
  const type = manageable.find((x) => x.id === typeId) ?? initialType;
  const [values, setValues] = useState<ResourceValues>(() => initialValues(resource, initialType));
  const set = <K extends keyof ResourceValues>(key: K, value: ResourceValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmConflicts, setConfirmConflicts] = useState<Booking[] | null>(null);

  // ── Équipements (salle) ───────────────────────────────────────────────────────────────────────────────
  const catalog = useQuery({ queryKey: ['rbs', 'equipments', type.school_id], queryFn: () => api.getEquipments(type.school_id) });
  const [equipment, setEquipment] = useState<Equipment[]>(resource?.equipment ?? []);
  const [equipmentPick, setEquipmentPick] = useState('');
  const [newEquipment, setNewEquipment] = useState('');
  const [sideError, setSideError] = useState('');

  /** Ressource existante : chaque ajout ou retrait est enregistré aussitôt (route dédiée), comme l'AngularJS. */
  const persistEquipment = async (list: Equipment[]) => {
    setEquipment(list);
    if (!resource) return;
    try {
      await api.setResourceEquipment(resource.id, list.map((e) => e.id));
      setSideError('');
      qc.invalidateQueries({ queryKey: ['rbs', 'resources'] });
    } catch {
      setSideError(t('rbs.resource.edit.equipment.save.error', { defaultValue: "Impossible d'enregistrer les équipements de cette ressource" }));
    }
  };
  const addEquipment = (id: number) => {
    const found = (catalog.data ?? []).find((e) => e.id === id);
    if (found && !equipment.some((e) => e.id === id)) void persistEquipment([...equipment, found]);
    setEquipmentPick('');
  };
  const createEquipment = async () => {
    const name = newEquipment.trim();
    if (!name) return;
    try {
      const created = await api.createEquipment(type.school_id, name);
      await qc.invalidateQueries({ queryKey: ['rbs', 'equipments', type.school_id] });
      setNewEquipment('');
      await persistEquipment([...equipment, created]);
    } catch {
      setSideError(t('rbs.resource.edit.equipment.save.error', { defaultValue: "Impossible d'enregistrer les équipements de cette ressource" }));
    }
  };

  // ── Affectations (matériel mobile) ────────────────────────────────────────────────────────────────────
  const candidates = useQuery({ queryKey: ['rbs', 'assign-candidates', type.school_id, resource?.id], queryFn: () => api.getAssignmentCandidates(type.school_id, resource!.id), enabled: editing && values.isMobile });
  const current = useQuery({ queryKey: ['rbs', 'assignments', resource?.id], queryFn: () => api.getAssignments(resource!.id), enabled: editing && values.isMobile });
  const [assigned, setAssigned] = useState<AssignedResource[] | null>(null);
  const assignments = assigned ?? current.data ?? [];
  const [assignPick, setAssignPick] = useState('');
  const persistAssignments = async (list: AssignedResource[]) => {
    setAssigned(list);
    try {
      await api.setAssignments(resource!.id, list.map((r) => r.id));
      setSideError('');
    } catch {
      setSideError(t('rbs.resource.edit.assignment.save.error', { defaultValue: "Impossible d'enregistrer l'affectation de cette ressource" }));
    }
  };

  // ── Conflits quantité / disponibilité ─────────────────────────────────────────────────────────────────
  const bookings = useQuery({ queryKey: ['rbs', 'resource', resource?.id, 'bookings'], queryFn: () => api.getResourceBookings(resource!.id), enabled: editing });
  const rules = useQuery({ queryKey: ['rbs', 'availability', resource?.id], queryFn: () => api.getResourceAvailability(resource!.id), enabled: editing });
  const conflicts = useMemo(() => {
    if (!resource || !bookings.data) return [];
    const quantity = values.isMobile ? Math.max(1, values.quantity) : 1;
    // Une ressource qui change de mode perd ses périodes de l'ancien mode : on ne les compte plus.
    const kept = (rules.data ?? []).filter((r) => r.is_unavailability === values.isAvailable);
    return planTreatment(bookings.data, { quantity, is_available: values.isAvailable }, kept).suspend;
  }, [resource, bookings.data, rules.data, values.quantity, values.isMobile, values.isAvailable]);
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [openAvailability, setOpenAvailability] = useState(false);
  useEffect(() => {
    if (rules.data && rules.data.length > 0) setOpenAvailability(true);
  }, [rules.data]);

  // ── Enregistrement ────────────────────────────────────────────────────────────────────────────────────
  const errorKeys = (e: unknown): string[] => [e instanceof ApiError ? e.key : 'rbs.error.technical'];
  const doSave = async () => {
    setBusy(true);
    setErrors([]);
    setConfirmConflicts(null);
    try {
      const body = resourceBody(values, editing ? undefined : equipment.map((e) => e.id));
      let saved: Resource;
      if (editing) {
        saved = await api.updateResource(resource!.id, type.id, resource!.is_available, body);
        // Passer de disponible à indisponible (ou l'inverse) rend caduques les périodes de l'ancien mode.
        if (resource!.is_available !== values.isAvailable) await api.deleteAllAvailabilities(resource!.id, !values.isAvailable);
        else {
          const kept = (rules.data ?? []).filter((r) => r.is_unavailability === values.isAvailable && r.quantity > body.quantity!);
          for (const r of kept) await api.updateAvailability(resource!.id, r.id, availabilityBody(resource!.id, r.is_unavailability, { ...fromAvailability(r), quantity: body.quantity! }, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris')).catch(() => undefined);
        }
      } else {
        saved = await api.createResource(type.id, body);
      }
      await qc.invalidateQueries({ queryKey: ['rbs'] });
      if (editing) await treatResource({ ...saved, ...resource!, quantity: body.quantity ?? 1, is_available: values.isAvailable, validation: values.validation }, canTreat);
      await qc.invalidateQueries({ queryKey: ['rbs'] });
      onClose();
    } catch (e) {
      setErrors(errorKeys(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!values.name.trim()) {
      setErrors(['rbs.resource.edit.name.placeholder']);
      return;
    }
    // Les deux intervalles doivent se suivre : le serveur refuse un minimum supérieur au maximum.
    if (values.hasMinDelay && values.hasMaxDelay && values.minDays > values.maxDays) {
      setErrors(['rbs.resource.bad.request.min_delay.greater.than.max_delay']);
      return;
    }
    if (editing && conflicts.length > 0) setConfirmConflicts(conflicts);
    else void doSave();
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────────────────────────────────
  const row = (label: string, body: ReactNode, htmlFor?: string) => (
    <div className="d-flex gap-12 mb-12 flex-wrap">
      <label htmlFor={htmlFor} style={{ minWidth: 220 }} className="mb-0">
        {label}
      </label>
      <div style={{ flex: 1, minWidth: 260 }}>{body}</div>
    </div>
  );
  const hint = (text: string) => <div style={HINT_STYLE}>{text}</div>;
  const check = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void, help?: string) => (
    <div className="mb-8" style={{ marginLeft: 220 }}>
      <div className="form-check">
        <input id={id} type="checkbox" className="form-check-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} className="form-check-label">
          {label}
        </label>
      </div>
      {help && hint(help)}
    </div>
  );
  const unusedEquipment = (catalog.data ?? []).filter((e) => !equipment.some((x) => x.id === e.id));
  const unusedCandidates = (candidates.data ?? []).filter((r) => !assignments.some((x) => x.id === r.id));

  return (
    <div data-resource-form>
      {confirmConflicts && (
        <Modal title={t('rbs.updating.resource', { defaultValue: "Modification d'une ressource" })} onClose={() => !busy && setConfirmConflicts(null)}>
          <div data-quantity-confirm>
            <p>
              <strong>{t('rbs.availability.save.warning', { defaultValue: 'Attention' })}</strong>
            </p>
            <p>{t('rbs.resource.edit.quantity.warning', { defaultValue: 'Des réservations supérieures à cette quantité ont été prévues' })}.</p>
            <p>{t('rbs.booking.suspended', { defaultValue: 'Cela entrainera la suspension des réservations concernées.' })}</p>
            <p>{t('rbs.booking.manager.decision', { defaultValue: 'Les gestionnaires devront définir les réservations à conserver.' })}</p>
            <p>{t('rbs.booking.concerned', { defaultValue: 'Réservations concernées' })}</p>
            <ConflictTable bookings={confirmConflicts} t={t} />
          </div>
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmConflicts(null)}>
              {t('rbs.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={doSave}>
              {t('rbs.save', { defaultValue: 'Enregistrer' })}
            </button>
          </div>
        </Modal>
      )}

      <h2>{editing ? `${t('rbs.resource.edit', { defaultValue: 'Modifier la ressource' })} ${resource!.name}` : t('rbs.resource.new', { defaultValue: 'Nouvelle ressource' })}</h2>

      {row(t('rbs.resource.edit.structure.label', { defaultValue: 'Établissement' }), <span>{structureName}</span>)}
      {row(
        t('rbs.resource.edit.type.label', { defaultValue: 'Type de ressource' }),
        <>
          <select id="rbs-rf-type" className="form-select" value={typeId} disabled={!editing && manageable.length <= 1} onChange={(e) => setTypeId(Number(e.target.value))}>
            {manageable.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {editing && typeId !== resource!.type_id && <div className="alert alert-warning mt-8 mb-0">{t('rbs.type.info.change', { defaultValue: 'Attention : la modification du type de la ressource peut avoir un impact sur les réservations et les validations !' })}</div>}
        </>,
        'rbs-rf-type',
      )}
      {row(
        t('rbs.resource.edit.name.label', { defaultValue: 'Nom de la ressource' }),
        <input id="rbs-rf-name" className="form-control" value={values.name} placeholder={t('rbs.resource.edit.name.placeholder', { defaultValue: 'Entrez un nom pour la ressource' })} onChange={(e) => set('name', e.target.value)} />,
        'rbs-rf-name',
      )}

      {check('rbs-rf-validation', t('type.form.validation.required', { defaultValue: 'Les demandes de réservation doivent être validées' }), values.validation, (v) => set('validation', v))}
      {check('rbs-rf-available', t('rbs.resource.edit.is_available.label', { defaultValue: 'Ressource disponible' }), values.isAvailable, (v) => set('isAvailable', v))}
      {check('rbs-rf-periodic', t('rbs.resource.edit.periodic_booking.label', { defaultValue: 'Autoriser les réservations périodiques' }), values.periodic, (v) => set('periodic', v))}

      {check('rbs-rf-has-min', t('rbs.resource.edit.add.min_delay', { defaultValue: 'Ajouter un intervalle minimum de réservation' }), values.hasMinDelay, (v) => set('hasMinDelay', v))}
      {values.hasMinDelay && (
        <div className="mb-12" style={{ marginLeft: 220 }}>
          {t('rbs.resource.must.be.booked.at.least', { defaultValue: 'La ressource doit être réservée au minimum' })}{' '}
          <select aria-label={t('rbs.manage.resource.min_delay', { defaultValue: 'Intervalle minimum' })} value={values.minDays} onChange={(e) => set('minDays', Number(e.target.value))}>
            {DELAY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>{' '}
          {t('rbs.resource.days.in.advance', { defaultValue: "jour(s) à l'avance" })}.
        </div>
      )}
      {check('rbs-rf-has-max', t('rbs.resource.edit.add.max_delay', { defaultValue: 'Ajouter un intervalle maximum de réservation' }), values.hasMaxDelay, (v) => set('hasMaxDelay', v))}
      {values.hasMaxDelay && (
        <div className="mb-12" style={{ marginLeft: 220 }}>
          {t('rbs.resource.can.be.booked.at.most', { defaultValue: 'La ressource peut être réservée au maximum' })}{' '}
          <select aria-label={t('rbs.manage.resource.max_delay', { defaultValue: 'Intervalle maximum' })} value={values.maxDays} onChange={(e) => set('maxDays', Number(e.target.value))}>
            {DELAY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>{' '}
          {t('rbs.resource.days.in.advance', { defaultValue: "jour(s) à l'avance" })}.
        </div>
      )}

      <hr />
      {row(
        t('rbs.resource.edit.quantity.label', { defaultValue: 'Quantité' }),
        <>
          <input id="rbs-rf-quantity" type="number" min={1} className="form-control" style={{ width: 110 }} disabled={!values.isMobile} value={values.isMobile ? values.quantity : 1} onChange={(e) => set('quantity', Math.max(1, Number(e.target.value) || 1))} />
          {hint(t('rbs.resource.edit.quantity.hint', { defaultValue: "Fixé à 1 pour un local (salle, amphithéâtre, gymnase...) : il n'y en a physiquement qu'un. Modifiable uniquement pour du matériel mobile." }))}
        </>,
        'rbs-rf-quantity',
      )}
      {check(
        'rbs-rf-mobile',
        t('rbs.resource.edit.is_mobile.label', { defaultValue: 'Cette ressource est du matériel mobile, pas une salle' }),
        values.isMobile,
        (v) => {
          set('isMobile', v);
          if (v) {
            set('capacity', '');
            if (equipment.length) void persistEquipment([]);
          } else set('quantity', 1);
        },
        t('rbs.resource.edit.is_mobile.hint', { defaultValue: 'À cocher pour un objet transportable. Masque « Capacité » et « Équipements », qui ne concernent que les salles.' }),
      )}
      {check(
        'rbs-rf-key',
        t('rbs.resource.edit.requires_key.label', { defaultValue: 'Une clé est nécessaire pour y accéder' }),
        values.requiresKey,
        (v) => set('requiresKey', v),
        t('rbs.resource.edit.requires_key.hint', { defaultValue: "Prévient la personne qui réserve qu'elle devra se procurer une clé pour accéder à la ressource." }),
      )}

      {!values.isMobile &&
        row(
          t('rbs.resource.edit.capacity.label', { defaultValue: "Capacité d'accueil (nombre de places dans la salle)" }),
          <>
            <input id="rbs-rf-capacity" type="number" min={0} className="form-control" style={{ width: 110 }} value={values.capacity} onChange={(e) => set('capacity', e.target.value)} />
            {hint(t('rbs.resource.edit.capacity.hint', { defaultValue: "N'empêche pas de réserver manuellement au-delà, mais est une contrainte pour le générateur automatique d'emploi du temps." }))}
          </>,
          'rbs-rf-capacity',
        )}

      {!values.isMobile &&
        row(
          t('rbs.resource.edit.equipment.label', { defaultValue: 'Équipements fixes installés dans cette salle' }),
          <div data-equipment>
            {hint(t('rbs.resource.edit.equipment.hint', { defaultValue: 'Le matériel présent en permanence dans la salle — pas la salle elle-même' }))}
            <select aria-label={t('rbs.resource.edit.equipment.label', { defaultValue: 'Équipements' })} className="form-select my-8" value={equipmentPick} onChange={(e) => (e.target.value ? addEquipment(Number(e.target.value)) : setEquipmentPick(''))}>
              <option value="">{t('rbs.resource.edit.equipment.choose', { defaultValue: 'Ajouter un équipement du catalogue à cette salle...' })}</option>
              {unusedEquipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <div className="d-flex gap-8 flex-wrap mb-8">
              {equipment.map((e) => (
                <button key={e.id} type="button" className="btn btn-secondary btn-sm" title={t('rbs.resource.edit.equipment.remove', { defaultValue: 'Retirer' })} onClick={() => void persistEquipment(equipment.filter((x) => x.id !== e.id))}>
                  {e.name} ✕
                </button>
              ))}
            </div>
            <div>{t('rbs.resource.edit.equipment.new.label', { defaultValue: "Créer un nouveau type d'équipement dans le catalogue de l'établissement :" })}</div>
            <div className="d-flex gap-8 mt-4">
              <input className="form-control" value={newEquipment} placeholder={t('rbs.resource.edit.equipment.new.placeholder', { defaultValue: 'Nom du nouvel équipement (ex. Vidéoprojecteur)' })} onChange={(e) => setNewEquipment(e.target.value)} />
              <button type="button" className="btn btn-secondary" disabled={!newEquipment.trim()} onClick={createEquipment}>
                {t('rbs.resource.edit.equipment.new.add', { defaultValue: 'Créer et ajouter à cette salle' })}
              </button>
            </div>
          </div>,
        )}

      {values.isMobile &&
        row(
          t('rbs.resource.edit.assignment.label', { defaultValue: 'Salle(s) où se trouve habituellement ce matériel' }),
          <div data-assignments>
            {hint(t('rbs.resource.edit.assignment.hint', { defaultValue: 'Purement indicatif : réserver la salle ne réserve pas ce matériel, et inversement.' }))}
            {!editing ? (
              hint(t('rbs.resource.edit.assignment.blocked.new', { defaultValue: 'Disponible après le premier enregistrement de cette fiche.' }))
            ) : (
              <>
                <select aria-label={t('rbs.resource.edit.assignment.label', { defaultValue: 'Affectation' })} className="form-select my-8" value={assignPick} onChange={(e) => {
                  const found = unusedCandidates.find((r) => r.id === Number(e.target.value));
                  if (found) void persistAssignments([...assignments, found]);
                  setAssignPick('');
                }}>
                  <option value="">{t('rbs.resource.edit.assignment.choose', { defaultValue: 'Affecter à une salle...' })}</option>
                  {unusedCandidates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="d-flex gap-8 flex-wrap">
                  {assignments.map((r) => (
                    <button key={r.id} type="button" className="btn btn-secondary btn-sm" onClick={() => void persistAssignments(assignments.filter((x) => x.id !== r.id))}>
                      {r.name} ✕
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
        )}
      {sideError && <div className="alert alert-warning">{sideError}</div>}

      {editing && conflicts.length > 0 && (
        <div className="alert alert-warning" data-quantity-warning>
          {t('rbs.resource.edit.quantity.warning', { defaultValue: 'Des réservations supérieures à cette quantité ont été prévues' })}{' '}
          <button type="button" className="btn btn-link p-0" aria-expanded={showConflictDetails} onClick={() => setShowConflictDetails(!showConflictDetails)}>
            {t('rbs.resource.edit.details', { defaultValue: 'Voir détails' })}
          </button>
          {showConflictDetails && <ConflictTable bookings={conflicts} t={t} />}
        </div>
      )}

      <div className="mt-12">
        <div className="form-check">
          <input id="rbs-rf-availability" type="checkbox" className="form-check-input" disabled={!editing} checked={openAvailability} onChange={(e) => setOpenAvailability(e.target.checked)} />
          <label htmlFor="rbs-rf-availability" className="form-check-label" style={editing ? undefined : { color: '#aaa' }}>
            {values.isAvailable ? t('rbs.resource.edit.unavailable.label', { defaultValue: "Ajouter une période d'indisponibilité" }) : t('rbs.resource.edit.available.label', { defaultValue: 'Ajouter une période de disponibilité' })}
          </label>
        </div>
        {!editing && <div style={{ ...HINT_STYLE, marginLeft: 24 }}>{values.isAvailable ? t('rbs.resource.edit.unavailable.label.blocked', { defaultValue: "Veuillez enregistrer la ressource avant de saisir une période d'indisponibilité" }) : t('rbs.resource.edit.available.label.blocked', { defaultValue: 'Veuillez enregistrer la ressource avant de saisir une période de disponibilité' })}</div>}
        {editing && openAvailability && <AvailabilityPanel resource={resource!} isAvailable={values.isAvailable} quantity={values.isMobile ? values.quantity : 1} canTreat={canTreat} />}
      </div>

      <hr />
      {row(t('rbs.resource.edit.color.label', { defaultValue: 'Couleur' }), <input id="rbs-rf-color" type="color" aria-label={t('rbs.resource.edit.color.label', { defaultValue: 'Couleur' })} value={values.color} onChange={(e) => set('color', e.target.value)} />, 'rbs-rf-color')}
      <hr />
      <div className="mb-12">
        <label htmlFor="rbs-rf-description" className="d-block mb-4">
          {t('rbs.resource.edit.description.label', { defaultValue: 'Description' })}
        </label>
        <DescriptionEditor id="rbs-rf-description" content={values.description} onChange={(html) => set('description', html)} />
      </div>

      {errors.length > 0 && (
        <div role="alert" data-form-errors>
          {errors.map((e) => (
            <div key={e} className="alert alert-warning mb-8">
              {t(e, { defaultValue: e })}
            </div>
          ))}
        </div>
      )}
      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </div>
  );
}

function ConflictTable({ bookings, t }: { bookings: Booking[]; t: (k: string, o?: Record<string, unknown>) => string }) {
  return (
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
        {bookings.map((b) => (
          <tr key={b.id}>
            <td>{b.owner_name}</td>
            <td>{formatDateTime(b.start_date)}</td>
            <td>{formatDateTime(b.end_date)}</td>
            <td>{b.quantity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ResourceForm;
