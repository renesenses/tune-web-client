// @vitest-environment jsdom
//
// renesenses/tune-web-client#1151 — Benjithom, forum fil 1780, message
// d'ouverture du 13/09/2026, Safari sur iPad, serveur v0.9.148 :
//
//   « Sur Safari et avec le test de la V1 on a du mal a obtenir les titres du
//     menu navigation seul les symboles subsistent. »
//
// ## Le défaut, tel qu'il est dans le code
//
// La barre latérale v2 a DEUX variables là où il n'y a qu'un état :
//
//   - `collapsed`  — la préférence de l'utilisateur, lue de `localStorage` ;
//   - `enIcones`   — ce qui est RÉELLEMENT rendu :
//                    `$formatEcran === 'etroit' || (collapsed && !enTiroir)`.
//
// La classe `.collapsed` de l'élément — donc le `display:none` des libellés —
// suit `enIcones` (`class:collapsed={enIcones}`). Mais les infobulles de
// secours, l'intitulé du bouton de repli et la pastille de mise à jour sont
// tous calculés sur `collapsed`.
//
// Au palier « étroit » (≤ 1100 px, un iPad) et sans rien dans `localStorage`,
// `enIcones` vaut `true` et `collapsed` vaut `false`. Résultat, exactement ce
// que montre la capture de Benjithom : des icônes nues, `display:none` sur le
// libellé ET `title={undefined}`. L'icône n'est nommée nulle part — ni pour la
// souris, ni pour VoiceOver, puisqu'un `<span>` en `display:none` ne compte pas
// dans le nom accessible.
//
// Et le bouton de repli, rendu sans condition de palier, est alors MORT : il
// écrit bien la préférence, mais `enIcones` ne la regarde pas au palier
// étroit. L'utilisateur n'a aucune porte de sortie ; il lui faudrait
// redimensionner la fenêtre, ce qu'un iPad ne permet pas.
//
// ## 🔴 CE QUE CE TÉMOIN PROUVE — ET CE QU'IL NE PROUVE PAS
//
// Le CSS scopé de Svelte n'est PAS injecté sous vitest+jsdom, et jsdom ne fait
// aucune mise en page. Ce fichier ne peut donc RIEN dire d'une largeur
// calculée, d'un `display` effectif ou d'un pixel à l'écran.
//
// Il prouve, dans le DOM réel d'un composant réellement monté :
//   - que le palier étroit replie toujours la barre (la classe est posée) ;
//   - que chaque entrée porte alors un nom (`title` non vide) ;
//   - que le bouton de repli annonce le bon geste ;
//   - que ce bouton DÉPLIE réellement au palier étroit — la porte de sortie ;
//   - et, par lecture de source, que la décision d'affichage et les infobulles
//     lisent la MÊME expression.
//
// Il ne prouve pas que les libellés sont visuellement masqués à 900 px (c'est
// la règle CSS, déclarée et gardée plus bas, mais jamais appliquée ici), ni
// quoi que ce soit sur Safari/iPadOS : aucun iPad réel n'a été mesuré.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { t } from '../i18n';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { shortcuts } from '../stores/shortcuts';
import Sidebar from '../../components/v2/Sidebar.svelte';

vi.setConfig({ testTimeout: 60_000 });

const source = () =>
  readFileSync(resolve(process.cwd(), 'src/components/v2/Sidebar.svelte'), 'utf-8');

/** Le cas de #1138, gardé tel quel : la barre porte aussi des entrées de service. */
const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Benjithom' },
  tidal: { enabled: true, authenticated: true, username: null },
  deezer: { enabled: true, authenticated: false, username: null },
} as any;

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

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/**
 * La largeur de la fenêtre, avant tout montage.
 *
 * `formatEcran` est un `readable` : sa fonction de démarrage relit
 * `window.innerWidth` au PREMIER abonné, c'est-à-dire au montage de la barre.
 * Poser la largeur après coup ne changerait rien.
 */
function largeur(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
}

/**
 * 🔴 L'ÉCRAN EST IMPORTÉ À LA COLLECTE, PAS DANS LE CAS — #1326 / #1333.
 *
 * Un `await import('….svelte')` posé DANS un cas fait payer la compilation du
 * composant par vite au chronomètre de ce cas. Sous charge (huit portes
 * simultanées sur Shrek), le chronomètre saute : vitest déclare le cas expiré,
 * `afterEach` retire l'hôte, le cas suivant s'ouvre — puis la continuation
 * abandonnée reprend et exécute son `mount(…, { target: hote! })`. `hote`
 * est une variable de MODULE : elle désigne alors l'hôte du cas SUIVANT. Deux
 * écrans dans la même boîte, et un faux rouge qui accuse le code de terrain.
 *
 * L'import statique déplace la compilation vers la COLLECTE, hors de tout
 * chronomètre, et rend `mount` SYNCHRONE ici : plus aucune continuation ne peut
 * se poser dans l'hôte du cas suivant. `Sidebar.svelte` n'a pas de
 * `<script module>` : l'importer avant les `vi.stubGlobal(…)` ne déclenche rien.
 * Gardé par `composantsALaCollecte1333.test.ts`.
 */
async function monterBarre() {
  monte = mount(Sidebar as any, { target: hote! });
  await laisserTourner(40);
}

function demonter() {
  if (monte) {
    try {
      unmount(monte);
    } catch {
      /* le démontage n'est pas le sujet */
    }
    monte = null;
  }
  hote!.innerHTML = '';
}

const barre = () => hote!.querySelector('aside.v2-sidebar') as HTMLElement;
const repliee = () => barre().classList.contains('collapsed');
const entrees = () => Array.from(hote!.querySelectorAll('button.nav')) as HTMLButtonElement[];
const boutonRepli = () => hote!.querySelector('button.collapse') as HTMLButtonElement;

/** Le nom lisible d'une entrée : son libellé s'il est écrit, sinon son `title`. */
const etiquette = (b: HTMLButtonElement) => (b.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Les entrées SANS aucun nom atteignable une fois la barre en icônes. */
function entreesAnonymes(): string[] {
  return entrees()
    .filter((b) => !(b.getAttribute('title') ?? '').trim())
    .map((b) => etiquette(b) || '(icône sans libellé ni infobulle)');
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
      if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
      if (/\/config/.test(u)) return reponse({});
      return reponse([]);
    }),
  );
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('home');
});

afterEach(() => {
  demonter();
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  largeur(1024);
});

describe('#1151 — au palier étroit, les icônes sont NOMMÉES', () => {
  it('TÉMOIN — à 900 px la barre est bien repliée en icônes (le palier reste)', async () => {
    // Ce ticket ne demande PAS de supprimer le palier étroit : 236 px de barre
    // sur une fenêtre de 1000 px, c'est un quart de l'écran. Si cette garde
    // tombe, c'est qu'on a « corrigé » en retirant le repli d'office.
    largeur(900);
    await monterBarre();
    expect(repliee(), 'le palier étroit ne replie plus la barre d’office').toBe(true);
  });

  it('🔴 à 900 px, sans préférence enregistrée, AUCUNE entrée n’est anonyme', async () => {
    // Le cas exact de Benjithom : palier étroit, `localStorage` vide, donc
    // `collapsed === false` pendant que la barre est repliée.
    largeur(900);
    await monterBarre();
    expect(repliee()).toBe(true);
    const muettes = entreesAnonymes();
    expect(
      muettes,
      `${muettes.length} entrée(s) repliée(s) sans nom : [${muettes.join(' | ')}]`,
    ).toEqual([]);
  });

  it('🔴 l’entrée de service de #1168 est nommée elle aussi', async () => {
    // La PR #1168 a posé `title={collapsed ? nomService(svc) : undefined}` :
    // elle hérite du même défaut, et son entrée « Qobuz » est muette au palier
    // étroit. Elle ne doit pas disparaître pour autant.
    largeur(900);
    await monterBarre();
    const svc = Array.from(hote!.querySelectorAll('button.nav.svc')) as HTMLButtonElement[];
    expect(svc.length, 'les entrées par service de #1168 ont disparu de la barre').toBeGreaterThan(0);
    const anonymes = svc.filter((b) => !(b.getAttribute('title') ?? '').trim());
    expect(anonymes.length, 'une entrée de service repliée reste sans nom').toBe(0);
    expect(svc.map((b) => b.getAttribute('title'))).toContain('Qobuz');
  });

  it('TÉMOIN — au palier large et dépliée, rien ne porte d’infobulle', async () => {
    // Une infobulle posée en permanence doublerait le libellé déjà écrit et
    // ferait passer la garde précédente sans rien réparer.
    largeur(1400);
    await monterBarre();
    expect(repliee(), 'la barre est repliée au palier large sans qu’on l’ait demandé').toBe(false);
    const avecInfobulle = entrees().filter((b) => (b.getAttribute('title') ?? '').trim());
    expect(
      avecInfobulle.map(etiquette),
      'des infobulles s’affichent alors que les libellés sont écrits',
    ).toEqual([]);
  });
});

describe('#1151 — la porte de sortie : déplier au palier étroit', () => {
  it('🔴 le bouton de repli DÉPLIE réellement la barre à 900 px', async () => {
    // Le bouton est rendu sans condition de palier, il écrit bien la
    // préférence — et l'écran ne bouge pas, parce que `enIcones` ignore
    // `collapsed` au palier étroit. Sur un iPad, c'est la seule sortie
    // possible : ni 760 px ni 1101 px ne dépendent du testeur.
    largeur(900);
    await monterBarre();
    expect(repliee()).toBe(true);

    boutonRepli().click();
    await laisserTourner(10);

    expect(repliee(), 'le bouton de repli est MORT au palier étroit : rien ne bouge').toBe(false);
    const ecrits = entrees().map(etiquette).filter(Boolean);
    expect(ecrits.length, 'dépliée, la barre n’écrit toujours aucun libellé').toBeGreaterThan(3);
  });

  it('🔴 son intitulé annonce le geste RÉEL, pas l’inverse', async () => {
    // Repliée d'office au palier étroit, le bouton annonçait « Replier » —
    // son intitulé était calculé sur la préférence brute, qui vaut `false`.
    //
    // ⚠️ Comparer simplement l'avant et l'après ne prouve RIEN : les deux
    // intitulés diffèrent déjà aujourd'hui, ils sont juste inversés. On
    // compare donc aux libellés ATTENDUS, tirés du même dictionnaire que le
    // composant (aucune chaîne française en dur ici).
    const tr = get(t);
    largeur(900);
    await monterBarre();
    expect(repliee()).toBe(true);
    expect(
      boutonRepli().getAttribute('title'),
      `repliée d’office, le bouton propose « ${boutonRepli().getAttribute('title')} »`,
    ).toBe(tr('v2.nav.expand'));
    expect(boutonRepli().getAttribute('aria-label')).toBe(tr('v2.nav.expandAria'));

    boutonRepli().click();
    await laisserTourner(10);
    expect(repliee()).toBe(false);
    expect(boutonRepli().getAttribute('title')).toBe(tr('v2.nav.collapse'));
    expect(boutonRepli().getAttribute('aria-label')).toBe(tr('v2.nav.collapseAria'));
  });

  it('🔴 le choix de déplier SURVIT au remontage (il est enregistré)', async () => {
    largeur(900);
    await monterBarre();
    boutonRepli().click();
    await laisserTourner(10);
    expect(repliee()).toBe(false);

    demonter();
    await monterBarre();
    expect(repliee(), 'le dépliage demandé au palier étroit est oublié au rechargement').toBe(false);
  });

  it('TÉMOIN — sans choix, le palier étroit reste maître ; le palier large aussi', async () => {
    // La préférence a trois états : repliée, dépliée, PAS DE CHOIX. Sans
    // choix, chaque palier garde son défaut — c'est ce qui permet de rendre le
    // bouton opérant sans supprimer le palier.
    largeur(900);
    await monterBarre();
    expect(repliee(), 'défaut du palier étroit : icônes').toBe(true);
    demonter();

    largeur(1400);
    await monterBarre();
    expect(repliee(), 'défaut du palier large : libellés').toBe(false);
  });

  it('🔴 replier au palier LARGE marche toujours (#non-régression)', async () => {
    largeur(1400);
    await monterBarre();
    expect(repliee()).toBe(false);
    boutonRepli().click();
    await laisserTourner(10);
    expect(repliee(), 'le repli manuel au palier large ne marche plus').toBe(true);
    const muettes = entreesAnonymes();
    expect(muettes, `entrées repliées sans nom : [${muettes.join(' | ')}]`).toEqual([]);
  });
});

describe('#1151 — UNE seule décision, lue partout', () => {
  /**
   * La garde du ticket, mot pour mot : « le rendu se décide sur `enIcones`,
   * les infobulles sur `collapsed` ». Ces deux-là doivent être la MÊME
   * expression, sinon le défaut revient au prochain `title=` ajouté.
   */
  it('🔴 la classe de repli et toutes les infobulles lisent la même variable', () => {
    const src = source();
    const pilote = /class:collapsed=\{(\w+)\}/.exec(src)?.[1];
    expect(pilote, 'la classe `.collapsed` n’est plus posée par une variable nommée').toBeTruthy();

    const conditionnelles = [...src.matchAll(/title=\{(\w+) \? /g)].map((m) => m[1]);
    expect(conditionnelles.length, 'plus aucune infobulle conditionnelle dans la barre')
      .toBeGreaterThan(5);
    const divergentes = [...new Set(conditionnelles)].filter((v) => v !== pilote);
    expect(
      divergentes,
      `la barre se rend sur « ${pilote} » et s’explique sur [${divergentes.join(', ')}]`,
    ).toEqual([]);
  });

  it('🔴 la pastille de mise à jour se décide sur la même variable', () => {
    // Repliée, `.txt` est en `display:none` : sans cette pastille l'annonce de
    // mise à jour disparaît entièrement. Elle était, elle aussi, calculée sur
    // la préférence brute — donc absente au palier étroit.
    const src = source();
    const pilote = /class:collapsed=\{(\w+)\}/.exec(src)?.[1];
    const garde = /\{#if (\w+) && \$updateAvailable\}/.exec(src)?.[1];
    expect(garde, 'la pastille de mise à jour n’a plus de garde reconnaissable').toBeTruthy();
    expect(garde, `la pastille se décide sur « ${garde} », la barre se rend sur « ${pilote} »`)
      .toBe(pilote);
  });

  it('la règle CSS de #1168 est intacte, et toujours pendue à cette classe', () => {
    // 🔴 Cette garde lit la SOURCE : le CSS scopé n'est pas injecté sous jsdom,
    // elle ne prouve pas que la règle s'applique, seulement qu'elle est
    // déclarée et qu'elle reste accrochée à `.v2-sidebar.collapsed`.
    const src = source();
    expect(/\.nav\.svc\{padding-left:30px/.test(src), 'le retrait des services de #1168 a sauté')
      .toBe(true);
    expect(
      /\.v2-sidebar\.collapsed \.nav\.svc\{padding-left:0\}/.test(src),
      'la règle repliée de #1168 a sauté : les icônes de service sortiraient de leur colonne',
    ).toBe(true);
    expect(
      /\.v2-sidebar\.collapsed \.nav span,/.test(src),
      'la règle qui masque les libellés en icônes a sauté',
    ).toBe(true);
  });

  it('le palier étroit est toujours ce qui commande le repli par défaut', () => {
    expect(/\$formatEcran === 'etroit'/.test(source()), 'le palier étroit a disparu de la barre')
      .toBe(true);
  });
});
