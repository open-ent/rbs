import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api, Resource, ResourceType } from '../api';
import { ResourceDialog } from './ResourceDialog';
import { ShareDialog } from './ShareDialog';
import { TypeDialog } from './TypeDialog';

type TypeDialogState = { mode: 'new' } | { mode: 'edit'; type: ResourceType } | null;
type ResourceDialogState = { typeId: number; resource?: Resource } | null;
type ShareDialogState = { typeId: number; typeName: string } | null;

/** Écran d'accueil : types + ressources, avec gestion (CRUD types/ressources). */
export function Resources() {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();

  const typesQuery = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });

  const [typeDialog, setTypeDialog] = useState<TypeDialogState>(null);
  const [resourceDialog, setResourceDialog] = useState<ResourceDialogState>(null);
  const [shareDialog, setShareDialog] = useState<ShareDialogState>(null);

  const deleteTypeMut = useMutation({
    mutationFn: (id: number) => api.deleteType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbs', 'types'] });
      qc.invalidateQueries({ queryKey: ['rbs', 'resources'] });
    },
  });
  const deleteResourceMut = useMutation({
    mutationFn: (id: number) => api.deleteResource(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rbs', 'resources'] }),
  });

  const byType = useMemo(() => {
    const map = new Map<number, Resource[]>();
    (resourcesQuery.data ?? []).forEach((r) => {
      const list = map.get(r.type_id) ?? [];
      list.push(r);
      map.set(r.type_id, list);
    });
    return map;
  }, [resourcesQuery.data]);

  const types = typesQuery.data ?? [];
  const loading = typesQuery.isLoading || resourcesQuery.isLoading;
  const error = typesQuery.isError || resourcesQuery.isError;

  return (
    <div>
      {typeDialog && (
        <TypeDialog
          type={typeDialog.mode === 'edit' ? typeDialog.type : undefined}
          onClose={() => setTypeDialog(null)}
        />
      )}
      {resourceDialog && (
        <ResourceDialog
          typeId={resourceDialog.typeId}
          resource={resourceDialog.resource}
          onClose={() => setResourceDialog(null)}
        />
      )}
      {shareDialog && (
        <ShareDialog typeId={shareDialog.typeId} typeName={shareDialog.typeName} onClose={() => setShareDialog(null)} />
      )}

      <div className="d-flex align-items-center justify-content-between mb-16">
        <h1 className="m-0">{t('rbs.title', { defaultValue: 'Réservation de ressources' })}</h1>
        <div className="d-flex gap-8">
          <Link to="/moderation" className="btn btn-secondary">
            {t('rbs.moderation.title', { defaultValue: 'Modération des réservations' })}
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setTypeDialog({ mode: 'new' })}>
            {t('rbs.type.new', { defaultValue: 'Nouveau type' })}
          </button>
        </div>
      </div>

      {loading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {error && (
        <div className="alert alert-warning" role="alert">
          {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}
      {!loading && types.length === 0 && (
        <p className="text-muted">{t('rbs.no.types', { defaultValue: 'Aucun type de ressource. Créez-en un.' })}</p>
      )}

      {types.map((type: ResourceType) => {
        const resources = byType.get(type.id) ?? [];
        return (
          <section key={type.id} className="mb-24">
            <div className="d-flex align-items-center justify-content-between mb-12">
              <h2 className="d-flex align-items-center gap-8 m-0" style={{ fontSize: 20 }}>
                <span
                  aria-hidden
                  style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: type.color ?? '#4bafd5' }}
                />
                {type.name}
                {type.validation && (
                  <span className="badge bg-info" style={{ fontSize: 11 }}>
                    {t('rbs.validation.short', { defaultValue: 'Validation' })}
                  </span>
                )}
              </h2>
              <div className="d-flex gap-8">
                <button type="button" className="btn btn-link p-0" onClick={() => setResourceDialog({ typeId: type.id })}>
                  {t('rbs.resource.add', { defaultValue: 'Ajouter une ressource' })}
                </button>
                <button type="button" className="btn btn-link p-0" onClick={() => setShareDialog({ typeId: type.id, typeName: type.name })}>
                  {t('rbs.share', { defaultValue: 'Partager' })}
                </button>
                <button type="button" className="btn btn-link p-0" onClick={() => setTypeDialog({ mode: 'edit', type })}>
                  {t('rbs.edit', { defaultValue: 'Modifier' })}
                </button>
                <button
                  type="button"
                  className="btn btn-link p-0 text-danger"
                  onClick={() => {
                    if (window.confirm(t('rbs.type.confirm.delete', { defaultValue: 'Supprimer ce type et ses ressources ?' })))
                      deleteTypeMut.mutate(type.id);
                  }}
                >
                  {t('rbs.delete', { defaultValue: 'Supprimer' })}
                </button>
              </div>
            </div>

            {resources.length === 0 ? (
              <p className="text-muted ms-24">{t('rbs.no.resources', { defaultValue: 'Aucune ressource dans ce type.' })}</p>
            ) : (
              <ul className="list-unstyled ms-24">
                {resources.map((r) => (
                  <li key={r.id} className="py-8 border-bottom d-flex justify-content-between align-items-center">
                    <div>
                      <Link to={`/resource/${r.id}`} className="fw-bold" style={{ fontSize: 16 }}>
                        {r.name}
                      </Link>
                      {r.description && <div className="text-muted" style={{ fontSize: 13 }}>{r.description}</div>}
                    </div>
                    <div className="d-flex align-items-center gap-8">
                      {r.validation && (
                        <span className="badge bg-info">{t('rbs.validation.short', { defaultValue: 'Validation' })}</span>
                      )}
                      {!r.is_available && (
                        <span className="badge bg-secondary">{t('rbs.unavailable', { defaultValue: 'Indisponible' })}</span>
                      )}
                      <button type="button" className="btn btn-link p-0" onClick={() => setResourceDialog({ typeId: type.id, resource: r })}>
                        {t('rbs.edit', { defaultValue: 'Modifier' })}
                      </button>
                      <button
                        type="button"
                        className="btn btn-link p-0 text-danger"
                        onClick={() => {
                          if (window.confirm(t('rbs.resource.confirm.delete', { defaultValue: 'Supprimer cette ressource ?' })))
                            deleteResourceMut.mutate(r.id);
                        }}
                      >
                        {t('rbs.delete', { defaultValue: 'Supprimer' })}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default Resources;
