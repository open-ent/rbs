import { useTranslation } from 'react-i18next';

import type { NotifyState, TreeStructure } from '../tree';

interface Props {
  tree: TreeStructure[];
  onStructure: (id: string) => void;
  onType: (id: number) => void;
  onResource: (id: number) => void;
  onExpandStructure: (id: string) => void;
  onExpandType: (id: number) => void;
  /** Ressources fermées par défaut et sans période de disponibilité : non réservables pour l'instant. */
  unavailable?: Set<number>;
  /** Abonnements aux notifications : cloche d'un type (toutes ses ressources) et d'une ressource. Absent = pas de cloches. */
  notifications?: {
    stateOf: (resourceIds: number[]) => NotifyState;
    notified: Set<number>;
    onType: (typeId: number, resourceIds: number[]) => void;
    onResource: (id: number) => void;
  };
}

/**
 * Arbre des ressources (établissement › type › ressource), comme le panneau latéral AngularJS : cases à cocher à
 * chaque niveau, dépliage mémorisé. Cocher un niveau coche tout ce qu'il contient.
 * Ex. « Collège A › Salles › Salle 101 ».
 */
export function ResourceTree({ tree, onStructure, onType, onResource, onExpandStructure, onExpandType, notifications, unavailable }: Props) {
  const { t } = useTranslation(['rbs', 'common']);
  if (tree.length === 0) return <p className="text-muted" style={{ fontSize: 13 }}>{t('rbs.agenda.noresource', { defaultValue: 'Aucune ressource' })}</p>;
  const caret = (open: boolean, label: string, onClick: () => void) => (
    <button type="button" className="btn p-0 border-0" style={{ background: 'none', width: 18 }} aria-expanded={open} aria-label={label} onClick={onClick}>
      {open ? '▾' : '▸'}
    </button>
  );
  const bell = (state: NotifyState, onClick: () => void, name: string) => {
    const label = state === 'all' ? t('rbs.unsubscribe', { defaultValue: 'Se désabonner des notifications' }) : t('rbs.subscribe', { defaultValue: 'S’abonner aux notifications' });
    return (
      <button type="button" className="btn p-0 border-0" style={{ background: 'none', opacity: state === 'none' ? 0.45 : 1 }} data-bell={state} aria-pressed={state === 'all'} aria-label={`${label} — ${name}`} title={label} onClick={onClick}>
        {state === 'none' ? '🔕' : '🔔'}
        {state === 'some' && <span aria-hidden style={{ fontSize: 10 }}>½</span>}
      </button>
    );
  };
  return (
    <ul className="list-unstyled mb-0" role="tree" aria-label={t('rbs.agenda.resources', { defaultValue: 'Ressources' })} data-resource-tree>
      {tree.map((s) => (
        <li key={s.id} role="treeitem" aria-expanded={s.expanded} data-structure={s.id}>
          <div className="d-flex align-items-center gap-4">
            {caret(s.expanded, `${s.expanded ? t('rbs.tree.collapse', { defaultValue: 'Replier' }) : t('rbs.tree.expand', { defaultValue: 'Déplier' })} ${s.name}`, () => onExpandStructure(s.id))}
            <label className="d-flex align-items-center gap-8 m-0" style={{ cursor: 'pointer', fontWeight: 700 }}>
              <input type="checkbox" checked={s.selected} onChange={() => onStructure(s.id)} aria-label={s.name} />
              {s.name}
            </label>
          </div>
          {s.expanded && (
            <ul className="list-unstyled ms-16" role="group">
              {s.types.map((ty) => (
                <li key={ty.id} role="treeitem" aria-expanded={ty.expanded} data-type={ty.id}>
                  <div className="d-flex align-items-center gap-4">
                    {caret(ty.expanded, `${ty.expanded ? t('rbs.tree.collapse', { defaultValue: 'Replier' }) : t('rbs.tree.expand', { defaultValue: 'Déplier' })} ${ty.name}`, () => onExpandType(ty.id))}
                    <label className="d-flex align-items-center gap-8 m-0" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={ty.resources.length > 0 && ty.resources.every((r) => r.selected)} onChange={() => onType(ty.id)} aria-label={ty.name} />
                      <span style={{ borderLeft: `4px solid ${ty.color ?? '#999'}`, paddingLeft: 6 }}>{ty.name}</span>
                    </label>
                    {notifications && ty.resources.length > 0 && bell(notifications.stateOf(ty.resources.map((r) => r.id)), () => notifications.onType(ty.id, ty.resources.map((r) => r.id)), ty.name)}
                  </div>
                  {ty.expanded && (
                    <ul className="list-unstyled ms-24" role="group">
                      {ty.resources.map((r) => (
                        <li key={r.id} role="treeitem" aria-selected={r.selected} data-resource={r.id}>
                          <div className="d-flex align-items-center gap-4">
                            <label className="d-flex align-items-center gap-8 m-0 py-2" style={{ cursor: 'pointer', fontSize: 14 }}>
                              <input type="checkbox" checked={r.selected} onChange={() => onResource(r.id)} aria-label={r.name} />
                              {r.name}
                              {unavailable?.has(r.id) && (
                                <span role="img" aria-label={t('rbs.manage.resource.is_available.false', { defaultValue: 'Indisponible' })} title={t('rbs.manage.resource.is_available.false', { defaultValue: 'Indisponible' })} style={{ color: '#b58900' }}>
                                  ❚❚
                                </span>
                              )}
                            </label>
                            {notifications && bell(notifications.notified.has(r.id) ? 'all' : 'none', () => notifications.onResource(r.id), r.name)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default ResourceTree;
