/**
 * Garde-fou sur la distinction `active` / `mounted` (#1916, #2069).
 *
 * Le défaut d'origine tient en une phrase : l'interface affichait l'INTENTION
 * de l'utilisateur en croyant afficher l'ÉTAT du montage. Ces tests échouent si
 * quelqu'un refait ce raccourci.
 */
import { describe, it, expect } from 'vitest';
import { etatPartage } from '../smbMountState';
import type { SmbMount } from '../api';

function partage(p: Partial<SmbMount> = {}): SmbMount {
  return {
    id: 1,
    server: '192.168.1.159',
    share: 'ROSEDISK',
    mount_path: '/mnt/192.168.1.159_ROSEDISK',
    username: 'ROSE',
    active: true,
    mounted: true,
    mount_state: 'mounted',
    last_mount_error: null,
    smb_version: 'negocie',
    ...p,
  };
}

describe('etatPartage', () => {
  it('un partage monté ne signale rien', () => {
    const e = etatPartage(partage());
    expect(e.enEchec).toBe(false);
    expect(e.cause).toBeNull();
    expect(e.signalerSmb1).toBe(false);
  });

  /// Le cas d'Éric (`ricouxxx`) : l'utilisateur VEUT ce partage (`active`),
  /// le remontage a échoué, et l'interface l'affichait quand même comme sain.
  it('un partage voulu mais non monté est en échec — active ne sauve rien', () => {
    const e = etatPartage(partage({
      active: true,
      mounted: false,
      mount_state: 'failed',
      last_mount_error: 'mount error(22): Invalid argument',
    }));
    expect(e.enEchec).toBe(true);
    expect(e.cause).toBe('mount error(22): Invalid argument');
  });

  /// L'inverse compte autant : un partage désactivé mais réellement monté
  /// n'est pas « en échec ». C'est `mounted` qui décide, jamais `active`.
  it('un partage désactivé mais monté n\'est pas en échec', () => {
    const e = etatPartage(partage({ active: false, mounted: true }));
    expect(e.enEchec).toBe(false);
  });

  /// Le constat de l'instant prime sur celui du dernier essai : un NAS rallumé
  /// et remonté à la main doit apparaître monté, même si le démarrage avait
  /// échoué.
  it('mounted prime sur un mount_state périmé', () => {
    const e = etatPartage(partage({
      mounted: true,
      mount_state: 'failed',
      last_mount_error: 'Host is down',
    }));
    expect(e.enEchec).toBe(false);
    expect(e.cause).toBeNull();
  });

  it('aucune cause affichée sans message, même en échec', () => {
    const e = etatPartage(partage({ mounted: false, last_mount_error: null }));
    expect(e.enEchec).toBe(true);
    expect(e.cause).toBeNull();
  });

  /// Le partage de Philippe Landes, exposé par un streamer ROSE qui ne parle
  /// que SMB 1.0. Y retomber est parfois la seule façon de le lire — le faire
  /// en silence, non.
  it('signale SMB 1.0, et lui seul', () => {
    expect(etatPartage(partage({ smb_version: '1.0' })).signalerSmb1).toBe(true);
    expect(etatPartage(partage({ smb_version: '2.0' })).signalerSmb1).toBe(false);
    expect(etatPartage(partage({ smb_version: 'negocie' })).signalerSmb1).toBe(false);
    // macOS : `mount_smbfs` négocie seul, rien n'est mémorisé.
    expect(etatPartage(partage({ smb_version: null })).signalerSmb1).toBe(false);
  });
});
