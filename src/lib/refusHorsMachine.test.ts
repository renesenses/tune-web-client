import { describe, expect, it } from 'vitest';
import { messageRefusHorsMachine, motifHorsMachine } from './refusHorsMachine';
import { ONZE_LANGUES, dictionnaire } from './__tests__/onzeDictionnaires';
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
    expect(messageRefusHorsMachine(new Error('Failed to fetch'), tr)).toBeNull();
  });

  it('🔴 rc14 — not_local : courte, sans commande, et juste pour Tune OS (jamais SSH)', () => {
    const e = erreur(403, { error: 'auth_required', reason: 'not_local' });
    const m = messageRefusHorsMachine(e, tr)!;
    expect(m).toBe(en['machineAction.notLocal']);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      const phrase = messageRefusHorsMachine(e, (c) => d[c] ?? c)!;
      // Ce qui est refusé et pourquoi, puis quoi faire : deux phrases, pas un paragraphe.
      expect(phrase.length, `${l} : ${phrase}`).toBeLessThan(220);
      for (const interdit of ['docker', 'journalctl', 'SSH', '{command}', 'localhost', '<container>']) {
        expect(phrase, `${l} : ${phrase}`).not.toContain(interdit);
      }
      // Le chemin du réglage ne cite plus aucune commande, et nulle part « SSH ».
      for (const cle of ['machineAction.whereToEnable', 'authActivation.codeIntro', 'authActivation.codeSent']) {
        expect(d[cle], `${l} ${cle}`).toBeTruthy();
        expect(d[cle], `${l} ${cle}`).not.toContain('SSH');
      }
      expect(d['machineAction.whereToEnable'], l).not.toContain('journalctl');
    }
    expect(fr['machineAction.notLocal']).toContain('machine du serveur');
    expect(fr['machineAction.notLocal']).toContain('administrateur');
  });

  it('autre motif : port 80 relayé, avec le chemin du réglage', () => {
    expect(messageRefusHorsMachine(erreur(403, { error: 'auth_required', reason: 'port80_relay' }), tr)).toBe(
      `${en['machineAction.port80Relay']} ${en['machineAction.whereToEnable']}`,
    );
    expect(en['machineAction.whereToEnable']).toContain('Settings > System > Authentication');
  });

  it('la phrase not_local existe en 20 langues, la variante « Redémarrer » a disparu', () => {
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['machineAction.notLocal'], l).toBeTruthy();
      expect(dictionnaire(l)['machineAction.notLocalRestart'], l).toBeUndefined();
    }
  });
});
