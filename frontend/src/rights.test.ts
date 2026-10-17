import { describe, expect, it } from 'vitest';

import { anyRight, Me, rightsOn, RIGHT_KEYS } from './rights';

const me: Me = { userId: 'u1', groupsIds: ['g1', 'g2'], adminLocalScope: ['s1'], isSuperAdmin: false };
const type = { owner: 'boss', school_id: 's9', shared: [] as Array<Record<string, unknown>> };

describe('droits sur un type ou une ressource', () => {
  it('aucun droit sans partage', () => {
    expect(rightsOn(type, me)).toEqual({ contrib: false, process: false, manage: false });
  });
  it('propriétaire du type ou de la ressource : tous les droits', () => {
    expect(rightsOn({ ...type, owner: 'u1' }, me)).toEqual({ contrib: true, process: true, manage: true });
    expect(rightsOn(type, me, { owner: 'u1' })).toEqual({ contrib: true, process: true, manage: true });
  });
  it('administrateur local de l\'établissement du type, et super-administrateur', () => {
    expect(rightsOn({ ...type, school_id: 's1' }, me).manage).toBe(true);
    expect(rightsOn(type, me).manage).toBe(false);
    expect(rightsOn(type, { ...me, isSuperAdmin: true }).process).toBe(true);
  });
  it('partage direct : seuls les droits accordés', () => {
    const t = { ...type, shared: [{ userId: 'u1', [RIGHT_KEYS.contrib]: true }] };
    expect(rightsOn(t, me)).toEqual({ contrib: true, process: false, manage: false });
  });
  it('partage par groupe : un groupe de l\'usager compte, un autre non', () => {
    const t = { ...type, shared: [{ groupId: 'g2', [RIGHT_KEYS.process]: true }, { groupId: 'gX', [RIGHT_KEYS.manage]: true }] };
    expect(rightsOn(t, me)).toEqual({ contrib: false, process: true, manage: false });
  });
  it('usager inconnu : rien', () => {
    expect(rightsOn({ ...type, owner: '' }, { ...me, userId: '' })).toEqual({ contrib: false, process: false, manage: false });
  });
  it('anyRight', () => {
    expect(anyRight([{ contrib: true, process: false, manage: false }, { contrib: false, process: true, manage: false }], 'process')).toBe(true);
    expect(anyRight([], 'manage')).toBe(false);
  });
});
