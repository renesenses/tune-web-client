// « Source = Qobuz » ne rendait que les FAVORIS. Étendre au CATALOGUE —
// renesenses/tune-server-rust#4473.
//
// Bertrand, 19/09/2026 : « Serait-il possible d'étendre les source = Qobuz à
// l'intégralité du catalogue ? ». Arbitrages du même jour : portée « artiste
// ou album » (aucun service n'énumère son catalogue, il faut dire QUOI
// chercher), et le catalogue ne compte PAS dans le décompte d'une collection.
//
// Le serveur porte la moitié moteur (`tune-smart-http/src/catalogue.rs`).
// Ici : l'écran propose le choix, le nomme, et dit ce qui manque AVANT
// d'enregistrer — un refus au moment de consulter arrive trop tard et se lit
// comme une panne (c'est exactement ce qui s'est passé pour #1231).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PREFIXE_CATALOGUE,
  libelleSource,
  serviceDuCatalogue,
  sourcesDisponibles,
} from '../sourcesRegle';
import { cibleDuCatalogue, manqueUneCible } from '../regleSourceAide';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const statut = (authenticated: boolean) => ({ enabled: true, authenticated }) as never;

describe('#4473 — la convention `catalogue:<service>`', () => {
  it('🔴 le préfixe est celui du serveur, au caractère près', () => {
    // `tune-smart-http/src/catalogue.rs` : `PREFIXE_CATALOGUE = "catalogue:"`.
    // Deux graphies divergentes écriraient une règle que le moteur ignore.
    expect(PREFIXE_CATALOGUE).toBe('catalogue:');
  });

  it('elle se relit, insensible à la casse et aux espaces', () => {
    expect(serviceDuCatalogue('catalogue:qobuz')).toBe('qobuz');
    expect(serviceDuCatalogue('  CATALOGUE:Tidal ')).toBe('tidal');
  });

  it('et elle ne mord pas sur les favoris ni sur la bibliothèque', () => {
    for (const s of ['qobuz', 'local', 'upnp', 'upnp:1234', '', 'catalogue:', 'catalogue:  ']) {
      expect(serviceDuCatalogue(s), s).toBeNull();
    }
  });
});

describe('#4473 — les deux choix se voient côte à côte', () => {
  it('chaque service connecté offre ses favoris ET son catalogue', () => {
    expect(sourcesDisponibles({ qobuz: statut(true), tidal: statut(true) }, null, true)).toEqual([
      'local', 'upnp', 'qobuz', 'catalogue:qobuz', 'tidal', 'catalogue:tidal',
    ]);
  });

  it('🔴 le drapeau reste OPTIONNEL : un écran dont le moteur ne suit pas se tait', () => {
    // `avecCatalogue` dit que le moteur SAIT honorer la valeur. Proposer une
    // case qu'il ignore, c'est refaire #1231. Par défaut, donc, pas de
    // catalogue — les deux éditeurs, eux, le demandent explicitement.
    expect(sourcesDisponibles({ qobuz: statut(true) })).toEqual(['local', 'upnp', 'qobuz']);
  });

  it('🔴 la bibliothèque n’a pas de catalogue distant', () => {
    // `catalogue:local` n'aurait aucun sens : il n'y a rien à interroger.
    const liste = sourcesDisponibles({ qobuz: statut(true) }, null, true);
    expect(liste).not.toContain('catalogue:local');
    expect(liste).not.toContain('catalogue:upnp');
  });

  it('un service déconnecté n’offre ni l’un ni l’autre', () => {
    expect(sourcesDisponibles({ qobuz: statut(false) }, null, true)).toEqual(['local', 'upnp']);
  });

  it('le libellé se lit, il ne montre pas la valeur brute', () => {
    expect(libelleSource('catalogue:qobuz', 'Bibliothèque', 'Catalogue {service}')).toBe(
      'Catalogue Qobuz',
    );
    expect(libelleSource('catalogue:youtube', 'x', 'Catalogue {service}')).toBe(
      'Catalogue YouTube',
    );
    // Sans gabarit traduit, un repli lisible plutôt que « catalogue:qobuz ».
    expect(libelleSource('catalogue:qobuz', 'x')).toBe('Catalogue Qobuz');
  });
});

describe('#4473 — la cible que le service saura chercher', () => {
  it('un artiste nommé par une ÉGALITÉ', () => {
    expect(
      cibleDuCatalogue([{ field: 'artist', op: '=', value: 'John Coltrane' }]),
    ).toBe('John Coltrane');
  });

  it('🔴 « contient » n’est pas une requête qu’un service sait honorer', () => {
    // Même règle que le serveur : accepter ici ce que le moteur refuse là-bas
    // rendrait 0 résultat sans un mot d'explication.
    expect(cibleDuCatalogue([{ field: 'artist', op: 'contains', value: 'Col' }])).toBeNull();
  });

  it('une valeur vide ne nomme rien', () => {
    expect(cibleDuCatalogue([{ field: 'artist', op: '=', value: '   ' }])).toBeNull();
  });

  it('l’artiste l’emporte sur l’album quand les deux sont là', () => {
    expect(
      cibleDuCatalogue([
        { field: 'album', op: '=', value: 'Blue Train' },
        { field: 'artist', op: '=', value: 'John Coltrane' },
      ]),
    ).toBe('John Coltrane');
  });

  it('l’album seul suffit', () => {
    expect(cibleDuCatalogue([{ field: 'album_title', op: '=', value: 'Blue Train' }])).toBe(
      'Blue Train',
    );
  });

  it('🔴 `title` est le champ que l’écran des collections écrit VRAIMENT', () => {
    // `CHAMPS` de `smartRegles.ts` nomme le titre d'album `title`, pas
    // `album` (libellé `smartCollection.fieldAlbumTitle`), et
    // `build_album_query` le traduit par `al.title`. Sans cette entrée,
    // « catalogue Qobuz + titre = Blue Train » aurait été averti à tort ici,
    // puis refusé par le serveur après coup.
    expect(cibleDuCatalogue([{ field: 'title', op: '=', value: 'Blue Train' }])).toBe('Blue Train');
    expect(manqueUneCible([
      { field: 'source', op: '=', value: 'catalogue:qobuz' },
      { field: 'title', op: '=', value: 'Blue Train' },
    ])).toBeNull();
  });

  it('les deux graphies d’opérateur des deux éditeurs', () => {
    // Les collections écrivent `op`, les playlists `operator`. Un seul des
    // deux lu, et la moitié de l'écran serait aveugle.
    expect(cibleDuCatalogue([{ field: 'artist', operator: '=', value: 'Miles' }])).toBe('Miles');
    expect(cibleDuCatalogue([{ field: 'artist', op: 'eq', value: 'Miles' }])).toBe('Miles');
  });
});

describe('#4473 — ce qui manque est dit AVANT d’enregistrer', () => {
  it('une source catalogue sans cible : on nomme le service', () => {
    expect(manqueUneCible([{ field: 'source', op: '=', value: 'catalogue:qobuz' }])).toBe('qobuz');
  });

  it('avec une cible : rien à signaler', () => {
    expect(
      manqueUneCible([
        { field: 'source', op: '=', value: 'catalogue:qobuz' },
        { field: 'artist', op: '=', value: 'John Coltrane' },
      ]),
    ).toBeNull();
  });

  it('🔴 les FAVORIS n’ont pas besoin de cible', () => {
    // `source = qobuz` sans artiste est parfaitement valide : c'est « tous mes
    // favoris Qobuz ». Avertir là serait un faux positif permanent.
    expect(manqueUneCible([{ field: 'source', op: '=', value: 'qobuz' }])).toBeNull();
    expect(manqueUneCible([{ field: 'source', op: '=', value: 'local' }])).toBeNull();
    expect(manqueUneCible([])).toBeNull();
  });
});

describe('#4473 — l’éditeur de COLLECTIONS propose le catalogue', () => {
  const vue = sansCommentaires(lire('src/components/v2/CollectionSmartEditeurV2.svelte'));

  it('il demande la liste AVEC les entrées de catalogue', () => {
    expect(vue).toContain('sourcesDisponibles(statutsServices, r.value, true)');
  });

  it('le choix porte son libellé traduit', () => {
    expect(vue).toContain("$t('v2.smart.sourceCatalogue' as any)");
  });

  it('la branche catalogue passe AVANT celle des favoris', () => {
    const cat = vue.indexOf("{#if serviceDuCatalogue(r.value ?? '')}");
    const fav = vue.indexOf("{:else if estSourceDeService(r.value ?? '')}");
    expect(cat, 'branche catalogue absente').toBeGreaterThan(-1);
    expect(fav, 'branche favoris absente').toBeGreaterThan(-1);
    expect(cat).toBeLessThan(fav);
    expect(vue).toContain('v2.smart.sourceCatalogueAide');
  });

  it('🔴 l’avertissement est CALCULÉ, pas écrit en dur', () => {
    // Une phrase toujours affichée, ou jamais, ne garde rien : elle doit
    // suivre les règles courantes.
    expect(vue).toContain('const catalogueSansCible = $derived(manqueUneCible(regles));');
    expect(vue).toContain('{#if catalogueSansCible}');
    expect(vue).toContain("$t('v2.smart.catalogueSansCible' as any)");
  });
});

// 🔴 Second volet de #4473 — le cas d'ORIGINE, `Test Qobuz Coltrane`, est une
// PLAYLIST. Le serveur y va désormais au catalogue
// (`smart_playlists::avec_pistes_de_catalogue`) ; l'éditeur doit donc offrir le
// choix, et non plus dire qu'il ne rendra rien.
describe('#4473 — l’éditeur de PLAYLISTS le propose AUSSI', () => {
  const vue = sansCommentaires(lire('src/components/v2/PlaylistSmartEditeurV2.svelte'));

  it('🔴 il demande la liste AVEC les entrées de catalogue', () => {
    expect(vue).toContain('sourcesDisponibles(statutsServices, r.value, true)');
  });

  it('le choix porte son libellé traduit', () => {
    expect(vue).toContain("$t('v2.smart.sourceCatalogue' as any)");
  });

  it('la branche catalogue passe AVANT celle des favoris, et dit quoi chercher', () => {
    const cat = vue.indexOf("{#if serviceDuCatalogue(r.value ?? '')}");
    const fav = vue.indexOf("{:else if estSourceDeService(r.value ?? '')}");
    expect(cat, 'branche catalogue absente').toBeGreaterThan(-1);
    expect(fav, 'branche favoris absente').toBeGreaterThan(-1);
    expect(cat).toBeLessThan(fav);
    expect(vue).toContain('v2.smart.sourceCatalogueAide');
  });

  it('🔴 l’avertissement est CALCULÉ, et lit les règles comme des PISTES', () => {
    // `'piste'` n'est pas un détail : sans lui, « catalogue Qobuz + titre =
    // Giant Steps » passerait ici (titre lu comme un album) et le serveur le
    // refuserait après coup.
    expect(vue).toContain("const catalogueSansCible = $derived(manqueUneCible(regles, 'piste'));");
    expect(vue).toContain('{#if catalogueSansCible}');
    expect(vue).toContain("$t('v2.smart.catalogueSansCible' as any)");
  });

  it('🔴 la phrase « le catalogue ne marche pas ici » a disparu partout', () => {
    // Elle est devenue fausse. Une phrase périmée est pire qu'absente : elle
    // dissuade d'une source qui fonctionne.
    expect(vue).not.toContain('catalogueHorsPlaylist');
  });
});

describe('#4473 — `title` ne veut pas dire la même chose des deux côtés', () => {
  it('🔴 dans une COLLECTION, `title` est le titre de l’ALBUM', () => {
    expect(cibleDuCatalogue([{ field: 'title', op: '=', value: 'Blue Train' }], 'album')).toBe(
      'Blue Train',
    );
  });

  it('🔴 dans une PLAYLIST, `title` est le titre de la PISTE : jamais une cible', () => {
    // `regles_sql::colonne_piste` le traduit par `t.title`. Aucun service ne
    // cherche « la piste intitulée X » dans tout son catalogue ; le serveur
    // s'en sert pour TRIER ce que l'artiste ou l'album a rendu.
    expect(cibleDuCatalogue([{ field: 'title', op: '=', value: 'Giant Steps' }], 'piste')).toBeNull();
    expect(
      manqueUneCible(
        [
          { field: 'source', op: '=', value: 'catalogue:qobuz' },
          { field: 'title', op: '=', value: 'Giant Steps' },
        ],
        'piste',
      ),
    ).toBe('qobuz');
  });

  it('l’album nommé reste une cible des deux côtés', () => {
    for (const objet of ['album', 'piste'] as const) {
      expect(cibleDuCatalogue([{ field: 'album', op: '=', value: 'Blue Train' }], objet)).toBe(
        'Blue Train',
      );
      expect(cibleDuCatalogue([{ field: 'artist', op: '=', value: 'Coltrane' }], objet)).toBe(
        'Coltrane',
      );
    }
  });
});

describe('#4473 — les onze langues', () => {
  const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

  it('les trois libellés existent partout', () => {
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const k of [
        '"v2.smart.sourceCatalogue":',
        '"v2.smart.sourceCatalogueAide":',
        '"v2.smart.catalogueSansCible":',
      ]) {
        expect(src, `${l} — ${k}`).toContain(k);
      }
      // 🔴 Retirée du même geste : elle disait que le catalogue ne marche pas
      // dans une playlist, ce qui est faux depuis le second volet.
      expect(src, `${l} — clé périmée`).not.toContain('"v2.smart.catalogueHorsPlaylist":');
    }
  });

  it('🔴 le libellé du choix porte {service}', () => {
    // Sans le marqueur, le remplacement ne se fait pas et l'utilisateur lit
    // « Catalogue {service} » tel quel.
    for (const l of LANGUES) {
      const ligne =
        lire(`src/lib/locales/${l}.ts`)
          .split('\n')
          .find((x) => x.includes('"v2.smart.sourceCatalogue":')) ?? '';
      expect(ligne, `${l}`).toContain('{service}');
    }
  });
});
