import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '../api';
import { defaultChoices, nextTypeColor, typesToCreate } from '../manage';

interface Props {
  structureId: string;
  /** Noms des types déjà présents dans l'établissement. */
  existingNames: string[];
  /** Couleurs des types déjà présents (la palette continue à partir d'elles). */
  existingColors: Array<{ color?: string | null }>;
  onClose: () => void;
}

/**
 * Création en lot des types de salles courants (Gymnase, Laboratoires, CDI…), parité IHM AngularJS : cases à cocher et
 * quantité (labo, amphithéâtre, terrain peuvent exister en plusieurs exemplaires : « Nom 1 », « Nom 2 »…), plus une
 * saisie libre d'une salle par ligne (« Nom - CATEGORIE »). Les types déjà présents sont grisés.
 */
export function DefaultTypesForm({ structureId, existingNames, existingColors, onClose }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const [choices, setChoices] = useState(() => defaultChoices(existingNames));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (i: number, p: Partial<(typeof choices)[number]>) => setChoices((list) => list.map((c, k) => (k === i ? { ...c, ...p } : c)));

  const save = async () => {
    const toCreate = typesToCreate(choices, custom);
    if (toCreate.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErrors([]);
    // La couleur suit la palette pour chaque nouveau type, à la suite de celles déjà prises.
    const colors = [...existingColors];
    const results = await Promise.allSettled(
      toCreate.map((item) => {
        const color = nextTypeColor(colors);
        colors.push({ color });
        return api.createType({ name: item.name, validation: false, school_id: structureId, color, category: item.category });
      }),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason instanceof ApiError ? r.reason.key : 'rbs.error.technical'));
    await qc.invalidateQueries({ queryKey: ['rbs'] });
    setBusy(false);
    if (failed.length === 0) onClose();
    else setErrors([...new Set(failed)]);
  };

  return (
    <div data-default-types-form>
      <h2>{t('rbs.resourcetype.defaults.title', { defaultValue: 'Créer des types de salles standards' })}</h2>
      <p style={{ fontStyle: 'italic', color: '#767676' }}>{t('rbs.resourcetype.defaults.help', { defaultValue: 'Cochez les types à créer.' })}</p>
      <table className="table">
        <thead>
          <tr>
            <th aria-hidden />
            <th>{t('rbs.resourcetype.defaults.name', { defaultValue: 'Type de salle' })}</th>
            <th>{t('rbs.resourcetype.defaults.quantity', { defaultValue: 'Quantité' })}</th>
          </tr>
        </thead>
        <tbody>
          {choices.map((c, i) => (
            <tr key={c.name} style={c.alreadyExists ? { opacity: 0.5 } : undefined}>
              <td>
                <input type="checkbox" aria-label={c.name} checked={c.checked} disabled={c.alreadyExists} onChange={(e) => patch(i, { checked: e.target.checked })} />
              </td>
              <td>
                {c.name} {c.alreadyExists && <em>({t('rbs.resourcetype.defaults.already.exists', { defaultValue: 'déjà présent' })})</em>}
              </td>
              <td>
                <input type="number" min={1} max={20} style={{ width: 80 }} aria-label={`${t('rbs.resourcetype.defaults.quantity', { defaultValue: 'Quantité' })} ${c.name}`} value={c.quantity} disabled={!c.checked || c.alreadyExists} onChange={(e) => patch(i, { quantity: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <label htmlFor="rbs-dt-custom" className="d-block mb-4">
        {t('rbs.resourcetype.defaults.custom.label', { defaultValue: 'Autres salles à créer (saisie libre)' })}
      </label>
      <textarea id="rbs-dt-custom" className="form-control" rows={3} value={custom} placeholder={t('rbs.resourcetype.defaults.custom.placeholder', { defaultValue: 'Un nom par ligne, ex. : Labo 102 - LABO_PHYSIQUE_CHIMIE' })} onChange={(e) => setCustom(e.target.value)} />
      <p style={{ fontStyle: 'italic', color: '#767676' }}>{t('rbs.resourcetype.defaults.custom.help', { defaultValue: 'Une salle par ligne, au format « Nom - CATEGORIE » (catégorie facultative, GENERAL par défaut).' })}</p>
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

export default DefaultTypesForm;
