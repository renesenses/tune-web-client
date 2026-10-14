// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// Bertrand, 13/10/2026 — « partout où l'on ajoute une piste (ou un album) à
// une playlist, il faut un champ de recherche pour retrouver la playlist
// cible, au lieu de faire défiler toute la liste ».
//
//   (a) le filtre : insensible à la casse et aux accents, sur le nom ;
//   (b) la fenêtre Tune (`AddToPlaylistModal`) : champ en haut, focus à
//       l'ouverture, filtre des DEUX groupes (Tune et service), Entrée choisit
//       la seule correspondance, « Nouvelle playlist » préremplie quand rien
//       ne correspond ;
//   (c) la fenêtre de cercle (`AjoutPlaylistCercleV2`) : même champ ;
//   (d) la garde : chaque chemin d'ajout recensé passe par un sélecteur qui
//       porte le champ, et aucun nouveau sélecteur n'apparaît sans lui.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { filtrerParNom, normaliserNom, actionEntree, nomPrerempli } from '../filtrePlaylists';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import AjoutPlaylistCercleV2 from '../../components/v2/AjoutPlaylistCercleV2.svelte';
import lFr from '../locales/fr';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

const cercle = vi.hoisted(() => ({
  ajouts: [] as { id: unknown }[],
  playlists: [] as { id: string; name: string; count: number; version: number; owner: null; updated_at: null; mine: boolean }[],
}));
vi.mock('../circlePlaylists', async (orig) => {
  const vrai = await orig<typeof import('../circlePlaylists')>();
  return {
    ...vrai,
    listerPlaylistsCercle: async () => cercle.playlists,
    ajouterMorceaux: async (id: unknown) => { cercle.ajouts.push({ id }); return {}; },
  };
});

// ─── (a) le filtre ────────────────────────────────────────────────────────
describe('(a) le filtre des playlists par nom', () => {
  const pls = [{ n: 'Soirées jazz' }, { n: 'Route' }, { n: 'ÉTÉ 2026' }, { n: 'Café crème' }];
  const f = (q: string) => filtrerParNom(pls, q, (x) => x.n).map((x) => x.n);

  it('requête vide : toute la liste, dans son ordre', () => {
    expect(f('')).toEqual(['Soirées jazz', 'Route', 'ÉTÉ 2026', 'Café crème']);
    expect(f('   ')).toHaveLength(4);
  });
  it('🔴 insensible à la casse', () => {
    expect(f('ROUTE')).toEqual(['Route']);
    expect(f('jAzZ')).toEqual(['Soirées jazz']);
  });
  it('🔴 insensible aux accents, dans les deux sens', () => {
    expect(f('soirees')).toEqual(['Soirées jazz']);
    expect(f('ete')).toEqual(['ÉTÉ 2026']);
    expect(f('cafe creme')).toEqual(['Café crème']);
    expect(f('Rôute')).toEqual(['Route']);
  });
  it('cherche n’importe où dans le nom', () => {
    expect(f('2026')).toEqual(['ÉTÉ 2026']);
    expect(f('zz')).toEqual(['Soirées jazz']);
  });
  it('normaliserNom écrase les espaces superflus', () => {
    expect(normaliserNom('  Café   Crème ')).toBe('cafe creme');
  });
  it('🔴 Entrée : la seule correspondance, sinon créer le nom tapé, sinon rien', () => {
    expect(actionEntree(['a'], 'x')).toEqual({ type: 'choisir', cible: 'a' });
    expect(actionEntree([], ' Nouvelle ')).toEqual({ type: 'creer', nom: 'Nouvelle' });
    expect(actionEntree(['a', 'b'], 'x')).toEqual({ type: 'rien' });
    expect(actionEntree(['a'], '  ')).toEqual({ type: 'rien' });
  });
  it('🔴 création préremplie seulement quand rien ne correspond', () => {
    expect(nomPrerempli(0, ' Ma liste ')).toBe('Ma liste');
    expect(nomPrerempli(2, 'Ma liste')).toBe('');
  });
});

// ─── banc monté ───────────────────────────────────────────────────────────
interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let reponses: [string, unknown][] = [];

async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(() => { flushSync(); if (!condition()) throw new Error(`attente expirée : ${quoi}`); },
    { timeout: 25_000, interval: 10 });
}

const PLAYLISTS_TUNE = [
  { id: 7, name: 'Été au jardin', track_count: 4 },
  { id: 8, name: 'Route', track_count: 2 },
  { id: 9, name: 'Soirées pluvieuses', track_count: 9 },
];
const PLAYLISTS_QOBUZ = [
  { cover_path: null, description: null, name: 'Soirées jazz', owner: null, source_id: '69142842', track_count: 3 },
];
const QOBUZ = {
  id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
  album_id: 'q-alb-1', source: 'qobuz', source_id: '4791523', duration_ms: 255000,
} as unknown as Track;
const LOCALE = { id: 601, title: 'Un', artist_name: 'X', source: 'local' } as unknown as Track;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  cercle.ajouts = [];
  reponses = [
    ['/streaming/qobuz/playlists', PLAYLISTS_QOBUZ],
    ['/playlists', PLAYLISTS_TUNE],
  ];
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = method === 'GET' ? reponses.find(([motif]) => url.includes(motif)) : null;
    const charge = trouve ? trouve[1] : { id: 42 };
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const champ = () => document.querySelector<HTMLInputElement>('[data-testid="recherche-playlist"]');
async function taper(texte: string) {
  const c = champ()!;
  c.value = texte;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  await souffler(3);
}
async function entree() {
  champ()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await souffler();
}
const noms = (ou?: string) =>
  [...document.querySelectorAll<HTMLElement>(`.playlist-option${ou ? `[data-ou="${ou}"]` : ''} .pl-name`)]
    .map((e) => (e.textContent ?? '').trim());

async function ouvrir(track: Track) {
  monte = mount(AddToPlaylistModal, { target: hote!, props: { track, onClose: () => {} } });
  await attendreQue(() => !!document.querySelector('.modal .modal-body .playlist-list'), 'la liste des playlists');
  await souffler();
}

describe('(b) la fenêtre « Ajouter à une playlist »', () => {
  it('🔴 le champ est en haut de la liste, avec le focus dès l’ouverture', async () => {
    await ouvrir(LOCALE);
    const c = champ();
    expect(c, 'pas de champ de recherche').toBeTruthy();
    expect(document.activeElement).toBe(c);
    expect(c!.placeholder).toBe(fr['playlist.searchPlaceholder']);
    // Au-dessus de la liste.
    const liste = document.querySelector('.playlist-list')!;
    expect(c!.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('🔴 filtre sans casse ni accents', async () => {
    await ouvrir(LOCALE);
    expect(noms()).toEqual(['Été au jardin', 'Route', 'Soirées pluvieuses']);
    await taper('ETE');
    expect(noms()).toEqual(['Été au jardin']);
    await taper('soirees');
    expect(noms()).toEqual(['Soirées pluvieuses']);
    await taper('');
    expect(noms()).toHaveLength(3);
  });

  it('🔴 filtre les playlists Tune ET celles du service', async () => {
    await ouvrir(QOBUZ);
    expect(noms('service')).toEqual(['Soirées jazz']);
    await taper('soirées');
    expect(noms('tune')).toEqual(['Soirées pluvieuses']);
    expect(noms('service')).toEqual(['Soirées jazz']);
    await taper('jazz');
    expect(noms('tune')).toEqual([]);
    expect(noms('service')).toEqual(['Soirées jazz']);
    // Le groupe vidé par le filtre le dit — sans prétendre qu'il n'y a aucune playlist.
    const indices = [...document.querySelectorAll('.empty-hint')].map((e) => e.textContent?.trim());
    expect(indices).toContain(fr['playlist.noMatch']);
    expect(indices).not.toContain(fr['playlist.noExisting']);
  });

  it('🔴 Entrée choisit la seule correspondance', async () => {
    await ouvrir(QOBUZ);
    await taper('JAZZ');
    await entree();
    const w = requetes.find((r) => r.method === 'POST');
    expect(w?.url).toMatch(/\/streaming\/qobuz\/playlists\/69142842\/tracks$/);
  });

  it('Entrée ne fait rien quand plusieurs playlists correspondent', async () => {
    await ouvrir(QOBUZ);
    await taper('soirées');
    await entree();
    expect(requetes.some((r) => r.method === 'POST')).toBe(false);
  });

  it('🔴 « Nouvelle playlist » reste visible et se préremplit quand rien ne correspond', async () => {
    await ouvrir(LOCALE);
    await taper('Ma toute nouvelle');
    expect(noms()).toEqual([]);
    const bouton = document.querySelector<HTMLButtonElement>('.new-playlist-btn');
    expect(bouton, '« Nouvelle playlist » a disparu').toBeTruthy();
    bouton!.click();
    await souffler(3);
    const nom = document.querySelector<HTMLInputElement>('.create-row input');
    expect(nom?.value).toBe('Ma toute nouvelle');
  });

  it('« Nouvelle playlist » n’est PAS préremplie quand une playlist correspond', async () => {
    await ouvrir(LOCALE);
    await taper('route');
    document.querySelector<HTMLButtonElement>('.new-playlist-btn')!.click();
    await souffler(3);
    expect(document.querySelector<HTMLInputElement>('.create-row input')?.value).toBe('');
  });

  it('🔴 Entrée sans correspondance ouvre la création préremplie, puis crée et ajoute', async () => {
    await ouvrir(LOCALE);
    await taper('Ma toute nouvelle');
    await entree();
    const nom = document.querySelector<HTMLInputElement>('.create-row input');
    expect(nom?.value).toBe('Ma toute nouvelle');
    expect(requetes.some((r) => r.method === 'POST'), 'Entrée a créé sans confirmation').toBe(false);
    document.querySelector<HTMLButtonElement>('.create-confirm')!.click();
    await souffler();
    const creation = requetes.find((r) => r.method === 'POST' && /\/playlists$/.test(r.url));
    expect(creation?.body?.name).toBe('Ma toute nouvelle');
    const ajout = requetes.find((r) => r.method === 'POST' && /\/playlists\/42\/tracks$/.test(r.url));
    expect(ajout?.body?.track_ids).toEqual([601]);
  });
});

describe('(c) la fenêtre « Ajouter à une playlist de cercle »', () => {
  it('🔴 même champ : focus, filtre sans accents, Entrée choisit', async () => {
    cercle.playlists = [
      { id: 'a', name: 'Écoute du dimanche', count: 3, version: 1, owner: null, updated_at: null, mine: true },
      { id: 'b', name: 'Route', count: 2, version: 1, owner: null, updated_at: null, mine: false },
    ];
    monte = mount(AjoutPlaylistCercleV2, {
      target: hote!,
      props: { ajout: { track_id: 601 } as any, titre: 'Un', onClose: () => {} },
    });
    await attendreQue(() => document.querySelectorAll('.choix-playlist').length === 2, 'les playlists de cercle');
    expect(document.activeElement).toBe(champ());
    await taper('ecoute');
    const vus = [...document.querySelectorAll('.choix-playlist .nom')].map((e) => e.textContent?.trim());
    expect(vus).toEqual(['Écoute du dimanche']);
    await entree();
    expect(cercle.ajouts.map((a) => a.id)).toEqual(['a']);
  });
});

// ─── (d) la garde ─────────────────────────────────────────────────────────
const SRC = resolve(__dirname, '../..');
const lire = (chemin: string) => readFileSync(join(SRC, chemin), 'utf-8');
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : fichiers(p);
    return /\.(svelte|ts)$/.test(n) ? [p] : [];
  });
}

/** Les SÉLECTEURS : les seules fenêtres qui listent des playlists pour y ajouter. */
const SELECTEURS = [
  'components/partages/AddToPlaylistModal.svelte',
  'components/v2/AjoutPlaylistCercleV2.svelte',
];
const OUVRE_UN_SELECTEUR = /(AddToPlaylistModal|AjoutPlaylistCercleV2|AjoutAlbumPlaylistV2)\.svelte/;

/**
 * Les chemins d'ajout recensés le 13/10/2026, et comment chacun atteint un
 * sélecteur : en le montant lui-même (`monte`), ou en déléguant à qui le monte
 * (`delegue` : le motif qui prouve la délégation).
 */
const CHEMINS: { fichier: string; monte?: true; delegue?: RegExp }[] = [
  { fichier: 'components/partages/MenuPisteV1.svelte', monte: true },
  { fichier: 'components/v2/PisteActions.svelte', monte: true },
  { fichier: 'components/v2/AlbumDetailV2.svelte', monte: true },
  { fichier: 'components/v2/AjoutAlbumPlaylistV2.svelte', monte: true },
  { fichier: 'components/v2/ShellV2.svelte', monte: true },
  // Rappel `onAddToPlaylist` : la coquille qui le fournit monte la fenêtre.
  { fichier: 'components/partages/TrackContextMenu.svelte', delegue: /ajouterAPlaylist:\s*onAddToPlaylist/ },
  { fichier: 'components/partages/NowPlaying.svelte', delegue: /onAddToPlaylist!?\(/ },
  { fichier: 'components/v2-heritage/BrowseView.svelte', delegue: /onAddToPlaylist!?\(/ },
  { fichier: 'components/v2-heritage/PlaylistManagerView.svelte', delegue: /onAddToPlaylist\?: \(track: Track\) => void/ },
  // L'écran Ambiance passe par la barre d'actions partagée.
  { fichier: 'components/v2-heritage/AmbianceView.svelte', delegue: /import PisteActions from '\.\.\/v2\/PisteActions\.svelte'/ },
  // Les menus « … » : un rappel, que `PisteActions` / `MenuPisteV1` branchent sur la fenêtre.
  { fichier: 'lib/menuPiste.ts', delegue: /g\.ajouterAPlaylist\b/ },
  { fichier: 'lib/actionsPochette.ts', delegue: /g\.ajouterAPlaylistDeCercle\b/ },
  { fichier: 'lib/actionsRapides.ts', delegue: /'nowplaying\.addToPlaylist'/ },
  // L'album entier : une demande, que la coquille ouvre dans `AjoutAlbumPlaylistV2`.
  { fichier: 'lib/gestesObjet.ts', delegue: /demandeAjoutPlaylist\.set\(/ },
];

/**
 * Les écritures dans une playlist qui ne sont PAS un choix de playlist cible :
 * on crée une playlist neuve (résultats, ambiance, IA), on duplique, on
 * transfère. Toute autre écriture hors des sélecteurs fait échouer la garde.
 */
const ECRITURES_HORS_SELECTEUR = [
  'components/v2-heritage/PlaylistManagerView.svelte', // transferts et correspondances manuelles
  'components/v2-heritage/AmbianceView.svelte', // « Enregistrer comme playlist » (création)
  'components/v2-heritage/SmartAIView.svelte', // idem
  'components/v2/SearchV2.svelte', // « Créer une playlist des résultats »
  'lib/gestesObjet.ts', // duplication d'une playlist
  'lib/api.ts',
  'lib/circlePlaylists.ts',
];

describe('(d) la garde : tous les chemins passent par le champ de recherche', () => {
  it.each(SELECTEURS)('🔴 %s porte <RecherchePlaylist>', (f) => {
    const s = lire(f);
    expect(s).toMatch(/import RecherchePlaylist from '[./]+(partages\/)?RecherchePlaylist\.svelte'/);
    expect(s).toMatch(/<RecherchePlaylist\b/);
    expect(s).toMatch(/filtrerParNom\(/);
  });

  it.each(CHEMINS)('🔴 $fichier atteint un sélecteur', ({ fichier, monte, delegue }) => {
    const s = lire(fichier);
    if (monte) expect(s, `${fichier} ne monte plus de sélecteur`).toMatch(OUVRE_UN_SELECTEUR);
    if (delegue) expect(s, `${fichier} ne délègue plus l'ajout`).toMatch(delegue);
    // Aucun chemin ne refait sa propre liste de playlists à choisir.
    expect(s).not.toMatch(/listerPlaylistsCercle\(/);
  });

  it('🔴 aucune autre écriture dans une playlist hors des sélecteurs', () => {
    const ecrit = /\b(addPlaylistTracks|addStreamingPlaylistTracks|ajouterMorceaux)\(/;
    const fautifs = fichiers(SRC)
      .map((p) => relative(SRC, p))
      .filter((r) => ecrit.test(readFileSync(join(SRC, r), 'utf-8')))
      .filter((r) => !SELECTEURS.includes(r) && !ECRITURES_HORS_SELECTEUR.includes(r));
    expect(fautifs, 'nouveau chemin d’ajout : passe-le par AddToPlaylistModal / RecherchePlaylist').toEqual([]);
  });

  it('🔴 la clé « aucune correspondance » existe dans les 11 langues', () => {
    for (const l of ONZE_LANGUES) {
      const m = dictionnaire(l);
      expect(m['playlist.noMatch'], l).toBeTruthy();
      expect(m['playlist.searchPlaceholder'], l).toBeTruthy();
    }
  });
});
