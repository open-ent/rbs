import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Resource } from '../api';
import { Modal } from './Modal';

/** Création / édition d'une ressource au sein d'un type. `resource` défini = édition. */
export function ResourceDialog({
  typeId,
  resource,
  onClose,
}: {
  typeId: number;
  resource?: Resource;
  onClose: () => void;
}) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const editing = !!resource;

  const [name, setName] = useState(resource?.name ?? '');
  const [description, setDescription] = useState(resource?.description ?? '');
  const [quantity, setQuantity] = useState(resource?.quantity ?? 1);
  const [periodicBooking, setPeriodicBooking] = useState(resource?.periodic_booking ?? true);
  const [isAvailable, setIsAvailable] = useState(resource?.is_available ?? true);
  const [validation, setValidation] = useState(resource?.validation ?? false);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        periodic_booking: periodicBooking,
        is_available: isAvailable,
        validation,
        quantity,
      };
      return editing
        ? api.updateResource(resource!.id, typeId, resource!.is_available, body)
        : api.createResource(typeId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbs', 'resources'] });
      onClose();
    },
  });

  return (
    <Modal
      title={editing ? t('rbs.resource.edit', { defaultValue: 'Modifier la ressource' }) : t('rbs.resource.new', { defaultValue: 'Nouvelle ressource' })}
      onClose={onClose}
    >
      <div className="mb-12">
        <label htmlFor="rbs-res-name" className="form-label">
          {t('rbs.resource.name', { defaultValue: 'Nom' })}
        </label>
        <input id="rbs-res-name" type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="mb-12">
        <label htmlFor="rbs-res-desc" className="form-label">
          {t('rbs.resource.description', { defaultValue: 'Description' })}
        </label>
        <textarea id="rbs-res-desc" className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="mb-12" style={{ maxWidth: 160 }}>
        <label htmlFor="rbs-res-qty" className="form-label">
          {t('rbs.resource.quantity', { defaultValue: 'Quantité disponible' })}
        </label>
        <input
          id="rbs-res-qty"
          type="number"
          min={1}
          className="form-control"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      <div className="form-check mb-8">
        <input id="rbs-res-available" type="checkbox" className="form-check-input" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
        <label htmlFor="rbs-res-available" className="form-check-label">
          {t('rbs.resource.available', { defaultValue: 'Disponible à la réservation' })}
        </label>
      </div>
      <div className="form-check mb-8">
        <input id="rbs-res-periodic" type="checkbox" className="form-check-input" checked={periodicBooking} onChange={(e) => setPeriodicBooking(e.target.checked)} />
        <label htmlFor="rbs-res-periodic" className="form-check-label">
          {t('rbs.resource.periodic', { defaultValue: 'Autoriser les réservations périodiques' })}
        </label>
      </div>
      <div className="form-check mb-16">
        <input id="rbs-res-validation" type="checkbox" className="form-check-input" checked={validation} onChange={(e) => setValidation(e.target.checked)} />
        <label htmlFor="rbs-res-validation" className="form-check-label">
          {t('rbs.resource.validation', { defaultValue: 'Réservations soumises à validation' })}
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
        <button type="button" className="btn btn-primary" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {t('rbs.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </Modal>
  );
}

export default ResourceDialog;
