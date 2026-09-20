// @vitest-environment jsdom
//
// renesenses/tune-web-client#1327, **point 1** — Gros Bidon (Didier), fil 1858,
// 20/09/2026, écran Streaming Qobuz, Windows :
//
//   « 1. Sur l'écran du service de streaming Qobuz les actions de la souris ne
//     sont pas très ergonomiques. Par exemple si la souris est à la hauteur de
//     la zone du titre Qobuz, la molette de la souris n'a aucun effet. »
//
// Ses points 2, 3 et 4 sont corrigés par #1380 (`defilementHorizontal`, la
// rangée qui confisquait la molette au milieu de sa course) — gardés par
// `defilementHorizontal1327.test.ts`, que ce fichier ne redouble pas. Le point
// 1 est d'une AUTRE nature : il n'y avait rien à confisquer, l'en-tête est
// simplement FRÈRE du défileur dans une colonne en `overflow:hidden`.
//
// ## 🔴 Ce qu'un test du seul module ne verrait pas
//
// `deplacementPorte` peut être juste sans que personne ne l'appelle, et sans
// que `.scroll` soit jamais lié. Les deux derniers cas MONTENT l'écran réel,
// envoient un vrai `WheelEvent` sur l'en-tête, et lisent `scrollTop` du
// contenu. Import de l'écran à la COLLECTE, pas dans le cas (#1326 / #1333).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import { deplacementPorte, unDefileurInterne } from '../molettePortee';
import { peutDefilerVerticalement } from '../defilementHorizontal';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.setConfig({ testTimeout: 30_000 });

/** Un défileur mesuré : 3 000 px de contenu dans 800 px de cadre. */
const defileur = (scrollTop: number) => ({ scrollTop, scrollHeight: 3000, clientHeight: 800 });

describe('#1327 point 1 — la règle : porter la molette au contenu', () => {
  it('🔴 une molette verticale sur une bande inerte part au défileur', () => {
    expect(deplacementPorte(defileur(0), { deltaX: 0, deltaY: 120 })).toBe(120);
    expect(deplacementPorte(defileur(500), { deltaX: 0, deltaY: -120 })).toBe(-120);
  });

  it('🔴 elle n’est PAS prise quand le contenu ne peut plus avancer', () => {
    // Sinon `preventDefault()` couperait le chaînage vers un défileur plus
    // haut : la règle d'en-tête de `defilementHorizontal`, appliquée ici.
    expect(deplacementPorte(defileur(2200), { deltaX: 0, deltaY: 120 })).toBe(0);
    expect(deplacementPorte(defileur(0), { deltaX: 0, deltaY: -120 })).toBe(0);
    expect(deplacementPorte({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 }, { deltaX: 0, deltaY: 120 }))
      .toBe(0);
  });

  it('un geste déjà horizontal, `Ctrl` + molette, et l’absence de cible passent leur tour', () => {
    expect(deplacementPorte(defileur(0), { deltaX: -40, deltaY: 120 })).toBe(0);
    // `Ctrl` + molette est le ZOOM du navigateur : on ne le détourne pas.
    expect(deplacementPorte(defileur(0), { deltaX: 0, deltaY: 120, ctrlKey: true })).toBe(0);
    expect(deplacementPorte(null, { deltaX: 0, deltaY: 120 })).toBe(0);
    expect(deplacementPorte(defileur(0), { deltaX: 0, deltaY: 0 })).toBe(0);
  });

  it('un sous-pixel d’arrondi ne fait pas un défileur', () => {
    expect(peutDefilerVerticalement({ scrollTop: 0, scrollHeight: 800.5, clientHeight: 800 }, 120))
      .toBe(false);
  });

  it('un défileur INTERNE à la bande garde son geste', () => {
    const bande = document.createElement('div');
    const dedans = document.createElement('div');
    const cible = document.createElement('span');
    dedans.appendChild(cible);
    bande.appendChild(dedans);
    // jsdom rend 0 partout : on pose les mesures à la main.
    Object.defineProperty(dedans, 'scrollHeight', { value: 900, configurable: true });
    Object.defineProperty(dedans, 'clientHeight', { value: 300, configurable: true });
    expect(unDefileurInterne(cible, bande, 120)).toBe(true);
    // …et la bande elle-même ne compte pas : c'est la BORNE.
    Object.defineProperty(bande, 'scrollHeight', { value: 900, configurable: true });
    Object.defineProperty(bande, 'clientHeight', { value: 300, configurable: true });
    expect(unDefileurInterne(bande, bande, 120)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L'écran monté : une vraie molette sur l'en-tête, et `scrollTop` du contenu.
// ---------------------------------------------------------------------------

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const SERVICES = { qobuz: { enabled: true, authenticated: true, username: 'Didier' } };

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function respirer(tours = 50, pret: () => boolean = () => false) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (pret()) break;
  }
  flushSync();
}

/**
 * jsdom ne met JAMAIS en page : `scrollHeight` y vaut toujours `clientHeight`,
 * donc aucun élément n'est « défilant » et aucun `scrollBy` ne bouge. On
 * instrumente le seul défileur de l'écran avec les mesures d'un vrai écran
 * (3 000 px de contenu dans 800 px de cadre) et un `scrollBy` qui tient le
 * compte — ce qu'on juge est le BRANCHEMENT, pas la mise en page du navigateur.
 */
function instrumenter(el: HTMLElement) {
  let haut = 0;
  Object.defineProperty(el, 'scrollHeight', { get: () => 3000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { get: () => 800, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    get: () => haut,
    set: (v: number) => { haut = Math.max(0, Math.min(2200, v)); },
    configurable: true,
  });
  (el as any).scrollBy = (o: any) => { el.scrollTop = haut + (o?.top ?? 0); };
  return () => haut;
}

/** Une molette comme le navigateur l'envoie : annulable, et qui remonte. */
function molette(cible: Element, deltaY: number, plus: Partial<WheelEventInit> = {}) {
  const e = new WheelEvent('wheel', { deltaY, deltaX: 0, bubbles: true, cancelable: true, ...plus });
  cible.dispatchEvent(e);
  return e;
}

describe('#1327 point 1 — l’écran monté : l’en-tête fait défiler le contenu', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) {
      vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) => {
        if (/\/streaming\/services/.test(String(url))) return reponse(SERVICES);
        return reponse([]);
      }),
    );
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) {
      try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
      monte = null;
    }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function monterEcran() {
    monte = mount(StreamingV2 as any, { target: hote! });
    await respirer(60, () => !!hote!.querySelector('nav.svcs button'));
  }

  it('🔴 une molette sur le titre « Streaming » fait défiler le contenu', async () => {
    await monterEcran();
    const entete = hote!.querySelector('header.v2-top') as HTMLElement;
    const contenu = hote!.querySelector('.scroll') as HTMLElement;
    expect(entete, 'l’en-tête n’est pas rendu').not.toBeNull();
    expect(contenu, 'le défileur n’est pas rendu').not.toBeNull();
    // 🔴 L'en-tête est bien HORS du défileur : c'est toute la cause. Si un jour
    // il passe dedans, ce témoin doit tomber, pas rester vert par accident.
    expect(contenu.contains(entete), 'l’en-tête est passé DANS le défileur').toBe(false);

    const ou = instrumenter(contenu);
    const titre = entete.querySelector('h1') as HTMLElement;
    const e = molette(titre, 120);
    expect(ou(), 'la molette sur l’en-tête n’a rien fait défiler').toBe(120);
    expect(e.defaultPrevented, 'l’événement n’a pas été pris').toBe(true);
  });

  it('les deux rangées d’onglets la portent aussi', async () => {
    await monterEcran();
    const contenu = hote!.querySelector('.scroll') as HTMLElement;
    const ou = instrumenter(contenu);
    molette(hote!.querySelector('nav.svcs button') as Element, 120);
    expect(ou(), 'la rangée de services ne porte pas la molette').toBe(120);
    molette(hote!.querySelector('nav.subs button') as Element, 60);
    expect(ou(), 'la rangée de sous-onglets ne porte pas la molette').toBe(180);
  });

  it('🔴 CONTRE-ÉPREUVE — en butée, l’en-tête RELÂCHE l’événement', async () => {
    // Sans cette garde, `preventDefault()` couperait le chaînage vers un
    // défileur plus haut et l'écran se figerait au lieu de se débloquer.
    await monterEcran();
    const contenu = hote!.querySelector('.scroll') as HTMLElement;
    instrumenter(contenu);
    const entete = hote!.querySelector('header.v2-top') as HTMLElement;
    expect(molette(entete, -120).defaultPrevented, 'pris alors que le contenu est en haut')
      .toBe(false);
    contenu.scrollTop = 2200;
    expect(molette(entete, 120).defaultPrevented, 'pris alors que le contenu est en bas')
      .toBe(false);
  });

  it('CONTRE-ÉPREUVE — une molette DANS le contenu n’est pas détournée', async () => {
    await monterEcran();
    const contenu = hote!.querySelector('.scroll') as HTMLElement;
    const ou = instrumenter(contenu);
    expect(molette(contenu, 120).defaultPrevented).toBe(false);
    expect(ou(), 'l’action a doublé le défilement naturel du contenu').toBe(0);
  });
});

// ---------------------------------------------------------------------------
// #1382 — la rangée d'artistes favoris n'est plus inatteignable.
// ---------------------------------------------------------------------------
describe('#1327 point 1 — l’écran ÉDITORIAL, celui de la capture', () => {
  // C'est `PageWidgets` que montre la capture de Didier : l'en-tête
  // « Éditorial / **Qobuz** / Modifier ». Il a la MÊME colonne — en-tête frère
  // d'un `.scroll` en `flex:1` — et le même défaut.
  //
  // ⚠️ Témoin de TEXTE, et il le dit : monter `PageWidgets` demande un
  // catalogue, une disposition et une clé de rangement, soit un décor plus
  // grand que ce qu'il garderait. Il ne prouve que le BRANCHEMENT ; la règle
  // elle-même est jugée plus haut, et son effet sur un écran monté aussi.
  const accueil = () => readFileSync(resolve('src/components/v2/PageWidgets.svelte'), 'utf8');

  it('son en-tête porte la molette, et son défileur est lié', () => {
    const src = accueil();
    expect(src).toContain("from '../../lib/molettePortee'");
    expect(
      /<header class="v2-top" use:molettePortee=\{\(\) => zoneDefilante\}>/.test(src),
      'l’en-tête de PageWidgets ne porte plus la molette',
    ).toBe(true);
    expect(
      /<div class="scroll" bind:this=\{zoneDefilante\}>/.test(src),
      'le défileur de PageWidgets n’est plus lié : l’action viserait `null`',
    ).toBe(true);
  });
});

describe('#1382 — Favoris ▸ Artistes : une affordance, enfin', () => {
  // 🔴 Chemin depuis `process.cwd()`, pas `import.meta.url` : sous
  // `@vitest-environment jsdom`, `import.meta.url` n'est PAS une URL `file:`
  // et `fileURLToPath` jette. Le cas était rouge pour cette seule raison.
  const source = () => readFileSync(resolve('src/components/v2/StreamingV2.svelte'), 'utf8');

  it('🔴 `.arow` va à la ligne et ne masque plus sa barre sur AUCUN moteur', () => {
    const css = source();
    const regle = /\.arow\{([^}]*)\}/.exec(css);
    expect(regle, 'la règle `.arow` a disparu').not.toBeNull();
    expect(regle![1], 'la rangée tient encore sur une seule ligne').toContain('flex-wrap:wrap');
    expect(regle![1], 'Gecko masque encore la barre').toContain('scrollbar-width:thin');
    // 🔴 La seconde moitié du masquage vivait CINQUANTE lignes plus bas, et
    // après : à spécificité égale c'est elle qui gagnait. On compte donc les
    // occurrences, on ne se contente pas de la première règle trouvée.
    expect(
      css.includes('.arow::-webkit-scrollbar{display:none}'),
      'Blink et WebKit masquent encore la barre, plus bas dans la feuille',
    ).toBe(false);
    expect(css).toContain('.arow::-webkit-scrollbar{height:8px}');
  });
});
