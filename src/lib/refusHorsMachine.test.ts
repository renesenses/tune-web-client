import { describe, expect, it } from 'vitest';
import { COMMANDE_PAR_DEFAUT, messageRefusHorsMachine, motifHorsMachine } from './refusHorsMachine';
import en from './locales/en';
import fr from './locales/fr';

const tr = (cle: string) => (en as Record<string, string>)[cle] ?? cle;

function erreur(status: number, corps: unknown) {
  const e = new Error('This action requires authentication to be enabled, or a call from this machine (localhost).') as Error & {
    status?: number;
    corps?: unknown;
  };
  e.status = status;
  e.corps = corps;
  return e;
}

describe('refus hors de la machine de Tune (tune-server-rust#9029)', () => {
  it('reconnaît le refus not_local et le relais du port 80', () => {
    expect(motifHorsMachine(erreur(403, { error: 'auth_required', reason: 'not_local' }))).toBe('not_local');
    expect(motifHorsMachine(erreur(403, { error: 'auth_required', reason: 'port80_relay' }))).toBe('port80_relay');
  });

  it('reconnaît not_local_network (réseau local) et garde la phrase traduite du serveur', () => {
    const corps = {
      error: 'auth_required',
      reason: 'not_local_network',
      message: 'Install the update: without authentication, it is only accepted from the local network.',
      message_key: 'api.machine.reservedOutsideLan',
    };
    const e = erreur(403, corps);
    expect(motifHorsMachine(e)).toBe('not_local_network');
    const m = messageRefusHorsMachine(e, tr)!;
    expect(m).toBe(`${corps.message} ${en['machineAction.whereToEnable']}`);
    expect(m).not.toContain(en['machineAction.notLocal']);
    // Sans phrase traduite : le chemin du réglage seul, jamais le texte brut.
    expect(messageRefusHorsMachine(erreur(403, { error: 'auth_required', reason: 'not_local_network', message: 'brut' }), tr)).toBe(
      en['machineAction.whereToEnable'],
    );
  });

  it('ignore les autres refus', () => {
    expect(motifHorsMachine(erreur(403, { error: 'admin role required' }))).toBeNull();
    expect(motifHorsMachine(erreur(403, { error: 'auth_required', code: 'auth_required' }))).toBeNull();
    expect(motifHorsMachine(erreur(401, { error: 'auth_required', reason: 'not_local' }))).toBeNull();
    expect(motifHorsMachine(new Error('Failed to fetch'))).toBeNull();
    expect(motifHorsMachine(null)).toBeNull();
    expect(messageRefusHorsMachine(new Error('Failed to fetch'), tr, 'restart')).toBeNull();
  });

  it('Redémarrer : dit les deux issues, avec la commande du conteneur', () => {
    const e = erreur(403, { error: 'auth_required', reason: 'not_local' });
    const docker = messageRefusHorsMachine(e, tr, 'restart', { moteur: 'Docker', commande: 'docker restart tune' })!;
    expect(docker).toContain('enable');
    expect(docker).toContain('docker restart tune');
    expect(docker).not.toContain('{command}');
    expect(messageRefusHorsMachine(e, tr, 'restart')).toContain(COMMANDE_PAR_DEFAUT);
  });

  it('autre action : la phrase générique, traduite', () => {
    const e = erreur(403, { error: 'auth_required', reason: 'not_local' });
    expect(messageRefusHorsMachine(e, tr)).toBe(`${en['machineAction.notLocal']} ${en['machineAction.whereToEnable']}`);
    expect(messageRefusHorsMachine(erreur(403, { error: 'auth_required', reason: 'port80_relay' }), tr)).toBe(
      `${en['machineAction.port80Relay']} ${en['machineAction.whereToEnable']}`,
    );
    // Chaque refus dit où activer l'authentification.
    expect(messageRefusHorsMachine(e, tr, 'restart')).toContain('Settings > System > Authentication');
  });

  it('les trois phrases existent en français et portent {command} où il faut', () => {
    for (const cle of ['machineAction.notLocal', 'machineAction.notLocalRestart', 'machineAction.port80Relay']) {
      expect((fr as Record<string, string>)[cle]).toBeTruthy();
    }
    expect(fr['machineAction.notLocalRestart']).toContain('{command}');
    expect(en['machineAction.notLocalRestart']).toContain('{command}');
  });
});
