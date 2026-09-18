/**
 * #1096 — « Aucune zone » alors que le serveur en porte quatorze.
 *
 * Le témoin du fait : pendant le redémarrage qui suit une mise à jour, le
 * client reçoit un échec sur `/zones`, le magasin reste à `[]`, et l'écran
 * conclut que l'utilisateur n'a aucune zone — en l'invitant à en créer une.
 *
 * Contre-épreuve à chaque garde : sans le correctif, un `[]` non chargé et un
 * `[]` réellement vide sont le MÊME état, et la garde ne garde rien.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  chargerLesZones,
  etatDesZones,
  listeVraimentVide,
  ESSAIS,
} from '../chargementDesZones';
import type { Zone } from '../types';

const zone = (id: number, name: string): Zone => ({ id, name } as unknown as Zone);

beforeEach(() => etatDesZones.set('jamais'));

describe('#1096 — distinguer « liste vide » de « pas pu la charger »', () => {
  it('une liste vide ne se dit « aucune zone » qu\'après un chargement RÉUSSI', () => {
    expect(listeVraimentVide('chargees', 0)).toBe(true);
    // Contre-épreuve : les trois autres états, mêmes zéro zones, ne l'autorisent pas.
    expect(listeVraimentVide('jamais', 0)).toBe(false);
    expect(listeVraimentVide('chargement', 0)).toBe(false);
    expect(listeVraimentVide('echec', 0)).toBe(false);
    // Et une liste PLEINE n'est jamais vide, quel que soit l'état.
    expect(listeVraimentVide('chargees', 14)).toBe(false);
  });

  it('un chargement réussi pose la liste et l\'état', async () => {
    const posees: Zone[][] = [];
    const liste = await chargerLesZones(
      (zs) => posees.push(zs),
      async () => [zone(1, 'HC4'), zone(2, 'Loopback')],
    );
    expect(liste?.length).toBe(2);
    expect(posees).toHaveLength(1);
    expect(get(etatDesZones)).toBe('chargees');
    expect(listeVraimentVide(get(etatDesZones), 2)).toBe(false);
  });

  it('un serveur qui redémarre : le premier appel échoue, le deuxième rend les zones', async () => {
    let appels = 0;
    const posees: Zone[][] = [];
    const liste = await chargerLesZones(
      (zs) => posees.push(zs),
      async () => {
        appels++;
        if (appels === 1) throw new Error('Failed to fetch');
        return [zone(1, 'HC4')];
      },
      ESSAIS,
      0,
    );
    expect(appels).toBe(2);
    expect(liste?.length).toBe(1);
    expect(get(etatDesZones)).toBe('chargees');
    // 🔴 le cœur du défaut : sans l'essai suivant, l'écran en serait resté à zéro.
    expect(posees.at(-1)).toHaveLength(1);
  });

  it('tous les essais échoués : état « echec », liste JAMAIS écrasée', async () => {
    const posees: Zone[][] = [];
    const liste = await chargerLesZones(
      (zs) => posees.push(zs),
      async () => { throw new Error('Failed to fetch'); },
      ESSAIS,
      0,
    );
    expect(liste).toBeNull();
    expect(get(etatDesZones)).toBe('echec');
    // Rien n'a été posé : un écran déjà peuplé ne se vide pas sous les yeux.
    expect(posees).toHaveLength(0);
    // Et surtout : on ne dit PAS « aucune zone ».
    expect(listeVraimentVide(get(etatDesZones), 0)).toBe(false);
  });

  it('le nombre d\'essais est celui annoncé', async () => {
    let appels = 0;
    await chargerLesZones(
      () => {},
      async () => { appels++; throw new Error('boom'); },
      ESSAIS,
      0,
    );
    expect(appels).toBe(ESSAIS);
  });

  it('un serveur réellement sans zone reste « aucune zone »', async () => {
    const liste = await chargerLesZones(() => {}, async () => []);
    expect(liste).toEqual([]);
    expect(get(etatDesZones)).toBe('chargees');
    expect(listeVraimentVide(get(etatDesZones), 0)).toBe(true);
  });
});

describe('#1096 — l\'écran Zones n\'invite plus à créer sur une liste non chargée', () => {
  it('ZonesV2 garde son état vide derrière listeVraimentVide', async () => {
    const fs = await import('node:fs');
    const vue = fs.readFileSync('src/components/v2/ZonesV2.svelte', 'utf8');
    // La phrase « Aucune zone » ne s'affiche plus sur un simple `!$zones.length`.
    const i = vue.indexOf("$t('v2.zone.none'");
    expect(i).toBeGreaterThan(0);
    const avant = vue.slice(0, i);
    expect(avant).toContain('listeVraimentVide($etatDesZones, $zones.length)');
    // Et le rechargement passe bien par le chargeur à essais.
    expect(vue).toContain('chargerLesZones((zs) => zones.set(zs))');
    expect(vue).not.toContain('zones.set(await api.getZones())');
  });

  it('l\'amorçage v2 passe par le chargeur à essais', async () => {
    const fs = await import('node:fs');
    const boot = fs.readFileSync('src/lib/v2Bootstrap.ts', 'utf8');
    expect(boot).toContain('chargerLesZones((zs) => zones.set(zs))');
    expect(boot).not.toContain('const list = await api.getZones()');
  });
});
