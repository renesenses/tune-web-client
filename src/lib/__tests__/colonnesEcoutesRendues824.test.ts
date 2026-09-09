// @vitest-environment jsdom
//
// #824 — « Colonnes DR, # écoutes et dernière écoute : grisées sur la foi
// d'une mesure périmée d'un jour ».
//
// ## Ce que j'ai mesuré, le 09/09/2026, avant d'écrire une ligne
//
// Contre le .18 en **v0.9.144** (`GET /api/v1/system/version`), donc la
// version PUBLIÉE et non une tête de branche :
//
//     GET /library/tracks?limit=3        → play_count=4, last_played_at posés
//     GET /library/tracks?q=Lachrimae…   → idem, chemin FILTRÉ (`is_active`)
//     GET /library/tracks/16645          → idem, fiche d'une piste
//
// Les trois surfaces passent par le même seam serveur,
// `tracks.rs::joindre_dr_par_piste`, qui appelle `albums.rs::attacher_ecoutes`.
// La présence de `play_count` dans la charge PROUVE donc que le seam du DR
// s'exécute dans le binaire déployé : c'est lui qui appelle l'autre.
//
// `dynamic_range` ne sortait pourtant sur aucune piste — parce que la
// bibliothèque du .18 ne porte AUCUN tag `DYNAMIC RANGE` (`select count(*)
// from track_metadata where key='dr_track'` → 0), et non parce que la route
// l'ignorerait. Deux lignes `dr_track` posées le temps de la mesure, puis
// retirées, ont fait sortir la clé sur les trois surfaces, `"0"` comprise.
// C'est très exactement le piège dans lequel la mesure du 07/09 est tombée.
//
// ## Pourquoi ce fichier MONTE le composant
//
// `valeurColonne` est éprouvée à côté, dans `colonnesPistes.test.ts`. Une
// fonction juste ne prouve pas qu'une cellule s'affiche : c'est la leçon
// « écrit mais pas branché ». Le drapeau `indisponible` était appliqué DEUX
// fois — dans `colonnesRetenues` et dans la matrice des Réglages — et le
// retirer d'un seul endroit aurait laissé la colonne invisible avec une
// fonction verte. Ce fichier lit donc le DOM RENDU : les en-têtes, puis les
// cellules, ligne par ligne.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { locale, t } from '../i18n';
import { preferences } from '../stores/preferences';
import type { Track } from '../types';

/** Une piste jouée quatre fois, telle que le .18 la rend (id 16645). */
const JOUEE: Partial<Track> = {
  id: 16645, title: 'Lachrimae Antiquae', artist_name: 'Jordi Savall',
  duration_ms: 327506, track_number: 1,
  play_count: 4, last_played_at: '2026-09-06T12:09:53Z',
};

/** Une piste JAMAIS jouée : `0` et `null`, tous deux servis. */
const JAMAIS: Partial<Track> = {
  id: 16662, title: 'Lachrimae Antiquae (2012)', artist_name: 'Jordi Savall',
  duration_ms: 300000, track_number: 2,
  play_count: 0, last_played_at: null,
};

/** Une piste dont le serveur n'a posé NI l'une NI l'autre : la base a échoué.
 *  Le serveur préfère se taire plutôt que d'écrire un `0` qui mentirait. */
const MUETTE: Partial<Track> = {
  id: 16661, title: 'Tiento III Primer Tono', artist_name: 'Jordi Savall',
  duration_ms: 200000, track_number: 3,
};

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => '{}',
    json: async () => ({}),
  } as unknown as Response)));
});

afterEach(() => {
  if (monte) unmount(monte, { outro: false });
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/**
 * Monte le TABLEAU avec ces colonnes cochées, en mode Essentiel.
 *
 * Essentiel et pas un autre : `enTableau = mode === 'beginner'` dans
 * `ListePistesV2`, et `MODES_BRANCHES` ne cite que lui. Au-dessus, le
 * composant rend des LIGNES, sans colonne ni en-tête — un test monté en mode
 * Expert n'aurait aucune cellule à lire et passerait au vert pour rien.
 */
function poser(colonnes: string[], pistes: Partial<Track>[]) {
  preferences.update((p) => ({
    ...p,
    settingsLevel: 'beginner',
    v2Colonnes: { ...p.v2Colonnes, beginner: colonnes as never },
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2, {
    target: hote,
    props: { pistes: pistes as Track[], onLire: () => {}, numerotation: 'aucune' },
  });
  flushSync();
  return hote;
}

/** Les libellés de la ligne d'en-tête, dans l'ordre du rendu. */
function entetes(): string[] {
  return [...hote!.querySelectorAll('.thead .th')]
    .map((e) => (e.textContent ?? '').trim())
    .filter((s) => s !== '');
}

/**
 * Les cellules d'une ligne, colonnes de données seulement.
 *
 * La cellule d'actions et celle du suffixe portent `.act` : elles ne sont pas
 * des colonnes de métadonnée et fausseraient les rangs.
 */
function cellules(rang: number): string[] {
  const ligne = hote!.querySelectorAll('.trow')[rang];
  expect(ligne, `pas de ligne au rang ${rang}`).toBeTruthy();
  return [...ligne.querySelectorAll('.td:not(.act)')]
    .map((e) => (e.textContent ?? '').trim());
}

describe('🔴 #824 — le tableau REND les colonnes rallumées', () => {
  it('l’en-tête porte « # écoutes » et « dernière écoute », traduits', () => {
    // Le grisage les écartait de `colonnesRetenues` : l'en-tête ne les
    // contenait pas, même cochées. C'est le premier symptôme visible.
    poser(['plays', 'lastPlayed'], [JOUEE]);
    const attendus = [get(t)('v2.tcol.plays' as never), get(t)('v2.tcol.lastPlayed' as never)];
    for (const libelle of attendus) {
      expect(String(libelle).trim(), 'clé i18n non résolue').not.toBe('');
      expect(entetes(), `« ${libelle} » absent de l’en-tête`).toContain(String(libelle));
    }
  });

  it('une piste jouée affiche son compte ET sa date', () => {
    poser(['plays', 'lastPlayed'], [JOUEE]);
    // Titre verrouillé en tête, puis les deux colonnes cochées.
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4', '2026-09-06']);
  });

  it('🔴 une piste JAMAIS jouée affiche « 0 », pas une cellule vide', () => {
    // Le contrat des écoutes est l'INVERSE de celui du DR : `0` est une
    // valeur. La rendre vide viderait la colonne sur presque toute la
    // bibliothèque, et la colonne passerait pour une panne — c'est ce qui
    // avait justifié le grisage.
    poser(['plays', 'lastPlayed'], [JAMAIS]);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae (2012)', '0', '']);
  });

  it('🔴 une piste SANS les clés laisse les deux cellules vides', () => {
    // Clés absentes = la base a échoué côté serveur. Un `0` affiché ici se
    // lirait « jamais jouée » et mentirait.
    poser(['plays', 'lastPlayed'], [MUETTE]);
    expect(cellules(0)).toEqual(['Tiento III Primer Tono', '', '']);
  });

  it('les trois cas cohabitent dans un même tableau', () => {
    // Trois lignes d'affilée : c'est ce que voit l'utilisateur, et c'est là
    // que « 0 » et « vide » doivent se distinguer à l'œil.
    poser(['plays', 'lastPlayed'], [JOUEE, JAMAIS, MUETTE]);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4', '2026-09-06']);
    expect(cellules(1)).toEqual(['Lachrimae Antiquae (2012)', '0', '']);
    expect(cellules(2)).toEqual(['Tiento III Primer Tono', '', '']);
  });

  it('🔴 le Dynamic Range n’est PAS rendu : il reste réservé à EXPERT', () => {
    // Ce que ce lot NE fait PAS, écrit pour qu'on ne le croie pas fait. `dr`
    // porte `min: 'expert'` (décision produit du 07/09) et le tableau n'existe
    // qu'en Essentiel : la valeur est calculée et testée, aucun écran ne la
    // montre encore. Le jour où le tableau d'Expert sera branché, ce témoin
    // devra être RELU, pas supprimé.
    poser(['dr', 'plays'], [{ ...JOUEE, dynamic_range: '0' }]);
    const dr = String(get(t)('v2.tcol.dr' as never));
    expect(entetes()).not.toContain(dr);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4']);
  });
});

describe('les trois en-têtes existent dans les ONZE langues', () => {
  // Le hongrois n'existe QUE côté client : dix langues serveur, onze ici. Une
  // clé manquante ne casse rien — `$t` retombe silencieusement sur autre
  // chose, et l'en-tête affiche la clé brute ou le texte d'une voisine.
  //
  // `check-i18n.mjs` tient déjà la parité de TOUTES les clés contre `fr.ts`.
  // Ce témoin-ci nomme les trois du ticket : il dit lesquelles, et il compte.
  const DOSSIER = resolve(process.cwd(), 'src/lib/locales');
  const langues = readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort();

  it('onze fichiers de langue, hongrois compris', () => {
    expect(langues.length).toBe(11);
    expect(langues).toContain('hu.ts');
  });

  it.each(['plays', 'lastPlayed', 'dr'])('v2.tcol.%s est traduite partout', (suffixe) => {
    // 🔴 Aiguille ASSEMBLÉE à l'exécution. Écrite en clair, elle figurerait
    // dans ce fichier — et un témoin qui cherche une chaîne présente chez lui
    // finit par se trouver lui-même et reste vert sous sabotage.
    const aiguille = '"' + 'v2.tcol.' + suffixe + '"';
    const sans = langues.filter(
      (f) => !readFileSync(join(DOSSIER, f), 'utf-8').includes(aiguille),
    );
    expect(sans, `v2.tcol.${suffixe} manque dans : ${sans.join(', ')}`).toEqual([]);
  });
});
