import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { formatTime, formatDuration } from '../utils';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Retours de Querite (forum, 05/09/2026)', () => {
  it("une PISTE s'affiche en minutes:secondes, pas arrondie à la minute", () => {
    // « Le temps est arrondi à la minute ? » — capture à l'appui : « 3min »,
    // « 4min », « 2min » sur toute une liste. `formatDuration` est fait pour
    // une durée TOTALE ; sur une piste, il perd les secondes, et un titre de
    // 50 s s'affiche « 0min ».
    expect(formatTime(282773)).toBe('4:42');
    expect(formatDuration(282773)).toBe('4min');
    expect(formatTime(50000)).toBe('0:50');
    expect(formatDuration(50000)).toBe('0min');

    for (const f of ['LignePisteV2', 'QueueV2', 'FavoritesV2', 'MediaServersV2']) {
      const src = sansCommentaires(lire(`src/components/v2/${f}.svelte`));
      const lignes = src.split('\n').filter((l) => /class="(dur|ndur|td)"/.test(l));
      expect(lignes.length, `${f} : aucune colonne de durée trouvée`).toBeGreaterThan(0);
      for (const l of lignes) {
        expect(l, `${f} : une durée de piste passe encore par formatDuration`).not.toContain('formatDuration(');
        expect(l).toContain('formatTime(');
      }
    }
  });

  it("`formatDuration` reste pour les durées TOTALES", () => {
    // Un album, une playlist, le reste d'une file : au-delà d'une heure,
    // « 1h 23min » se lit mieux que « 83:12 ».
    expect(formatDuration(5000000)).toBe('1h 23min');
    const queue = sansCommentaires(lire('src/components/v2/QueueV2.svelte'));
    expect(queue).toContain('formatDuration(remainingMs)');
  });
});

describe('Extensions marquées « incompatible » (Querite, capture)', () => {
  const api = lire('src/lib/api.ts');

  it("`compatible` absent vaut COMPATIBLE, et la normalisation vit dans l'API", () => {
    // Mesuré sur le .18 : la réponse de /plugins ne porte PAS le champ. Un
    // champ absent est faux, donc `!p.compatible` marquait tout en
    // incompatible et grisait le bouton Installer.
    const i = api.indexOf('export function getMergedPlugins');
    expect(i).toBeGreaterThan(-1);
    const corps = api.slice(i, i + 400);
    expect(corps).toContain('compatible: (p as any).compatible ?? true');
    // `?? true` et non `= true` : un `false` explicite doit être respecté.
    expect(corps).not.toContain('compatible: true }');
  });

  it("l'écran V2 continue de RESPECTER un `false` explicite", () => {
    const v2 = sansCommentaires(lire('src/components/v2/PluginsV2.svelte'));
    expect(v2).toContain('!p.compatible');
  });
});

describe('getMergedPlugins : comportement observé', () => {
  let api: typeof import('../api');
  beforeEach(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.resetModules();
    api = await import('../api');
  }, 60_000);
  afterEach(() => vi.restoreAllMocks());

  function reponse(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response)));
  }

  it('ajoute `compatible: true` quand le serveur ne le dit pas', async () => {
    reponse([{ name: 'bandcamp', version: '0.9.135', installed: true }]);
    const r = await api.getMergedPlugins();
    expect(r[0].compatible).toBe(true);
  });

  it('laisse un `false` explicite intact', async () => {
    reponse([{ name: 'vieux', version: '0.1', installed: true, compatible: false }]);
    const r = await api.getMergedPlugins();
    expect(r[0].compatible).toBe(false);
  });

  it('une liste vide ne casse rien', async () => {
    reponse([]);
    await expect(api.getMergedPlugins()).resolves.toEqual([]);
  });
});

describe('Les trois écrans que la coquille ne montait pas', () => {
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
  const barre = sansCommentaires(lire('src/components/v2/Sidebar.svelte'));

  it('Ambiance, Répertoires et Oxygen sont montés ET atteignables', () => {
    // « Manque les onglets : Ambiance, Répertoires, Oxygen ». Les trois vues
    // étaient déclarées dans le type `View` et leurs écrans existaient : la
    // coquille n'en montait aucune, et rien dans la barre n'y menait. Écrit,
    // pas branché — pour la quatrième fois aujourd'hui.
    for (const [vue, composant] of [
      ['oxygen', 'OxygenView'], ['ambiance', 'AmbianceView'], ['browse', 'BrowseView'],
    ]) {
      expect(shell, `${vue} : composant absent`).toContain(`import ${composant} from '../${composant}.svelte'`);
      expect(shell, `${vue} : vue non routée`).toContain(`$activeView === '${vue}'`);
      expect(shell, `${vue} : composant non monté`).toContain(`<${composant} `);
      expect(barre, `${vue} : absent de la barre`).toContain(`view: '${vue}'`);
    }
  });

  it('chacune porte un libellé dans le fil d’Ariane de la coquille', () => {
    // Sans quoi l'en-tête afficherait la clé technique — « browse » — au lieu
    // du nom de l'écran.
    for (const k of ['oxygen:', 'ambiance:', 'browse:']) expect(shell).toContain(k);
  });
});

describe('Vignettes et fiche album (Bertrand, 05/09/2026)', () => {
  it('la qualité et la source passent sur une TROISIÈME ligne', () => {
    // « Badge qualité masqué : mets-le sur une troisième ligne » — il était
    // posé SUR la pochette, masqué par la barre d'actions au survol et perdu
    // sur les pochettes claires. Il ne s'affichait d'ailleurs qu'à partir du
    // niveau Avancé, et seulement pour le hi-res et le DSD.
    const q = sansCommentaires(lire('src/components/v2/QualiteAlbum.svelte'));
    expect(q).toContain("import ServiceBadge from '../ServiceBadge.svelte'");
    for (const f of ['LibraryV2', 'SearchV2']) {
      const src = sansCommentaires(lire(`src/components/v2/${f}.svelte`));
      expect(src, f).toContain("import QualiteAlbum from './QualiteAlbum.svelte'");
      expect(src, f).toContain('<QualiteAlbum objet=');
    }
  });

  it('la source est TOUJOURS nommée, `local` compris', () => {
    // « avec Local d'ailleurs ! ». `AlbumArt` exclut explicitement `local` de
    // son badge de pochette : on savait qu'un disque venait de Bandcamp, jamais
    // qu'il était chez soi.
    const q = sansCommentaires(lire('src/components/v2/QualiteAlbum.svelte'));
    expect(q).toContain("const s = objet?.source ?? 'local'");
    expect(q).toContain("s === 'radio' ? null : s");
    expect(q, "`local` ne doit pas être écarté").not.toMatch(/!==\s*'local'/);
    // Le libellé existe déjà côté ServiceBadge.
    expect(lire('src/components/ServiceBadge.svelte')).toContain("local:");
  });

  it("la fiche d'un album porte enfin un FAVORI", () => {
    // « En vue Album, où se trouve l'icône favori ? » — nulle part. Le cœur
    // vivait sur la pochette dans la grille ; en ouvrant l'album on le perdait.
    const det = sansCommentaires(lire('src/components/v2/AlbumDetailV2.svelte'));
    expect(det).toContain('basculerFavori');
    // Les deux espaces d'identifiants sont distincts : le chemin local sur un
    // album de service ne retirerait rien, en silence (#1478).
    expect(det).toContain('basculerFavoriLocal({ albumId: album.id })');
    expect(det).toContain('toggleStreamingFavorite({');
    // Absent quand l'album n'est désignable ni d'un côté ni de l'autre.
    expect(det).toContain('{#if album.id != null || (service && sidDistant)}');
  });
});

describe("Vignettes de streaming : harmonisées avec la Bibliothèque", () => {
  const str = sansCommentaires(lire('src/components/v2/StreamingV2.svelte'));
  const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it("le titre cliquable ne garde pas l'allure d'un bouton", () => {
    // Bertrand, 05/09/2026, capture d'une grille Bandcamp : « fond sous le
    // titre ». En rendant le titre cliquable, `.ct` est devenu un <button> —
    // qui conserve le fond, la bordure, le rembourrage et le CENTRAGE que le
    // navigateur donne aux boutons.
    const regle = /\.ct\{[^}]*\}/.exec(str)?.[0] ?? '';
    expect(regle).toContain('border:0');
    expect(regle).toContain('background:transparent');
    expect(regle).toContain('padding:0');
    expect(regle).toContain('text-align:left');
  });

  it('les deux grilles se lisent pareil', () => {
    // Même corps et même interligne des deux côtés : c'est ce qui fait
    // l'harmonie, plus que la couleur.
    const ct = (src: string) => /\.ct\{[^}]*font:([^;]*);/.exec(src)?.[1]?.trim();
    expect(ct(str)).toBe(ct(lib));
    expect(/\.ct\{[^}]*line-height:1\.25/.test(str)).toBe(true);
  });

  it('la troisième ligne y est aussi', () => {
    expect(str).toContain("import QualiteAlbum from './QualiteAlbum.svelte'");
    expect(str).toContain('<QualiteAlbum objet={{');
    // Les services rendent la qualité dans un sous-objet `quality` : sans
    // cette traduction, la ligne n'annoncerait que la source.
    expect(str).toContain('p?.quality?.codec');
    expect(str).toContain('p?.quality?.sample_rate');
  });
});
