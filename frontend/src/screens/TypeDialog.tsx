import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ResourceType } from '../api';
import { Modal } from './Modal';

const COLORS = ['#4bafd5', '#46bfaf', '#ecbe30', '#e13a3a', '#b930a2', '#763294', '#1a22a2'];

/** Création / édition d'un type de ressource. `type` défini = édition. */
export function TypeDialog({ type, onClose }: { type?: ResourceType; onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const { user } = useEdificeClient();
  const qc = useQueryClient();
  const editing = !!type;

  const structures = user?.structures ?? [];
  const structureNames = user?.structureNames ?? [];

  const [name, setName] = useState(type?.name ?? '');
  const [validation, setValidation] = useState(type?.validation ?? false);
  const [color, setColor] = useState(type?.color ?? COLORS[0]);
  const [schoolId, setSchoolId] = useState(type?.school_id ?? structures[0] ?? '');

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.updateType(type!.id, { name: name.trim(), validation, color })
        : api.createType({ name: name.trim(), validation, color, school_id: schoolId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbs', 'types'] });
      onClose();
    },
  });

  const canSave = name.trim().length > 0 && (editing || !!schoolId);

  return (
    <Modal
      title={editing ? t('rbs.type.edit', { defaultValue: 'Modifier le type' }) : t('rbs.type.new', { defaultValue: 'Nouveau type' })}
      onClose={onClose}
    >
      <div className="mb-12">
        <label htmlFor="rbs-type-name" className="form-label">
          {t('rbs.type.name', { defaultValue: 'Nom' })}
        </label>
        <input id="rbs-type-name" type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      {!editing && structures.length > 1 && (
        <div className="mb-12">
          <label htmlFor="rbs-type-school" className="form-label">
            {t('rbs.type.structure', { defaultValue: 'Établissement' })}
          </label>
          <select id="rbs-type-school" className="form-select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            {structures.map((sid, i) => (
              <option key={sid} value={sid}>
                {structureNames[i] ?? sid}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-12">
        <span className="form-label d-block">{t('rbs.type.color', { defaultValue: 'Couleur' })}</span>
        <div className="d-flex gap-8">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                background: c,
                border: color === c ? '3px solid #333' : '1px solid #ccc',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <div className="form-check mb-16">
        <input id="rbs-type-validation" type="checkbox" className="form-check-input" checked={validation} onChange={(e) => setValidation(e.target.checked)} />
        <label htmlFor="rbs-type-validation" className="form-check-label">
          {t('rbs.type.validation', { defaultValue: 'Réservations soumises à validation' })}
        </label>
      </div>

      {saveMut.isError && (
        <div className="alert alert-warning" role="alert">
          {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('rbs.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {t('rbs.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </Modal>
  );
}

export default TypeDialog;
