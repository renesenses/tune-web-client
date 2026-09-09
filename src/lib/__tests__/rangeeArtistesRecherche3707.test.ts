// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3707 — FabienM, fil forum 1727 (08/09/2026),
// v0.9.143 :
//
//   « Le problème est le bloc artistes qui est mal alignés, on ne peut pas
//     voir tous les résultats. »
//
// Sa capture montre la pastille « Artistes 22 », une rangée dont la 6e
// vignette est tranchée par le bord de la fenêtre, et un bouton
// « Voir plus (10) ». Le mot « mal alignés » désigne le symptôme : c'était un
// DÉBORDEMENT HORIZONTAL SANS AFFORDANCE. `.arow` posait
// `overflow-x:auto; scrollbar-width:none` plus
// `.arow::-webkit-scrollbar{display:none}` — le contenu était dans le DOM,
// hors champ, et le seul indice de son existence était effacé.
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 CE QU'UN TEST PEUT GARDER ICI, ET CE QU'IL NE PEUT PAS
//
// Il ne peut PAS garder la mise en page. Mesuré le 09/09/2026 : le CSS scopé
// d'un composant Svelte n'est pas injecté sous vitest+jsdom —
// `document.styleSheets.length` vaut 0 et `getComputedStyle(.arow).display`
// rend `block` alors que la règle dit `flex`. Aucune assertion de style
// calculé, de largeur, de `scrollWidth` ou de vignette « visible » n'aurait
// le moindre sens ici : jsdom ne fait aucune mise en page.
//
// Il PEUT garder deux choses, et ce fichier ne prétend pas à davantage :
//   1. le NOMBRE de vignettes réellement posées — au montage, puis après
//      « Voir plus ». C'est un témoin qui monte et qui clique ; il garde le
//      comportement du révélateur, PAS le correctif de mise en page (il était
//      déjà vert avant lui, et c'est dit ici plutôt que sous-entendu).
//   2. que la rangée ne masque plus sa barre de défilement et se REPLIE. Cet
//      unique point est gardé sur le TEXTE de la feuille de style, faute de
//      pouvoir l'exécuter. C'est une garde faible — elle lit ce que le code
//      déclare — et c'est la seule disponible pour un défaut de disposition.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { setSearchCriteria } from '../stores/shortcuts';

vi.setConfig({ testTimeout: 30_000 });

/** Le compte de sa capture : la pastille disait « Artistes 22 ». */
const TOTAL_ARTISTES = 22;
/** `PAS_ARTISTES`, le pas du révélateur, et le nombre posé au montage. */
const PAS = 12;

const artiste = (i: number) => ({ id: 10_000 + i, name: `Artiste ${i}`, image_path: null });

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

const RESULTAT = {
  artists: Array.from({ length: TOTAL_ARTISTES }, (_, i) => artiste(i + 1)),
  albums: [],
  tracks: [],
  playlists: [],
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/search/.test(u)) return reponse(RESULTAT);
      if (/\/search\?/.test(u)) return reponse({ local: RESULTAT, services: {}, radios: [] });
      if (/\/playlists/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

/** `SearchV2` reprend la requête d'un raccourci au montage : on la pose. */
async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: 'souchon' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  flushSync();
  // L'anti-rebond de la recherche vaut 240 ms ; on le laisse passer.
  await new Promise((r) => setTimeout(r, 320));
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  return hote;
}

const vignettes = (el: HTMLElement) => el.querySelectorAll('.arow .artile').length;
const voirPlus = (el: HTMLElement) =>
  (el.querySelector('.basartistes .voirplus') as HTMLButtonElement | null);

describe('#3707 — combien de vignettes d’artiste sont POSÉES', () => {
  it('douze au montage, et le révélateur annonce les dix qui restent', async () => {
    const el = await chercher();
    expect(
      vignettes(el),
      `la rangée devrait poser ${PAS} vignettes sur ${TOTAL_ARTISTES} artistes`,
    ).toBe(PAS);
    const bouton = voirPlus(el);
    expect(bouton, 'aucun « voir plus » : les dix artistes restants seraient invisibles').not.toBeNull();
    expect(bouton!.textContent, 'le bouton n’annonce pas COMBIEN il reste').toContain('10');
  });

  it('« Voir plus » pose les vingt-deux, et aucune n’est jetée', async () => {
    const el = await chercher();
    voirPlus(el)!.click();
    flushSync();
    expect(
      vignettes(el),
      'après « voir plus », les 22 artistes rendus par le serveur doivent être dans le DOM',
    ).toBe(TOTAL_ARTISTES);
    expect(voirPlus(el), 'il ne reste rien à révéler : le bouton doit disparaître').toBeNull();
  });
});

describe('#3707 — la rangée ne cache plus ce qu’elle ne montre pas', () => {
  // ⚠️ GARDE TEXTUELLE, et volontairement la seule de ce fichier : jsdom
  // n'applique pas le CSS scopé (mesuré : 0 feuille de style, `display: block`
  // là où la règle dit `flex`). Elle lit ce que le composant DÉCLARE.
  const style = (() => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SearchV2.svelte'), 'utf8');
    const i = src.indexOf('<style>');
    // Les commentaires CSS portent l'ANCIENNE règle en citation : les lire
    // ferait passer cette garde pour rien.
    return src.slice(i).replace(/\/\*[\s\S]*?\*\//g, '');
  })();
  const regleArow = /(^|\n)\s*\.arow\s*\{([^}]*)\}/.exec(style)?.[2] ?? '';

  it('la rangée des artistes se REPLIE', () => {
    expect(regleArow, '`.arow` a disparu de la feuille de style').not.toBe('');
    expect(
      /flex-wrap\s*:\s*wrap/.test(regleArow),
      'la rangée ne se replie plus : douze vignettes de 112 px fuient hors de la colonne, ' +
        'et rien ne garantit qu’une souris sans molette horizontale puisse les atteindre',
    ).toBe(true);
  });

  it('et elle n’efface plus sa barre de défilement', () => {
    expect(
      /scrollbar-width\s*:\s*none/.test(regleArow),
      '`scrollbar-width: none` est de retour : le débordement redevient muet',
    ).toBe(false);
    expect(
      /\.arow::-webkit-scrollbar\s*\{[^}]*display\s*:\s*none/.test(style),
      '`.arow::-webkit-scrollbar{display:none}` est de retour : sous Chrome et Edge — ' +
        'le navigateur de FabienM — le débordement redevient muet',
    ).toBe(false);
  });
});
