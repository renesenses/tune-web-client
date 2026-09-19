/**
 * #4471 — réparer les coffrets ripés en `CD1/`, `CD2/`, depuis l'écran
 * Métadonnées.
 *
 * Un coffret ripé en sous-dossiers arrive bien dans UN album, mais ses titres
 * se déclarent tous « disque 1 » : les numéros de piste se marchent dessus,
 * l'album se lit dans un ordre indéfini et paraît plein de doublons.
 *
 * Mesuré sur le .18 le 19/09/2026 :
 *
 *     #991 The Song Remains The Same    9 pistes, disques [1], n° 1-4 en double
 *     #834 Delicate Sound Of Thunder   15 pistes, disques [1], n° 1-7 en double
 *     #844 Pulse (Live)                24 pistes, disques [1], n° 1-11 en double
 *
 * Rendement de la réparation sur cette même bibliothèque : 372 albums en
 * collision, 3 réparés, 369 laissés tels quels — le dossier n'explique pas
 * leur collision, et le serveur refuse d'inventer une numérotation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');
const api = readFileSync('src/lib/api.ts', 'utf8');

describe('#4471 — les deux routes', () => {
  it('l\'aperçu et la réparation existent, et ne se confondent pas', () => {
    expect(api).toContain("`${BASE}/library/albums/disques-abimes`");
    expect(api).toContain("`${BASE}/library/albums/disques-abimes/reparer`");
    // 🔴 L'aperçu ne doit RIEN écrire : pas de méthode, donc GET.
    const i = api.indexOf('export function getDisquesAbimes()');
    const bloc = api.slice(i, api.indexOf('\n}', i));
    expect(bloc).not.toContain("method: 'POST'");
    // La réparation, elle, est un POST explicite.
    const j = api.indexOf('export function reparerDisquesAbimes()');
    expect(api.slice(j, api.indexOf('\n}', j))).toContain("method: 'POST'");
  });

  it('les deux rendent la MÊME forme — l\'écran compare avant et après', () => {
    expect(api).toContain('export interface DisquesAbimes');
    const i = api.indexOf('export interface DisquesAbimes');
    const bloc = api.slice(i, api.indexOf('\n}', i));
    for (const champ of ['applique', 'albums', 'pistes', 'details']) {
      expect(bloc, champ).toContain(champ);
    }
  });
});

describe('#4471 — l\'écran', () => {
  it('le bloc vit dans l\'onglet Doublons', () => {
    expect(vue).toContain('v2.meta.discsTitle');
    expect(vue).toContain('api.getDisquesAbimes()');
    expect(vue).toContain('api.reparerDisquesAbimes()');
  });

  it('🔴 il ne se montre QUE s\'il y a quelque chose à réparer', () => {
    expect(vue).toContain('{#if disques && disques.albums > 0}');
  });

  it('🔴 il survit à un onglet Doublons VIDE', () => {
    // Un coffret mal numéroté n'est pas un doublon : le bloc est hors du
    // `{#if dblLoading}` et hors du « rien à signaler », sinon il serait
    // invisible précisément quand il est seul à avoir quelque chose à dire.
    const iBloc = vue.indexOf('{#if disques && disques.albums > 0}');
    const iVide = vue.indexOf("v2.meta.noDup");
    expect(iBloc).toBeGreaterThan(0);
    expect(iVide).toBeGreaterThan(iBloc);
    // Et « rien à signaler » ne s'affiche plus quand des disques attendent.
    expect(vue).toContain('{#if !disques || disques.albums === 0}');
  });

  it('🔴 le bouton DISPARAÎT une fois la réparation faite', () => {
    // `applique` distingue l'aperçu du compte rendu : proposer de réparer ce
    // qui vient de l'être inviterait à un second passage sans objet.
    expect(vue).toContain('{#if !disques.applique}');
    expect(vue).toContain("disques.applique ? 'v2.meta.discsDone'");
  });

  it('⚠️ l\'écran DIT que les fichiers ne sont pas touchés', () => {
    // C'est la question que se pose quiconque a tagué sa bibliothèque à la
    // main : ce geste ne réécrit aucun FLAC.
    expect(vue).toContain('v2.meta.discsSafe');
    const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');
    const ligne = fr.split('\n').find((l) => l.includes('v2.meta.discsSafe')) ?? '';
    expect(ligne.toLowerCase()).toContain('tags');
  });

  it('la bibliothèque est RELUE après l\'écriture', () => {
    const i = vue.indexOf('async function reparerDisques(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('await chargerDoublons()');
  });

  it('🔴 un serveur ANTÉRIEUR ne prive pas l\'onglet de ses autres listes', () => {
    // La requête est à part et son échec est avalé : un 404 sur la nouvelle
    // route ne doit pas emporter les albums, artistes et pistes en double.
    const i = vue.indexOf('async function chargerDisques(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('catch { disques = null; }');
    expect(vue).toContain('void chargerDisques();');
  });
});

describe('#4471 — les six clés dans les ONZE langues', () => {
  const CLES = ['v2.meta.discsTitle', 'v2.meta.discsWhat', 'v2.meta.discsPreview',
    'v2.meta.discsDone', 'v2.meta.discsSafe', 'v2.meta.discsFix'];
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of CLES) expect(src, `${l} / ${c}`).toContain(c);
      for (const c of ['v2.meta.discsPreview', 'v2.meta.discsDone']) {
        const ligne = src.split('\n').find((x) => x.includes(c)) ?? '';
        expect(ligne, `${l} / ${c}`).toContain('{albums}');
        expect(ligne, `${l} / ${c}`).toContain('{tracks}');
      }
    });
  }
});
