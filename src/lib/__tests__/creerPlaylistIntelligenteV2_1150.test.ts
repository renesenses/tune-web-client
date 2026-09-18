// @vitest-environment jsdom
//
// #1150 — CRÉER, MODIFIER ET SUPPRIMER UNE PLAYLIST INTELLIGENTE DANS LA V2.
//
// FabienM, forum fil 1778, point 8 (v0.9.148, 13/09/2026) :
//
//   « Comment créer une playlist intelligente pour obtenir des titres avec
//     des critères ? Les collections ne ramènent que des albums »
//
// Sa lecture était exacte. `createSmartPlaylist`, `updateSmartPlaylist` et
// `deleteSmartPlaylist` existaient dans `lib/api.ts` et n'avaient d'appelant
// que dans `v2-heritage/SmartPlaylistsView.svelte` — l'ÉCRAN DE L'ANCIENNE
// INTERFACE. L'onglet « Intelligentes » du nouveau client listait et jouait ;
// son seul bouton quittait l'écran pour l'ancien.
//
// ## CE QUE CE TÉMOIN REFUSE DE FAIRE
//
// Il ne cherche pas `api.createSmartPlaylist(` dans le source. Une garde de
// texte est satisfaite par un appel posé n'importe où, y compris dans une
// branche que personne n'atteint — et c'est précisément le défaut du ticket :
// la fonction EXISTAIT, elle n'était pas branchée.
//
// On monte donc le VRAI écran, on clique l'onglet, on ouvre l'éditeur, on
// REMPLIT le formulaire (un nom, un champ, un opérateur, une valeur), on
// soumet, et on regarde ce qui est parti sur le réseau : la méthode, la route,
// et les RÈGLES du corps.
//
// ## LES DEUX ESPACES D'IDENTIFIANTS
//
// Une playlist classique et une playlist intelligente peuvent porter le MÊME
// nombre : ce sont deux tables. Le décor en pose donc deux, toutes deux `7`,
// et la suppression doit frapper `/library/smart-playlists/7`, jamais
// `/playlists/7`. Sans ce piège, un appel au mauvais espace passerait au vert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { dialogs } from '../stores/dialogs';

/**
 * Monter cet écran compile un composant de plus de huit cents lignes, et
 * l'éditeur en compile un second, à la demande. Sur une machine chargée — la
 * porte web tourne les 458 fichiers en parallèle — la première compilation
 * prend plusieurs secondes.
 */
vi.setConfig({ testTimeout: 60_000 });

interface Appel {
  methode: string;
  url: string;
  corps: any;
}

/** La playlist intelligente du décor — même identifiant qu'une classique. */
const SP = {
  id: 7,
  name: 'Depeche',
  description: null,
  rules: JSON.stringify([{ field: 'artist', op: 'contains', value: 'depeche' }]),
  match_mode: 'all',
  sort_by: 'title',
  sort_order: 'asc',
  max_tracks: 200,
};

let appels: Appel[] = [];

function corpsPour(url: string, methode: string): unknown {
  if (/\/library\/smart-playlists\/7\/tracks/.test(url)) return [];
  if (/\/library\/smart-playlists\/7(\?|$)/.test(url)) {
    return methode === 'DELETE' ? { deleted: 1 } : SP;
  }
  if (/\/library\/smart-playlists(\?|$)/.test(url)) {
    return methode === 'POST' ? { id: 12 } : [SP];
  }
  // La classique qui porte le MÊME identifiant que l'intelligente.
  if (/\/playlists\?/.test(url)) return [{ id: 7, name: 'Classique', track_count: 2 }];
  if (/\/streaming\/services/.test(url)) return {};
  return [];
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opts?: RequestInit) => {
      const methode = (opts?.method ?? 'GET').toUpperCase();
      let corps: any = undefined;
      try {
        corps = opts?.body ? JSON.parse(String(opts.body)) : undefined;
      } catch {
        corps = String(opts?.body);
      }
      appels.push({ methode, url: String(url), corps });
      const reponse = corpsPour(String(url), methode);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => reponse,
        text: async () => JSON.stringify(reponse),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/** Monte l'écran Playlists et se place sur l'onglet « Intelligentes ». */
async function ouvrirOngletIntelligentes(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistsV2, { target: hote, props: {} as any });
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();

  const onglets = [...hote.querySelectorAll<HTMLButtonElement>('nav.onglets button.onglet')];
  const smart = onglets.find((b) => b.getAttribute('role') === 'tab' && b.textContent?.trim() !== 'Playlists');
  expect(smart, 'l’onglet « Intelligentes » a disparu').toBeTruthy();
  smart!.click();
  flushSync();
  await attendre();
  flushSync();
  return hote;
}

/** L'éditeur de règles du nouveau client, s'il est à l'écran. */
const editeur = (el: HTMLElement) => el.querySelector<HTMLElement>('.v2-spl');

/** Les appels réseau qui ont écrit quelque chose. */
const ecritures = () => appels.filter((a) => a.methode !== 'GET');

/**
 * Attend que l'éditeur soit à l'écran, ou renonce.
 *
 * Il est chargé à la demande (`{#await import(...)}`) : le premier cas du
 * fichier paie la compilation du composant, les suivants la trouvent en
 * cache. Un délai fixe serait donc vert ou rouge selon l'ordre des cas.
 */
async function attendreEditeur(el: HTMLElement, plafond = 400): Promise<HTMLElement | null> {
  for (let i = 0; i < plafond; i++) {
    flushSync();
    const ed = editeur(el);
    if (ed) return ed;
    await attendre(50);
  }
  return editeur(el);
}

/** Ouvre l'éditeur par le bouton de création de l'onglet. */
async function ouvrirCreation(el: HTMLElement) {
  const boutons = [...el.querySelectorAll<HTMLButtonElement>('.grp.creer button')];
  expect(boutons.length, 'aucun bouton de création dans l’onglet « Intelligentes »').toBeGreaterThan(0);
  boutons[0].click();
  flushSync();
  await attendreEditeur(el);
}

/** Remplit le formulaire : un nom, puis une règle champ/opérateur/valeur. */
async function remplir(ed: HTMLElement, nom: string, champ: string, op: string, valeur: string) {
  const nomInput = ed.querySelector<HTMLInputElement>('input.txt');
  expect(nomInput, 'le formulaire n’a pas de champ « Nom »').not.toBeNull();
  nomInput!.value = nom;
  nomInput!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  const ligne = ed.querySelector<HTMLElement>('.regle');
  expect(ligne, 'le formulaire n’a aucune ligne de règle').not.toBeNull();
  const selects = [...ligne!.querySelectorAll<HTMLSelectElement>('select')];
  expect(selects.length, 'une règle sans champ ni opérateur').toBeGreaterThanOrEqual(2);

  selects[0].value = champ;
  selects[0].dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const selects2 = [...ed.querySelector<HTMLElement>('.regle')!.querySelectorAll<HTMLSelectElement>('select')];
  selects2[1].value = op;
  selects2[1].dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const champValeur = ed.querySelector<HTMLElement>('.regle')!.querySelector<HTMLInputElement>('input');
  expect(champValeur, 'la règle n’a pas de champ de valeur').not.toBeNull();
  champValeur!.value = valeur;
  champValeur!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await attendre();
  flushSync();
}

/** Le bouton d'enregistrement du pied de l'éditeur. */
function enregistrer(ed: HTMLElement): HTMLButtonElement {
  const b = ed.querySelector<HTMLButtonElement>('.pied button.play');
  expect(b, 'l’éditeur n’a pas de bouton d’enregistrement').not.toBeNull();
  return b!;
}

describe('#1150 — le décor est bien celui du signalement', () => {
  it('l’onglet « Intelligentes » liste la playlist du serveur', async () => {
    const el = await ouvrirOngletIntelligentes();
    expect(
      el.textContent,
      'la playlist intelligente du décor n’est pas affichée : le témoin ne mesure rien',
    ).toContain('Depeche');
    expect(editeur(el), 'l’éditeur est déjà ouvert : le témoin ne prouverait rien').toBeNull();
  });
});

describe('#1150 — CRÉER depuis le nouveau client', () => {
  it('🔴 remplir et soumettre le formulaire APPELLE la route de création, avec les règles', async () => {
    const el = await ouvrirOngletIntelligentes();
    await ouvrirCreation(el);

    const ed = editeur(el);
    expect(ed, 'le bouton de création n’ouvre aucun éditeur DANS l’écran v2').not.toBeNull();

    await remplir(ed!, 'Depeche 80s', 'artist', 'contains', 'depeche');
    enregistrer(ed!).click();
    flushSync();
    await attendre(60);
    flushSync();

    const creation = ecritures().find(
      (a) => a.methode === 'POST' && /\/library\/smart-playlists$/.test(a.url),
    );
    expect(
      creation,
      'aucun POST vers /library/smart-playlists : le formulaire ne crée rien',
    ).toBeTruthy();
    expect(creation!.corps.name).toBe('Depeche 80s');
    expect(
      creation!.corps.rules,
      'les règles saisies ne partent pas avec la création',
    ).toEqual([{ field: 'artist', op: 'contains', value: 'depeche' }]);
    expect(creation!.corps.match_mode).toBe('all');
    expect(creation!.corps.sort_by).toBe('title');
    expect(creation!.corps.sort_order).toBe('asc');
    expect(creation!.corps.max_tracks).toBe(200);
  });

  it('🔴 un nom vide n’envoie RIEN — la validation de l’ancien écran est reprise', async () => {
    const el = await ouvrirOngletIntelligentes();
    await ouvrirCreation(el);
    const ed = editeur(el)!;

    // Une règle complète, mais pas de nom.
    await remplir(ed, '', 'artist', 'contains', 'depeche');
    const b = enregistrer(ed);
    expect(b.disabled, 'le bouton d’enregistrement est actif sans nom').toBe(true);
    b.click();
    flushSync();
    await attendre();
    expect(
      ecritures(),
      'une playlist sans nom a été envoyée au serveur',
    ).toHaveLength(0);
  });

  it('🔴 la liste est RELUE après la création — l’écran ne diverge pas du serveur', async () => {
    const el = await ouvrirOngletIntelligentes();
    await ouvrirCreation(el);
    const ed = editeur(el)!;
    await remplir(ed, 'Depeche 80s', 'artist', 'contains', 'depeche');

    const avant = appels.filter((a) => a.methode === 'GET' && /\/library\/smart-playlists$/.test(a.url)).length;
    enregistrer(ed).click();
    flushSync();
    await attendre(80);
    flushSync();

    const apres = appels.filter((a) => a.methode === 'GET' && /\/library\/smart-playlists$/.test(a.url)).length;
    expect(apres, 'la liste n’est pas relue : la nouvelle playlist n’apparaît pas').toBeGreaterThan(avant);
    expect(editeur(el), 'l’éditeur reste ouvert après l’enregistrement').toBeNull();
  });
});

describe('#1150 — MODIFIER depuis le nouveau client', () => {
  it('🔴 le crayon de la vignette ouvre l’éditeur SUR la règle, et enregistre en PUT', async () => {
    const el = await ouvrirOngletIntelligentes();

    const crayon = el.querySelector<HTMLButtonElement>('.grid .card button.coin.tr');
    expect(crayon, 'aucun bouton d’édition sur la vignette d’une playlist intelligente').not.toBeNull();
    crayon!.click();
    flushSync();
    await attendreEditeur(el);
    await attendre(40);
    flushSync();

    const ed = editeur(el);
    expect(ed, 'le crayon n’ouvre aucun éditeur').not.toBeNull();
    const nomInput = ed!.querySelector<HTMLInputElement>('input.txt');
    expect(
      nomInput!.value,
      'l’éditeur s’ouvre VIDE : il ne modifie pas, il écraserait',
    ).toBe('Depeche');

    nomInput!.value = 'Depeche 90s';
    nomInput!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    enregistrer(ed!).click();
    flushSync();
    await attendre(60);
    flushSync();

    const maj = ecritures().find((a) => a.methode === 'PUT');
    expect(maj, 'aucun PUT : le crayon ne modifie rien').toBeTruthy();
    expect(
      maj!.url,
      'la modification vise le mauvais espace d’identifiants',
    ).toMatch(/\/library\/smart-playlists\/7$/);
    expect(maj!.corps.name).toBe('Depeche 90s');
    expect(
      maj!.corps.rules,
      'la règle d’origine est perdue en enregistrant',
    ).toEqual([{ field: 'artist', op: 'contains', value: 'depeche' }]);
  });
});

describe('#1150 — SUPPRIMER depuis le nouveau client', () => {
  /** Ouvre le menu de la vignette et clique l'entrée en `danger`. */
  async function demanderSuppression(el: HTMLElement) {
    const menu = el.querySelector<HTMLButtonElement>('.grid .card .menu-actions button.coin.bl');
    expect(menu, 'la vignette n’a pas de menu d’actions').not.toBeNull();
    menu!.click();
    flushSync();
    await attendre();
    flushSync();
    const entrees = [...el.querySelectorAll<HTMLButtonElement>('.grid .card .menu button[role="menuitem"]')];
    const supprimer = entrees.find((b) => b.classList.contains('danger'));
    expect(
      supprimer,
      'aucune entrée « Supprimer » dans le menu d’une playlist intelligente',
    ).toBeTruthy();
    supprimer!.click();
    flushSync();
    await attendre();
    flushSync();
  }

  it('🔴 elle passe par le dialogue MAISON, jamais par window.confirm', async () => {
    const natif = vi.fn(() => true);
    vi.stubGlobal('confirm', natif);
    const el = await ouvrirOngletIntelligentes();
    await demanderSuppression(el);

    expect(natif, 'la suppression ouvre une boîte native — invisible en webview (#166)').not.toHaveBeenCalled();
    const attente = get(dialogs);
    expect(attente.length, 'aucune demande de confirmation en attente').toBe(1);
    expect(attente[0].kind).toBe('confirm');
    expect(attente[0].danger, 'la confirmation n’est pas en mode danger').toBe(true);
    dialogs.settle(attente[0].id, false);
    await attendre();
  });

  it('🔴 ANNULER ne supprime rien', async () => {
    const el = await ouvrirOngletIntelligentes();
    await demanderSuppression(el);

    const attente = get(dialogs);
    expect(attente.length, 'aucune demande de confirmation en attente').toBe(1);
    dialogs.settle(attente[0].id, false);
    await attendre(60);
    flushSync();

    expect(
      appels.filter((a) => a.methode === 'DELETE'),
      'la playlist est supprimée alors que l’utilisateur a annulé',
    ).toHaveLength(0);
  });

  it('🔴 CONFIRMER supprime la playlist INTELLIGENTE, pas la classique de même identifiant', async () => {
    const el = await ouvrirOngletIntelligentes();
    await demanderSuppression(el);

    const attente = get(dialogs);
    expect(attente.length, 'aucune demande de confirmation en attente').toBe(1);
    dialogs.settle(attente[0].id, true);
    await attendre(80);
    flushSync();

    const supprimes = appels.filter((a) => a.methode === 'DELETE');
    expect(supprimes, 'rien n’est supprimé après confirmation').toHaveLength(1);
    expect(
      supprimes[0].url,
      'la suppression frappe l’espace des playlists CLASSIQUES : ' +
        'les deux tables portent l’identifiant 7',
    ).toMatch(/\/library\/smart-playlists\/7$/);

    const relecture = appels.filter((a) => a.methode === 'GET' && /\/library\/smart-playlists$/.test(a.url));
    expect(relecture.length, 'la liste n’est pas relue après la suppression').toBeGreaterThan(1);
  });
});

describe('#1150 — une seule porte', () => {
  it('l’onglet ne QUITTE plus l’écran pour l’éditeur de l’ancienne interface', async () => {
    // #1011 avait posé un bouton qui basculait la vue sur `smartplaylists`.
    // Le garder EN PLUS de l'éditeur v2 ferait deux portes vers la même
    // fonction — exactement le doublon que #1127 vient de retirer ailleurs.
    const { activeView } = await import('../stores/navigation');
    const el = await ouvrirOngletIntelligentes();
    activeView.set('playlists');
    await ouvrirCreation(el);
    expect(
      get(activeView),
      'le bouton de création quitte encore l’écran pour l’ancienne interface',
    ).toBe('playlists');
    expect(editeur(el), 'aucun éditeur v2 n’a pris sa place').not.toBeNull();
  });
});
