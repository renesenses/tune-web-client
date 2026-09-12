/**
 * Deux gestes que rien ne gardait vraiment.
 *
 *   1. `sharePlaylist()` doit émettre un **POST**. La route serveur
 *      (`tune-server/src/routes/playlists.rs` : `.route("/{id}/share",
 *      post(share_playlist))`) n'existe qu'en POST ; l'appel partait jadis
 *      sans `method`, donc en GET, et ne recevait qu'un 405.
 *
 *      Le verbe n'est pas un détail de forme. Le jour où la même route
 *      répondrait aussi en GET — l'état du partage, `{"shared": false}` — un
 *      GET « réussirait » sans rien publier, et l'écran copierait cet état en
 *      croyant tenir un lien. Un témoin qui ne vérifie que l'URL ne garde rien
 *      de tout cela ; celui-ci vérifie la requête RÉELLEMENT émise, pas le
 *      texte de la source.
 *
 *   2. Le bouton « importer » était grisé quand `matched === 0`. Sur une
 *      bibliothèque VIDE — le premier import Roon, l'usage même de la
 *      fonction — rien ne peut être reconnu : il l'était pour toujours.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// api.ts lit `window.location` à l'import et un jeton à chaque appel : on fige
// les deux avant de la charger.
vi.stubGlobal('window', {
  location: { protocol: 'http:', host: 'localhost:8888', origin: 'http://localhost:8888' },
});
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const api = await import('../api');
const { shareLink } = await import('../playlistShare');
const { canConfirmImport } = await import('../importReport');

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** La source sans ses commentaires.
 *
 *  Un témoin qui cherche un motif dans le texte brut rougit sur le commentaire
 *  qui EXPLIQUE le motif disparu — et resterait vert si le motif ne survivait
 *  que dans du code commenté. On ne lit donc que ce qui s'exécute.
 */
const sansCommentaires = (src: string) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('<!--'))
    .join('\n');

let appels: Array<{ url: string; init?: RequestInit }> = [];

function repondre(corps: unknown, status = 200) {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      headers: new Headers(),
      text: async () => texte,
      json: async () => JSON.parse(texte),
    } as unknown as Response;
  });
}

beforeEach(() => {
  appels = [];
});

// =========================================================================
// 1. Partager publie — et publier, c'est POST
// =========================================================================

describe('sharePlaylist', () => {
  it('émet un POST, pas un GET', async () => {
    vi.stubGlobal('fetch', repondre({ token: 'jeton-de-test', url: '/api/v1/playlists/shared/jeton-de-test' }));
    await api.sharePlaylist(7);

    expect(appels).toHaveLength(1);
    // Sans `method`, `init.method` est indéfini et `fetch` part en GET : c'est
    // exactement le geste d'avant, et la route répond alors 405.
    expect(appels[0].init?.method, 'le partage repart en GET : la route répond 405').toBe('POST');
    expect(String(appels[0].init?.method ?? 'GET').toUpperCase()).not.toBe('GET');
  });

  it('vise /api/v1/playlists/{id}/share', async () => {
    vi.stubGlobal('fetch', repondre({ token: 't', url: '/api/v1/playlists/shared/t' }));
    await api.sharePlaylist(7);
    expect(appels[0].url).toBe('/api/v1/playlists/7/share');
  });
});

// =========================================================================
// 2. Ce qui atterrit dans le presse-papier
// =========================================================================

describe('shareLink', () => {
  it('rend un lien absolu à partir de { token, url }', () => {
    expect(shareLink({ token: 'abc', url: '/api/v1/playlists/shared/abc' }, 'http://tune.local:8888')).toBe(
      'http://tune.local:8888/api/v1/playlists/shared/abc',
    );
  });

  it("se replie sur le jeton quand l'URL manque", () => {
    expect(shareLink({ token: 'abc' }, 'http://tune.local:8888')).toBe(
      'http://tune.local:8888/api/v1/playlists/shared/abc',
    );
  });

  it("lève sur une réponse d'état, au lieu d'en copier le corps", () => {
    // Le corps que rendrait un GET sur la même route. Le repli d'avant —
    // `JSON.stringify(result)` — l'aurait collé tel quel dans le presse-papier,
    // et l'écran aurait annoncé « lien copié » : un échec déguisé en réussite.
    expect(() => shareLink({ shared: false } as never, 'http://tune.local:8888')).toThrow(/no url/);
  });

  it('lève sur une réponse vide ou sans jeton', () => {
    expect(() => shareLink(undefined, 'http://tune.local:8888')).toThrow(/no url/);
    expect(() => shareLink({ url: '' }, 'http://tune.local:8888')).toThrow(/no url/);
  });

  it("ne fabrique jamais un lien qui finit par « undefined »", () => {
    // `PlaylistsV2` construisait `/shared/${r.token}` sans vérifier `token`.
    let lien: string | null = null;
    try {
      lien = shareLink({}, 'http://tune.local:8888');
    } catch {
      lien = null;
    }
    expect(lien).toBeNull();
  });

  it('est bien celui que les DEUX écrans appellent', () => {
    for (const ecran of ['../../components/PlaylistManagerView.svelte', '../../components/v2/PlaylistsV2.svelte']) {
      const source = sansCommentaires(lire(ecran));
      expect(source, `${ecran} ne passe plus par shareLink`).toMatch(/shareLink\(/);
      // Les deux replis qui fabriquaient un faux succès ne doivent pas revenir.
      expect(source, `${ecran} recopie de nouveau le corps brut`).not.toMatch(/JSON\.stringify\(result\)/);
      expect(source, `${ecran} refabrique un lien sans vérifier le jeton`).not.toMatch(
        /playlists\/shared\/\$\{[^}]*token\}/,
      );
    }
  });
});

// =========================================================================
// 3. Le bouton « importer » sur une bibliothèque vide
// =========================================================================

describe('canConfirmImport', () => {
  it('reste actif quand rien ne correspond mais que le fichier porte des lignes', () => {
    // Le premier import Roon : 1 200 lignes lues, aucune reconnue puisque la
    // bibliothèque est vide. C'est précisément là qu'il faut pouvoir importer.
    expect(canConfirmImport({ total_rows: 1200, matched: 0 }, false)).toBe(true);
  });

  it('reste actif quand des lignes correspondent', () => {
    expect(canConfirmImport({ total_rows: 1200, matched: 900 }, false)).toBe(true);
  });

  it('se grise sur un fichier sans aucune ligne', () => {
    expect(canConfirmImport({ total_rows: 0, matched: 0 }, false)).toBe(false);
  });

  it("se grise pendant l'import et sans aperçu", () => {
    expect(canConfirmImport({ total_rows: 1200, matched: 0 }, true)).toBe(false);
    expect(canConfirmImport(null, false)).toBe(false);
  });

  it("est bien celui que l'écran appelle", () => {
    const source = sansCommentaires(lire('../../components/SettingsView.svelte'));
    expect(source).toMatch(/disabled=\{!canConfirmImport\(importReport, importImporting\)\}/);
    // La condition d'avant, qui grisait le bouton sur une bibliothèque vide.
    expect(source, "l'écran regrise le bouton sur matched === 0").not.toMatch(/importReport\.matched === 0/);
  });
});
