// @vitest-environment jsdom
/**
 * Fils 3098 (Firefox, 2 189 albums) et 3104 (Edge, 40 537 pistes) — la
 * grille des albums se FIGE après une vingtaine de lignes de défilement.
 *
 * Reproduit sur Shrek (Chromium sans affichage, faux serveur de 3 000
 * albums, 40 crans de molette) : au vingtième cran, 24 s de fil principal
 * bloqué, puis `effect_update_depth_exceeded`. La trace montrait la tranche
 * basculer 119-350 ↔ 126-357 un millier de fois DANS LA MÊME vidange, à
 * chaque fois depuis `update` de l'action.
 *
 * Cause : Svelte appelle `update` d'une action depuis son effet de rendu
 * sans l'isoler. `calculer` → `surFenetre` (`poserTranchePaginee`) LIT la
 * tranche pour la comparer, puis l'ÉCRIT : l'effet dépendait de l'état
 * qu'il écrivait. Il suffisait que l'ancre lue dans le DOM hésite entre deux
 * rangées pour que l'effet ne s'arrête plus.
 *
 * Ces témoins montent l'action par `use:` dans un vrai composant. Sur le
 * `main` d'avant le correctif, le témoin est ROUGE (`effect_update_depth_exceeded`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Temoin from './TemoinGrillePaginee3104.svelte';
import type { TrancheAlbums } from '../fenetreAlbumsPaginee';

type Instance = { poses: TrancheAlbums[] };

let monte: ReturnType<typeof mount> | null = null;
let hote: HTMLElement;

beforeEach(() => {
  // Les trames ne passent jamais : seul le chemin synchrone (`update`) compte.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('fils 3098 / 3104 — la grille en pages ne boucle pas sur sa propre tranche', () => {
  it("l'ancre qui hésite entre deux rangées ne fige pas la page", () => {
    // Le DOM rendu par une tranche désigne l'autre comme première rangée en
    // vue (cale du haut estimée ≠ rangées réelles) : A → B → A…
    let position = 0;
    const apresPose = (el: HTMLElement) => {
      if (!Object.prototype.hasOwnProperty.call(el, 'scrollTop')) {
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => position, set: (v: number) => { position = v; } });
      }
      position = position === 0 ? 50_000 : 0;
    };
    const props = $state({ total: 3000, apresPose });
    monte = mount(Temoin, { target: hote, props });
    flushSync();
    const temoin = monte as unknown as Instance;
    const avant = temoin.poses.length;
    // Une page arrive : les options changent, `update` part une fois.
    props.total = 3001;
    expect(() => flushSync()).not.toThrow();
    expect(temoin.poses.length - avant).toBe(1);
  });
});
