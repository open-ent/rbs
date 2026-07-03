import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { api, Resource, ResourceType } from '../api';

/** Écran d'accueil : types de ressources et, sous chacun, ses ressources réservables. */
export function Resources() {
  const { t } = useTranslation(['rbs', 'common']);

  const typesQuery = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });

  // Ressources regroupées par type_id.
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
      <div className="d-flex align-items-center justify-content-between mb-16">
        <h1 className="m-0">{t('rbs.title', { defaultValue: 'Réservation de ressources' })}</h1>
        <Link to="/moderation" className="btn btn-secondary">
          {t('rbs.moderation.title', { defaultValue: 'Modération des réservations' })}
        </Link>
      </div>

      {loading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {error && (
        <div className="alert alert-warning" role="alert">
          {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}
      {!loading && types.length === 0 && (
        <p className="text-muted">
          {t('rbs.no.types', { defaultValue: 'Aucun type de ressource disponible.' })}
        </p>
      )}

      {types.map((type: ResourceType) => {
        const resources = byType.get(type.id) ?? [];
        return (
          <section key={type.id} className="mb-24">
            <h2 className="d-flex align-items-center gap-8 mb-12" style={{ fontSize: 20 }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: type.color ?? '#4bafd5',
                }}
              />
              {type.name}
            </h2>
            {resources.length === 0 ? (
              <p className="text-muted ms-24">
                {t('rbs.no.resources', { defaultValue: 'Aucune ressource dans ce type.' })}
              </p>
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
                        <span className="badge bg-info" title={t('rbs.validation.required', { defaultValue: 'Soumise à validation' })}>
                          {t('rbs.validation.short', { defaultValue: 'Validation' })}
                        </span>
                      )}
                      {!r.is_available && (
                        <span className="badge bg-secondary">
                          {t('rbs.unavailable', { defaultValue: 'Indisponible' })}
                        </span>
                      )}
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
