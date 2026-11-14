// @vitest-environment jsdom
/**
 * Décisions de Bertrand, 14/11/2026 — une zone de recherche, le composant
 * partagé `ChampRecherche`, sur Historique, Collections, Répertoires,
 * Playlists intelligentes et Titres bannis. Filtrage côté client, sur la
 * liste déjà chargée ; aucune route serveur.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import TitresBannisV2 from '../../components/v2/TitresBannisV2.svelte';
import { locale } from '../i18n';

const lire = (f: string) => readFileSync(f, 'utf8');
const balisage = (f: string) => { const s = lire(f); const i = s.lastIndexOf('<style'); return i < 0 ? s : s.slice(0, i); };

const ECRANS: Record<string, string[]> = {
  'src/components/v2/HistoriqueV2.svelte': ['filtrerParTexte(entrees, recherche', 'regrouperParContexte(trouvees)'],
  'src/components/v2/CollectionsV2.svelte': ['champsRepondent([libelleTradu(e), e.nom, descriptionTraduite(e)], recherche)'],
  'src/components/v2-heritage/BrowseView.svelte': ['filtrerParTexte(roots, recherche', 'filtrerParTexte(browseResult?.directories ?? [], recherche', '{#each dossiersTrouves as dir}', '{#each racinesTrouvees as root}'],
  'src/components/v2-heritage/SmartPlaylistsView.svelte': ['filtrerParTexte(smartPlaylists, recherche'],
  'src/components/v2/TitresBannisV2.svelte': ['filtrerParTexte(items, recherche', '{#each trouves as b (cleDe(b))}'],
};

describe('les cinq écrans ont la zone de recherche partagée', () => {
  for (const [f, filtres] of Object.entries(ECRANS)) {
    it(`${f.split('/').pop()} : ChampRecherche, et la liste passe par le filtre`, () => {
      const s = lire(f);
      expect(s).toMatch(/import ChampRecherche from '(\.\/|\.\.\/v2\/)ChampRecherche\.svelte'/);
      expect(balisage(f)).toMatch(/<ChampRecherche bind:valeur=\{recherche\}/);
      expect(s).toContain("from '../../lib/filtreTexte'");
      for (const x of filtres) expect(s, x).toContain(x);
    });
  }

  it('dans l’en-tête v2, le champ précède boutons et compteur', () => {
    for (const f of ['src/components/v2/HistoriqueV2.svelte', 'src/components/v2/CollectionsV2.svelte', 'src/components/v2/TitresBannisV2.svelte']) {
      const bloc = (balisage(f).match(/<header class="v2-top[^"]*"[^>]*>[\s\S]*?<\/header>/g) ?? []).find((b) => b.includes('<ChampRecherche'));
      expect(bloc, f).toBeTruthy();
      const rech = bloc!.indexOf('<ChampRecherche');
      expect(bloc!.indexOf('class="v2-actions')).toBeLessThan(rech);
      for (const apres of ['class="v2-btn', 'class="meta"', '<BoutonMenuV2']) {
        const i = bloc!.indexOf(apres);
        if (i >= 0) expect(i, `${f} : ${apres}`).toBeGreaterThan(rech);
      }
    }
  });

  it('Répertoires : seuls les DOSSIERS sont filtrés, les pistes gardent leur position', () => {
    const s = lire('src/components/v2-heritage/BrowseView.svelte');
    expect(s).toContain('{#each browseResult.tracks as t, index}');
    expect(s).not.toMatch(/filtrerParTexte\(browseResult\?\.tracks/);
  });
});

describe('Titres bannis — le filtrage, à l’écran', () => {
  const LISTE = {
    total: 3,
    items: [
      { track_id: 7, title: 'Song A', artist: 'Bill Evans', album_id: 3, album_title: 'Portrait in Jazz', banned_at: null, resolved: true },
      { track_id: 8, title: 'Song B', artist: 'Miles Davis', album_id: 4, album_title: 'Kind of Blue', banned_at: null, resolved: true },
      { track_id: null, source: 'qobuz', source_id: 'q1', title: 'Song C', artist: 'Hélène Grimaud', album_title: null, banned_at: null, resolved: true },
    ],
  };
  let hote: HTMLDivElement;
  let monte: Record<string, unknown> | null = null;
  const souffler = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

  beforeEach(() => {
    locale.set('fr');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(LISTE), json: async () => LISTE,
    }) as unknown as Response));
    hote = document.createElement('div');
    document.body.append(hote);
  });
  afterEach(() => {
    if (monte) unmount(monte as any);
    monte = null;
    hote.remove();
    vi.unstubAllGlobals();
  });

  const taper = (v: string) => {
    const input = hote.querySelector<HTMLInputElement>('header .v2-rech input')!;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };
  const titres = () => [...hote.querySelectorAll('.ligne .tt')].map((e) => e.textContent);

  it('le champ est dans l’en-tête, invite « Rechercher dans Titres bannis… »', async () => {
    monte = mount(TitresBannisV2, { target: hote, props: {} });
    await souffler();
    const input = hote.querySelector<HTMLInputElement>('header .v2-rech input');
    expect(input).not.toBeNull();
    expect(input!.placeholder).toMatch(/^Rechercher dans .+…$/);
    expect(titres()).toEqual(['Song A', 'Song B', 'Song C']);
  });

  it('artiste, album, accents ; vide rend tout ; aucun résultat le dit', async () => {
    monte = mount(TitresBannisV2, { target: hote, props: {} });
    await souffler();
    taper('evans');
    expect(titres()).toEqual(['Song A']);
    taper('kind blue');
    expect(titres()).toEqual(['Song B']);
    taper('helene');
    expect(titres()).toEqual(['Song C']);
    taper('zzz');
    expect(titres()).toEqual([]);
    expect(hote.querySelector('[data-recherche-vide]')?.textContent).toContain('zzz');
    taper('');
    expect(titres()).toEqual(['Song A', 'Song B', 'Song C']);
  });
});
