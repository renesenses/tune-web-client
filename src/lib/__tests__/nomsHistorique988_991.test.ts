/**
 * #988 et #991 — l'objet de l'Historique porte son NOM, son ARTISTE et sa
 * POCHETTE.
 *
 * FabienM, fil 1774 (v0.9.147), points 10, 11 et 17 :
 *  - « cas d'une playlist : son nom n'apparaît pas, c'est indiqué "Sans nom" » ;
 *  - « manque l'artiste de l'album joué » ;
 *  - « il manque la vignette des titres d'une playlist ou d'un album joué
 *    provenant d'une source streaming ».
 *
 * Trois sources de nom, dans l'ordre : la playlist de service résolue, le
 * `context_name` du serveur (.151, tune-server-rust#4036), les pistes.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  nomDObjet, artisteDObjet, pochetteDObjet, serviceDePlaylist,
} from '../historiqueParContexte';
import { NomsDePlaylists } from '../nomsDePlaylists';
import { entreesDepuisServeur } from '../historiqueLecture';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const q = (over: any = {}) => ({ track: { source: 'qobuz', artist_name: 'Anette Askvik', album_title: 'Liberty', cover_path: 'https://x/1.jpg', ...over } });

describe('#988 — le nom de l’objet', () => {
  it('🔴 `context_name` du serveur PRIME sur ce que disent les pistes', () => {
    expect(nomDObjet('album', [{ ...q(), contexte: { nom: 'Soirée' } }])).toBe('Soirée');
  });
  it('sans nom serveur, un album se nomme par ses pistes — comme avant', () => {
    expect(nomDObjet('album', [q()])).toBe('Liberty');
    expect(nomDObjet('playlist', [q()])).toBeNull();
  });
  it('🔴 le mapping serveur ne JETTE plus `context_name`', () => {
    const e = entreesDepuisServeur([{ title: 'x', listened_at: '2026-09-16T10:00:00Z', context_type: 'playlist', context_id: '3', context_name: 'Soirée' }]);
    expect(e[0].contexte?.nom).toBe('Soirée');
    const sans = entreesDepuisServeur([{ title: 'x', listened_at: '2026-09-16T10:00:00Z' }]);
    expect(sans[0].contexte?.nom ?? null).toBeNull();
  });
});

describe('#988, point 11 — l’artiste de l’album', () => {
  it('un album porte l’artiste de ses pistes', () => {
    expect(artisteDObjet('album', [q({ artist_name: '' }), q()])).toBe('Anette Askvik');
  });
  it('ni pour un artiste (ce serait son nom), ni pour une playlist', () => {
    expect(artisteDObjet('artist', [q()])).toBeNull();
    expect(artisteDObjet('playlist', [q()])).toBeNull();
  });
});

describe('#991 — la pochette de l’objet', () => {
  it('la première piste qui en porte une', () => {
    expect(pochetteDObjet([q({ cover_path: null, album_id: null }), q()])).toEqual({ cover_path: 'https://x/1.jpg', album_id: null });
    expect(pochetteDObjet([q({ cover_path: null, album_id: 12 })])).toEqual({ cover_path: null, album_id: 12 });
    expect(pochetteDObjet([q({ cover_path: null, album_id: null })])).toBeNull();
  });
});

describe('#988 — à QUEL service demander le nom d’une playlist', () => {
  it('toutes les pistes du même service → ce service', () => {
    expect(serviceDePlaylist('playlist', [q(), q({ source: 'Qobuz' })])).toBe('qobuz');
  });
  it('🔴 une playlist LOCALE ne se demande à personne — son id entier vaudrait une playlist Qobuz étrangère', () => {
    expect(serviceDePlaylist('playlist', [q({ source: 'local' })])).toBeNull();
    expect(serviceDePlaylist('playlist', [q({ source: 'local' }), q()])).toBeNull();
  });
  it('mixte, vide, ou pas une playlist → null', () => {
    expect(serviceDePlaylist('playlist', [q(), q({ source: 'tidal' })])).toBeNull();
    expect(serviceDePlaylist('playlist', [])).toBeNull();
    expect(serviceDePlaylist('album', [q()])).toBeNull();
  });
});

describe('#988 — NomsDePlaylists : une demande par playlist, échec compris', () => {
  it('deux résolutions concurrentes = UNE requête ; la suivante lit la mémoire', async () => {
    const demander = vi.fn(async () => ({ name: ' Liberty ', cover_path: 'https://x/p.jpg' }));
    const n = new NomsDePlaylists(demander);
    const [a, b] = await Promise.all([n.resoudre('qobuz', '21846544'), n.resoudre('Qobuz', '21846544')]);
    expect(a).toEqual({ nom: 'Liberty', pochette: 'https://x/p.jpg' });
    expect(b).toEqual(a);
    await n.resoudre('qobuz', '21846544');
    expect(demander).toHaveBeenCalledTimes(1);
    expect(n.lire('qobuz', '21846544')).toEqual(a);
  });
  it('🔴 un service qui échoue n’est pas martelé : l’échec est mémorisé', async () => {
    const demander = vi.fn(async () => { throw new Error('502'); });
    const n = new NomsDePlaylists(demander);
    expect(await n.resoudre('tidal', 'abc')).toBeNull();
    expect(await n.resoudre('tidal', 'abc')).toBeNull();
    expect(demander).toHaveBeenCalledTimes(1);
    expect(n.lire('tidal', 'abc')).toBeNull();
    expect(n.lire('tidal', 'jamais')).toBeUndefined();
  });
  it('une réponse sans nom ni pochette vaut null', async () => {
    const n = new NomsDePlaylists(async () => ({ name: '' }));
    expect(await n.resoudre('qobuz', '1')).toBeNull();
  });
});

describe('branchement — l’écran s’en sert vraiment', () => {
  const src = lire('src/components/v2/HistoriqueV2.svelte');
  it('🔴 la ligne d’objet rend l’artiste, la pochette et le nom résolu', () => {
    expect(src).toContain('artisteDObjet(tranche.type, lot)');
    expect(src).toContain('pochetteDObjet(lot)');
    expect(src).toContain('new NomsDePlaylists(api.getStreamingPlaylist)');
    expect(src).toMatch(/class="oart"/);
    expect(src).toMatch(/class="ovig"/);
    expect(src).toContain('fiche?.nom ?? nom ??');
  });
  it('🔴 la résolution ne part que pour une playlist de SERVICE sans nom', () => {
    const eff = src.slice(src.indexOf('$effect(() => {\n    for (const tr of tranches)'), src.indexOf('noms.resoudre('));
    expect(eff).toContain("nomDObjet(tr.type, tr.entrees) != null) continue");
    expect(eff).toContain('serviceDePlaylist(tr.type, tr.entrees)');
    expect(eff).toContain('fiches.has(tr.cle)) continue');
  });
  it('la route est écrite une fois, dans api.ts', () => {
    const api = lire('src/lib/api.ts');
    expect(api).toMatch(/export function getStreamingPlaylist\(service: string, id: string\)/);
    expect(api).toContain('/playlists/${encodeURIComponent(id)}`');
  });
});
