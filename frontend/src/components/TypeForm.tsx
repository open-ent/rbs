import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, ResourceType } from '../api';
import { CATEGORIES, TypeValues, typeBody } from '../manage';
import { ShareDialog } from '../screens/ShareDialog';

interface Props {
  /** `undefined` = création. */
  type?: ResourceType;
  /** Établissements proposés à la création (id, nom) ; un seul = affiché sans choix. */
  structures: Array<{ id: string; name: string }>;
  /** Établissement présélectionné à la création (celui de l'arbre). */
  defaultStructureId?: string;
  /** Couleur proposée à un nouveau type. */
  suggestedColor: string;
  onClose: () => void;
}

const HINT = { fontStyle: 'italic', color: '#767676' } as const;

/**
 * Formulaire d'un type de ressource (création et modification), parité IHM AngularJS : établissement, nom, étape de
 * validation des demandes, catégorie de salle (suggestions + aide), couleur et héritage par les ressources, grille
 * horaire de l'établissement (créneaux prédéfinis) ; en modification, partage et valideurs. Les administrateurs
 * locaux de l'établissement sont d'office gestionnaires du type.
 */
export function TypeForm({ type, structures, defaultStructureId, suggestedColor, onClose }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const editing = !!type;

  const [schoolId, setSchoolId] = useState(type?.school_id ?? defaultStructureId ?? structures[0]?.id ?? '');
  const [values, setValues] = useState<TypeValues>({
    name: type?.name ?? '',
    validation: type?.validation ?? false,
    category: type?.category ?? '',
    color: type?.color ?? suggestedColor,
    extendcolor: !!type?.extendcolor,
    slotprofile: type?.slotprofile ?? null,
  });
  const set = <K extends keyof TypeValues>(key: K, value: TypeValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const profiles = useQuery({ queryKey: ['rbs', 'slot-profiles', schoolId], queryFn: () => api.getSchoolSlotProfiles(schoolId), enabled: !!schoolId });
  // Seuls les profils qui ont des plages sont proposés (un profil vide n'aurait aucun effet).
  const usable = (profiles.data ?? []).filter((p) => (p.slots?.length ?? 0) > 0);
  const structureName = structures.find((s) => s.id === (type?.school_id ?? schoolId))?.name ?? '';

  const save = async () => {
    if (!values.name.trim()) {
      setErrors(['rbs.resourcetype.edit.name.placeholder']);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const body = typeBody(values, schoolId);
      if (editing) {
        const { school_id: _school, ...update } = body;
        await api.updateType(type!.id, update);
      } else await api.createType(body);
      await qc.invalidateQueries({ queryKey: ['rbs'] });
      onClose();
    } catch (e) {
      setErrors([e instanceof ApiError ? e.key : 'rbs.error.technical']);
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, body: React.ReactNode, htmlFor?: string) => (
    <div className="d-flex gap-12 mb-12 flex-wrap">
      <label htmlFor={htmlFor} style={{ minWidth: 200 }} className="mb-0">
        {label}
      </label>
      <div style={{ flex: 1, minWidth: 260 }}>{body}</div>
    </div>
  );

  return (
    <div data-type-form>
      {sharing && type && <ShareDialog typeId={type.id} typeName={type.name} onClose={() => setSharing(false)} />}
      <h2>{editing ? `${t('rbs.resourcetype.edit', { defaultValue: 'Édition du Type de ressources : ' })}${type!.name}` : t('rbs.resourcetype.new', { defaultValue: 'Nouveau Type de ressources' })}</h2>

      {row(
        t('rbs.resourcetype.edit.structure.label', { defaultValue: 'Établissement' }),
        !editing && structures.length > 1 ? (
          <select id="rbs-tf-structure" className="form-select" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); set('slotprofile', null); }}>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span>{structureName}</span>
        ),
        'rbs-tf-structure',
      )}
      {row(
        t('rbs.resourcetype.edit.name.label', { defaultValue: 'Nom du type' }),
        <input id="rbs-tf-name" className="form-control" value={values.name} placeholder={t('rbs.resourcetype.edit.name.placeholder', { defaultValue: 'Entrez un nom pour le type de ressources' })} onChange={(e) => set('name', e.target.value)} />,
        'rbs-tf-name',
      )}
      <div className="form-check mb-12" style={{ marginLeft: 212 }}>
        <input id="rbs-tf-validation" type="checkbox" className="form-check-input" checked={values.validation} onChange={(e) => set('validation', e.target.checked)} />
        <label htmlFor="rbs-tf-validation" className="form-check-label">
          {t('type.form.validation.required', { defaultValue: 'Les demandes de réservation doivent être validées' })}
        </label>
      </div>
      {row(
        t('rbs.resourcetype.edit.category.label', { defaultValue: 'Catégorie de salle' }),
        <>
          <input id="rbs-tf-category" className="form-control" list="rbs-type-categories" value={values.category} placeholder={t('rbs.resourcetype.edit.category.placeholder', { defaultValue: 'GENERAL, GYMNASE, LABO_PHYSIQUE_CHIMIE, LABO_SVT, CDI…' })} onChange={(e) => set('category', e.target.value)} />
          <datalist id="rbs-type-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div style={HINT}>{t('rbs.resourcetype.edit.category.help', { defaultValue: "Utilisée pour rapprocher automatiquement une salle de la matière qui l'exige (ex. Gymnase pour l'EPS)." })}</div>
        </>,
        'rbs-tf-category',
      )}
      <hr />
      {row(t('rbs.resourcetype.edit.color.label', { defaultValue: 'Couleur' }), <input id="rbs-tf-color" type="color" value={values.color} onChange={(e) => set('color', e.target.value)} />, 'rbs-tf-color')}
      <div className="form-check mb-12" style={{ marginLeft: 212 }}>
        <input id="rbs-tf-extend" type="checkbox" className="form-check-input" checked={values.extendcolor} onChange={(e) => set('extendcolor', e.target.checked)} />
        <label htmlFor="rbs-tf-extend" className="form-check-label">
          {t('rbs.resourcetype.edit.color.heritage.label', { defaultValue: 'Les ressources de ce type ont la même couleur.' })}
        </label>
      </div>
      <hr />
      {usable.length > 0 &&
        row(
          t('rbs.resourcetype.edit.slotprofile.label', { defaultValue: 'Grille horaire' }),
          <select id="rbs-tf-profile" className="form-select" value={values.slotprofile ?? ''} onChange={(e) => set('slotprofile', e.target.value || null)}>
            <option value="">{t('rbs.resourcetype.edit.slotprofile.free', { defaultValue: '(Libre)' })}</option>
            {[...usable].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>,
          'rbs-tf-profile',
        )}
      <hr />
      {!editing && <p style={HINT}>{t('rbs.resourcetype.edit.save.to.configure', { defaultValue: 'Enregistrez le type de ressources pour configurer le partage et les valideurs' })}</p>}
      <p style={HINT}>{t('rbs.type.info.adml', { defaultValue: "Les administrateurs locaux de l'établissement sont automatiquement gestionnaires de ce type de ressources" })}</p>
      {editing && (
        <div className="mb-12">
          <button type="button" className="btn btn-secondary" onClick={() => setSharing(true)}>
            {t('rbs.manage.type.share', { defaultValue: 'Partager le type' })}
          </button>
        </div>
      )}
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
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
          {busy ? t('rbs.processing', { defaultValue: 'Enregistrement en cours' }) : t('rbs.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </div>
  );
}

export default TypeForm;
