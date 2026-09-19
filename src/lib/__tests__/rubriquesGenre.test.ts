// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getStreamingGenreAlbums } from '../api';
import { CLE_RUBRIQUE, chargerRubriquesGenre, empreinteAlbums } from '../rubriquesGenre';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FeaturedSection } from '../types';

/** Les sept rubriques que Qobuz sert, dans l'ordre du serveur. */
const SEPT: FeaturedSection[] = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'best-sellers', name: 'Best Sellers' },
  { id: 'press-awards', name: 'Press Awards' },
  { id: 'editor-picks', name: 'Editor Picks' },
  { id: 'most-streamed', name: 'Most Streamed' },
  { id: 'ideal-discography', name: 'Ideal Discography' },
  { id: 'qobuzissims', name: 'Qobuzissimes' },
];

const alb = (prefixe: string, n = 3) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefixe}-${i}`, title: `${prefixe} ${i}` }));

describe('Rubriques d’un genre — le serveur QUI SAIT les servir (#1300)', () => {
  it('empile une bande par rubrique, dans l’ordre, avec sa clé de traduction', async () => {
    const charger = vi.fn(async (s?: string) => alb(s ?? 'defaut'));

    const bandes = await chargerRubriquesGenre(SEPT, charger);

    expect(bandes.map((b) => b.id)).toEqual(SEPT.map((s) => s.id));
    expect(bandes.map((b) => b.cle)).toEqual([
      'streaming.section.newReleases',
      'streaming.section.bestSellers',
      'streaming.section.pressAwards',
      'streaming.section.editorPicks',
      'streaming.section.mostStreamed',
      'streaming.section.idealDiscography',
      'streaming.section.qobuzissimes',
    ]);
    // Chaque bande porte SA liste : c'est tout le sujet de #1300.
    expect((bandes[2].albums[0] as any).id).toBe('press-awards-0');
    // La liste par défaut n'est jamais demandée quand les rubriques répondent.
    expect(charger).not.toHaveBeenCalledWith(undefined);
  });

  it('les rubriques partent bien par leur identifiant serveur', async () => {
    const vus: (string | undefined)[] = [];
    await chargerRubriquesGenre(SEPT, async (s) => {
      vus.push(s);
      return alb(s ?? 'defaut');
    });
    expect(vus).toEqual(SEPT.map((s) => s.id));
  });
});

describe('🔴 Dégradation — le serveur qui IGNORE ?section= (0.9.155/0.9.156, le .18)', () => {
  /**
   * Mesuré contre un serveur 0.9.152 le 19/09/2026, genre Jazz, `limit=40` :
   * `new-releases`, `press-awards`, `ideal-discography` et `qobuzissims`
   * rendent les mêmes quarante identifiants (empreinte `c6f81526c4cd`). Le
   * paramètre est jeté, la réponse est inchangée.
   */
  const MEMES_QUARANTE = alb('jazz-nouveautes', 40);

  it('ne rend qu’UNE bande, pas sept fois la même grille', async () => {
    const charger = vi.fn(async () => MEMES_QUARANTE);

    const bandes = await chargerRubriquesGenre(SEPT, charger);

    expect(bandes).toHaveLength(1);
    expect(bandes[0].albums).toHaveLength(40);
  });

  it('cesse de demander les rubriques suivantes dès qu’il l’a vu', async () => {
    const charger = vi.fn(async () => MEMES_QUARANTE);

    await chargerRubriquesGenre(SEPT, charger);

    // Deux sondes suffisent à établir que le paramètre n'est pas lu : les cinq
    // requêtes restantes ne partent pas chez Qobuz.
    expect(charger).toHaveBeenCalledTimes(2);
  });

  it('ne vide pas l’écran : la bande garde les albums que le serveur rend', async () => {
    const bandes = await chargerRubriquesGenre(SEPT, async () => MEMES_QUARANTE);
    expect(bandes[0].albums.length).toBeGreaterThan(0);
  });
});

describe('Dégradations de bord', () => {
  it('aucune rubrique servie (Tidal) : la liste par défaut, sans titre', async () => {
    const charger = vi.fn(async (s?: string) => (s === undefined ? alb('defaut') : []));

    const bandes = await chargerRubriquesGenre([], charger);

    expect(bandes).toHaveLength(1);
    expect(bandes[0].id).toBe('');
    expect(bandes[0].cle).toBeNull();
    // Un seul appel, SANS rubrique : l'URL d'avant, `?limit=` et rien d'autre.
    expect(charger.mock.calls).toHaveLength(1);
    expect(charger.mock.calls[0][0]).toBeUndefined();
  });

  it('une rubrique en erreur est écartée, les autres restent', async () => {
    const bandes = await chargerRubriquesGenre(SEPT, async (s) => {
      if (s === 'press-awards') throw new Error('400 Qobuz : type inconnu');
      return alb(s ?? 'defaut');
    });

    expect(bandes.map((b) => b.id)).not.toContain('press-awards');
    expect(bandes).toHaveLength(6);
  });

  it('une rubrique vide est écartée sans emporter l’écran', async () => {
    const bandes = await chargerRubriquesGenre(SEPT, async (s) =>
      s === 'qobuzissims' ? [] : alb(s ?? 'defaut'),
    );

    expect(bandes.map((b) => b.id)).not.toContain('qobuzissims');
    expect(bandes).toHaveLength(6);
  });

  it('toutes les rubriques en erreur : repli sur la liste par défaut, jamais un écran vide', async () => {
    const charger = vi.fn(async (s?: string) => {
      if (s !== undefined) throw new Error('400');
      return alb('defaut');
    });

    const bandes = await chargerRubriquesGenre(SEPT, charger);

    expect(bandes).toHaveLength(1);
    expect(bandes[0].cle).toBeNull();
    expect(bandes[0].albums).toHaveLength(3);
  });

  it('deux rubriques tardives identiques : la première gagne, pas de doublon', async () => {
    const jumelle = alb('meme-liste');
    const bandes = await chargerRubriquesGenre(SEPT, async (s) =>
      s === 'most-streamed' || s === 'qobuzissims' ? jumelle : alb(s ?? 'defaut'),
    );

    const ids = bandes.map((b) => b.id);
    expect(ids).toContain('most-streamed');
    expect(ids).not.toContain('qobuzissims');
    expect(new Set(bandes.map((b) => empreinteAlbums(b.albums))).size).toBe(bandes.length);
  });

  it('un serveur muet sur tout ne rend aucune bande plutôt qu’une bande vide', async () => {
    const bandes = await chargerRubriquesGenre(SEPT, async () => []);
    expect(bandes).toEqual([]);
  });
});

describe('Les sept clés de traduction existent dans les onze langues', () => {
  // Les onze fichiers lus comme TEXTE, et non importés. Aucune clé n'est
  // AJOUTÉE par ce lot — les sept existent depuis longtemps ; la garde vérifie
  // seulement qu'aucune ne manque à l'appel au moment où l'écran s'en sert.
  // Une garde de texte se justifie ici parce que ce qu'elle garde EST du
  // texte : une valeur de dictionnaire, pas une logique.
  //
  // Le motif que les autres fichiers emploient — `await import(
  // \`../locales/${code}\`)` pour les onze langues, dans un test à 5 s — est
  // celui qui expire par intermittence sur Shrek en pleine suite. Mesuré :
  // `origin/main` VIERGE passe (4 exécutions, 551 fichiers), `origin/main`
  // PLUS UN SEUL fichier d'essai trivial rougit (`bandeauFermable1043`,
  // `Test timed out in 5000ms`). Le défaut ne vient donc pas de ce lot ; il
  // n'est pas contourné, et ce fichier ne l'imite pas.
  //
  // `hu.ts` écrit ses clés entre guillemets doubles : la reconnaissance ne
  // présume pas du guillemet.
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

  for (const lang of LANGUES) {
    it(`${lang} traduit les sept rubriques`, () => {
      const src = readFileSync(resolve(process.cwd(), `src/lib/locales/${lang}.ts`), 'utf-8');
      for (const cle of Object.values(CLE_RUBRIQUE)) {
        const pose = new RegExp(`["']${cle.replace(/\./g, '\\.')}["']\\s*:\\s*["']\\S`);
        expect(pose.test(src), `${lang} : ${cle} manque ou n'a pas de valeur`).toBe(true);
      }
    });
  }
});

describe('api.ts — la rubrique atteint bien l’URL', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('?section= n’est écrit que lorsqu’une rubrique est demandée', async () => {
    const vues: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      vues.push(String(url));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await getStreamingGenreAlbums('qobuz', '80', 40);
    await getStreamingGenreAlbums('qobuz', '80', 40, 'press-awards');

    expect(vues).toHaveLength(2);
    expect(vues[0]).toContain('/streaming/qobuz/genres/80/albums?limit=40');
    expect(vues[0]).not.toContain('section=');
    expect(vues[1]).toContain('section=press-awards');
  });
});
