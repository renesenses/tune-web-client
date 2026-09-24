// @vitest-environment jsdom
//
// « Autres versions » sur une piste de SERVICE — par titre + artiste.
//
// Décision de Bertrand, 23/09/2026 : l'entrée doit AUSSI apparaître sur une
// piste Qobuz, Tidal, Deezer, Bandcamp, YouTube ou de l'historique streaming,
// « par rapprochement titre + artiste, résultats approximatifs acceptés ».
// Jusqu'ici `menuPiste.ts` ne la poussait que si `idBibliotheque != null` :
// `GET /library/tracks/{id}/versions` prend un `i64`.
//
// Ce que ce fichier tient :
//   1. le MENU : la capacité `versionsParTitre` pousse l'entrée, même libellé,
//      même icône ; sans titre ou sans artiste, `cibleParTitre` la refuse ; une
//      piste de la bibliothèque ne change pas ;
//   2. le RAPPROCHEMENT, appelé : titre ≈, artiste ≈, la piste d'origine
//      exclue, pas de doublon, la forme du panneau ;
//   3. le PANNEAU MONTÉ en mode titre + artiste, `fetch` tenu : l'en-tête dit
//      le mode, les tuiles sont celles du rapprochement, l'ordre « par
//      source » (#4368) s'y applique comme pour la route par piste ;
//   4. la clé i18n dans les onze langues.
//
// Contre-épreuve : sur la base (#1522, sans `versionsParTitre`), le bloc 1
// rougit — l'entrée reste absente pour une piste Qobuz.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { entreesMenuPiste, ICONES, type CapacitesPiste, type GestesPiste } from '../menuPiste';
import {
  artistesProches, cibleParTitre, rapprocherParTitre, titresProches, type CibleParTitre,
} from '../versionsParTitre';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { ORDRE_VERSIONS_DEFAUT } from '../versionsPiste';
import type { Track } from '../types';
import lFr from '../locales/fr';
import lEn from '../locales/en';
import lDe from '../locales/de';
import lEs from '../locales/es';
import lIt from '../locales/it';
import lZh from '../locales/zh';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lHu from '../locales/hu';

const fr: Record<string, string> = lFr as any;

/** Une piste Qobuz, telle que la recherche ou l'historique la rendent. */
const QOBUZ: Track = {
  id: null, title: 'Lovely Day', artist_name: 'Bill Withers',
  album_title: 'Menagerie', source: 'qobuz', source_id: '52528016',
};
const LOCALE: Track = {
  id: 2450, title: 'La fleur', artist_id: 125, artist_name: 'M',
  album_id: 259, album_title: 'Je dis aime', source: 'local',
};

function gestes(): { g: GestesPiste; appels: string[] } {
  const appels: string[] = [];
  const g = {} as GestesPiste;
  for (const nom of ['lire', 'ensuite', 'aLaFile', 'plusCommeCa', 'autresVersions',
                     'ajouterAPlaylist', 'allerArtiste', 'allerAlbum', 'etiqueter',
                     'champsDuFichier'] as const) {
    (g as any)[nom] = () => appels.push(nom);
  }
  return { g, appels };
}

/** Les capacités d'une piste de service, comme `PisteActions` les pose. */
function capacitesDeService(piste: Track): CapacitesPiste {
  return {
    jouable: true, idBibliotheque: null, artistId: null, albumId: null,
    etiquetable: true, playlistDeService: 'qobuz',
    versionsParTitre: cibleParTitre(piste) != null,
  };
}

describe('le menu — « Autres versions » sur une piste de service', () => {
  it('🔴 une piste Qobuz avec titre et artiste porte l’entrée, même libellé, même icône', () => {
    const { g } = gestes();
    const entrees = entreesMenuPiste(capacitesDeService(QOBUZ), g);
    const entree = entrees.find((e) => e.cle === 'library.otherVersions');
    expect(entree, '« Autres versions » absente sur une piste Qobuz nommée').toBeTruthy();
    expect(entree!.icone).toBe(ICONES.versions);
    // À la même place que pour une piste de la bibliothèque : après « Plus
    // comme ça » (absent ici), avant la playlist.
    const cles = entrees.map((e) => e.cle);
    expect(cles.indexOf('library.otherVersions')).toBeGreaterThan(cles.indexOf('queue.addToQueue'));
    expect(cles.indexOf('library.otherVersions')).toBeLessThan(cles.indexOf('nowplaying.addToPlaylist'));
  });
  it('l’entrée déclenche le geste `autresVersions`, et lui seul', () => {
    const { g, appels } = gestes();
    entreesMenuPiste(capacitesDeService(QOBUZ), g)
      .find((e) => e.cle === 'library.otherVersions')!.faire();
    expect(appels).toEqual(['autresVersions']);
  });
  it('sans titre, ou sans artiste : pas de cible, donc pas d’entrée', () => {
    const { g } = gestes();
    for (const piste of [
      { ...QOBUZ, title: '' },
      { ...QOBUZ, title: '   ' },
      { ...QOBUZ, artist_name: null, album_artist: null },
    ] as Track[]) {
      expect(cibleParTitre(piste)).toBeNull();
      expect(entreesMenuPiste(capacitesDeService(piste), g).map((e) => e.cle))
        .not.toContain('library.otherVersions');
    }
  });
  it('sans la capacité, une piste de service reste sans entrée (comportement d’origine)', () => {
    const { g } = gestes();
    const c: CapacitesPiste = { jouable: true, idBibliotheque: null, artistId: null, albumId: null };
    expect(entreesMenuPiste(c, g).map((e) => e.cle)).not.toContain('library.otherVersions');
  });
  it('une piste de la BIBLIOTHÈQUE : rien ne change — dix gestes, et `cibleParTitre` la refuse', () => {
    const { g } = gestes();
    expect(cibleParTitre(LOCALE), 'la route par `i64` fait mieux : pas de rapprochement').toBeNull();
    const c: CapacitesPiste = { jouable: true, idBibliotheque: 2450, artistId: 125, albumId: 259 };
    const avec = entreesMenuPiste({ ...c, versionsParTitre: false }, g).map((e) => e.cle);
    const sans = entreesMenuPiste(c, g).map((e) => e.cle);
    expect(avec).toEqual(sans);
    expect(sans).toHaveLength(10);
    expect(sans.filter((k) => k === 'library.otherVersions')).toHaveLength(1);
  });
  it('l’artiste d’album sert de repli quand la piste n’a pas d’artiste', () => {
    const c = cibleParTitre({ ...QOBUZ, artist_name: null, album_artist: 'Bill Withers' });
    expect(c?.artiste).toBe('Bill Withers');
    expect(c?.source).toBe('qobuz');
    expect(c?.source_id).toBe('52528016');
  });
});

const CIBLE: CibleParTitre = {
  titre: 'Lovely Day', artiste: 'Bill Withers', source: 'qobuz', source_id: '52528016',
};

/** `album_id` d'une piste de service est une CHAÎNE : on construit sans le typage local. */
function piste(p: Record<string, unknown>): Track {
  return { id: null, title: 'Lovely Day', artist_name: 'Bill Withers', ...p } as Track;
}

/** Ce que `/search?q=Lovely Day` rend, réduit à ce qui compte. */
const REPONSE = {
  local: {
    tracks: [
      piste({ id: 46940, album_id: 4411, album_title: 'Menagerie', source: 'local',
        cover_path: '/c/4411.jpg', duration_ms: 257000 }),
      // Un autre titre qui contient le mot : hors sujet.
      piste({ id: 46941, title: 'Lovely Day Dream', album_id: 4412, album_title: 'Ailleurs', source: 'local' }),
      // Une reprise locale par un autre interprète : hors du rapprochement titre + ARTISTE.
      piste({ id: 46942, artist_name: 'Jamie Cullum', album_id: 4413, album_title: 'Interlude', source: 'local' }),
    ],
    albums: [], artists: [],
  },
  services: {
    bandcamp: {
      tracks: [
        piste({ source_id: 'bc-1', album_id: 'bca-1', album_title: 'Lovely Day (Single)', cover_path: null }),
      ],
      albums: [], artists: [],
    },
    qobuz: {
      tracks: [
        // 🔴 LA PISTE D'ORIGINE : jamais dans ses propres « autres versions ».
        piste({ source_id: '52528016', album_id: 'eyx2', album_title: 'Menagerie' }),
        piste({ source_id: '52528999', album_id: 'eyx3', album_title: 'Lovely Day (Remastered 2005)',
          title: 'Lovely Day (Remastered 2005)' }),
        // Un « feat. » : l'artiste contient le nôtre.
        piste({ source_id: '52529000', album_id: 'eyx4', album_title: 'Live',
          artist_name: 'Bill Withers feat. Grover Washington, Jr.' }),
        // Doublon du précédent, tel qu'un service peut le rendre deux fois.
        piste({ source_id: '52529000', album_id: 'eyx4', album_title: 'Live',
          artist_name: 'Bill Withers feat. Grover Washington, Jr.' }),
        // Une reprise par un autre : écartée.
        piste({ source_id: '7', album_id: 'x7', album_title: 'Covers', artist_name: 'Emigre' }),
        // Ni piste ni album désignés : rien à montrer.
        piste({ source_id: null, album_id: null, album_title: 'Fantôme' }),
      ],
      albums: [], artists: [],
    },
  },
};

describe('le rapprochement, appelé', () => {
  it('titre ≈ : égal normalisé, ou égal sans la mention finale — jamais un mot de plus', () => {
    expect(titresProches('Lovely Day', 'lovely day')).toBe(true);
    expect(titresProches('Lovely Day (Remastered 2005)', 'Lovely Day')).toBe(true);
    expect(titresProches('Lovely Day [Live] (2020 Remaster)', 'Lovely Day')).toBe(true);
    expect(titresProches('Lovely Day - Radio Edit', 'Lovely Day (Single)')).toBe(true);
    expect(titresProches('Élégie', 'elegie')).toBe(true);
    // Un mot de plus sans parenthèse ni tiret : un AUTRE morceau.
    expect(titresProches('Lovely Day Dream', 'Lovely Day')).toBe(false);
    expect(titresProches('Lovely Daydream', 'Lovely Day')).toBe(false);
    expect(titresProches('', 'Lovely Day')).toBe(false);
  });
  it('artiste ≈ : égal normalisé, ou l’un contient l’autre — l’absence n’est pas un joker', () => {
    expect(artistesProches('Bill Withers', 'bill withers')).toBe(true);
    expect(artistesProches('Bill Withers feat. Grover Washington, Jr.', 'Bill Withers')).toBe(true);
    expect(artistesProches('Emigre', 'Bill Withers')).toBe(false);
    expect(artistesProches(null, 'Bill Withers')).toBe(false);
  });
  it('🔴 rend la forme du panneau : bibliothèque dans `versions`, services dans `streaming`', () => {
    const g = rapprocherParTitre(REPONSE as any, CIBLE);
    expect(g.title).toBe('Lovely Day');
    expect(g.versions).toEqual([{
      track_id: 46940, album_id: 4411, album_title: 'Menagerie', artist_name: 'Bill Withers',
      cover_path: '/c/4411.jpg', duration_ms: 257000,
    }]);
    expect(g.streaming!.map((v) => `${v.service}:${v.source_id}`)).toEqual([
      'bandcamp:bc-1', 'qobuz:52528999', 'qobuz:52529000',
    ]);
    expect(g.streaming![1]).toMatchObject({
      service: 'qobuz', source_id: '52528999', album_id: 'eyx3',
      album_title: 'Lovely Day (Remastered 2005)', artist_name: 'Bill Withers', kind: 'version',
    });
  });
  it('la piste d’origine est EXCLUE, par sa paire service + identifiant', () => {
    const g = rapprocherParTitre(REPONSE as any, CIBLE);
    expect(g.streaming!.some((v) => v.service === 'qobuz' && v.source_id === '52528016')).toBe(false);
    // Sans origine connue (historique sans identifiant), elle reste : on ne
    // peut pas l'écarter sans se tromper de piste.
    const sans = rapprocherParTitre(REPONSE as any, { ...CIBLE, source_id: null });
    expect(sans.streaming!.some((v) => v.source_id === '52528016')).toBe(true);
  });
  it('une réponse vide ou absente rend un groupe vide, pas une erreur', () => {
    expect(rapprocherParTitre(null, CIBLE)).toMatchObject({ versions: [], streaming: [] });
    expect(rapprocherParTitre({ local: { tracks: [] } } as any, CIBLE))
      .toMatchObject({ versions: [], streaming: [] });
  });
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let requetes: string[] = [];

async function souffler(n = 8) {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

describe('le panneau, MONTÉ en mode titre + artiste', () => {
  beforeEach(() => {
    locale.set('fr');
    requetes = [];
    try { localStorage.clear(); } catch { /* ignore */ }
    preferences.update((p) => ({ ...p, ordreAutresVersions: ORDRE_VERSIONS_DEFAUT }));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      requetes.push(url);
      const c = /\/search\?q=/.test(url) ? REPONSE : {};
      return {
        ok: true, status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(c),
        json: async () => c,
      } as unknown as Response;
    }));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    document.querySelectorAll('.fond').forEach((e) => e.remove());
    vi.unstubAllGlobals();
  });

  async function ouvrir(props: Record<string, unknown>) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(VersionsPistePanneau, { target: hote, props: { onClose: () => {}, ...props } as any });
    await souffler();
  }
  const albumsRendus = () =>
    [...document.querySelectorAll('.tuile .ti')].map((e) => (e.textContent ?? '').trim());

  it('🔴 interroge la recherche fédérée par le titre, jamais la route par `i64`', async () => {
    await ouvrir({ parTitre: CIBLE, titre: 'Lovely Day' });
    expect(requetes.some((u) => /\/search\?q=Lovely%20Day/.test(u)), requetes.join('\n')).toBe(true);
    expect(requetes.some((u) => /\/library\/tracks\//.test(u))).toBe(false);
  });
  it('l’en-tête dit « rapproché par titre et artiste » — et pas en mode `trackId`', async () => {
    await ouvrir({ parTitre: CIBLE, titre: 'Lovely Day' });
    expect(document.querySelector('.approx')?.textContent).toBe(fr['library.otherVersionsByTitle']);
    expect(fr['library.otherVersionsByTitle']).toMatch(/titre et artiste/);
    if (monte) unmount(monte);
    monte = null;
    document.querySelectorAll('.fond').forEach((e) => e.remove());
    await ouvrir({ trackId: 700, titre: 'x' });
    expect(document.querySelector('.approx')).toBeNull();
  });
  it('les tuiles sont celles du rapprochement : la locale, puis les services, sans l’origine', async () => {
    // L'ordre « par pertinence » rend les services dans l'ordre REÇU. Il est
    // posé ici explicitement : depuis #4368 (23/09/2026) le défaut est « par
    // source », que le témoin suivant couvre.
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'pertinence' }));
    await ouvrir({ parTitre: CIBLE, titre: 'Lovely Day' });
    expect(albumsRendus()).toEqual([
      'Menagerie', 'Lovely Day (Single)', 'Lovely Day (Remastered 2005)', 'Live',
    ]);
    expect(document.querySelectorAll('.tuile')).toHaveLength(4);
  });
  it('l’ordre « par source » (#4368) s’applique : Bandcamp passe en dernier', async () => {
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'source' }));
    await ouvrir({ parTitre: CIBLE, titre: 'Lovely Day' });
    expect(albumsRendus()).toEqual([
      'Menagerie', 'Lovely Day (Remastered 2005)', 'Live', 'Lovely Day (Single)',
    ]);
  });
  it('sans rien de proche, le cas vide est écrit', async () => {
    await ouvrir({ parTitre: { ...CIBLE, titre: 'Ain’t No Sunshine' }, titre: 'Ain’t No Sunshine' });
    expect(document.querySelector('.etat')?.textContent).toBe(fr['library.noOtherVersions']);
  });
});

describe('i18n — la clé de l’en-tête dans les onze langues', () => {
  const LANGUES: [string, Record<string, string>][] = [
    ['fr', lFr as any], ['en', lEn as any], ['de', lDe as any], ['es', lEs as any],
    ['it', lIt as any], ['zh', lZh as any], ['ja', lJa as any], ['ko', lKo as any],
    ['ro', lRo as any], ['sv', lSv as any], ['hu', lHu as any],
  ];
  it('couvre bien onze langues', () => { expect(LANGUES).toHaveLength(11); });
  for (const [langue, dict] of LANGUES) {
    it(`library.otherVersionsByTitle — ${langue}`, () => {
      expect(dict['library.otherVersionsByTitle'], `manque en ${langue}`).toBeTruthy();
    });
  }
});
