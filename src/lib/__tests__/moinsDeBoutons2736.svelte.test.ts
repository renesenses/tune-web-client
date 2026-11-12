// @vitest-environment jsdom
//
// web#2736 — « moins de boutons » (Bertrand, 09/11/2026).
//
//   Vue album       [ ▶ Lecture | ▾ ]  [ ⤮ ]  [ ♡ ]  [ … ]
//                   … ▸ Ajouter à · ▸ Infos · ▸ Bibliothèque
//                   Pistes | Crédits | Bio | Présentation
//   Vue collection  [ ▶ Tout lire | ▾ ] [ Aléatoire ] [ Trier ▾ ] [ … ]
//                   liste : un seul « + Nouvelle » (Manuelle / Intelligente / IA)
//   Vue playlist    même principe que l'album.
//
// 🔴 « Aucune fonction ne disparaît. » Ces témoins MONTENT les fiches et
// OUVRENT les menus : chaque geste qui était un bouton d'en-tête doit être
// une entrée atteignable, avec son `data-*`, et absente quand elle ne
// s'applique pas. Le menu est celui des pistes (`MenuPisteV2`) : role=menu,
// ↑ / ↓, Échap, focus rendu au bouton.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import type { Album, Track } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import BoutonLectureV2 from '../../components/v2/BoutonLectureV2.svelte';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const ALBUM_ID = 12;
const LOCAL = { id: ALBUM_ID, title: 'Kind of Blue', artist_name: 'Miles Davis', year: 1959 } as Album;
const QOBUZ = { id: null, source: 'qobuz', source_id: '0886443853839', title: 'Kind of Blue', artist_name: 'Miles Davis' } as unknown as Album;
const PISTES = [
  { id: 11, album_id: ALBUM_ID, title: 'So What', artist_name: 'Miles Davis', track_number: 1, disc_number: 1, duration_ms: 562000, source: 'local', file_path: '/musique/Miles Davis/Kind of Blue/01 So What.flac' },
  { id: 12, album_id: ALBUM_ID, title: 'Freddie Freeloader', artist_name: 'Miles Davis', track_number: 2, disc_number: 1, duration_ms: 586000, source: 'local', file_path: '/musique/Miles Davis/Kind of Blue/02 Freddie Freeloader.flac' },
] as unknown as Track[];
const CREDITS = [
  { id: 1, track_id: 11, artist_id: 125, artist_name: 'Bill Evans', role: 'performer', instrument: 'piano', position: 0, track_title: 'So What', track_number: 1, disc_number: 1 },
];
const EDITION = {
  album: { id: ALBUM_ID, title: 'Kind of Blue', album_artist: 'Miles Davis', year: 1959, label: null, genre: 'Jazz',
    release_type: 'album', cover_path: null, compilation_mode: 'auto', compilation_effective: false, coffret: null, champs_edites: [] },
  discs: [{ number: 1, title: null, cover_path: null, track_count: 2 }],
  tracks: PISTES.map((p) => ({ id: p.id, disc_number: 1, track_number: p.track_number, title: p.title, artist_name: p.artist_name, duration_ms: p.duration_ms })),
};

const reponse = (corps: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}
const tr = (k: string) => get(t)(k as any);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: string[] = [];

beforeEach(() => {
  appels = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    appels.push(u);
    if (/\/library\/albums\/\d+\/edition/.test(u)) return reponse(EDITION);
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse(PISTES);
    if (/\/library\/albums\/\d+\/credits/.test(u)) return reponse(CREDITS);
    if (/\/library\/albums\/\d+\/bio/.test(u)) return reponse({ bio: 'Enregistré en 1959 au studio de la 30e Rue.', source: 'test' });
    if (/\/streaming\/qobuz\/albums\/[^/]+\/description/.test(u)) return reponse({ description: 'Le disque de jazz le plus vendu.' });
    if (/\/streaming\/qobuz\/albums\/[^/]+\/credits/.test(u)) return reponse(CREDITS);
    if (/\/streaming\/qobuz\/albums\/[^/]+(\/tracks)?(\?|$)/.test(u)) return reponse({ tracks: [] });
    return reponse([]);
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function poser(composant: any, props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: { onClose: () => {}, ...props } as any });
  flushSync();
}
/** Le menu est PORTÉ à la racine du document. */
const menu = () => document.body.querySelector<HTMLElement>('[role="menu"]');
const entrees = () => Array.from(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]') ?? []);
const touche = (cible: EventTarget, key: string) =>
  cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('le bouton Lecture scindé (BoutonLectureV2)', () => {
  it('la partie principale lit ; la flèche, nommée, déroule « Lire ensuite » et « Ajouter à la file d’attente »', async () => {
    const lire = vi.fn(), ensuite = vi.fn(), file = vi.fn();
    poser(BoutonLectureV2, { onLire: lire, cle: 'v2.album.play', ensuite: { faire: ensuite }, file: { faire: file } });
    hote!.querySelector<HTMLButtonElement>('[data-lecture-principale]')!.click();
    expect(lire).toHaveBeenCalledTimes(1);
    expect(menu(), 'la partie principale ne doit pas ouvrir de menu').toBeNull();

    const fleche = hote!.querySelector<HTMLButtonElement>('[data-lecture-options]')!;
    expect(fleche.getAttribute('aria-haspopup')).toBe('menu');
    expect(fleche.getAttribute('aria-label')).toBe(tr('v2.menu.playOptions'));
    expect(fleche.getAttribute('aria-expanded')).toBe('false');

    fleche.focus();
    fleche.click();
    flushSync();
    expect(fleche.getAttribute('aria-expanded')).toBe('true');
    const [e1, e2] = entrees();
    expect(entrees()).toHaveLength(2);
    expect(e1.hasAttribute('data-lire-ensuite')).toBe(true);
    expect(e1.textContent?.trim()).toBe(tr('v2.album.playNext'));
    expect(e2.hasAttribute('data-ajouter-file')).toBe(true);
    expect(e2.textContent?.trim()).toBe(tr('v2.menu.addToQueue'));

    // Clavier : le focus entre sur la première entrée, ↓ passe à la suivante,
    // ↓ reboucle, Échap referme ET rend le focus à la flèche.
    expect(document.activeElement).toBe(e1);
    touche(menu()!, 'ArrowDown');
    expect(document.activeElement).toBe(e2);
    touche(menu()!, 'ArrowDown');
    expect(document.activeElement).toBe(e1);
    touche(window, 'Escape');
    flushSync();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(fleche);

    // ↓ sur la flèche ouvre aussi ; choisir une entrée lance SON geste.
    touche(fleche, 'ArrowDown');
    flushSync();
    entrees()[1].click();
    flushSync();
    expect(file).toHaveBeenCalledTimes(1);
    expect(ensuite).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(fleche);
  });

  it('sans rien à mettre en file, pas de flèche', () => {
    poser(BoutonLectureV2, { onLire: () => {}, cle: 'v2.album.play' });
    expect(hote!.querySelector('[data-lecture-options]')).toBeNull();
  });
});

describe('la fiche album : trois boutons et un menu', () => {
  async function ouvrirMenuAlbum() {
    const b = hote!.querySelector<HTMLButtonElement>('[data-menu-album]')!;
    b.click();
    flushSync();
    return b;
  }

  it('l’en-tête ne garde que Lecture (et sa flèche), Aléatoire, Favori et « … »', async () => {
    poser(AlbumDetailV2, { album: LOCAL });
    await jusqua(() => hote!.querySelectorAll('.tracks [data-track-id], .tracks .row, .tracks tr').length > 0, 1500);
    const boutons = Array.from(hote!.querySelectorAll<HTMLButtonElement>('.actions:not(.local) > button, .actions:not(.local) > .bl > button'));
    expect(boutons.map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      tr('v2.album.play'), tr('v2.menu.playOptions'), tr('v2.album.shuffle'),
      tr('favorites.addAlbum'), tr('v2.cover.more'),
    ]);
  });

  it('🔴 album de la bibliothèque : chaque ancien bouton est une entrée du menu, rangée dans son groupe', async () => {
    poser(AlbumDetailV2, { album: LOCAL });
    // Les gestes qui dépendent d'une lecture : pistes (dossier, sélection) et fiche d'édition.
    await jusqua(() => appels.some((u) => /\/edition/.test(u)) && appels.some((u) => /\/tracks/.test(u)));
    await jusqua(() => false, 200);
    const plus = await ouvrirMenuAlbum();
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    const attendus = [
      'data-album-playlist', 'data-album-collection', 'data-etiquettes-album',
      'data-suggestions-ia-album', 'data-notes-ia-album',
      'data-selection-album', 'data-modifier-album', 'data-reidentifier-album', 'data-localiser-album',
    ];
    for (const a of attendus) {
      expect(menu()!.querySelector(`[${a}]`), `entrée absente du menu « … » : ${a}`).not.toBeNull();
    }
    // Les groupes portent leur nom (role=group + intertitre).
    const groupes = Array.from(menu()!.querySelectorAll('[role="group"]')).map((g) => g.getAttribute('aria-label'));
    expect(groupes).toEqual([tr('v2.menu.addTo'), tr('v2.menu.info'), tr('v2.menu.library')]);
    // Hors coffret, pas de « Défaire le coffret » ; hors service, Lire ensuite / file sont sous la flèche.
    expect(menu()!.querySelector('[data-defaire-coffret]')).toBeNull();
    expect(menu()!.querySelector('[data-lire-ensuite], [data-ajouter-file]')).toBeNull();

    // Choisir une entrée ferme le menu, rend le focus et fait le geste.
    menu()!.querySelector<HTMLElement>('[data-modifier-album]')!.click();
    expect(await jusqua(() => !!hote!.querySelector('.edition'))).toBe(true);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(plus);
  });

  it('« Ajouter à › Collection » ouvre la liste des collections sous le bouton « … »', async () => {
    poser(AlbumDetailV2, { album: LOCAL });
    await ouvrirMenuAlbum();
    menu()!.querySelector<HTMLElement>('[data-album-collection]')!.click();
    expect(await jusqua(() => !!document.querySelector('.coll-menu'))).toBe(true);
  });

  it('album de service : ni Collection, ni Bibliothèque, ni Localiser', async () => {
    poser(AlbumDetailV2, { album: QOBUZ, service: 'qobuz' });
    await jusqua(() => false, 150);
    await ouvrirMenuAlbum();
    expect(menu()!.querySelector('[data-album-collection]')).toBeNull();
    expect(menu()!.querySelector('[data-localiser-album]')).toBeNull();
    expect(menu()!.querySelector('[data-reidentifier-album]')).toBeNull();
    const groupes = Array.from(menu()!.querySelectorAll('[role="group"]')).map((g) => g.getAttribute('aria-label'));
    expect(groupes).not.toContain(tr('v2.menu.library'));
  });
});

describe('la fiche album : onglets Pistes | Crédits | Bio | Présentation', () => {
  const onglet = (o: string) => hote!.querySelector<HTMLButtonElement>(`[role="tab"][data-onglet-album="${o}"]`);
  const panneau = () => hote!.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');

  it('album de la bibliothèque : Crédits et Bio affichent leur contenu, Pistes revient à la liste', async () => {
    poser(AlbumDetailV2, { album: LOCAL });
    expect(Array.from(hote!.querySelectorAll('[role="tab"]')).map((x) => x.getAttribute('data-onglet-album')))
      .toEqual(['pistes', 'credits', 'bio']);
    expect(onglet('pistes')!.getAttribute('aria-selected')).toBe('true');

    onglet('credits')!.click();
    flushSync();
    expect(onglet('credits')!.getAttribute('aria-selected')).toBe('true');
    expect(hote!.querySelector('.tracks')!.hasAttribute('hidden')).toBe(true);
    expect(await jusqua(() => !!panneau()?.querySelector('[data-famille]'))).toBe(true);
    expect(panneau()!.textContent).toContain('Bill Evans');
    expect(appels.some((u) => u.includes(`/library/albums/${ALBUM_ID}/credits`))).toBe(true);

    onglet('bio')!.click();
    expect(await jusqua(() => !!panneau()?.textContent?.includes('studio de la 30e Rue'))).toBe(true);
    expect(panneau()!.hasAttribute('data-panneau-bio')).toBe(true);

    // ← / → d'un onglet à l'autre, le focus suit.
    touche(onglet('bio')!, 'ArrowRight');
    flushSync();
    expect(onglet('pistes')!.getAttribute('aria-selected')).toBe('true');
    expect(hote!.querySelector('.tracks')!.hasAttribute('hidden')).toBe(false);
  });

  it('album Qobuz : l’onglet Présentation lit et affiche la présentation du service', async () => {
    poser(AlbumDetailV2, { album: QOBUZ, service: 'qobuz' });
    expect(onglet('bio'), 'un album de service n’a pas de bio locale').toBeNull();
    expect(onglet('presentation')).not.toBeNull();
    onglet('presentation')!.click();
    expect(await jusqua(() => !!panneau()?.textContent?.includes('Le disque de jazz le plus vendu.'))).toBe(true);
    expect(appels.some((u) => /\/streaming\/qobuz\/albums\/0886443853839\/description/.test(u))).toBe(true);
  });
});

describe('la fiche playlist : même principe', () => {
  const PL = { kind: 'local', pl: { id: 7, name: 'Dimanche', description: null, track_count: 2 } };

  it('Lecture scindé, Aléatoire, Favori, « … » — et les gestes d’avant dans le menu', async () => {
    poser(PlaylistDetailV2, { item: PL });
    await jusqua(() => false, 150);
    expect(hote!.querySelector('[data-bouton-lecture] [data-lecture-options]')).not.toBeNull();
    const plus = hote!.querySelector<HTMLButtonElement>('[data-menu-playlist]')!;
    plus.click();
    flushSync();
    for (const a of ['data-etiquettes-playlist', 'data-exporter-playlist', 'data-editer-playlist']) {
      expect(menu()!.querySelector(`[${a}]`), `entrée absente : ${a}`).not.toBeNull();
    }
    // Renommer et Supprimer n'existent qu'en mode édition, comme avant.
    expect(menu()!.querySelector('[data-supprimer-playlist]')).toBeNull();
    menu()!.querySelector<HTMLElement>('[data-editer-playlist]')!.click();
    flushSync();
    plus.click();
    flushSync();
    expect(menu()!.querySelector('[data-renommer-playlist]')).not.toBeNull();
    expect(menu()!.querySelector('[data-supprimer-playlist]')).not.toBeNull();
  });
});

describe('l’écran Collections', () => {
  const COLLECTIONS = [
    { id: 1, name: 'Ambiances', description: null, album_ids: [ALBUM_ID], covers: [], created_at: '2026-01-01T00:00:00Z' },
  ];
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('IntersectionObserver', ResizeObserverInerte);
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      appels.push(u);
      if (/\/smart-collections/.test(u)) return reponse([]);
      if (/\/library\/collections\/\d+\/albums/.test(u)) return reponse([LOCAL]);
      if (u.endsWith('/library/collections')) return reponse(COLLECTIONS);
      return reponse([]);
    }));
  });
  async function tourner(n = 10) { for (let i = 0; i < n; i++) { await respirer(); flushSync(); } }

  async function poserCollections() {
    poser(CollectionsV2, {});
    await tourner();
  }

  it('la liste : UN bouton « + Nouvelle » qui propose Manuelle, Intelligente et Suggérée par l’IA', async () => {
    await poserCollections();
    const nouvelle = hote!.querySelector<HTMLButtonElement>('[data-nouvelle-collection]')!;
    expect(nouvelle).not.toBeNull();
    expect(hote!.querySelectorAll('header .v2-actions > button').length, 'un seul bouton dans l’en-tête de la liste').toBe(1);
    expect(nouvelle.getAttribute('aria-haspopup')).toBe('menu');
    nouvelle.click();
    flushSync();
    expect(entrees().map((e) => e.textContent?.trim())).toEqual([
      tr('v2.menu.newManual'), tr('v2.menu.newSmart'), tr('v2.menu.newAi'),
    ]);
    expect(menu()!.querySelector('[data-propositions-ia]')).not.toBeNull();
    // Manuelle : la fenêtre de création des collections simples.
    menu()!.querySelector<HTMLElement>('[data-nouvelle-manuelle]')!.click();
    await tourner(2);
    expect(document.body.textContent).toContain(tr('v2.col.create'));
  });

  it('une collection ouverte : Lecture scindé, Aléatoire, UN « Trier ▾ » et « … » (Modifier, Re-tirer, Supprimer)', async () => {
    await poserCollections();
    const onglets = Array.from(hote!.querySelectorAll<HTMLButtonElement>('nav.tabs button.tab'));
    onglets[1].click();
    await tourner();
    expect(await jusqua(() => !!hote!.querySelector('.grid .card .meta'))).toBe(true);
    hote!.querySelector<HTMLButtonElement>('.grid .card .meta')!.click();
    expect(await jusqua(() => !!hote!.querySelector('[data-menu-tri]'))).toBe(true);
    await tourner();
    expect(hote!.querySelector('.fa [data-bouton-lecture] [data-lecture-options]')).not.toBeNull();
    expect(hote!.querySelectorAll('.fa select').length, 'plus de <select> de tri dans l’en-tête').toBe(0);

    // Trier ▾ : les critères ET le sens, en choix exclusifs cochés.
    const trier = hote!.querySelector<HTMLButtonElement>('[data-menu-tri]')!;
    trier.click();
    flushSync();
    const coches = entrees().filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.getAttribute('data-tri') ?? e.getAttribute('data-sens'));
    expect(coches).toEqual(['artist', 'asc']);
    expect(menu()!.querySelector('[data-tri="random"]')).not.toBeNull();
    menu()!.querySelector<HTMLElement>('[data-tri="random"]')!.click();
    flushSync();

    // « … » : Modifier, Re-tirer (l'ordre est maintenant aléatoire), Supprimer.
    const plus = hote!.querySelector<HTMLButtonElement>('[data-menu-collection]')!;
    plus.click();
    flushSync();
    expect(entrees().map((e) => [...e.attributes].map((a) => a.name).find((n) => n.startsWith('data-'))))
      .toEqual(['data-editer-collection', 'data-re-tirer', 'data-supprimer-collection']);
    touche(window, 'Escape');
    flushSync();
    expect(document.activeElement).toBe(plus);

    // Un ordre non aléatoire n'a rien à re-tirer.
    trier.click();
    flushSync();
    menu()!.querySelector<HTMLElement>('[data-tri="title"]')!.click();
    flushSync();
    plus.click();
    flushSync();
    expect(menu()!.querySelector('[data-re-tirer]')).toBeNull();
  });
});
