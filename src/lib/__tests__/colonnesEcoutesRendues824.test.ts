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
//
// Le même défaut a resurgi aussitôt, d'un cran plus haut : les trois colonnes
// rallumées, le DR restait invisible — `dr` est `min: 'expert'` et le tableau
// n'existait qu'en Essentiel. Arbitrage de Bertrand le 09/09/2026 : on branche
// le tableau en Expert, la colonne garde son niveau. Ce fichier monte donc les
// DEUX modes branchés, vérifie qu'Avancé garde son rendu en lignes, et rejoue
// le chargement réel des préférences pour un Expert d'avant le tableau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { DEFAUTS } from '../colonnesPistes';
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
 * Monte la liste dans un MODE donné, avec ces colonnes cochées.
 *
 * Le mode est un paramètre depuis le 09/09/2026 : le tableau existe désormais
 * en Essentiel ET en Expert (`MODES_BRANCHES`). Il fallait bien qu'il le
 * devienne — un test qui monte toujours le même mode ne verrait jamais
 * qu'Expert a reperdu son tableau.
 */
function poserAu(mode: string, colonnes: string[], pistes: Partial<Track>[]) {
  preferences.update((p) => ({
    ...p,
    settingsLevel: mode as never,
    v2Colonnes: { ...p.v2Colonnes, [mode]: colonnes as never },
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

/** Le cas d'origine : le tableau du mode Essentiel. */
function poser(colonnes: string[], pistes: Partial<Track>[]) {
  return poserAu('beginner', colonnes, pistes);
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

  it('🔴 le Dynamic Range n’est pas rendu en ESSENTIEL : il est réservé à Expert', () => {
    // Brancher le tableau en Expert ne déplace aucune colonne : `dr` porte
    // `min: 'expert'` et reste hors d'Essentiel, même cochée par un vieux
    // réglage.
    poser(['dr', 'plays'], [{ ...JOUEE, dynamic_range: '0' }]);
    const dr = String(get(t)('v2.tcol.dr' as never));
    expect(entetes()).not.toContain(dr);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4']);
  });
});

/**
 * Arbitrage de Bertrand, 09/09/2026 : « on branche le tableau en mode Expert.
 * La colonne `dr` garde `min: 'expert'` — c'est l'écran qui descend vers elle,
 * pas l'inverse. »
 *
 * Le premier état de ce lot rallumait les trois colonnes mais laissait le DR
 * invisible : `dr` était experte, le tableau essentiel. Ces témoins mesurent
 * le DOM d'Expert, pas `valeurColonne` — c'est la seule façon de voir la
 * différence entre « la valeur est juste » et « la cellule s'affiche ».
 */
describe('🔴 #824 — le tableau EXPERT, et le Dynamic Range enfin rendu', () => {
  it('Expert rend un TABLEAU, pas des lignes', () => {
    poserAu('expert', ['plays'], [JOUEE]);
    expect(hote!.querySelector('.tbl'), 'aucun tableau en Expert').toBeTruthy();
    expect(hote!.querySelectorAll('.trow').length).toBe(1);
  });

  it('🔴 le DR s’affiche, DR0 compris', () => {
    // Le cœur du ticket, enfin visible à l'écran : `"0"` est la mesure d'un
    // master saturé, pas une absence, et la cellule doit porter « 0 ».
    poserAu('expert', ['dr', 'plays', 'lastPlayed'], [{ ...JOUEE, dynamic_range: '0' }]);
    expect(entetes()).toContain(String(get(t)('v2.tcol.dr' as never)));
    // Ordre du CATALOGUE : titre, plays, lastPlayed, … puis dr.
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4', '2026-09-06', '0']);
  });

  it('🔴 une piste sans tag DR laisse la cellule vide, dans la même grille', () => {
    // Trois lignes d'affilée : DR0, DR14, et pas de tag. C'est là que « 0 » et
    // « vide » doivent se distinguer à l'œil, et c'est ce que le serveur rend
    // — mesuré le 09/09, la clé manque sur la piste non taguée alors que ses
    // deux voisines la portent.
    poserAu('expert', ['dr'], [
      { ...JOUEE, dynamic_range: '0' },
      { ...JAMAIS, dynamic_range: '14' },
      MUETTE,
    ]);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '0']);
    expect(cellules(1)).toEqual(['Lachrimae Antiquae (2012)', '14']);
    expect(cellules(2)).toEqual(['Tiento III Primer Tono', '']);
  });

  it('les écoutes s’affichent AUSSI en Expert, mêmes contrats', () => {
    poserAu('expert', ['plays', 'lastPlayed'], [JOUEE, JAMAIS, MUETTE]);
    expect(cellules(0)).toEqual(['Lachrimae Antiquae', '4', '2026-09-06']);
    expect(cellules(1)).toEqual(['Lachrimae Antiquae (2012)', '0', '']);
    expect(cellules(2)).toEqual(['Tiento III Primer Tono', '', '']);
  });

  it('🔴 AVANCÉ garde le rendu en LIGNES — le périmètre est Expert seul', () => {
    // `{#if !enTableau}` protège l'autre rendu. Brancher Expert ne doit pas
    // l'emporter avec lui : Avancé reste hors du tableau, décision explicite.
    poserAu('intermediate', ['plays', 'lastPlayed'], [JOUEE]);
    expect(hote!.querySelector('.tbl'), 'Avancé est passé au tableau').toBeNull();
    expect(hote!.querySelector('.thead')).toBeNull();
    // Et il rend bien QUELQUE CHOSE : une absence de tableau doublée d'une
    // absence de lignes serait un écran blanc, pas un mode non branché.
    expect((hote!.textContent ?? '')).toContain('Lachrimae Antiquae');
  });

  it('🔴 un réglage VIDE n’ouvre pas une grille nue : le titre reste', () => {
    // « Une liste VIDE est un choix » dit le magasin de préférences, et il la
    // garde telle quelle. Le titre est verrouillé : il survit, avec son bouton
    // de lecture. Une ligne sans une seule cellule cliquable serait pire que
    // l'absence de tableau.
    poserAu('expert', [], [JOUEE]);
    expect(hote!.querySelector('.tbl')).toBeTruthy();
    expect(cellules(0)).toEqual(['Lachrimae Antiquae']);
  });

  it('🔴 les DÉFAUTS d’Expert remplissent la grille — ils ne sont plus théoriques', () => {
    // `settingsLevel` vaut `'expert'` par DÉFAUT depuis le 27/08 : cette
    // liste est ce que voit une installation neuve à l'ouverture. Une liste
    // vide ici ouvrirait un tableau nu sur toute la bibliothèque.
    poserAu('expert', [...DEFAUTS.expert], [JOUEE]);
    expect(DEFAUTS.expert.length).toBeGreaterThan(1);
    // `quality` est une pastille, pas un texte : on compte les CELLULES, pas
    // les libellés, sinon la colonne Qualité ferait échouer l'égalité.
    expect(cellules(0).length).toBe(DEFAUTS.expert.length);
    expect(entetes()).toContain(String(get(t)('v2.tcol.composer' as never)));
  });
});

describe('🔴 #824 — ce que voit un Expert dont les préférences PRÉCÈDENT le tableau', () => {
  /**
   * On rejoue le VRAI chargement du magasin, pas une reconstitution.
   *
   * `loadPrefs()` n'est pas exportée : elle s'exécute à l'import du module. On
   * sème donc `localStorage`, puis on réimporte le magasin à neuf
   * (`vi.resetModules()`), et on lit ce qu'il en a fait. Reconstituer la
   * fusion à la main dans le test ne prouverait rien — ce serait répliquer le
   * code au lieu de le mesurer.
   */
  async function magasinFrais(stocke: unknown) {
    localStorage.setItem('tune-preferences', JSON.stringify(stocke));
    vi.resetModules();
    const mod = await import('../stores/preferences');
    return get(mod.preferences);
  }

  afterEach(() => {
    localStorage.removeItem('tune-preferences');
  });

  it('des préférences SANS `v2Colonnes` retombent sur les défauts d’Expert', () => {
    // Le cas de tout le monde : ces préférences datent d'avant les colonnes.
    return magasinFrais({ settingsLevel: 'expert' }).then((p) => {
      expect(p.settingsLevel).toBe('expert');
      expect(p.v2Colonnes.expert).toEqual(DEFAUTS.expert);
    });
  });

  it('🔴 un `v2Colonnes` qui ne connaît qu’Essentiel ne VIDE pas Expert', () => {
    // C'est le piège que le magasin avait anticipé, et la raison d'être de sa
    // fusion mode par mode : `{ ...defaults, ...raw }` est PLATE, et un objet
    // stocké qui ne porte que `beginner` aurait effacé les deux autres. Le
    // jour où Expert passe au tableau — aujourd'hui — il se serait ouvert sur
    // une grille vide.
    return magasinFrais({
      settingsLevel: 'expert',
      v2Colonnes: { beginner: ['num', 'title', 'artist'] },
    }).then((p) => {
      expect(p.v2Colonnes.beginner).toEqual(['num', 'title', 'artist']);
      expect(p.v2Colonnes.expert, 'Expert ouvrirait sur une grille vide')
        .toEqual(DEFAUTS.expert);
    });
  });

  it('une liste VIDE écrite à la main reste vide — c’est un choix, pas une panne', () => {
    // Le magasin le dit en toutes lettres. La grille garde le titre (témoin
    // ci-dessus), donc le tableau reste utilisable.
    return magasinFrais({ settingsLevel: 'expert', v2Colonnes: { expert: [] } })
      .then((p) => expect(p.v2Colonnes.expert).toEqual([]));
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
