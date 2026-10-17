import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ShareAction } from '../api';
import { Modal } from './Modal';

/** Niveaux de droit d'un type de ressource (ordre croissant) + libellés FR. */
const LEVELS: { key: string; fr: string }[] = [
  { key: 'rbs.read', fr: 'Lecture' },
  { key: 'rbs.contrib', fr: 'Réservation' },
  { key: 'rbs.publish', fr: 'Validation' },
  { key: 'rbs.manager', fr: 'Gestion' },
];

type Kind = 'group' | 'user';
interface Row {
  id: string;
  kind: Kind;
  label: string;
  levels: Set<string>;
}

/** Partage d'un TYPE de ressource (modèle entcore batch, comme forum). */
export function ShareDialog({ typeId, typeName, onClose }: { typeId: number; typeName: string; onClose: () => void }) {
  const { t } = useTranslation(['rbs', 'common']);
  const qc = useQueryClient();
  const shareQuery = useQuery({ queryKey: ['rbs', 'share', typeId], queryFn: () => api.getTypeShare(typeId) });

  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');

  const actionsByLevel = useMemo(() => {
    const m = new Map<string, ShareAction>();
    shareQuery.data?.actions.forEach((a) => m.set(a.displayName, a));
    return m;
  }, [shareQuery.data]);

  const initialRows = useMemo<Row[]>(() => {
    const data = shareQuery.data;
    if (!data) return [];
    const active = (checked: string[], lvl: string) =>
      (actionsByLevel.get(lvl)?.name ?? []).every((n) => checked.includes(n));
    const out: Row[] = [];
    const push = (kind: Kind, id: string, label: string, checked: string[]) =>
      out.push({ id, kind, label, levels: new Set(LEVELS.map((l) => l.key).filter((k) => active(checked, k))) });
    Object.entries(data.groups.checked).forEach(([id, ch]) => {
      const g = data.groups.visibles.find((v) => v.id === id);
      push('group', id, g?.name ?? id, ch);
    });
    Object.entries(data.users.checked).forEach(([id, ch]) => {
      const u = data.users.visibles.find((v) => v.id === id);
      push('user', id, u?.username ?? id, ch);
    });
    return out;
  }, [shareQuery.data, actionsByLevel]);

  const current = rows ?? initialRows;

  const candidates = useMemo(() => {
    const data = shareQuery.data;
    if (!data || search.trim().length < 1) return [];
    const q = search.trim().toLowerCase();
    const present = new Set(current.map((r) => r.id));
    const groups = data.groups.visibles
      .filter((g) => !present.has(g.id) && (g.name ?? '').toLowerCase().includes(q))
      .map((g) => ({ id: g.id, kind: 'group' as Kind, label: g.name ?? g.id }));
    const users = data.users.visibles
      .filter((u) => !present.has(u.id) && (u.username ?? '').toLowerCase().includes(q))
      .map((u) => ({ id: u.id, kind: 'user' as Kind, label: u.username ?? u.id }));
    return [...groups, ...users].slice(0, 12);
  }, [shareQuery.data, search, current]);

  const toggleLevel = (id: string, lvl: string) =>
    setRows(
      current.map((r) => {
        if (r.id !== id) return r;
        const levels = new Set(r.levels);
        if (levels.has(lvl)) levels.delete(lvl);
        else levels.add(lvl);
        return { ...r, levels };
      }),
    );

  const addRecipient = (c: { id: string; kind: Kind; label: string }) => {
    setRows([...current, { ...c, levels: new Set(['rbs.read']) }]);
    setSearch('');
  };
  const removeRow = (id: string) => setRows(current.filter((r) => r.id !== id));

  const saveMut = useMutation({
    mutationFn: async () => {
      const batch = { users: {} as Record<string, string[]>, groups: {} as Record<string, string[]>, bookmarks: {} };
      current.forEach((r) => {
        if (r.levels.size === 0) return;
        const acts = new Set<string>();
        r.levels.forEach((lvl) => (actionsByLevel.get(lvl)?.name ?? []).forEach((n) => acts.add(n)));
        (r.kind === 'group' ? batch.groups : batch.users)[r.id] = [...acts];
      });
      await api.shareTypeBatch(typeId, batch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbs', 'share', typeId] });
      onClose();
    },
  });

  return (
    <Modal title={`${t('rbs.share.title', { defaultValue: 'Partager le type' })} — ${typeName}`} onClose={onClose}>
      {shareQuery.isLoading && <p>{t('rbs.loading', { defaultValue: 'Chargement…' })}</p>}
      {shareQuery.isError && (
        <div className="alert alert-warning" role="alert">
          {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}

      {shareQuery.data && (
        <>
          <div className="mb-16 position-relative">
            <input
              type="text"
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('rbs.share.search', { defaultValue: 'Rechercher un groupe ou une personne…' })}
              aria-label={t('rbs.share.search', { defaultValue: 'Rechercher un destinataire' })}
            />
            {candidates.length > 0 && (
              <ul className="list-unstyled border rounded bg-white position-absolute w-100 mt-2" style={{ zIndex: 10, maxHeight: 240, overflow: 'auto' }}>
                {candidates.map((c) => (
                  <li key={`${c.kind}-${c.id}`}>
                    <button type="button" className="btn btn-link text-start w-100 px-12 py-8" onClick={() => addRecipient(c)}>
                      {c.kind === 'group' ? '👥 ' : '👤 '}
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {current.length === 0 ? (
            <p className="text-muted">{t('rbs.share.empty', { defaultValue: 'Aucun partage. Recherchez un destinataire ci-dessus.' })}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('rbs.share.recipient', { defaultValue: 'Destinataire' })}</th>
                  {LEVELS.map((l) => (
                    <th key={l.key} className="text-center">{l.fr}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {current.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>
                      {r.kind === 'group' ? '👥 ' : '👤 '}
                      {r.label}
                    </td>
                    {LEVELS.map((l) => (
                      <td key={l.key} className="text-center">
                        <input type="checkbox" checked={r.levels.has(l.key)} aria-label={`${r.label} — ${l.fr}`} onChange={() => toggleLevel(r.id, l.key)} />
                      </td>
                    ))}
                    <td className="text-end">
                      <button type="button" className="btn btn-link p-0 text-danger" onClick={() => removeRow(r.id)} aria-label={t('rbs.delete', { defaultValue: 'Supprimer' })}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {saveMut.isError && (
            <div className="alert alert-warning" role="alert">
              {t('rbs.error', { defaultValue: 'Une erreur est survenue.' })}
            </div>
          )}

          <div className="d-flex justify-content-end gap-8 mt-16">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('rbs.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button type="button" className="btn btn-primary" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {t('rbs.share.submit', { defaultValue: 'Partager' })}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default ShareDialog;
