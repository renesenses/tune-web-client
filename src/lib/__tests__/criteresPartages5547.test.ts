// @vitest-environment jsdom
//
// tune-server-rust#5547 — Bertrand, 30/09/2026, sur le .18 en 0.9.169 :
// « l'éditeur des playlists intelligentes n'offre pas les mêmes critères de
// sélection que celui des collections intelligentes. Il manque notamment les
// ÉTIQUETTES. Harmonise avec les smart collections ! »
//
// Il y avait deux listes de critères : quatorze champs et un seul jeu
// d'opérateurs pour les playlists (`smartPlaylistChamps.ts`), vingt-quatre
// champs typés pour les collections (`smartRegles.ts`). Il n'y en a plus
// qu'une. Ce fichier est la GARDE : il échoue si les deux niveaux divergent à
// nouveau, et il joue l'éditeur de bout en bout pour la règle « Étiquette ».
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import {
  CHAMPS as DEFINITION,
  EN_ATTENTE,
  champsDe,
  champsSaisissables,
  operateursDe as operateursCollection,
} from '../smartRegles';
import {
  CHAMPS as CHAMPS_PLAYLIST,
  lireRegles,
  normaliserOperateur,
  operateursDe as operateursPlaylist,
  operateursPour,
  reglesPourServeur,
} from '../smartPlaylistChamps';
import PlaylistSmartEditeurV2 from '../../components/v2/PlaylistSmartEditeurV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Les SEULS critères propres à un niveau. Ajouter un nom ici est une
 * décision : elle se lit dans la revue, au lieu de se glisser dans une liste.
 */
const PROPRES_AUX_PLAYLISTS = ['title', 'comments'];
const PROPRES_AUX_COLLECTIONS: string[] = [];

describe('#5547 — une seule définition, deux niveaux', () => {
  it('🔴 GARDE : aucun critère n’est propre à un niveau sans être nommé ici', () => {
    const playlists = DEFINITION.filter((c) => c.seulement === 'playlist').map((c) => c.value);
    const collections = DEFINITION.filter((c) => c.seulement === 'collection').map((c) => c.value);
    expect(playlists.sort()).toEqual([...PROPRES_AUX_PLAYLISTS].sort());
    expect(collections.sort()).toEqual([...PROPRES_AUX_COLLECTIONS].sort());
  });

  it('🔴 GARDE : chaque critère des collections existe dans les playlists, même type, même libellé, mêmes opérateurs', () => {
    const cols = champsDe('collection').filter((c) => !c.seulement);
    const pls = champsDe('playlist').filter((c) => !c.seulement);
    expect(pls.length).toBe(cols.length);
    cols.forEach((c, i) => {
      const p = pls[i];
      expect(p.labelKey, c.value).toBe(c.labelKey);
      expect(p.type, c.value).toBe(c.type);
      expect(operateursPlaylist(p.value).map((o) => o.value), c.value).toEqual(
        operateursCollection(c.value).map((o) => o.value),
      );
    });
  });

  it('les deux menus proposent les mêmes critères, au nom près', () => {
    const cles = (n: 'collection' | 'playlist') =>
      champsSaisissables(n).filter((c) => !c.seulement).map((c) => c.labelKey).sort();
    expect(cles('playlist')).toEqual(cles('collection'));
  });

  it('🔴 l’ÉTIQUETTE est un critère de playlist, choisie dans une liste', () => {
    const tag = CHAMPS_PLAYLIST.find((c) => c.value === 'tag');
    expect(tag, 'la règle « Étiquette » manque aux playlists').toBeTruthy();
    expect(tag!.type).toBe('tag_ref');
    expect(tag!.key).toBe('smartCollection.fieldTag');
    expect(operateursPlaylist('tag').map((o) => o.value)).toEqual(['is', 'is_not']);
  });

  it('« Note » n’est proposée NULLE PART tant qu’elle est cassée côté serveur', () => {
    // `t.rating` n'existe pas : l'aperçu rend une erreur 500, aux collections
    // comme aux playlists (mesuré sur le .18 en 0.9.169). Question rendue à
    // Bertrand dans tune-server-rust#5547.
    expect(EN_ATTENTE).toEqual(['rating']);
    for (const n of ['collection', 'playlist'] as const) {
      expect(champsSaisissables(n).map((c) => c.value), n).not.toContain('rating');
    }
    // Mais la grammaire la garde : une règle enregistrée s'ouvre sans la perdre.
    expect(DEFINITION.some((c) => c.value === 'rating')).toBe(true);
  });

  it('les critères rattrapés sont tous là', () => {
    const offerts = champsSaisissables('playlist').map((c) => c.value);
    for (const f of ['tag', 'label', 'folder', 'track_count', 'duration', 'track_number',
      'disc_number', 'bpm', 'cover_path', 'added_at', 'play_count', 'last_played_at']) {
      expect(offerts, f).toContain(f);
    }
  });

  it('deux noms seulement changent au niveau de la piste — ceux que les playlists portent déjà', () => {
    // Les règles enregistrées portent `artist` et `album` : les renommer les
    // rendrait illisibles pour le menu.
    const pl = champsDe('playlist').filter((c) => !c.seulement);
    const co = champsDe('collection').filter((c) => !c.seulement);
    const renommes = co
      .map((c, i) => [c.value, pl[i].value] as const)
      .filter(([a, b]) => a !== b);
    expect(renommes).toEqual([['artist_name', 'artist'], ['title', 'album']]);
  });
});

describe('#5547 — les règles déjà enregistrées gardent leur sens', () => {
  /** `regles_sql::normaliser_op` du serveur, recopié : c'est lui qui juge. */
  function serveur(op: string): string {
    switch (op) {
      case '=': case 'eq': case 'equals': return '=';
      case '!=': case 'ne': case 'neq': case 'not_equals': return '!=';
      case '>=': case 'gte': case 'greater_than': case 'greater_equal': return '>=';
      case '>': case 'gt': return '>';
      case '<=': case 'lte': case 'less_than': case 'less_equal': return '<=';
      case '<': case 'lt': return '<';
      case 'is_empty': case 'empty': case 'is_null': return 'is_null';
      case 'is_not_empty': case 'not_empty': case 'is_not_null': return 'is_not_null';
      default: return op;
    }
  }

  const ANCIENNES = ['equals', 'not_equals', 'gte', 'lte', 'greater_than', 'less_than',
    '>=', '<=', '>', '<', '=', '!=', 'contains', 'starts_with', 'is_empty', 'is_not_empty',
    'in', 'not_in', 'is', 'is_not'];

  it.each(ANCIENNES)('« %s » garde son sens pour le serveur une fois relu', (op) => {
    expect(serveur(normaliserOperateur(op))).toBe(serveur(op));
  });

  it('une règle ancienne se relit et repart à l’identique, au nom d’opérateur près', () => {
    const lues = lireRegles(JSON.stringify([
      { field: 'artist', op: 'contains', value: 'depeche' },
      { field: 'year', operator: 'gte', value: '1980' },
      { field: 'source', op: 'equals', value: 'local' },
    ]));
    expect(reglesPourServeur(lues)).toEqual([
      { field: 'artist', op: 'contains', value: 'depeche' },
      { field: 'year', op: '>=', value: '1980' },
      { field: 'source', op: '=', value: 'local' },
    ]);
  });

  it('un opérateur que le menu ne propose plus reste AFFICHÉ, pas perdu', () => {
    // `branch_of` : offert par l'ancien menu, traduit par aucun moteur. La
    // règle se garde telle quelle au lieu de se changer en silence.
    const r = { field: 'genre', operator: 'branch_of', value: 'Jazz' };
    expect(operateursPour(r).map((o) => o.value)).toContain('branch_of');
    expect(operateursPlaylist('genre').map((o) => o.value)).not.toContain('branch_of');
  });

  it('« est vide » part SANS valeur — l’ancien filtre la jetait', () => {
    expect(reglesPourServeur([{ field: 'cover_path', operator: 'is_null', value: null }]))
      .toEqual([{ field: 'cover_path', op: 'is_null', value: null }]);
    expect(reglesPourServeur([{ field: 'genre', operator: 'contains', value: '  ' }])).toEqual([]);
  });

  it('« entre » part avec ses deux bornes, et seulement complet', () => {
    expect(reglesPourServeur([{ field: 'year', operator: 'between', value: [1960, 1969] }]))
      .toEqual([{ field: 'year', op: 'between', value: [1960, 1969] }]);
    expect(reglesPourServeur([{ field: 'year', operator: 'between', value: [1960, ''] }])).toEqual([]);
  });
});

describe('#5547 — les trois éditeurs lisent la même liste', () => {
  const v2 = sansCommentaires(lire('src/components/v2/PlaylistSmartEditeurV2.svelte'));
  const heritage = sansCommentaires(lire('src/components/v2-heritage/SmartPlaylistsView.svelte'));
  const col = sansCommentaires(lire('src/components/v2/CollectionSmartEditeurV2.svelte'));
  const grammaire = sansCommentaires(lire('src/lib/smartPlaylistChamps.ts'));

  it('aucun ne porte sa propre liste de champs', () => {
    for (const [nom, src] of [['v2', v2], ['héritage', heritage], ['collections', col], ['grammaire', grammaire]]) {
      expect(src, `${nom} : une liste recopiée`).not.toContain("value: 'composer'");
      expect(src, `${nom} : une liste recopiée`).not.toContain("labelKey: 'smartCollection.fieldArtist'");
    }
    expect(v2).toContain("champsSaisissables('playlist')");
    expect(heritage).toContain("champsSaisissables('playlist')");
    expect(col).toContain("champsSaisissables('collection')");
  });

  it('l’ancien écran sait SAISIR une étiquette', () => {
    expect(heritage).toContain("{:else if rule.field === 'tag'}");
    expect(heritage).toContain('api.getTags()');
  });
});

/* ------------------------------------------------------------------ */
/* De bout en bout : l'éditeur du nouveau client crée une règle        */
/* « Étiquette », et c'est elle qui part au serveur.                   */
/* ------------------------------------------------------------------ */

interface Appel { methode: string; url: string; corps: any }
let appels: Appel[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function corpsPour(url: string, methode: string): unknown {
  if (/\/tags\/(\?|$)/.test(url)) return [{ id: 7, name: 'J’adore', count: 3 }, { id: 9, name: 'Soirée', count: 1 }];
  if (/\/library\/smart-playlists$/.test(url) && methode === 'POST') return { id: 12 };
  if (/\/streaming\/services/.test(url)) return {};
  return [];
}

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
    const methode = (opts?.method ?? 'GET').toUpperCase();
    const corps = opts?.body ? JSON.parse(String(opts.body)) : undefined;
    appels.push({ methode, url: String(url), corps });
    const reponse = corpsPour(String(url), methode);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => reponse,
      text: async () => JSON.stringify(reponse),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#5547 — l’éditeur de playlists crée une règle « Étiquette »', () => {
  it('🔴 choisir « Étiquette », puis une étiquette, envoie {field:"tag", op:"is", value:"7"}', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PlaylistSmartEditeurV2, {
      target: hote,
      props: { id: null, onClose: () => {}, onSaved: () => {} },
    });
    for (let i = 0; i < 6; i++) await attendre(10);
    flushSync();

    const nom = hote.querySelector<HTMLInputElement>('input.txt')!;
    nom.value = 'Mes coups de cœur';
    nom.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    const champ = hote.querySelector<HTMLElement>('.regle')!.querySelector<HTMLSelectElement>('select')!;
    expect(
      [...champ.options].map((o) => o.value),
      'le menu des champs ne propose pas l’étiquette',
    ).toContain('tag');
    champ.value = 'tag';
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    await attendre();
    flushSync();

    const selects = [...hote.querySelector<HTMLElement>('.regle')!.querySelectorAll<HTMLSelectElement>('select')];
    expect(selects.length, 'la règle « Étiquette » n’a pas de liste d’étiquettes').toBe(3);
    expect([...selects[1].options].map((o) => o.value)).toEqual(['is', 'is_not']);
    const valeurs = [...selects[2].options].map((o) => o.value);
    expect(valeurs, 'la liste ne montre pas les étiquettes du serveur').toEqual(['', '7', '9']);
    selects[2].value = '7';
    selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    hote.querySelector<HTMLButtonElement>('.pied button.play')!.click();
    flushSync();
    await attendre(60);
    flushSync();

    const creation = appels.find((a) => a.methode === 'POST' && /\/library\/smart-playlists$/.test(a.url));
    expect(creation, 'aucune création envoyée').toBeTruthy();
    expect(creation!.corps.rules).toEqual([{ field: 'tag', op: 'is', value: '7' }]);
  });
});
