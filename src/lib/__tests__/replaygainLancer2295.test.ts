/**
 * web#2295 (Tades, fil 2370, rc7 ; récidive de tune-server-rust#6330) —
 * « Pourquoi pas d'interrupteur Lancer - Pause sur le ReplayGain alors que
 * tous les autres en ont ». La carte ReplayGain d'« État du serveur » n'avait
 * aucun geste au repos. Route : `POST /system/replaygain/analyze`
 * (tune-server-rust#6778).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CARTES_LANCABLES, CLE_ISSUE, boutonLancer, issueDe, lancerTout, lancerTraitement,
  type RoutesLancement,
} from '../lancerTraitement';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

function routes(rg: RoutesLancement['rg']): RoutesLancement {
  return {
    dr: async () => ({ status: 'started' }),
    enrich: async () => ({ status: 'started' }),
    covers: async () => ({ status: 'started' }),
    rg,
  };
}

describe('web#2295 — la carte ReplayGain porte « Lancer »', () => {
  it('🔴 au repos ou terminée : oui ; en cours, suspendue, éteinte ou inconnue : non', () => {
    expect(boutonLancer({ id: 'rg', etat: 'idle' }, false)).toBe(true);
    expect(boutonLancer({ id: 'rg', etat: 'done' }, false)).toBe(true);
    expect(boutonLancer({ id: 'rg', etat: 'running' }, false)).toBe(false);
    expect(boutonLancer({ id: 'rg', etat: 'idle' }, true), 'suspendue : elle se REPREND').toBe(false);
    expect(boutonLancer({ id: 'rg', etat: 'off' }, false)).toBe(false);
    expect(boutonLancer({ id: 'rg', etat: 'inconnu' }, false)).toBe(false);
  });

  it('« Tout relancer » ne la lance pas en plus : `relaunch-all` la réveille déjà', () => {
    expect(CARTES_LANCABLES).not.toContain('rg');
  });
});

describe('web#2295 — ce que dit chaque réponse de la route', () => {
  it('🔴 « Lancer » appelle la route ReplayGain et lit son issue', async () => {
    const rg = vi.fn(async () => ({ status: 'started', waiting_reason: null }));
    expect(await lancerTraitement('rg', routes(rg))).toBe('lance');
    expect(rg).toHaveBeenCalledTimes(1);
  });

  it('les cas du contrat (#6778)', () => {
    expect(issueDe('started', { waiting_reason: 'playback' })).toBe('attente');
    expect(issueDe('nothing_to_do')).toBe('rien');
    expect(issueDe('already_running')).toBe('deja');
    expect(issueDe('refused', { reason: 'analysis_disabled' })).toBe('coupee');
    expect(issueDe('refused', { reason: 'paused' })).toBe('suspendue');
  });

  it('serveur sans la route (404/405) : une phrase d’information, pas une erreur', async () => {
    for (const status of [404, 405]) {
      const rg = async () => { throw Object.assign(new Error(String(status)), { status }); };
      expect(await lancerTraitement('rg', routes(rg))).toBe('indisponible');
    }
    const panne = async () => { throw Object.assign(new Error('500'), { status: 500 }); };
    await expect(lancerTraitement('rg', routes(panne))).rejects.toThrow('500');
  });

  it('« Tout relancer » garde ses trois lancements', async () => {
    const rg = vi.fn(async () => ({ status: 'started' }));
    const r = await lancerTout(new Set(), routes(rg));
    expect(Object.keys(r)).toEqual(['dr', 'enrich', 'covers']);
    expect(rg).not.toHaveBeenCalled();
  });

  it('chaque issue a sa phrase dans les 13 langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const cle of Object.values(CLE_ISSUE)) expect(d[cle], `${l} ${cle}`).toBeTruthy();
    }
  });

  it('l’API vise la route de #6778, et un 409 est une réponse', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf8');
    const i = src.indexOf('export function lancerReplayGain()');
    expect(i).toBeGreaterThan(0);
    const corps = src.slice(i, i + 400);
    expect(corps).toContain('/system/replaygain/analyze');
    expect(corps).toContain("method: 'POST'");
    expect(corps).toContain('statut === 409');
  });
});
