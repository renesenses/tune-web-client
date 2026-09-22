/**
 * `tune-server-rust#4710` — la durée totale (#3190) et « créer une liste de
 * lecture depuis les résultats » (#3191) ont disparu de l'écran livré.
 *
 * Les deux ne vivaient que dans `src/components/SearchView.svelte`, supprimé le
 * 19/09 par `d5ed7deb` avec leurs deux bancs de tests ; leurs sept clés de
 * traduction sont parties avec `35e66cd0`. `SearchV2.svelte` ne les a jamais
 * reprises. jfpaquet les réclame le 22/09 (fil 1644).
 *
 * Ce banc garde les deux moitiés : le CALCUL (module pur, testé sur des
 * valeurs) et le BRANCHEMENT (l'écran appelle bien ce calcul, et ses sept clés
 * existent dans les onze langues). Sans le second, un module juste mais non
 * appelé rendrait ce banc vert alors que l'écran, lui, serait inchangé —
 * c'est exactement la forme du défaut que ce ticket décrit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dureeTotaleMs,
  nombreAvecDuree,
  pistesEnregistrables,
  identifiantsEnregistrables,
} from '../rechercheResultatsMasse';
import { estDeBibliotheque } from '../provenanceBibliotheque';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (src: string): string =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const LANGUES = ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;
const CLES = [
  'search.durationShown',
  'search.createPlaylist',
  'search.playlistNamePrompt',
  'search.playlistCreated',
  'search.playlistCreatedPartial',
  'search.playlistNoLocalTracks',
  'search.playlistError',
] as const;

describe('#3190 — la durée totale des résultats', () => {
  it('somme les durées des pistes reçues', () => {
    const pistes = [{ duration_ms: 180_000 }, { duration_ms: 240_000 }, { duration_ms: 60_000 }];
    expect(dureeTotaleMs(pistes)).toBe(480_000);
  });

  it('une piste sans durée compte pour zéro, elle ne retranche rien', () => {
    // Les pistes de service dont le fournisseur n'annonce pas la longueur.
    const pistes = [
      { duration_ms: 180_000 },
      { duration_ms: null },
      {},
      { duration_ms: -5_000 },
      { duration_ms: Number.NaN },
      { duration_ms: 120_000 },
    ];
    expect(dureeTotaleMs(pistes)).toBe(300_000);
  });

  it('une liste vide ou absente vaut zéro, jamais NaN', () => {
    expect(dureeTotaleMs([])).toBe(0);
    expect(dureeTotaleMs(null)).toBe(0);
    expect(dureeTotaleMs(undefined)).toBe(0);
    expect(Number.isNaN(dureeTotaleMs([{ duration_ms: Number.NaN }]))).toBe(false);
  });

  it("dit sur COMBIEN de lignes le total porte — c'est ce qui l'empêche de mentir", () => {
    const pistes = [{ duration_ms: 180_000 }, { duration_ms: null }, { duration_ms: 0 }];
    expect(nombreAvecDuree(pistes)).toBe(1);
    expect(nombreAvecDuree([])).toBe(0);
  });
});

describe('#3191 — la liste de lecture depuis les résultats', () => {
  // L'écran MÊLE bibliothèque et services : c'est la seule liste de pistes du
  // client qui le fasse. Une liste locale ne contient pas une piste de service.
  const resultats = [
    { id: 11, source: 'local', duration_ms: 1000 },
    { id: 'qobuz:9182', source: 'qobuz', duration_ms: 2000 },
    { id: 12, source: 'upnp', duration_ms: 3000 }, // #4201 : UPnP EST la bibliothèque
    { id: null, source: 'local', duration_ms: 4000 },
    { id: 13, duration_ms: 5000 }, // source absente = local
    { id: 'bc-7', source: 'bandcamp', duration_ms: 6000 },
  ];

  it('ne garde que les pistes de la bibliothèque, avec un identifiant numérique', () => {
    const gardees = pistesEnregistrables(resultats as any, estDeBibliotheque as any);
    expect(gardees.map((p: any) => p.id)).toEqual([11, 12, 13]);
  });

  it("un album UPnP est de la BIBLIOTHÈQUE, pas d'un service (#4201)", () => {
    const gardees = pistesEnregistrables(
      [{ id: 12, source: 'upnp' }, { id: 14, source: 'upnp:uuid-abc' }] as any,
      estDeBibliotheque as any,
    );
    expect(gardees).toHaveLength(2);
  });

  it("aucune piste de service n'entre, même avec un identifiant", () => {
    const gardees = pistesEnregistrables(
      [{ id: 'qobuz:1', source: 'qobuz' }, { id: 5, source: 'tidal' }] as any,
      estDeBibliotheque as any,
    );
    expect(gardees).toEqual([]);
  });

  it("les identifiants sortent dédoublonnés, dans l'ordre de l'écran", () => {
    const ids = identifiantsEnregistrables(
      [{ id: 3 }, { id: 1 }, { id: 3 }, { id: 2 }] as any,
      estDeBibliotheque as any,
    );
    expect(ids).toEqual([3, 1, 2]);
  });

  it('une recherche sans aucune piste locale rend une liste vide, pas une erreur', () => {
    expect(identifiantsEnregistrables([{ id: 'x', source: 'qobuz' }] as any, estDeBibliotheque as any))
      .toEqual([]);
  });
});

describe("le BRANCHEMENT dans l'écran de recherche", () => {
  const src = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it('SearchV2 appelle bien le calcul de durée — et pas une copie locale', () => {
    expect(src).toContain("from '../../lib/rechercheResultatsMasse'");
    expect(src).toMatch(/dureeTotaleMs\(\s*titres\b/);
  });

  it('la durée se rend à côté du compteur de la section Titres', () => {
    expect(src).toContain('libelleDureeTitres');
    expect(src).toMatch(/class="grp-duree"/);
    // `formatDuration` était importé et JAMAIS appelé : c'était la signature
    // exacte de la régression (#4710, lecture au sha embarqué de v0.9.161).
    expect(src.match(/formatDuration\(/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('le bouton « créer une liste » existe et passe par le calcul partagé', () => {
    expect(src).toContain('creerPlaylistDepuisResultats');
    expect(src).toMatch(/identifiantsEnregistrables\(/);
    expect(src).toContain("$t('search.createPlaylist'");
    expect(src).toContain('api.createPlaylist(');
    expect(src).toContain('api.addPlaylistTracks(');
  });

  it("le message de succès DIT combien de pistes ont été enregistrées", () => {
    // 🔴 Une liste tronquée en silence PERSISTE : elle sera prise pour
    // exhaustive des mois plus tard, là où un écran tronqué se corrige en
    // refaisant la recherche.
    expect(src).toContain("$t('search.playlistCreated'");
    expect(src).toContain("$t('search.playlistCreatedPartial'");
  });

  it('le nom est demandé par le socle dialogs, jamais par la boîte native (#166)', () => {
    // Les dialogues natifs ne s'ouvrent pas dans un webview : le clic ne fait
    // rien, et rien ne le dit. Le nom de la boîte interdite est reconstitué,
    // et jamais écrit en toutes lettres : `scripts/check-native-dialogs.mjs`
    // balaie TOUT le dépôt, ce banc compris.
    const boiteNative = new RegExp(`\\bwindow\\.${'pro' + 'mpt'}\\(`);
    expect(src).toMatch(/dialogs\.prompt\(/);
    expect(src).not.toMatch(boiteNative);
  });
});

describe('les sept clés perdues sont revenues dans les ONZE langues', () => {
  for (const langue of LANGUES) {
    it(`${langue} porte les sept clés`, () => {
      const src = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of CLES) {
        expect(src, `${cle} manque dans ${langue}`).toMatch(
          new RegExp(`["']${cle.replace('.', '\\.')}["']\\s*:`),
        );
      }
    });
  }

  it('les libellés à paramètres gardent leurs jetons', () => {
    const fr = lire('src/lib/locales/fr.ts');
    expect(fr).toMatch(/['"]search\.durationShown['"]:\s*['"][^'"]*\{d\}/);
    expect(fr).toMatch(/['"]search\.playlistCreated['"]:\s*['"][^'"]*\{name\}/);
    expect(fr).toMatch(/['"]search\.playlistCreatedPartial['"]:\s*['"][^'"]*\{total\}/);
  });

  it("aucun accent n'a été double-encodé par une retouche en masse", () => {
    for (const langue of LANGUES) {
      const src = lire(`src/lib/locales/${langue}.ts`);
      expect((src.match(/Ã/g) ?? []).length, `${langue} double-encodé`).toBe(0);
    }
  });
});
