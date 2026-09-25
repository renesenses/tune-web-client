// @vitest-environment jsdom
//
// LE MODE « MODIFIER » DE LA FICHE ALBUM — GO de Bertrand, 25/09/2026.
//
// Ces témoins MONTENT `AlbumDetailV2` et lisent ce qui part sur le réseau :
// `fetch` est remplacé, pas `api.ts`. Le serveur est codé en parallèle
// (lot `batch/edition-coffrets-20260925`) : les réponses simulées suivent le
// contrat du lot, mot pour mot.
//
//   GET  /library/albums/{id}/edition       → { album, discs, tracks }
//   PUT  /library/albums/{id}/edition       ← ce qui a changé ; 422 si `discs` incomplet
//   POST /library/albums/{id}/discs/attach  ← { album_id }
//   POST /library/albums/{id}/discs/{n}/detach
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { t } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { brouillonDepuis, corpsEdition, estReponseEdition, type EditionReponse } from '../editionAlbum';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 101;
const LOCAL = { id: ALBUM_ID, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959 } as Album;

/** Un coffret de deux disques, deux pistes chacun. */
function edition(): EditionReponse {
  return {
    album: {
      id: ALBUM_ID, title: 'Kind of Blue', album_artist: 'Miles Davis', year: 1959, label: null,
      genre: 'Jazz', release_type: 'album', cover_path: null, compilation_mode: 'auto',
      compilation_effective: true, coffret: 'auto', champs_edites: [],
    },
    discs: [
      { number: 1, title: null, cover_path: null, track_count: 2 },
      { number: 2, title: null, cover_path: null, track_count: 2 },
    ],
    tracks: [
      { id: 21, disc_number: 2, track_number: 1, title: 'Flamenco Sketches', artist_name: 'Miles Davis', duration_ms: 566000 },
      { id: 11, disc_number: 1, track_number: 1, title: 'So What', artist_name: 'Miles Davis', duration_ms: 562000 },
      { id: 12, disc_number: 1, track_number: 2, title: 'Freddie Freeloader', artist_name: 'Miles Davis', duration_ms: 586000 },
      { id: 22, disc_number: 2, track_number: 2, title: 'All Blues', artist_name: 'Miles Davis', duration_ms: 693000 },
    ],
  };
}

const reponse = (corps: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Err',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { methode: string; url: string; corps: any }[] = [];
/** `absente` : un serveur antérieur, qui répond 404 sur la route. */
let routeEdition: 'presente' | 'absente' = 'presente';
let refusPut: { status: number; corps: unknown } | null = null;

beforeEach(() => {
  appels = [];
  routeEdition = 'presente';
  refusPut = null;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    appels.push({ methode, url: u, corps });
    if (/\/library\/albums\/\d+\/edition/.test(u)) {
      if (routeEdition === 'absente') return reponse({ error: 'not found', path: u }, 404);
      if (methode === 'PUT' && refusPut) return reponse(refusPut.corps, refusPut.status);
      return reponse(edition());
    }
    if (/\/discs\/attach/.test(u) || /\/discs\/\d+\/detach/.test(u)) return reponse({ ok: true });
    if (/\/library\/search\?/.test(u)) {
      return reponse({ albums: [{ id: 202, title: 'Sketches of Spain', artist_name: 'Miles Davis' }, { id: ALBUM_ID, title: 'Kind of Blue' }], tracks: [], artists: [] });
    }
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse([]);
    if (/\/library\/albums\/\d+$/.test(u)) return reponse(LOCAL);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, ...props } as any });
  flushSync();
}

const q = <T extends Element = HTMLElement>(sel: string) => hote?.querySelector<T>(sel) ?? null;
const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(hote?.querySelectorAll<T>(sel) ?? []);
const boutonModifier = () => q<HTMLButtonElement>('[data-modifier-album]');
const ecritures = () => appels.filter((a) => a.methode !== 'GET');
const puts = () => appels.filter((a) => a.methode === 'PUT');

async function ouvrirEdition() {
  poser({ album: LOCAL });
  expect(await jusqua(() => !!boutonModifier()), 'pas de bouton « Modifier »').toBe(true);
  boutonModifier()!.click();
  expect(await jusqua(() => !!q('.edition'))).toBe(true);
}
function saisir(el: HTMLInputElement | null, valeur: string) {
  expect(el).not.toBeNull();
  el!.value = valeur;
  el!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
const champ = (nom: string) => q<HTMLInputElement>(`.ed-champs [name="${nom}"]`);
async function enregistrer() {
  const b = q<HTMLButtonElement>('[data-enregistrer]');
  expect(b?.disabled, 'Enregistrer est grisé : rien n’a changé').toBe(false);
  b!.click();
  await jusqua(() => puts().length > 0);
}
function touche(el: HTMLElement | null, key: string) {
  expect(el).not.toBeNull();
  el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  flushSync();
}

describe('le bouton « Modifier » n’apparaît que si le serveur sait éditer', () => {
  it('présent sur un album de la bibliothèque quand la route répond', async () => {
    poser({ album: LOCAL });
    expect(await jusqua(() => !!boutonModifier())).toBe(true);
    expect(appels.some((a) => a.methode === 'GET' && a.url.endsWith(`/library/albums/${ALBUM_ID}/edition`))).toBe(true);
  });

  it('🔴 absent sur un serveur sans la route (404)', async () => {
    routeEdition = 'absente';
    poser({ album: LOCAL });
    await jusqua(() => appels.some((a) => /\/edition$/.test(a.url)));
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(appels.some((a) => /\/edition$/.test(a.url)), 'la sonde n’est pas partie').toBe(true);
    expect(boutonModifier()).toBeNull();
  });

  it('🔴 absent sur un album de service, et aucune sonde', async () => {
    poser({ album: { id: null, title: 'Blue Train', source: 'qobuz', source_id: 'abc', artist_name: 'John Coltrane', cover_path: 'x', year: 1957 } as any, service: 'qobuz' });
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(boutonModifier()).toBeNull();
    expect(appels.some((a) => /\/edition/.test(a.url))).toBe(false);
  });

  it('absent sur l’album d’un dépôt distant', async () => {
    poser({ album: LOCAL, depot: { url: 'http://autre:8888', nom: 'Autre' } as any });
    for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
    expect(boutonModifier()).toBeNull();
    expect(appels.some((a) => /\/edition/.test(a.url))).toBe(false);
  });
});

describe('le mode Modifier — un seul PUT, exactement ce qui a changé', () => {
  it('champs de l’album ⇒ PUT exact', async () => {
    await ouvrirEdition();
    expect(q('[data-non-enregistre]')).toBeNull();
    saisir(champ('title'), 'Kind of Blue (Legacy)');
    saisir(champ('year'), '1997');
    saisir(champ('label'), 'Columbia');
    saisir(champ('genre'), '');
    expect(q('[data-non-enregistre]'), 'indicateur « non enregistré » absent').not.toBeNull();
    await enregistrer();
    expect(puts()).toHaveLength(1);
    expect(puts()[0].url).toMatch(new RegExp(`/library/albums/${ALBUM_ID}/edition$`));
    expect(puts()[0].corps).toEqual({ title: 'Kind of Blue (Legacy)', year: 1997, label: 'Columbia', genre: null });
  });

  it('après l’enregistrement, la fiche se recharge et quitte le mode', async () => {
    await ouvrirEdition();
    const pistesAvant = appels.filter((a) => /\/tracks/.test(a.url)).length;
    saisir(champ('title'), 'Autre titre');
    await enregistrer();
    expect(await jusqua(() => !q('.edition'))).toBe(true);
    expect(await jusqua(() => appels.filter((a) => /\/tracks/.test(a.url)).length > pistesAvant)).toBe(true);
    expect(await jusqua(() => !!boutonModifier())).toBe(true);
  });

  it('réordonner deux disques au clavier ⇒ `discs` dans le nouvel ordre', async () => {
    await ouvrirEdition();
    touche(q('.ed-poignee[data-disque-rang="0"]'), 'ArrowDown');
    expect(qa('.ed-disque').map((d) => d.dataset.disque)).toEqual(['2', '1']);
    await enregistrer();
    expect(puts()[0].corps).toEqual({
      discs: [
        { number: 2, title: null, track_ids: [21, 22] },
        { number: 1, title: null, track_ids: [11, 12] },
      ],
    });
  });

  it('réordonner deux disques en GLISSANT', async () => {
    await ouvrirEdition();
    q('.ed-poignee[data-disque-rang="1"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const cible = qa('.ed-disque')[0];
    cible.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    cible.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    flushSync();
    await enregistrer();
    expect(puts()[0].corps.discs.map((d: any) => d.number)).toEqual([2, 1]);
  });

  it('renommer un disque', async () => {
    await ouvrirEdition();
    const noms = qa<HTMLInputElement>('.ed-nom-disque input');
    expect(noms).toHaveLength(2);
    saisir(noms[1], 'Live at Newport');
    await enregistrer();
    expect(puts()[0].corps).toEqual({
      discs: [
        { number: 1, title: null, track_ids: [11, 12] },
        { number: 2, title: 'Live at Newport', track_ids: [21, 22] },
      ],
    });
  });

  it('déplacer une piste du disque 2 au disque 1 — menu clavier', async () => {
    await ouvrirEdition();
    const disque2 = qa('.ed-disque')[1];
    const menu = disque2.querySelector<HTMLSelectElement>('.ed-piste select.ed-vers')!;
    expect(menu).not.toBeNull();
    menu.value = '0';
    menu.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await enregistrer();
    expect(puts()[0].corps).toEqual({
      discs: [
        { number: 1, title: null, track_ids: [11, 12, 21] },
        { number: 2, title: null, track_ids: [22] },
      ],
    });
  });

  it('déplacer une piste du disque 2 au disque 1 — en glissant sur une piste', async () => {
    await ouvrirEdition();
    const p21 = q('.ed-piste[data-piste-id="21"] .ed-poignee')!;
    p21.dispatchEvent(new Event('dragstart', { bubbles: true }));
    const p12 = q('.ed-piste[data-piste-id="12"]')!;
    p12.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    p12.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    flushSync();
    await enregistrer();
    expect(puts()[0].corps.discs).toEqual([
      { number: 1, title: null, track_ids: [11, 21, 12] },
      { number: 2, title: null, track_ids: [22] },
    ]);
  });

  it('réordonner les pistes d’un disque au clavier ; titre et artiste d’une piste', async () => {
    await ouvrirEdition();
    touche(q('.ed-piste[data-piste-id="11"] .ed-poignee'), 'ArrowDown');
    saisir(q('.ed-piste[data-piste-id="22"] .ed-titre'), 'All Blues (take 2)');
    saisir(q('.ed-piste[data-piste-id="22"] .ed-artiste'), 'Miles Davis Sextet');
    await enregistrer();
    expect(puts()[0].corps).toEqual({
      discs: [
        { number: 1, title: null, track_ids: [12, 11] },
        { number: 2, title: null, track_ids: [21, 22] },
      ],
      tracks: [{ id: 22, title: 'All Blues (take 2)', artist_name: 'Miles Davis Sextet' }],
    });
  });

  it('compilation : Automatique dit l’effet de la règle ; Oui / Non partent, Auto revenu = rien', async () => {
    await ouvrirEdition();
    const effet = q('[data-effet-compilation]');
    expect(effet?.textContent?.trim()).toBe(get(t)('v2.edition.compNowYes' as any));
    const radio = (v: string) => q<HTMLInputElement>(`input[name="compilation_mode"][value="${v}"]`)!;
    radio('oui').click(); flushSync();
    expect(q('[data-effet-compilation]')).toBeNull();
    radio('auto').click(); flushSync();
    expect(q<HTMLButtonElement>('[data-enregistrer]')!.disabled, 'Auto revenu : rien à enregistrer').toBe(true);
    radio('non').click(); flushSync();
    await enregistrer();
    expect(puts()[0].corps).toEqual({ compilation_mode: 'non' });
  });

  it('compilation Oui', async () => {
    await ouvrirEdition();
    q<HTMLInputElement>('input[name="compilation_mode"][value="oui"]')!.click();
    flushSync();
    await enregistrer();
    expect(puts()[0].corps).toEqual({ compilation_mode: 'oui' });
  });

  it('🔴 422 : le motif du serveur s’affiche, lisible, et le mode reste ouvert', async () => {
    refusPut = { status: 422, corps: { code: 'invalid_discs', error: 'la piste 11 manque dans discs' } };
    await ouvrirEdition();
    saisir(champ('title'), 'X');
    await enregistrer();
    expect(await jusqua(() => !!q('[data-erreur-edition]'))).toBe(true);
    const texte = q('[data-erreur-edition]')!.textContent!;
    expect(texte).toContain(get(t)('v2.edition.errRefused' as any));
    expect(texte).toContain('la piste 11 manque dans discs');
    expect(q('.edition')).not.toBeNull();
  });

  it('🔴 Annuler ne fait AUCUN appel en écriture', async () => {
    await ouvrirEdition();
    saisir(champ('title'), 'Brouillon jeté');
    touche(q('.ed-poignee[data-disque-rang="0"]'), 'ArrowDown');
    q<HTMLButtonElement>('[data-annuler]')!.click();
    flushSync();
    for (let i = 0; i < 5; i++) { await respirer(); flushSync(); }
    expect(q('.edition')).toBeNull();
    expect(ecritures()).toEqual([]);
    // Rouvert : le brouillon est reparti de la réponse du serveur.
    boutonModifier()!.click();
    flushSync();
    expect(champ('title')!.value).toBe('Kind of Blue');
  });
});

describe('détacher et ajouter un disque', () => {
  it('détacher : confirmation, puis POST …/discs/2/detach et relecture', async () => {
    await ouvrirEdition();
    const lectures = appels.filter((a) => a.methode === 'GET' && /\/edition$/.test(a.url)).length;
    q<HTMLButtonElement>('[data-detacher="2"]')!.click();
    expect(await jusqua(() => get(dialogs).length === 1)).toBe(true);
    dialogs.settle(get(dialogs)[0].id, true);
    expect(await jusqua(() => ecritures().length === 1)).toBe(true);
    expect(ecritures()[0].methode).toBe('POST');
    expect(ecritures()[0].url).toMatch(new RegExp(`/library/albums/${ALBUM_ID}/discs/2/detach$`));
    expect(await jusqua(() => appels.filter((a) => a.methode === 'GET' && /\/edition$/.test(a.url)).length > lectures)).toBe(true);
  });

  it('détacher puis refuser la confirmation : rien ne part', async () => {
    await ouvrirEdition();
    q<HTMLButtonElement>('[data-detacher="2"]')!.click();
    expect(await jusqua(() => get(dialogs).length === 1)).toBe(true);
    dialogs.settle(get(dialogs)[0].id, false);
    for (let i = 0; i < 5; i++) { await respirer(); flushSync(); }
    expect(ecritures()).toEqual([]);
  });

  it('ajouter un disque : recherche, puis POST …/discs/attach { album_id }', async () => {
    await ouvrirEdition();
    q<HTMLButtonElement>('[data-ajouter-disque]')!.click();
    flushSync();
    saisir(q<HTMLInputElement>('.ed-recherche input'), 'Sketches');
    q<HTMLFormElement>('.ed-recherche')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(await jusqua(() => qa('[data-attacher]').length > 0)).toBe(true);
    // L'album lui-même n'est pas proposé.
    expect(qa('[data-attacher]').map((b) => b.dataset.attacher)).toEqual(['202']);
    q<HTMLButtonElement>('[data-attacher="202"]')!.click();
    expect(await jusqua(() => ecritures().length === 1)).toBe(true);
    expect(ecritures()[0].url).toMatch(new RegExp(`/library/albums/${ALBUM_ID}/discs/attach$`));
    expect(ecritures()[0].corps).toEqual({ album_id: 202 });
  });

  it('avec des modifications en suspens, détacher et ajouter attendent', async () => {
    await ouvrirEdition();
    saisir(champ('title'), 'En cours');
    expect(q<HTMLButtonElement>('[data-detacher="2"]')!.disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-ajouter-disque]')!.disabled).toBe(true);
  });
});

describe('lib/editionAlbum — les règles pures', () => {
  it('la sonde ne reconnaît que la forme du contrat', () => {
    expect(estReponseEdition(edition())).toBe(true);
    expect(estReponseEdition([])).toBe(false);
    expect(estReponseEdition({ id: 1, title: 'x' })).toBe(false);
    expect(estReponseEdition(null)).toBe(false);
  });

  it('brouillon intact ⇒ corps vide', () => {
    const r = edition();
    expect(corpsEdition(r, brouillonDepuis(r))).toEqual({});
  });

  it('un disque vidé n’est pas envoyé ; chaque piste une fois', () => {
    const r = edition();
    const b = brouillonDepuis(r);
    b.disques[0].pistes.push(...b.disques[1].pistes.splice(0));
    const c = corpsEdition(r, b);
    expect(c.discs).toEqual([{ number: 1, title: null, track_ids: [11, 12, 21, 22] }]);
  });
});
