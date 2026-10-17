import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError, Booking, Resource, ResourceType } from '../api';
import { canAct } from '../bookingList';
import { DefaultTypesForm } from '../components/DefaultTypesForm';
import { EdtImportForm } from '../components/EdtImportForm';
import { ResourceForm } from '../components/ResourceForm';
import { TypeForm } from '../components/TypeForm';
import { useRbsContext } from '../hooks/useRbsContext';
import { delayLabel, nextTypeColor } from '../manage';
import { rightsOn } from '../rights';
import { Modal } from './Modal';

type Pane = { kind: 'list' } | { kind: 'type'; type?: ResourceType } | { kind: 'defaults' } | { kind: 'edt-import' } | { kind: 'resource'; resource?: Resource };
type Confirm = { kind: 'delete-types'; types: ResourceType[] } | { kind: 'delete-resources'; resources: Resource[] } | null;

/** Plain-text d'une description saisie en HTML : jamais de balise interprétée. */
const plain = (html?: string | null): string => (html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : '');

/**
 * Gestion des types et des ressources (onglet « Gestion »), parité IHM AngularJS : à gauche les établissements et leurs
 * types (cases à cocher), à droite les ressources du type courant (nom, validation, disponibilité, périodique,
 * intervalles) avec leur description dépliable. Créer un type, les types de salles standards, une ressource ; modifier ou
 * supprimer la sélection (types ou ressources) avec confirmation des conséquences. Les droits suivent ceux du type :
 * « valider » permet de modifier une ressource, « gérer » d'en créer, d'en supprimer et de gérer le type.
 */
export function Manage() {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const ctx = useRbsContext();

  const typesQuery = useQuery({ queryKey: ['rbs', 'types'], queryFn: api.getTypes });
  const resourcesQuery = useQuery({ queryKey: ['rbs', 'resources'], queryFn: api.getResources });
  const types = typesQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];

  const [pane, setPane] = useState<Pane>({ kind: 'list' });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [currentTypeId, setCurrentTypeId] = useState<number | null>(null);
  const [structureId, setStructureId] = useState('');
  const [typeSel, setTypeSel] = useState<Set<number>>(new Set());
  const [resourceSel, setResourceSel] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const detachedName = t('rbs.structure.detached', { defaultValue: 'Autres établissements' });
  const rightsOf = (type: ResourceType, resource?: Resource) => rightsOn(type, ctx.me, resource);
  const visible = (type: ResourceType) => {
    const r = rightsOf(type);
    return r.process || r.manage;
  };

  /** Types gérables (ou modifiables) par l'usager, rangés par établissement ; ceux d'établissements tiers vont ensemble. */
  const groups = useMemo(() => {
    const ids = new Set(ctx.structures.map((s) => s.id));
    const mine = ctx.structures.map((s) => ({ id: s.id, name: s.name, types: types.filter((x) => x.school_id === s.id && visible(x)) }));
    const others = types.filter((x) => !ids.has(x.school_id) && visible(x));
    return [...mine, ...(others.length ? [{ id: 'DETACHED', name: detachedName, types: others }] : [])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.structures, types, detachedName, ctx.me]);

  const current = types.find((x) => x.id === currentTypeId);
  const currentRights = current ? rightsOf(current) : undefined;
  const currentResources = resources.filter((r) => r.type_id === currentTypeId);
  const manageable = types.filter((x) => rightsOf(x).manage);
  const structureFor = (typeId: string) => (typeId === 'DETACHED' ? detachedName : (ctx.structures.find((s) => s.id === typeId)?.name ?? typeId));

  const canTreat = (b: Booking): boolean => {
    const resource = resources.find((r) => r.id === b.resource_id);
    const type = resource ? types.find((x) => x.id === resource.type_id) : undefined;
    return canAct(b, ctx.me.userId, type && resource ? rightsOf(type, resource) : { process: false, manage: false });
  };

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const closePane = () => setPane({ kind: 'list' });

  const run = async (job: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setErrors([]);
    try {
      await job();
      await qc.invalidateQueries({ queryKey: ['rbs'] });
      after();
    } catch (e) {
      setErrors([e instanceof ApiError ? e.key : 'rbs.error.technical']);
    } finally {
      setBusy(false);
    }
  };

  const loading = typesQuery.isLoading || resourcesQuery.isLoading;
  const selectedTypes = types.filter((x) => typeSel.has(x.id));
  const selectedResources = currentResources.filter((r) => resourceSel.has(r.id));
  const structureTypes = groups.find((g) => g.id === structureId)?.types ?? [];
  const canEditResource = !!currentRights?.process && selectedResources.length === 1;
  const canDeleteResources = !!currentRights?.manage && selectedResources.length > 0;
  const canCreateType = ctx.can.typemanage;

  const list = (
    <>
      {current && currentRights?.manage && (
        <p>
          <button type="button" className="btn btn-primary" onClick={() => setPane({ kind: 'resource' })}>
            {t('rbs.manage.resource.create', { defaultValue: 'Créer une ressource' })}
          </button>
        </p>
      )}
      {!current && <p className="text-muted">{types.length === 0 ? t('rbs.manage.types.empty', { defaultValue: 'Aucun type de ressources' }) : t('rbs.manage.pick.type', { defaultValue: 'Choisissez un type de ressources dans la liste.' })}</p>}
      {current && (
        <table className="table table-bordered" data-resources-table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label={t('rbs.list.selectall', { defaultValue: 'Tout sélectionner' })}
                  checked={currentResources.length > 0 && selectedResources.length === currentResources.length}
                  onChange={(e) => setResourceSel(e.target.checked ? new Set(currentResources.map((r) => r.id)) : new Set())}
                />
              </th>
              <th>{t('rbs.manage.resource.name', { defaultValue: 'Nom de la ressource' })}</th>
              <th>{t('rbs.manage.resource.validation', { defaultValue: 'Validation' })}</th>
              <th>{t('rbs.manage.resource.is_available', { defaultValue: 'Disponibilité' })}</th>
              <th>{t('rbs.manage.resource.periodic_booking', { defaultValue: 'Réservations périodiques' })}</th>
              <th>{t('rbs.manage.resource.min_delay', { defaultValue: 'Intervalle minimum' })}</th>
              <th>{t('rbs.manage.resource.max_delay', { defaultValue: 'Intervalle maximum' })}</th>
            </tr>
          </thead>
          {currentResources.map((r) => {
            const days = (s?: number | null) => {
              const d = delayLabel(s);
              return d == null ? t('rbs.manage.resource.delay.undefined', { defaultValue: 'Non défini' }) : `${d} ${t('rbs.manage.resource.days', { defaultValue: 'jour(s)' })}`;
            };
            return (
              <tbody key={r.id} data-resource-row={r.id}>
                <tr>
                  <td>
                    <input type="checkbox" aria-label={r.name} checked={resourceSel.has(r.id)} onChange={() => setResourceSel(toggle(resourceSel, r.id))} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-link p-0" aria-expanded={open.has(r.id)} onClick={() => setOpen(toggle(open, r.id))}>
                      {r.name}
                    </button>
                  </td>
                  <td>{r.validation ? t('rbs.manage.resource.validation.true', { defaultValue: 'À valider' }) : t('rbs.manage.resource.validation.false', { defaultValue: 'Sans validation' })}</td>
                  <td>{r.is_available ? t('rbs.manage.resource.is_available.true', { defaultValue: 'Disponible' }) : t('rbs.manage.resource.is_available.false', { defaultValue: 'Indisponible' })}</td>
                  <td>{r.periodic_booking ? t('rbs.manage.resource.periodic_booking.true', { defaultValue: 'Autorisées' }) : t('rbs.manage.resource.periodic_booking.false', { defaultValue: 'Interdites' })}</td>
                  <td>{days(r.min_delay)}</td>
                  <td>{days(r.max_delay)}</td>
                </tr>
                {open.has(r.id) && (
                  <tr>
                    <td />
                    <td colSpan={6} style={{ whiteSpace: 'pre-wrap' }}>
                      {plain(r.description) || <span className="text-muted">{t('rbs.booking.details.description.empty', { defaultValue: 'Cette ressource n’a pas de description renseignée.' })}</span>}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
          {currentResources.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={7} className="text-muted text-center">
                  {t('rbs.manage.resources.empty', { defaultValue: 'Aucune ressource pour ce Type' })}
                </td>
              </tr>
            </tbody>
          )}
        </table>
      )}
    </>
  );

  return (
    <div data-manage>
      {confirm?.kind === 'delete-types' && (
        <Modal title={t('rbs.manage.type.delete.confirm', { defaultValue: 'Suppression du type de ressources : ' }) + confirm.types.map((x) => x.name).join(', ')} onClose={() => !busy && setConfirm(null)}>
          <div data-confirm-delete-types>
            {confirm.types.map((x) => {
              const inside = resources.filter((r) => r.type_id === x.id);
              return (
                <div key={x.id} className="mb-12">
                  {inside.length > 0 && (
                    <>
                      <h3 style={{ fontSize: 16 }}>{x.name}</h3>
                      <p>{t('rbs.manage.type.delete.resources', { defaultValue: 'Ressources appartenant à ce type :' })}</p>
                      <ul>
                        {inside.map((r) => (
                          <li key={r.id}>{r.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p>{inside.length > 0 ? plain(t('rbs.manage.type.delete.details.notempty', { defaultValue: 'Toutes les ressources de ce type seront supprimées, ainsi que les réservations les concernant.' })) : t('rbs.manage.type.delete.details.empty', { defaultValue: 'Ce type ne contient aucune ressource. Aucune réservation ne sera impactée.' })}</p>
                </div>
              );
            })}
          </div>
          <ErrorList errors={errors} t={t} />
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              {t('rbs.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => Promise.all(confirm.types.map((x) => api.deleteType(x.id))),
                  () => {
                    setConfirm(null);
                    setTypeSel(new Set());
                    if (confirm.types.some((x) => x.id === currentTypeId)) setCurrentTypeId(null);
                  },
                )
              }
            >
              {t('rbs.delete', { defaultValue: 'Supprimer' })}
            </button>
          </div>
        </Modal>
      )}
      {confirm?.kind === 'delete-resources' && (
        <Modal title={confirm.resources.length > 1 ? t('rbs.manage.resource.delete.confirm.multi', { defaultValue: 'Suppression des ressources sélectionnées' }) : t('rbs.manage.resource.delete.confirm.one', { defaultValue: 'Suppression de la ressource' })} onClose={() => !busy && setConfirm(null)}>
          <div data-confirm-delete-resources>
            <ul>
              {confirm.resources.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
            <p>{plain(t('rbs.manage.resource.delete.details', { defaultValue: 'Les réservations concernant ces ressources seront supprimées.' }))}</p>
          </div>
          <ErrorList errors={errors} t={t} />
          <div className="d-flex justify-content-end gap-8">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
              {t('rbs.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(
                  () => Promise.all(confirm.resources.map((r) => api.deleteResource(r.id))),
                  () => {
                    setConfirm(null);
                    setResourceSel(new Set());
                  },
                )
              }
            >
              {busy ? t('rbs.deleting', { defaultValue: 'Suppression en cours' }) : t('rbs.delete', { defaultValue: 'Supprimer' })}
            </button>
          </div>
        </Modal>
      )}

      <div className="d-flex gap-16" style={{ alignItems: 'flex-start' }}>
        <aside style={{ minWidth: 250, maxWidth: 280 }} aria-label={t('rbs.manage.types', { defaultValue: 'Types de ressources' })} data-manage-tree>
          {loading && <p className="text-muted">{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
          <ul className="list-unstyled">
            {groups.map((g) => {
              const isOpen = expanded.has(g.id);
              return (
                <li key={g.id} data-structure={g.id}>
                  <button
                    type="button"
                    className="btn btn-link p-0"
                    aria-expanded={isOpen}
                    style={{ fontWeight: structureId === g.id ? 700 : 400 }}
                    onClick={() => {
                      setExpanded(toggle(expanded, g.id));
                      setStructureId(g.id);
                    }}
                  >
                    {isOpen ? '▾' : '▸'} {g.name}
                  </button>
                  {isOpen && (
                    <ul className="list-unstyled ms-16">
                      {g.types.map((x) => (
                        <li key={x.id} data-type={x.id} className="d-flex align-items-center gap-4">
                          {rightsOf(x).manage && <input type="checkbox" aria-label={x.name} checked={typeSel.has(x.id)} onChange={() => setTypeSel(toggle(typeSel, x.id))} />}
                          <button
                            type="button"
                            className="btn btn-link p-0"
                            style={{ fontWeight: currentTypeId === x.id ? 700 : 400 }}
                            onClick={() => {
                              setCurrentTypeId(x.id);
                              setStructureId(g.id);
                              setResourceSel(new Set());
                              setPane({ kind: 'list' });
                            }}
                          >
                            <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: x.color ?? '#4bafd5', marginRight: 6 }} />
                            {x.name}
                          </button>
                        </li>
                      ))}
                      {g.types.length === 0 && <li className="text-muted">{t('rbs.resourcetype.empty', { defaultValue: 'Aucun type de ressource' })}</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <hr />
          <div className="d-flex flex-column gap-4">
            {canCreateType && (
              <button type="button" className="btn btn-link p-0 text-start" onClick={() => setPane({ kind: 'type' })}>
                {t('rbs.manage.type.create', { defaultValue: 'Créer un type de ressources' })}
              </button>
            )}
            {canCreateType && structureId && structureId !== 'DETACHED' && (
              <button type="button" className="btn btn-link p-0 text-start" onClick={() => setPane({ kind: 'defaults' })}>
                {t('rbs.manage.type.create.defaults', { defaultValue: 'Créer les types de salles standards (Gymnase, Labo, CDI…)' })}
              </button>
            )}
            {ctx.can.edtImport && structureId && structureId !== 'DETACHED' && (
              <button type="button" className="btn btn-link p-0 text-start" onClick={() => setPane({ kind: 'edt-import' })}>
                {t('rbs.edtImport.open', { defaultValue: "Générer les réservations depuis l'Emploi du temps" })}
              </button>
            )}
          </div>
        </aside>

        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          {pane.kind === 'edt-import' && structureId && structureId !== 'DETACHED' && <EdtImportForm structureId={structureId} onClose={closePane} />}
          {pane.kind === 'list' && (
            <>
              {(selectedResources.length > 0 || selectedTypes.length > 0) && (
                <div className="d-flex align-items-center gap-8 flex-wrap mb-8" role="toolbar" data-manage-actions aria-label={t('rbs.list.actions', { defaultValue: 'Actions sur la sélection' })}>
                  {selectedResources.length > 0 && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!canEditResource} onClick={() => setPane({ kind: 'resource', resource: selectedResources[0] })}>
                        {selectedResources.length > 1 ? t('rbs.manage.resource.edits', { defaultValue: 'Éditer les ressources' }) : t('rbs.manage.resource.edit', { defaultValue: 'Éditer la ressource' })}
                      </button>
                      {canDeleteResources && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'delete-resources', resources: selectedResources })}>
                          {selectedResources.length > 1 ? t('rbs.manage.resource.removes', { defaultValue: 'Supprimer les ressources' }) : t('rbs.manage.resource.remove', { defaultValue: 'Supprimer la ressource' })}
                        </button>
                      )}
                    </>
                  )}
                  {selectedTypes.length > 0 && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={selectedTypes.length !== 1} onClick={() => setPane({ kind: 'type', type: selectedTypes[0] })}>
                        {t('rbs.manage.type.edit', { defaultValue: 'Éditer le type' })}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm({ kind: 'delete-types', types: selectedTypes })}>
                        {t('rbs.manage.type.remove', { defaultValue: 'Supprimer le type' })}
                      </button>
                    </>
                  )}
                </div>
              )}
              {list}
            </>
          )}
          {pane.kind === 'type' && (
            <TypeForm
              type={pane.type}
              structures={[...ctx.structures]}
              defaultStructureId={structureId && structureId !== 'DETACHED' ? structureId : undefined}
              suggestedColor={nextTypeColor(structureTypes)}
              onClose={() => {
                closePane();
                setTypeSel(new Set());
              }}
            />
          )}
          {pane.kind === 'defaults' && structureId && (
            <DefaultTypesForm structureId={structureId} existingNames={structureTypes.map((x) => x.name)} existingColors={structureTypes} onClose={closePane} />
          )}
          {pane.kind === 'resource' && current && (
            <ResourceForm
              key={pane.resource?.id ?? 'new'}
              type={current}
              manageable={manageable.length ? manageable : [current]}
              resource={pane.resource}
              structureName={structureFor(groups.find((g) => g.types.some((x) => x.id === current.id))?.id ?? current.school_id)}
              canTreat={canTreat}
              onClose={() => {
                closePane();
                setResourceSel(new Set());
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorList({ errors, t }: { errors: string[]; t: (k: string, o?: Record<string, unknown>) => string }) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" data-form-errors>
      {errors.map((e) => (
        <div key={e} className="alert alert-warning mb-8">
          {t(e, { defaultValue: e })}
        </div>
      ))}
    </div>
  );
}

export default Manage;
