/**
 * Coffrets ÉCLATÉS en un album par disque — moitié client du chantier
 * (serveur : renesenses/tune-server-rust PR #4475).
 *
 * Mesuré sur le .18 le 19/09/2026 : 61 coffrets, 148 albums, 94 disques isolés
 * écartés. *Radio Nova — La boîte Bleue* en compte vingt-cinq à elle seule.
 *
 * ⚠️ À ne pas confondre avec les coffrets MAL NUMÉROTÉS (#4471, bloc voisin) :
 * là, l'album est déjà un et sa numérotation est fausse ; ici il y a autant
 * d'albums que de disques.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');
const api = readFileSync('src/lib/api.ts', 'utf8');

describe('coffrets éclatés — les routes', () => {
  it('lister et regrouper existent, et ne se confondent pas', () => {
    expect(api).toContain("`${BASE}/library/albums/coffrets`");
    expect(api).toContain('/regrouper');
    const i = api.indexOf('export function getCoffretsEclates()');
    expect(api.slice(i, api.indexOf('\n}', i))).not.toContain("method: 'POST'");
    const j = api.indexOf('export function regrouperCoffret(');
    expect(api.slice(j, api.indexOf('\n}', j))).toContain("method: 'POST'");
  });

  it('🔴 le regroupement prend UNE cible, pas une liste', () => {
    // Un bouton « tout regrouper » sur vingt-cinq disques est un geste qu'on
    // ne peut pas relire avant de le faire.
    expect(api).toContain('export function regrouperCoffret(cible: number)');
  });
});

describe('coffrets éclatés — l\'écran', () => {
  it('le bloc existe et appelle les deux routes', () => {
    expect(vue).toContain('v2.meta.boxTitle');
    expect(vue).toContain('api.getCoffretsEclates()');
    expect(vue).toContain('api.regrouperCoffret(c.cible)');
  });

  it('il ne se montre que s\'il y a des coffrets', () => {
    expect(vue).toContain('{#if coffrets.length}');
  });

  it('🔴 UN SEUL regroupement à la fois', () => {
    // `coffretEnCours` désarme TOUS les boutons pendant l'opération : deux
    // absorptions concurrentes sur la même bibliothèque se marcheraient dessus.
    expect(vue).toContain('coffretEnCours != null || c.cible == null');
    expect(vue).toContain('coffretEnCours === c.cible');
  });

  it('🔴 il survit à un onglet Doublons VIDE', () => {
    // Un coffret éclaté n'est pas un doublon : « Aucun doublon » ne doit plus
    // s'afficher quand des coffrets attendent.
    expect(vue).toContain('(!disques || disques.albums === 0) && !coffrets.length');
  });

  it('les deux listes sont RELUES après un regroupement', () => {
    const i = vue.indexOf('async function regrouper(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('await chargerCoffrets()');
    expect(bloc).toContain('await chargerDoublons()');
  });

  it('🔴 un serveur ANTÉRIEUR ne prive pas l\'onglet du reste', () => {
    const i = vue.indexOf('async function chargerCoffrets(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('catch { coffrets = []; }');
  });

  it('l\'écran montre le DOSSIER — c\'est lui qui a servi de preuve', () => {
    expect(vue).toContain('{c.dossier}');
    expect(vue).toContain('v2.meta.boxDiscs');
  });
});

describe('coffrets éclatés — les trois clés dans les ONZE langues', () => {
  const CLES = ['v2.meta.boxTitle', 'v2.meta.boxDiscs', 'v2.meta.boxMerge'];
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of CLES) expect(src, `${l} / ${c}`).toContain(c);
      const ligne = src.split('\n').find((x) => x.includes('v2.meta.boxDiscs')) ?? '';
      expect(ligne, `${l} sans {n}`).toContain('{n}');
    });
  }
});
