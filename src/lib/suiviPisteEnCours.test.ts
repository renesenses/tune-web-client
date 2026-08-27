import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  positionFileAnnoncee,
  doitRechargerLaFileEntiere,
  doitReessayerCheminSignal,
  delaiEssaiCheminSignal,
  MAX_ESSAIS_CHEMIN_SIGNAL,
} from './suiviPisteEnCours';

/**
 * Deux comportements avaient été livrés puis avalés par la fusion f14553f du
 * 23/07/2026 (« Merge branch 'prep/v0.9.0-ui' into web-main-090 ») : le côté
 * perdant a disparu du contenu sans que les commits sortent de l'histoire.
 *
 *  - #133/#1096 — l'avance de piste ne déplace que le pointeur ; recharger la
 *    file ENTIÈRE à chaque changement fige l'écran sous une grande file
 *    aléatoire (Jean Valjean). Le serveur pose l'index AVANT d'émettre
 *    (orchestrator.rs, `update_queue_info` puis `play`/`update_now_playing`),
 *    donc l'événement porte déjà `queue_position`.
 *  - #72/#75 — sur la PREMIÈRE piste d'une zone démarrée à froid, la réponse
 *    de `GET /zones/{id}` peut arriver avant que la zone ait fini de passer en
 *    lecture : `signal_path` revient nul et le badge bit-perfect ne s'affiche
 *    qu'à la deuxième piste (« absent en lecture de 1ière piste, apparaît en
 *    2ième piste »).
 *
 * Ce fichier tient les deux : la décision pure d'un côté, le CÂBLAGE dans
 * App.svelte de l'autre — car c'est précisément le câblage, et non la règle,
 * que la fusion avait emporté.
 */

const appSource = readFileSync(resolve(__dirname, '../App.svelte'), 'utf-8');

/** Le corps de la branche `playback.started` / `playback.track_changed`. */
function brancheDemarrageOuChangement(): string {
  const debut = appSource.indexOf(
    "if (type === 'playback.started' || type === 'playback.track_changed') {",
    appSource.indexOf('// Optimistic update'),
  );
  const fin = appSource.indexOf('// Fetch full zone state from API', debut);
  expect(debut).toBeGreaterThan(0);
  expect(fin).toBeGreaterThan(debut);
  return appSource.slice(debut, fin);
}

describe('câblage dans App.svelte (perdu par la fusion f14553f)', () => {
  it('consomme la décision partagée au lieu de la réécrire sur place', () => {
    expect(appSource).toContain("from './lib/suiviPisteEnCours'");
    expect(appSource).toContain('positionFileAnnoncee');
    expect(appSource).toContain('doitRechargerLaFileEntiere');
    expect(appSource).toContain('doitReessayerCheminSignal');
  });

  it('#1096 : ne recharge plus la file entière sans condition', () => {
    const branche = brancheDemarrageOuChangement();
    // Le défaut à ne pas laisser revenir : `fetchQueue()` posé nu dans la
    // branche, donc exécuté à chaque avance de piste. Il ne doit y avoir qu'un
    // seul appel, et sous la garde.
    expect(branche.match(/fetchQueue\(\)/g)).toHaveLength(1);
    expect(branche).toMatch(
      /if \(doitRechargerLaFileEntiere\(type, serveurPorteLaPositionDeFile\)\) \{\s*\n\s*fetchQueue\(\);/,
    );
  });

  it('#1096 : prend la position portée par l’événement', () => {
    const branche = brancheDemarrageOuChangement();
    expect(branche).toContain('positionFileAnnoncee(event.data)');
    expect(branche).toContain('queuePosition.set(');
  });

  it('#72/#75 : relance la synchro tant que le chemin du signal manque', () => {
    const branche = brancheDemarrageOuChangement();
    expect(branche).toContain('doitReessayerCheminSignal(');
    expect(branche).toContain('syncZoneState(zoneId)');
    expect(branche).toContain('delaiEssaiCheminSignal(');
  });
});

describe('position annoncée par le serveur (#1096)', () => {
  it('prend l’index annoncé, y compris la première piste', () => {
    expect(positionFileAnnoncee({ queue_position: 0 })).toBe(0);
    expect(positionFileAnnoncee({ queue_position: 417 })).toBe(417);
  });

  it('refuse tout ce qui n’est pas un index — mieux vaut recharger que mentir', () => {
    expect(positionFileAnnoncee({})).toBeNull();
    expect(positionFileAnnoncee({ queue_position: null })).toBeNull();
    expect(positionFileAnnoncee({ queue_position: '3' })).toBeNull();
    expect(positionFileAnnoncee({ queue_position: -1 })).toBeNull();
    expect(positionFileAnnoncee({ queue_position: 1.5 })).toBeNull();
    expect(positionFileAnnoncee({ queue_position: NaN })).toBeNull();
    expect(positionFileAnnoncee(null)).toBeNull();
    expect(positionFileAnnoncee(undefined)).toBeNull();
  });
});

describe('rechargement de la file entière (#1096)', () => {
  it('ne recharge PLUS sur une simple avance de piste', () => {
    expect(doitRechargerLaFileEntiere('playback.track_changed', true)).toBe(false);
  });

  it('recharge au démarrage : le contenu peut être neuf', () => {
    expect(doitRechargerLaFileEntiere('playback.started', true)).toBe(true);
  });

  it('recharge contre un serveur qui ne porte pas la position', () => {
    expect(doitRechargerLaFileEntiere('playback.track_changed', false)).toBe(true);
    expect(doitRechargerLaFileEntiere('playback.started', false)).toBe(true);
  });
});

describe('rattrapage du chemin du signal (#72, #75)', () => {
  it('réessaie sur une zone qui joue sans chemin de signal', () => {
    expect(doitReessayerCheminSignal({ state: 'playing', signal_path: null }, 0)).toBe(true);
  });

  it('ne renonce PAS sur un état transitoire — le défaut corrigé par #75', () => {
    // Démarrage lent (NAS / SQLite / Windows, Bilou) : la zone est encore en
    // transition quand l'événement arrive. Rendre la main ici, c'était laisser
    // le badge absent pendant toute la première piste.
    expect(doitReessayerCheminSignal({ state: 'paused', signal_path: null }, 0)).toBe(true);
    expect(doitReessayerCheminSignal({ state: undefined, signal_path: null }, 0)).toBe(true);
  });

  it('s’arrête dès que le chemin est résolu — coût nul en régime établi', () => {
    expect(
      doitReessayerCheminSignal({ state: 'playing', signal_path: { bit_perfect: true } as any }, 0),
    ).toBe(false);
  });

  it('s’arrête sur un arrêt franc ou une zone disparue', () => {
    expect(doitReessayerCheminSignal({ state: 'stopped', signal_path: null }, 0)).toBe(false);
    expect(doitReessayerCheminSignal(null, 0)).toBe(false);
    expect(doitReessayerCheminSignal(undefined, 0)).toBe(false);
  });

  it('borne le budget et l’élargit assez pour un démarrage lent', () => {
    const zone = { state: 'playing' as const, signal_path: null };
    expect(doitReessayerCheminSignal(zone, MAX_ESSAIS_CHEMIN_SIGNAL - 1)).toBe(true);
    expect(doitReessayerCheminSignal(zone, MAX_ESSAIS_CHEMIN_SIGNAL)).toBe(false);
    // Le premier correctif s'arrêtait à 3 essais (~2,4 s) : trop court.
    expect(MAX_ESSAIS_CHEMIN_SIGNAL).toBeGreaterThan(3);
    const budget = Array.from({ length: MAX_ESSAIS_CHEMIN_SIGNAL }, (_, i) =>
      delaiEssaiCheminSignal(i + 1),
    ).reduce((a, b) => a + b, 0);
    expect(budget).toBeGreaterThanOrEqual(8000);
  });
});
