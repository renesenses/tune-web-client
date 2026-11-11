// @vitest-environment jsdom
//
// COMPOSER UN COFFRET À LA MAIN — Bertrand, 20/09/2026, capture à l'appui.
//
// > « Par exemple je voudrais créer un coffret pour 101 de Depeche Mode »
// > (écran Métadonnées ▸ Compilations, recherche « 101 » : deux lignes,
// > *101 - Disc A* 9 pistes et *101 - Disc B* 11 pistes)
// > « Et je veux l'interface pour le faire (proche de compilations). »
//
// Les deux chemins existants ne pouvaient pas le faire, et ce n'est pas une
// supposition :
//
//   - l'onglet **Compilations** réunit en UN SEUL disque (`mergeAlbums`) — ce
//     qu'il faut pour une compilation, et l'inverse de ce qu'il faut ici ;
//   - la **détection automatique** (onglet Doublons) ne lit que des marqueurs
//     CHIFFRÉS et ne groupe que des dossiers FRÈRES : « Disc A » lui est
//     invisible.
//
// 🔴 CE TÉMOIN MONTE L'ÉCRAN, COCHE ET CLIQUE. Une garde qui lirait la source
// resterait verte si le bouton n'était pas branché — « écrit mais pas
// branché », le motif que ce client passe son temps à corriger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
// 🔴 STATIQUE, en tête de fichier — #1333. Un `await import()` DANS le cas
// fait compiler le composant sur le chronomètre du cas, et pollue le suivant.
import MetadataV2 from '../../components/v2/MetadataV2.svelte';

const DELAI_MONTAGE = 60_000;

/** Les deux albums de la capture, tels que `/library/albums` les rend. */
const ALBUMS = [
  { album_id: 11, title: '101 - Disc A', album_artist: 'Depeche Mode', track_count: 9, cover_path: null, is_compilation: false },
  { album_id: 12, title: '101 - Disc B', album_artist: 'Depeche Mode', track_count: 11, cover_path: null, is_compilation: false },
  { album_id: 13, title: '101', album_artist: 'Keren Ann', track_count: 12, cover_path: null, is_compilation: false },
  // #8463 (fil 2763) — un album DÉJÀ à trois disques, puis un album d'un disque.
  { album_id: 21, title: 'Immersion Box Set', album_artist: 'Pink Floyd', track_count: 36, disc_count: 3, cover_path: null, is_compilation: false },
  { album_id: 22, title: 'Immersion Stereo', album_artist: 'Pink Floyd', track_count: 10, disc_count: 1, cover_path: null, is_compilation: false },
];

/** La route de COMPOSITION, pas son aperçu (#8464). */
const composition = (e: { url: string }) => /\/albums\/coffret$/.test(e.url);

let envois: { url: string; corps: any }[] = [];

function reponse(url: string, init?: RequestInit): Response {
  const u = String(url);
  if (init?.method === 'POST') {
    envois.push({ url: u, corps: init.body ? JSON.parse(String(init.body)) : null });
  }
  // ⚠️ `getAlbumsDetailed` pagine et lit `items` / `total` — un décor écrit
  // sur « albums » serait vert contre une forme que le client ne lit pas.
  const corps = u.includes('/library/albums/coffret/apercu')
    ? { titre: '101 (calculé)' }
    : u.includes('/library/albums/coffret') && init?.method === 'POST'
    ? { cible: 11, absorbes: 1, disques: 2, titre: '101' }
    : u.includes('/library/albums')
      ? { items: ALBUMS, total: ALBUMS.length }
      : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function ouvrirOngletCoffrets() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(MetadataV2 as any, { target: hote, props: {} as any });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('nav.tabs button')]
    .find((b) => /coffret/i.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
  expect(onglet, 'aucun onglet « Coffrets » dans la barre').toBeDefined();
  onglet!.click();
  flushSync();
  await attendre();
  return hote;
}

/**
 * La case d'une ligne, désignée par son TITRE.
 *
 * 🔴 Surtout pas par son rang : la liste est triée par titre, et « 101 » de
 * Keren Ann arrive AVANT « 101 - Disc A ». Un banc écrit sur les indices
 * passerait au vert en cochant les mauvais albums — c'est ce qu'il a fait à
 * la première écriture.
 */
function caseDe(el: HTMLElement, titre: string): HTMLInputElement {
  const ligne = [...el.querySelectorAll('label.cprow')]
    .find((l) => l.querySelector('.pt')?.textContent?.trim() === titre);
  expect(ligne, `aucune ligne « ${titre} »`).toBeDefined();
  return ligne!.querySelector('input[type=checkbox]') as HTMLInputElement;
}

/** Tape une recherche et laisse la liste se filtrer. */
async function chercher(el: HTMLElement, texte: string) {
  const champ = el.querySelector<HTMLInputElement>('input.cpq');
  expect(champ, 'pas de champ de recherche dans l’onglet').not.toBeNull();
  champ!.value = texte;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await attendre();
}

beforeEach(() => {
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => reponse(url, init)));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('l’onglet Coffrets compose le « 101 » de Depeche Mode', () => {
  it('🔴 les deux disques sont cochables, et le rang s’affiche', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrirOngletCoffrets();
    await chercher(el, '101');
    const lignes = el.querySelectorAll('label.cprow');
    expect(lignes.length, 'la recherche ne rend aucune ligne').toBe(3);
    caseDe(el, '101 - Disc A').click();
    flushSync();
    caseDe(el, '101 - Disc B').click();
    flushSync();
    // Le rang est VISIBLE : c'est le numéro de disque à venir.
    const rangs = [...el.querySelectorAll('.cfrang')].map((s) => s.textContent?.trim());
    expect(rangs.length, 'le rang des disques n’est pas montré').toBe(2);
    expect(rangs[0]).toMatch(/1/);
    expect(rangs[1]).toMatch(/2/);
  });

  it('🔴 le clic envoie les identifiants DANS L’ORDRE COCHÉ', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrirOngletCoffrets();
    await chercher(el, '101');
    // On coche B AVANT A : c'est l'ordre COCHÉ qui décide des disques, pas
    // l'ordre d'affichage.
    caseDe(el, '101 - Disc B').click(); flushSync();
    caseDe(el, '101 - Disc A').click(); flushSync();
    const bouton = [...el.querySelectorAll('button')]
      .find((b) => /coffret/i.test(b.textContent ?? '') && !b.closest('nav')) as HTMLButtonElement;
    expect(bouton, 'pas de bouton « Réunir en coffret »').toBeDefined();
    // Deux clics : le geste est armé avant d'être fait.
    bouton.click(); flushSync();
    expect(envois.filter(composition).length,
      'le premier clic a déjà écrit — le geste n’est pas armé').toBe(0);
    bouton.click(); flushSync();
    await attendre();
    const envoi = envois.find(composition);
    expect(envoi, 'aucun appel à la route de composition').toBeDefined();
    expect(envoi!.corps.album_ids).toEqual([12, 11]);
  });

  it('🔴 #8464 — le nom est prérempli par le serveur, et le nom saisi est envoyé', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrirOngletCoffrets();
    await chercher(el, '101');
    caseDe(el, '101 - Disc A').click(); flushSync();
    caseDe(el, '101 - Disc B').click(); flushSync();
    await attendre();
    const apercu = envois.filter((e) => e.url.endsWith('/albums/coffret/apercu')).at(-1);
    expect(apercu, 'l’aperçu du titre n’est pas demandé').toBeDefined();
    expect(apercu!.corps.album_ids).toEqual([11, 12]);
    const champ = el.querySelector<HTMLInputElement>('input.cpq[type=text]');
    expect(champ, 'pas de champ pour le nom du coffret').not.toBeNull();
    flushSync();
    expect(champ!.value, 'le champ n’est pas prérempli').toBe('101 (calculé)');

    champ!.value = 'Mon 101';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const bouton = [...el.querySelectorAll('button')]
      .find((b) => /coffret/i.test(b.textContent ?? '') && !b.closest('nav')) as HTMLButtonElement;
    bouton.click(); flushSync();
    bouton.click(); flushSync();
    await attendre();
    const envoi = envois.find(composition);
    expect(envoi, 'aucun appel à la route de composition').toBeDefined();
    expect(envoi!.corps).toEqual({ album_ids: [11, 12], titre: 'Mon 101' });
  });

  it('🔴 #8463 — un album de trois disques annonce les disques 1 à 3, le suivant le 4', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrirOngletCoffrets();
    await chercher(el, 'Immersion');
    caseDe(el, 'Immersion Box Set').click(); flushSync();
    caseDe(el, 'Immersion Stereo').click(); flushSync();
    const rangs = [...el.querySelectorAll('.cfrang')].map((s) => s.textContent?.trim() ?? '');
    expect(rangs.length).toBe(2);
    expect(rangs[0]).toMatch(/1.*3/);
    expect(rangs[1]).toMatch(/4/);
    expect(rangs[1]).not.toMatch(/2/);
  });

  it('un seul disque ne compose rien', { timeout: DELAI_MONTAGE }, async () => {
    const el = await ouvrirOngletCoffrets();
    await chercher(el, '101');
    caseDe(el, '101 - Disc A').click();
    flushSync();
    const bouton = [...el.querySelectorAll('button')]
      .find((b) => /coffret/i.test(b.textContent ?? '') && !b.closest('nav')) as HTMLButtonElement;
    expect(bouton.disabled, 'le bouton est actif avec un seul disque').toBe(true);
  });
});

describe('le contrat, et ce qui le distingue des voisins', () => {
  const api = readFileSync('src/lib/api.ts', 'utf8');
  const vue = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');

  it('l’appel poste une LISTE ordonnée sur la route de composition', () => {
    expect(api).toContain('export function composerCoffret(albumIds: number[], titre?: string)');
    expect(api).toContain('`${BASE}/library/albums/coffret`');
    expect(api).toContain('{ album_ids: albumIds }');
  });

  it('🔴 la sélection est une LISTE, pas un ensemble', () => {
    // Un `Set` perdrait l'ordre — et l'ordre EST le numéro de disque.
    expect(vue).toContain('let cfChoisis = $state<number[]>([]);');
    expect(vue).not.toContain('cfChoisis = new Set');
  });

  it('il ne réutilise PAS la fusion des compilations', () => {
    // `mergeAlbums` écrase les disques : c'est l'inverse du geste voulu.
    const i = vue.indexOf('async function composerCoffret');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).not.toContain('mergeAlbums');
    expect(bloc).toContain('api.composerCoffret(cfChoisis, cfTitre)');
  });

  it('les six clés existent dans les ONZE langues', () => {
    const cles = ['v2.meta.tabCoffret', 'v2.meta.boxIntro', 'v2.meta.boxCompose',
                  'v2.meta.boxOrder', 'v2.meta.boxDisc', 'v2.meta.boxDone',
                  'v2.meta.boxName', 'v2.meta.boxDiscRange'];
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const s = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of cles) expect(s, `${l} : ${c}`).toContain(`"${c}"`);
    }
  });
});
