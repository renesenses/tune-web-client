// @vitest-environment jsdom
//
// jsdom est indispensable ICI et nulle part ailleurs : sans `window`, le
// runtime client de Svelte n'installe pas son ordonnanceur et `$effect` ne se
// declenche JAMAIS, meme apres `flushSync`. Verifie : `$derived` fonctionne en
// environnement `node`, les effets non. Un test de reactivite ecrit sans DOM
// serait vert sans avoir rien execute — exactement le genre de test qui donne
// une fausse assurance. Le reste de la suite reste en `node`.
import { describe, expect, it } from 'vitest';
import { writable } from 'svelte/store';

import { flush, trackedReset, untrackedReset } from './effectScope.svelte';

/**
 * Bug de navigation Qobuz — Dominique COMET, 0.9.66 (Windows).
 *
 * « lorsqu'on fait retour on revient à la racine de Qobuz avec le choix des
 * genres au lieu de revenir sur la liste d'albums correspondants au genre
 * choisi. »
 *
 * Le bouton « Retour » n'y était pour rien. L'effet de remise à zéro de
 * `StreamingView`, censé ne réagir qu'au changement de service, appelait
 * `loadLocalFavorites` — qui lit `$currentProfileId` avant son premier
 * `await`. Le profil devenait donc une dépendance de l'effet, et en changer
 * effaçait `browsingGenres` et `genreBreadcrumb` en pleine navigation.
 *
 * Deux tests distincts, parce qu'il y a deux choses à protéger :
 *  1. le MÉCANISME — qu'`untrack` isole bien un corps qui lit d'autres stores ;
 *  2. le CODE — que le corps de cet effet-là reste enfermé dedans.
 */

describe('portée des dépendances d’un $effect', () => {
  it('sans untrack, une lecture imbriquée devient une dépendance', () => {
    const service = writable<string | null>('qobuz');
    const profileId = writable<number | null>(1);

    const r = trackedReset(service, profileId);
    expect(r.bodyRuns).toBe(1);

    // Changer de SERVICE doit rejouer le corps : c'est le contrat voulu.
    service.set('tidal');
    flush();
    expect(r.bodyRuns).toBe(2);

    // Changer de PROFIL le rejoue aussi — c'est précisément le bug.
    profileId.set(2);
    flush();
    expect(r.bodyRuns).toBe(3);

    r.stop();
  });

  it('avec untrack, seul le service reste une dépendance', () => {
    const service = writable<string | null>('qobuz');
    const profileId = writable<number | null>(1);

    const r = untrackedReset(service, profileId);
    expect(r.bodyRuns).toBe(1);

    service.set('tidal');
    flush();
    expect(r.bodyRuns).toBe(2);

    // Le profil change : la navigation ne doit PAS être remise à zéro.
    profileId.set(2);
    flush();
    expect(r.bodyRuns).toBe(2);

    // Et il reste inerte quel que soit le nombre de changements.
    profileId.set(3);
    profileId.set(4);
    flush();
    expect(r.bodyRuns).toBe(2);

    r.stop();
  });
});
