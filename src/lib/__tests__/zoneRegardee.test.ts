/**
 * #753 — vider la file d'une zone vidait l'affichage de la file d'une AUTRE.
 *
 * Le cache de file était remis à zéro sans filtre à la réception de
 * `playback.queue.cleared`, alors que tout le reste de la même branche filtre
 * sur la zone. Deux zones, on vide la première, l'écran de la seconde affiche
 * une file vide qui ne l'est pas — et rien ne la recharge.
 */
import { describe, it, expect } from 'vitest';
import { concerneLaZoneRegardee } from '../zoneRegardee';

const ZONES = [
  { id: 8, group_id: null },        // Sonos, seul
  { id: 10, group_id: null },       // Eversolo, seul
  { id: 4, group_id: 'g1' },        // deux zones synchronisées
  { id: 5, group_id: 'g1' },
];

describe('L’événement concerne-t-il la zone regardée ?', () => {
  it('oui, quand c’est la même zone', () => {
    expect(concerneLaZoneRegardee(10, { id: 10 }, ZONES)).toBe(true);
  });

  it('🔴 NON, quand c’est une autre zone — c’était le défaut #753', () => {
    // Je regarde l'Eversolo, on vide la file du Sonos : mon écran ne bouge pas.
    expect(concerneLaZoneRegardee(8, { id: 10, group_id: null }, ZONES)).toBe(false);
  });

  it('oui, quand les deux zones sont dans le même groupe', () => {
    // Deux zones synchronisées partagent leur file : l'événement émis par le
    // suiveur concerne bien ce qu'affiche le meneur.
    expect(concerneLaZoneRegardee(5, { id: 4, group_id: 'g1' }, ZONES)).toBe(true);
  });

  it('non, quand les groupes diffèrent', () => {
    const zones = [...ZONES, { id: 6, group_id: 'g2' }];
    expect(concerneLaZoneRegardee(6, { id: 4, group_id: 'g1' }, zones)).toBe(false);
  });

  it('🔴 deux ABSENCES de groupe ne se rencontrent pas', () => {
    // C'est le défaut classique de `a?.x === b?.x` : `null === null` est vrai,
    // et toutes les zones non groupées deviendraient solidaires.
    expect(concerneLaZoneRegardee(8, { id: 10, group_id: null }, ZONES)).toBe(false);
    expect(concerneLaZoneRegardee(8, { id: 10 }, [{ id: 8 }, { id: 10 }])).toBe(false);
  });

  it('un événement sans zone ne concerne personne', () => {
    expect(concerneLaZoneRegardee(null, { id: 10 }, ZONES)).toBe(false);
    expect(concerneLaZoneRegardee(undefined, { id: 10 }, ZONES)).toBe(false);
  });

  it('sans zone courante, rien ne concerne l’écran', () => {
    expect(concerneLaZoneRegardee(10, null, ZONES)).toBe(false);
    expect(concerneLaZoneRegardee(10, { id: null }, ZONES)).toBe(false);
  });

  it('une zone émettrice inconnue de la liste ne devient pas solidaire', () => {
    expect(concerneLaZoneRegardee(99, { id: 4, group_id: 'g1' }, ZONES)).toBe(false);
  });
});

describe('🔴 La branche `queue.cleared` d’App.svelte appelle bien ce filtre', () => {
  it('ne vide plus le cache de file sans condition', async () => {
    // Garde de CÂBLAGE : la règle ci-dessus ne sert à rien si l'appelant ne
    // l'appelle pas. On vérifie que les trois remises à zéro du cache sont
    // sous condition, et non plus au fil de la branche.
    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/App.svelte', 'utf8'),
    );
    const branche = source.slice(
      source.indexOf("type === 'playback.queue.cleared'"),
      source.indexOf("} else if (zoneId) {", source.indexOf("type === 'playback.queue.cleared'")),
    );
    expect(branche).toContain('concerneLaZoneRegardee');
    // `queueTracks.set([])` doit être précédé du filtre dans la même branche.
    const avantLeVidage = branche.slice(0, branche.indexOf('queueTracks.set([])'));
    expect(avantLeVidage).toContain('concerneLaZoneRegardee');
  });
});
