// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '../api';
import type { ArbreCollections, RayonCollections } from '../api';
import {
  chargerRayons,
  decoderGlisse,
  destinationsDeLaCollection,
  destinationsDuRayon,
  encoderGlisse,
} from '../rayonsCollections';

/**
 * Rayons de collections — tune-server-rust#4853.
 *
 * Décision de Bertrand du 24/09/2026 : arbre, profondeur 3. Ces témoins
 * portent sur ce que l'écran PROPOSE (menus « Déplacer vers… ») et sur le
 * repli vers les listes plates quand le serveur ne sert pas l'arbre.
 */

function rayon(id: number, name: string, parent: number | null, depth: number, folders: RayonCollections[] = []): RayonCollections {
  return { id, name, parent_id: parent, position: 0, depth, folders, collections: [] };
}

// Musique(1) > Rock(2) > Punk(3) ; Jazz(4) ; Vide(5)
const punk = rayon(3, 'Punk', 2, 3);
const rock = rayon(2, 'Rock', 1, 2, [punk]);
const musique = rayon(1, 'Musique', null, 1, [rock]);
const jazz = rayon(4, 'Jazz', null, 1);
const vide = rayon(5, 'Vide', null, 1);
const arbre: ArbreCollections = { max_depth: 3, folders: [musique, jazz, vide], collections: [] };

const ids = (l: (RayonCollections | null)[]) => l.map((d) => (d ? d.id : null));

describe('menu « Déplacer vers… » d’un rayon', () => {
  it('ne propose ni le rayon lui-même ni ses descendants (cycle)', () => {
    // « Vide » (feuille, niveau 1) : la profondeur l'autoriserait partout, y
    // compris sous lui-même — seul le refus du cycle l'exclut.
    expect(ids(destinationsDuRayon(arbre, 5))).not.toContain(5);
    // Avec une profondeur maximale de 3, un DESCENDANT est toujours exclu
    // aussi par la hauteur ; on le vérifie quand même sur Rock.
    const d = ids(destinationsDuRayon(arbre, 2));
    expect(d).not.toContain(2);
    expect(d).not.toContain(3);
  });

  it('ne propose aucun parent qui ferait dépasser 3 niveaux', () => {
    // Musique porte 3 niveaux : il ne peut aller QUE… nulle part sous un autre
    // rayon (1 + 3 > 3). Il est déjà à la racine : liste vide.
    expect(ids(destinationsDuRayon(arbre, 1))).toEqual([]);
    // Rock (hauteur 2) peut aller sous un rayon de niveau 1, pas plus bas, et
    // à la racine.
    expect(ids(destinationsDuRayon(arbre, 2))).toEqual([null, 4, 5]);
    // Un rayon sans enfant peut aller jusque sous un niveau 2.
    expect(ids(destinationsDuRayon(arbre, 5))).toEqual([1, 2, 4]);
  });
});

describe('menu « Déplacer vers… » d’une collection', () => {
  it('propose tous les rayons, quel que soit leur niveau, sauf l’actuel', () => {
    expect(ids(destinationsDeLaCollection(arbre, null))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(destinationsDeLaCollection(arbre, 3))).toEqual([null, 1, 2, 4, 5]);
  });
});

describe('glisser-déposer', () => {
  it('garde la SORTE d’une collection : l’id 1 est à la fois « favorites » et « Audiophile »', () => {
    const smart = decoderGlisse(encoderGlisse({ type: 'collection', kind: 'smart', id: 1 }));
    expect(smart).toEqual({ type: 'collection', kind: 'smart', id: 1 });
    expect(decoderGlisse(JSON.stringify({ type: 'collection', kind: 'smart_collection', id: 1 }))).toBeNull();
    expect(decoderGlisse('pas du json')).toBeNull();
  });
});

describe('repli sur les listes plates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('un serveur sans la route (404) rend le mode plat, sans lever', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'not found', path: '/api/v1/library/collection-folders' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(chargerRayons(api.getCollectionFolders)).resolves.toEqual({ mode: 'plat' });
  });

  it('un 200 qui n’est pas l’arbre (repli SPA) rend aussi le mode plat', async () => {
    await expect(chargerRayons(async () => ({}) as any)).resolves.toEqual({ mode: 'plat' });
  });

  it('un serveur récent rend l’arbre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(arbre), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const e = await chargerRayons(api.getCollectionFolders);
    expect(e.mode).toBe('arbre');
    expect(e.mode === 'arbre' && e.arbre.folders.map((f) => f.name)).toEqual(['Musique', 'Jazz', 'Vide']);
  });

  it('le refus serveur garde son MOTIF (profondeur, cycle) pour l’écran', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'profondeur maximale atteinte : 3 niveaux de dossiers', code: 'conflict' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(api.createCollectionFolder('4', 3)).rejects.toThrow(/profondeur maximale/);
  });
});
