/**
 * #910 — « Radio » et « Best of » absents près du nom de l'artiste (Sandro,
 * 15/09/2026, v0.9.150, interface italienne).
 *
 * Il demandait s'ils avaient été retirés. Ils ne l'avaient pas été : les deux
 * boutons sont entièrement conditionnés par `{#if titres.length}`, et `titres`
 * reste VIDE dans DEUX cas très différents —
 *
 *   • le service ne rend aucun titre phare pour cet artiste ;
 *   • la requête `top-tracks` a ÉCHOUÉ, et `Promise.allSettled` avale le rejet.
 *
 * Dans le second, la page montrait ses albums sans un mot, et deux gestes
 * disparaissaient sans que rien ne dise pourquoi. Même distinction que #1096
 * pour les zones : une liste vide et une liste qu'on n'a pas pu charger ne se
 * disent pas pareil.
 *
 * ⚠️ Ce témoin ne prétend RIEN sur le cas de Sandro lui-même : son blocage
 * établi est la navigation vers la fiche (#956), qu'il n'atteignait pas. Il
 * garde le défaut d'affichage que l'issue décrit, et lui seul.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/ArtisteServiceV2.svelte', 'utf8');

describe('#910 — un refus n\'est pas une absence', () => {
  it('le témoin d\'échec existe et part du bon côté de `allSettled`', () => {
    expect(vue).toContain('let titresEnEchec = $state(false);');
    const i = vue.indexOf("if (tt.status === 'fulfilled')");
    expect(i).toBeGreaterThan(0);
    const bloc = vue.slice(i, i + 1400);
    // Succès : on l'éteint. Rejet : on l'allume.
    expect(bloc).toContain('titresEnEchec = false;');
    expect(bloc).toContain('titresEnEchec = true;');
    // 🔴 Contre-épreuve : l'allumage est bien dans la branche `else`.
    const faux = bloc.indexOf('titresEnEchec = true;');
    const sinon = bloc.indexOf('} else {');
    expect(sinon).toBeGreaterThan(0);
    expect(faux).toBeGreaterThan(sinon);
  });

  it('🔴 il est REMIS À ZÉRO à chaque chargement', () => {
    // Sans cela, un artiste dont les titres se chargent après un artiste en
    // échec hériterait du message de son prédécesseur.
    const i = vue.indexOf('async function charger(');
    const bloc = vue.slice(i, i + 400);
    expect(bloc).toContain('titres = [];');
    expect(bloc).toContain('titresEnEchec = false;');
  });
});

describe('#910 — ce que l\'écran en dit', () => {
  it('les deux boutons restent conditionnés aux titres — ils ne mentent pas', () => {
    // Les afficher sans titres ferait partir un « best of » VIDE : `titres`
    // est ce que `jouerLesTitres` met en file.
    expect(vue).toContain('{#if titres.length}');
    const i = vue.indexOf("v2.fas.bestOf");
    const garde = vue.lastIndexOf('{#if ', i);
    expect(vue.slice(garde, i)).toContain('titres.length');
  });

  it('🔴 mais l\'écran DIT pourquoi ils manquent, et laisse réessayer', () => {
    expect(vue).toContain('{:else if titresEnEchec && !chargement}');
    expect(vue).toContain('v2.fas.topTracksFailed');
    const i = vue.indexOf('{:else if titresEnEchec && !chargement}');
    const bloc = vue.slice(i, i + 500);
    expect(bloc).toContain("zone.retry");
    expect(bloc).toContain('charger(');
  });

  it('🔴 « rien trouvé » et « rien chargé » ne sont plus la même phrase', () => {
    // 🔴 Viser la LIGNE DE L'ÉTAT, pas la première occurrence de la clé :
    // `v2.fas.empty` sert aussi deux notifications d'échec de lecture, plus
    // haut dans le fichier. Une garde qui coupe au premier `indexOf` aurait
    // jugé le mauvais endroit — et serait restée rouge quoi qu'on fasse.
    const ligne = vue.split('\n').find((l) => l.includes('class="etat"') && l.includes('v2.fas.empty'));
    expect(ligne, 'ligne d\'état introuvable').toBeDefined();
    expect(ligne!).toContain('titresEnEchec ?');
    expect(ligne!).toContain('v2.fas.topTracksFailed');
  });

  it('la clé existe dans les ONZE langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      expect(readFileSync(`src/lib/locales/${l}.ts`, 'utf8'), l).toContain('v2.fas.topTracksFailed');
    }
  });
});
