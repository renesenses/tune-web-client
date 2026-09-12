// @vitest-environment jsdom
//
// #3924 — « mesurés, calculés ou juste reportés ? » (Patatorz, fil 1683).
//
// LA MÊME CLÉ PORTE DEUX VOCABULAIRES, et le client n'en connaissait qu'un.
// Mesuré sur le tag `v0.9.147` :
//
//   ALBUM  GET /library/albums/{id}          album_tag | track_average
//          (`DynamicRangeAlbum::source`, tune-core/src/db/album_repo.rs)
//   PISTE  GET /library/albums/{id}/tracks   tag | analysis
//          GET /library/tracks
//          (`albums::provenance_du_dr`, routes/library/albums.rs:447)
//
// `SourceDynamicRange` valait `'album_tag' | 'track_average'`. Une valeur
// `analysis` — celle que la passe d'analyse a CALCULÉE sur les échantillons
// depuis la v0.9.145 — tombait donc dans la branche par défaut et s'affichait
// avec l'infobulle « lue dans les tags des fichiers ». Un énoncé FAUX, et
// précisément celui que le testeur cherchait à départager.
//
// 🔴 CE TÉMOIN MONTE LE TABLEAU DE PISTES et lit l'infobulle que le DOM porte.
// Vérifier la seule fonction ne prouverait pas que la colonne l'appelle — et
// avant ce lot, la cellule `dr` n'avait AUCUNE infobulle de provenance : la
// règle pouvait être parfaite, l'utilisateur ne voyait rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { afficherDynamicRange } from '../dynamicRange';
import { cleInfobulleColonne, valeurColonne } from '../colonnesPistes';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import type { Track } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Une piste dont le DR vient du TAG du fichier. */
const PISTE_TAG = {
  id: 101, title: 'Lue dans le tag', artist_name: 'X', duration_ms: 200000,
  dynamic_range: '12', dynamic_range_source: 'tag',
} as unknown as Track;

/** Une piste dont le DR a été CALCULÉ par la passe d'analyse. */
const PISTE_ANALYSE = {
  id: 102, title: 'Calculée par Tune', artist_name: 'X', duration_ms: 200000,
  dynamic_range: '12', dynamic_range_source: 'analysis',
} as unknown as Track;

/** Une base antérieure à la v0.9.145 : valeur sans provenance connue. */
const PISTE_SANS_PROVENANCE = {
  id: 103, title: 'Provenance inconnue', artist_name: 'X', duration_ms: 200000,
  dynamic_range: '12',
} as unknown as Track;

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

/** Monte le tableau en mode Expert, colonne DR cochée — le seul mode où
 *  cette colonne est offerte (`COLONNES`, min: 'expert'). */
function poser(pistes: Track[]) {
  preferences.update((p) => ({
    ...p,
    settingsLevel: 'expert' as never,
    v2Colonnes: { ...p.v2Colonnes, expert: ['dr'] as never },
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2, {
    target: hote,
    props: { pistes, onLire: () => {}, numerotation: 'aucune' },
  });
  flushSync();
  return hote;
}

/** L'infobulle de la cellule DR, au rang donné. */
function infobulleDR(rang: number): string {
  const ligne = hote!.querySelectorAll('.trow')[rang];
  expect(ligne, `pas de ligne au rang ${rang}`).toBeTruthy();
  const cellules = [...ligne.querySelectorAll('.td:not(.act):not(.titre)')];
  expect(
    cellules.length,
    'la colonne DR n’est pas rendue — le tableau ne porte aucune cellule de donnée',
  ).toBeGreaterThan(0);
  return cellules[cellules.length - 1].getAttribute('title') ?? '';
}

describe('#3924 — la règle connaît le vocabulaire des PISTES', () => {
  it('`analysis` n’est plus « lue dans les tags »', () => {
    const a = afficherDynamicRange(PISTE_ANALYSE)!;
    expect(a.cleInfobulle).toBe('library.dynamicRangeAnalysisTip');
    expect(a.cleInfobulle).not.toBe('library.dynamicRangeTip');
    expect(a.calcule).toBe(true);
  });

  it('`tag` reste « lue dans les tags » — l’énoncé y était vrai', () => {
    const a = afficherDynamicRange(PISTE_TAG)!;
    expect(a.cleInfobulle).toBe('library.dynamicRangeTip');
    expect(a.calcule).toBe(false);
  });

  it('une valeur CALCULÉE ne prend pas le tilde de l’« environ »', () => {
    // Le tilde dit « approximativement », et c'est vrai d'une moyenne de
    // pistes. Un calcul sur les échantillons est une MESURE : lui coller un
    // tilde affirmerait une approximation qui n'existe pas.
    expect(afficherDynamicRange(PISTE_ANALYSE)!.texte).toBe('12');
    expect(afficherDynamicRange(PISTE_ANALYSE)!.deduit).toBe(false);
    // …alors que la moyenne d'album, elle, le garde.
    const moyenne = afficherDynamicRange({ dynamic_range: '12', dynamic_range_source: 'track_average' })!;
    expect(moyenne.texte).toBe('~12');
  });

  it('le vocabulaire d’ALBUM n’a pas bougé d’un iota', () => {
    const mesure = afficherDynamicRange({ dynamic_range: '12', dynamic_range_source: 'album_tag' })!;
    expect(mesure.cleInfobulle).toBe('library.dynamicRangeTip');
    expect(mesure.calcule).toBe(false);
    const moyenne = afficherDynamicRange({ dynamic_range: '12', dynamic_range_source: 'track_average' })!;
    expect(moyenne.cleInfobulle).toBe('library.dynamicRangeAverageTip');
  });

  it('une provenance INCONNUE se tait, elle ne s’invente pas', () => {
    // Un `dr_track` écrit avant que `dr_source` existe n'a pas de provenance.
    // Lui coller « tag », puisque c'était le seul producteur d'alors, serait
    // un affichage fabriqué sur une base qu'un rattrapage a pu recalculer —
    // c'est le raisonnement du serveur, mot pour mot.
    const a = afficherDynamicRange(PISTE_SANS_PROVENANCE)!;
    expect(a.cleInfobulle).toBe('library.dynamicRangeTip');
    expect(a.calcule).toBe(false);
  });
});

describe('#3924 — la colonne DR est BRANCHÉE sur cette règle', () => {
  it('le modèle de colonne rend la clé d’infobulle, pour `dr` et pour elle seule', () => {
    expect(cleInfobulleColonne(PISTE_ANALYSE, 'dr')).toBe('library.dynamicRangeAnalysisTip');
    expect(cleInfobulleColonne(PISTE_TAG, 'dr')).toBe('library.dynamicRangeTip');
    // Une piste sans DR n'a rien à dire : l'infobulle retombe sur la valeur.
    expect(cleInfobulleColonne({ id: 1 } as Track, 'dr')).toBeNull();
    expect(cleInfobulleColonne(PISTE_ANALYSE, 'title')).toBeNull();
    expect(cleInfobulleColonne(PISTE_ANALYSE, 'bpm')).toBeNull();
  });

  it('la valeur affichée reste celle du serveur', () => {
    expect(valeurColonne(PISTE_ANALYSE, 'dr')).toBe('12');
    expect(valeurColonne(PISTE_TAG, 'dr')).toBe('12');
  });

  it('🔴 le TABLEAU porte l’infobulle « calculée par Tune » sur une valeur d’analyse', () => {
    poser([PISTE_ANALYSE]);
    const bulle = infobulleDR(0);
    expect(
      bulle,
      'la cellule DR doit dire d’où sort la valeur',
    ).toBe(fr['library.dynamicRangeAnalysisTip']);
    // …et surtout PAS l'énoncé faux d'avant.
    expect(bulle).not.toBe(fr['library.dynamicRangeTip']);
  });

  it('🔴 deux pistes au MÊME chiffre ne disent pas la même chose', () => {
    // C'est toute la question du testeur : `DR 12` et `DR 12`, l'un lu dans
    // le fichier, l'autre calculé par Tune. Sans l'infobulle, rien ne les
    // distingue à l'écran.
    poser([PISTE_TAG, PISTE_ANALYSE]);
    expect(infobulleDR(0)).toBe(fr['library.dynamicRangeTip']);
    expect(infobulleDR(1)).toBe(fr['library.dynamicRangeAnalysisTip']);
    expect(infobulleDR(0)).not.toBe(infobulleDR(1));
  });

  it('la clé i18n est RÉSOLUE, pas affichée en clair', () => {
    poser([PISTE_ANALYSE]);
    expect(infobulleDR(0)).not.toContain('library.dynamicRange');
    expect(infobulleDR(0).length).toBeGreaterThan(20);
  });
});

describe('#3924 — l’infobulle existe dans les onze langues', () => {
  it('`library.dynamicRangeAnalysisTip` est traduite partout, et distincte des deux autres', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const code of langues) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      const tip = dico['library.dynamicRangeAnalysisTip'];
      expect(tip, `${code} / library.dynamicRangeAnalysisTip`).toBeTruthy();
      expect((tip ?? '').trim().length, code).toBeGreaterThan(20);
      expect(tip, `${code} : confondue avec l’infobulle des tags`).not.toBe(
        dico['library.dynamicRangeTip'],
      );
      expect(tip, `${code} : confondue avec l’infobulle de la moyenne`).not.toBe(
        dico['library.dynamicRangeAverageTip'],
      );
    }
  });
});
