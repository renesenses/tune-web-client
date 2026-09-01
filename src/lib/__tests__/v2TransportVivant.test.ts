/**
 * La barre de transport du nouveau client doit être ALIMENTÉE.
 *
 * ## Le défaut
 *
 * `?v2` monte `ShellV2` À LA PLACE de `App.svelte`. Or c'est `App` qui possède
 * toute la plomberie temps réel : WebSocket, rafraîchissement des zones,
 * minuteur de progression, report de la répétition et de l'aléatoire.
 * `bootstrapV2` ne charge que du STATIQUE, une fois, au montage.
 *
 * Constaté par Bertrand le 01/09/2026, la barre historique une fois montée dans
 * le shell v2 : « la barre de progression est mal branchée ainsi que le statut
 * des boutons ». Elle n'était pas mal branchée — personne ne l'alimentait.
 *
 * ## Trois manques distincts, et il faut les trois
 *
 * `currentTrack` et `playbackState` DÉRIVENT de `currentZone`, donc de `zones` :
 * ils suivent tout seuls, à condition que `zones` bouge.
 *
 *  1. la liste des zones ne se rafraîchissait pas → piste et état figés ;
 *  2. le minuteur ne tournait pas → la barre n'avançait jamais ;
 *  3. répétition et aléatoire n'arrivent QUE par l'événement `snapshot` — ni
 *     `/zones` ni `/zones/{id}` ne les portent. Sans lui, ces deux boutons
 *     restent éternellement sur leur valeur par défaut.
 *
 * Corriger un seul des trois laisse une barre à moitié vivante — plus
 * trompeuse qu'une barre morte, parce qu'elle a l'air de fonctionner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const live = () => lire('../v2Live.ts');
const shell = () => lire('../../components/v2/ShellV2.svelte');

describe('Nouveau client — le transport est alimenté', () => {
  it('la coquille démarre le raccordement, et l’arrête au démontage', () => {
    const src = shell();
    expect(src.includes('demarrerTransportV2'), 'le raccordement n’est plus démarré').toBe(true);
    // `$effect(() => demarrerTransportV2())` : la valeur rendue EST le nettoyage.
    // Sans elle, le minuteur et l'abonnement survivent au démontage.
    expect(
      /\$effect\(\(\) => demarrerTransportV2\(\)\)/.test(src),
      'le retour de nettoyage est perdu : minuteur et abonnements survivraient au démontage.',
    ).toBe(true);
  });

  it('les zones sont rafraîchies en direct', () => {
    const src = live();
    expect(src.includes('tuneWS.connect()'), 'le WebSocket n’est plus connecté').toBe(true);
    expect(src.includes("type === 'zone.updated'"), 'la mise à jour groupée des zones a disparu').toBe(true);
    expect(src.includes('zones.set('), 'les zones ne sont plus écrites').toBe(true);
  });

  it('le minuteur de progression tourne, et se corrige sans osciller', () => {
    const src = live();
    expect(src.includes('startSeekTimer()'), 'le minuteur n’est plus démarré').toBe(true);
    expect(src.includes('stopSeekTimer()'), 'le minuteur n’est plus arrêté hors lecture').toBe(true);
    // Sans filtre de dérive, chaque point du serveur ferait sauter la barre au
    // lieu de la laisser glisser.
    expect(
      /DERIVE_MAX_MS\s*=\s*2000/.test(src),
      'le filtre de dérive a disparu ou changé : la barre oscillerait à chaque point serveur.',
    ).toBe(true);
  });

  it('répétition et aléatoire suivent le `snapshot`, seule source', () => {
    const src = live();
    expect(src.includes("type === 'snapshot'"), 'le snapshot n’est plus écouté').toBe(true);
    expect(src.includes('repeatMode.set('), 'la répétition n’est plus reportée').toBe(true);
    expect(src.includes('shuffleEnabled.set('), 'l’aléatoire n’est plus reporté').toBe(true);
  });

  it('les charges partielles sont FUSIONNÉES, pas écrasées', () => {
    // Un `snapshot` peut ne porter que l'un des deux. Écraser l'autre avec
    // `undefined` éteindrait un bouton allumé.
    expect(
      live().includes('mergeTransport(transportParZone.get(z.id), zone)'),
      'la fusion a disparu : une charge partielle éteindrait le bouton qu’elle ne mentionne pas.',
    ).toBe(true);
  });

  it('un serveur muet ne vide pas l’écran', () => {
    // Recharger les zones peut échouer. Vider `zones` afficherait « aucune
    // zone » — un écran vide qui ressemble à une réponse.
    const src = live();
    const i = src.indexOf('async function rechargerZones');
    const bloc = src.slice(i, src.indexOf('\n}', i));
    expect(bloc.includes('catch'), 'l’échec de rechargement n’est plus rattrapé').toBe(true);
    expect(
      /catch\s*\{[^}]*zones\.set/.test(bloc),
      'l’échec vide les zones : l’écran annoncerait « aucune zone » sur une simple coupure.',
    ).toBe(false);
  });
});
