// @vitest-environment jsdom
//
// « Ce qui tourne », branché sur les champs de l'étape 3 du serveur
// (renesenses/tune-server-rust#6310) : `activity` / `reason` sur chaque
// traitement et sur le scan PRIMENT sur la déduction ; le bloc
// `playback_priority.background_compute` dit si le calcul de fond tourne en
// basse priorité, et laquelle. Un serveur plus ancien garde la déduction.
import { describe, expect, it } from 'vitest';
import { ceQuiTourne, clePriorite, phraseCalcul, remplir } from '../ceQuiTourne';
import lFr from '../locales/fr';

const fr = lFr as Record<string, string>;

function base(over: Record<string, unknown> = {}): any {
  return {
    tasks: [],
    pausable: [],
    all_paused: false,
    playback_priority: {
      playback_active: true,
      playing_zone_ids: [3],
      pause_between_items_ms: 5000,
      policy: { enabled: true, pause_between_items_ms: 5000, scan_width: 2, pause_between_files_ms: 20, background_compute_low_priority: true },
      brakes: {},
    },
    ...over,
  };
}

const par = (c: any) => Object.fromEntries(c.lignes.map((l: any) => [l.id, l]));

describe('activity / reason du serveur', () => {
  it('priment sur la déduction faite des anciens champs', () => {
    const c = ceQuiTourne(base({
      pausable: [
        // Anciens champs contradictoires : c'est `activity` qui fait foi.
        { id: 'replaygain', state: 'en_cours', paused: false, throttled_for_playback: false, activity: 'yielded', reason: 'playback' },
        { id: 'enrichment', state: 'au_repos', paused: false, throttled_for_playback: false, activity: 'throttled', reason: 'playback' },
        { id: 'acoustic', state: 'en_cours', paused: false, throttled_for_playback: true, activity: 'idle', reason: null },
        { id: 'fingerprints', state: 'en_cours', paused: false, activity: 'paused', reason: 'user_pause' },
        { id: 'dynamic_range', state: 'au_repos', paused: false, activity: 'working', reason: null },
      ],
      scan: { running: false, throttled_for_playback: false, activity: 'throttled', reason: 'playback' },
    }))!;
    const p = par(c);
    expect(p.replaygain.etat).toBe('cedee');
    expect(p.replaygain.raisonCle).toBe('v2.health.running.why.decodeYield');
    expect(p.enrichment.etat).toBe('ralentie');
    expect(p.enrichment.params).toEqual({ s: 5 });
    expect(p.acoustic, 'idle : au repos, pas de ligne').toBeUndefined();
    expect(p.fingerprints.etat).toBe('en_pause');
    expect(p.fingerprints.raisonCle).toBe('v2.health.running.why.paused');
    expect(p.dynamic_range.etat).toBe('en_cours');
    expect(p.scan.etat).toBe('ralentie');
    expect(c.auRepos).toBe(1);
  });

  it('un serveur ancien (sans activity) garde la déduction ; un mot inconnu aussi', () => {
    const c = ceQuiTourne(base({
      pausable: [
        { id: 'replaygain', state: 'au_repos', paused: false, throttled_for_playback: true },
        { id: 'enrichment', state: 'en_cours', paused: false, throttled_for_playback: true, activity: 'mot_futur' },
      ],
      scan: { running: true, throttled_for_playback: false },
    }))!;
    const p = par(c);
    expect(p.replaygain.etat).toBe('cedee');
    expect(p.enrichment.etat).toBe('ralentie');
    expect(p.scan.etat).toBe('en_cours');
  });

  it('le scan au repos selon le serveur ne produit pas de ligne', () => {
    const c = ceQuiTourne(base({ scan: { running: true, activity: 'idle', reason: null } }))!;
    expect(par(c).scan).toBeUndefined();
  });
});

describe('background_compute', () => {
  const bc = { low_priority_pool: true, armed: true, cpu: 'nice_10', io: 'idle', threads: 2, idle_threads: 1, jobs_done: 18342 };

  it('armé : les fils, les travaux, la priorité obtenue', () => {
    const c = ceQuiTourne(base({ playback_priority: { ...base().playback_priority, background_compute: bc } }));
    const ph = phraseCalcul(c)!;
    expect(ph.cle).toBe('v2.health.running.compute.on');
    expect(ph.params).toEqual({ n: 2, libres: 1, faits: 18342 });
    expect(ph.cpuCle).toBe('v2.health.running.prio.nice_10');
    expect(ph.ioCle).toBe('v2.health.running.prio.idle');
    expect(remplir(fr[ph.cle], ph.params)).toContain('18342');
  });

  it('réglage coupé, pas encore armé, valeur inconnue, bloc absent', () => {
    const pp = base().playback_priority;
    const coupe = ceQuiTourne(base({ playback_priority: { ...pp, policy: { ...pp.policy, background_compute_low_priority: false }, background_compute: { ...bc, low_priority_pool: false } } }));
    expect(phraseCalcul(coupe)!.cle).toBe('v2.health.running.compute.off');
    const pasArme = ceQuiTourne(base({ playback_priority: { ...pp, background_compute: { ...bc, armed: false, cpu: null, io: null } } }));
    expect(phraseCalcul(pasArme)).toEqual({ cle: 'v2.health.running.compute.notArmed', params: {}, cpuCle: null, ioCle: null });
    expect(clePriorite('sched_futur')).toBeNull();
    expect(phraseCalcul(ceQuiTourne(base()))).toBeNull();
  });

  it('chaque clé existe en français', () => {
    for (const k of ['off', 'notArmed', 'on', 'cpu', 'io']) expect(fr[`v2.health.running.compute.${k}`], k).toBeTruthy();
    for (const v of ['nice_10', 'qos_background', 'thread_mode_background', 'idle', 'best_effort_7', 'none']) {
      expect(fr[clePriorite(v)!], v).toBeTruthy();
    }
  });
});
