// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5313 — Cyrille Moutia, fil 1685 : dans la vue
// d'un genre Qobuz, il veut aussi les PLAYLISTS Qobuz de ce genre (classique,
// chanson française…). Go de Bertrand du 27/09 : une bande « Playlists du
// genre », en passant `?genre=` à la route des playlists éditoriales.
//
// Le serveur sait déjà filtrer : `GET /streaming/{service}/featured-playlists`
// lit `genre` et le transmet à Qobuz (`genre_ids`). Mesuré sur le .18 le
// 09/10/2026 : genre 10 (Classique) rend Steve Reich, Daniil Trifonov, Jordi
// Savall ; genre 112 (Pop/Rock) rend Johnny Marr, Flashback années 80 — deux
// listes différentes. Les autres services renvoient une liste vide : la bande
// n'apparaît pas, sans liste de services en dur.
//
// Ce fichier n'importe PAS le module neuf de façon statique : avant le
// correctif, chaque assertion échoue sur ce qu'elle affirme, et non sur un
// import manquant qui emporterait tout le fichier.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MODULE = ['..', 'playlistsDuGenre'].join('/');
const charger = async () => (await import(/* @vite-ignore */ MODULE)) as {
  LIMITE_PLAYLISTS_GENRE: number;
  chargerPlaylistsDuGenre: (f: () => Promise<unknown>) => Promise<unknown[]>;
};

describe('#5313 — la route des playlists éditoriales reçoit le genre', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('getStreamingGenrePlaylists demande /featured-playlists?genre=<id>', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL) => {
      urls.push(String(u));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const api = (await import('../api')) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    expect(typeof api.getStreamingGenrePlaylists).toBe('function');
    await api.getStreamingGenrePlaylists('qobuz', '10');
    expect(urls.some((u) => u.includes('/streaming/qobuz/featured-playlists?genre=10'))).toBe(true);
  });
});

describe('#5313 — chargerPlaylistsDuGenre', () => {
  it('borne la bande : le serveur peut en rendre 500', async () => {
    const m = await charger();
    const tout = Array.from({ length: 500 }, (_, i) => ({ source_id: String(i) }));
    const rendu = await m.chargerPlaylistsDuGenre(async () => tout);
    expect(rendu.length).toBe(m.LIMITE_PLAYLISTS_GENRE);
    expect(m.LIMITE_PLAYLISTS_GENRE).toBeGreaterThan(0);
    expect(m.LIMITE_PLAYLISTS_GENRE).toBeLessThan(100);
  });

  it('un échec ou une réponse qui n’est pas une liste ne casse pas la vue', async () => {
    const m = await charger();
    expect(await m.chargerPlaylistsDuGenre(async () => { throw new Error('502'); })).toEqual([]);
    expect(await m.chargerPlaylistsDuGenre(async () => ({ erreur: 'x' }))).toEqual([]);
    expect(await m.chargerPlaylistsDuGenre(async () => null)).toEqual([]);
  });

  it('écarte les entrées sans identifiant (clé de boucle Svelte)', async () => {
    const m = await charger();
    const rendu = await m.chargerPlaylistsDuGenre(async () => [{ source_id: 'a' }, { name: 'sans id' }, null]);
    expect(rendu).toEqual([{ source_id: 'a' }]);
  });
});

describe('#5313 — l’écran du genre branche la bande', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');

  it('l’effet des albums du genre charge aussi ses playlists, par le genre ouvert', () => {
    const debut = source.indexOf('/** Albums d');
    expect(debut).toBeGreaterThan(-1);
    const effet = source.slice(debut, source.indexOf('// Recherche dans le service courant.', debut));
    expect(effet).toContain('api.getStreamingGenrePlaylists(svc, gid)');
    expect(effet).toContain('chargerPlaylistsDuGenre(');
  });

  it('la bande est rendue dans le volet Genres, avec un titre traduit', () => {
    const debut = source.indexOf("{:else if sub === 'genres'}");
    expect(debut).toBeGreaterThan(-1);
    const volet = source.slice(debut, source.indexOf("{:else if sub === 'playlists'}", debut));
    expect(volet).toContain('{#each genrePlaylists as p');
    expect(volet).toContain("$t('streaming.genrePlaylists')");
  });

  it('le libellé existe dans les onze langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu']) {
      const txt = readFileSync(resolve(process.cwd(), `src/lib/locales/${l}.ts`), 'utf-8');
      expect(txt, l).toMatch(/"streaming\.genrePlaylists":\s*['"][^'"]+['"]/);
    }
  });
});
