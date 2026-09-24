// La ligne de chiffres CONFIGURABLE de l'accueil — tune-server-rust#4527.
//
// Bertrand, 19/09/2026, sur la maquette de Levente : « Chantier homepage.
// Chiffres de la library », « Ce sera une ligne configurable dans la
// homepage », « Des chiffres (bibliothèque, écoutes, …). L'unité de taille de
// bibliothèque peut être le To si > 1000 Go ».
//
// Les valeurs de ce banc sont celles MESURÉES sur son .18 (0.9.155) le
// 19/09/2026, pas des valeurs inventées :
//
//   bibliothèque  4389 albums · 1638 artistes · 47 118 titres · 115 genres
//                 12 511 671 291 ms · 1 922 005 252 389 octets
//   écoute        1110 lectures · 513 titres · 341 artistes · 300 011 800 ms
import { describe, expect, it } from 'vitest';
import {
  CHIFFRES,
  CHOIX_DEFAUT,
  basculer,
  cartes,
  chiffreParId,
  choixAEnregistrer,
  formaterNombre,
  formaterOctets,
  sourcesNecessaires,
  type SourcesChiffres,
} from '../chiffresAccueil';

const LE_18: SourcesChiffres = {
  bibliotheque: {
    albums: 4389, artists: 1638, tracks: 47118,
    total_duration_ms: 12_511_671_291, total_size_bytes: 1_922_005_252_389,
  },
  ecoute: {
    total_listens: 1110, unique_tracks: 513, unique_artists: 341,
    total_duration_ms: 300_011_800,
  },
  genres: 115,
};

describe('le catalogue', () => {
  it('chaque chiffre a un identifiant unique', () => {
    const ids = CHIFFRES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('🔴 aucun libellé écrit en dur : tout passe par une clé de traduction', () => {
    for (const c of CHIFFRES) expect(c.cleLibelle, c.id).toMatch(/^v2\.home\./);
  });

  it('le choix par défaut ne cite que des chiffres qui existent', () => {
    for (const id of CHOIX_DEFAUT) expect(chiffreParId(id), id).not.toBeNull();
  });

  it('il mêle les deux familles, comme Bertrand l’a demandé', () => {
    const familles = new Set(CHOIX_DEFAUT.map((id) => chiffreParId(id)!.famille));
    expect(familles).toEqual(new Set(['bibliotheque', 'ecoute']));
  });
});

describe('les formats', () => {
  it('🔴 les nombres suivent la LANGUE', () => {
    // L'écran affichait « 4389 », sans séparateur.
    expect(formaterNombre(1110, 'fr')).toBe('1 110');
    expect(formaterNombre(1110, 'en')).toBe('1,110');
  });

  it('🔴 au-delà de 1000 Go, la taille passe en To', () => {
    // 1 922 005 252 389 octets s'écrivaient « 1790.0 Gio » — point anglais
    // dans une page française, et une unité que personne n'emploie.
    expect(formaterOctets(1_922_005_252_389, 'fr')).toBe('1,9 To');
    expect(formaterOctets(1_922_005_252_389, 'en')).toBe('1.9 To');
  });

  it('en dessous de 1000 Go, elle reste en Go', () => {
    expect(formaterOctets(850_000_000_000, 'fr')).toBe('850 Go');
    expect(formaterOctets(999_400_000_000, 'fr')).toBe('999,4 Go');
  });

  it('🔴 la bascule se fait bien À 1000 Go, pas à 1024', () => {
    // Unités décimales : celles que Bertrand a nommées, et celles des disques.
    expect(formaterOctets(1_000_000_000_000, 'fr')).toContain('To');
    expect(formaterOctets(999_000_000_000, 'fr')).toContain('Go');
  });
});

describe('les cartes rendues, sur les chiffres du .18', () => {
  it('le choix par défaut donne cinq cartes justes', () => {
    const v = cartes(CHOIX_DEFAUT, LE_18, 'fr');
    expect(v.map((c) => c.texte)).toEqual([
      '4 389',   // albums
      '1 638',   // artistes
      '1 110',   // lectures
      '83',           // heures écoutées : 300 011 800 ms
      '1,9 To',       // taille
    ]);
  });

  it('l’ordre CHOISI est respecté, pas celui du catalogue', () => {
    const v = cartes(['taille', 'albums'], LE_18, 'fr');
    expect(v.map((c) => c.id)).toEqual(['taille', 'albums']);
  });

  it('la durée de la BIBLIOTHÈQUE n’est pas celle écoutée', () => {
    // 3475 h de musique possédée, 83 h écoutées : deux cartes distinctes.
    const v = cartes(['duree', 'heures-ecoutees'], LE_18, 'fr');
    expect(v.map((c) => c.texte)).toEqual(['3 475', '83']);
  });

  it('🔴 un chiffre que la source ne porte pas est ÉCARTÉ, pas mis à zéro', () => {
    // `unique_genres` n'existe que depuis #4527, non promu : tant que le
    // serveur ne le rend pas, « 0 genre écouté » serait un mensonge.
    const v = cartes(['genres-ecoutes', 'albums'], LE_18, 'fr');
    expect(v.map((c) => c.id)).toEqual(['albums']);
  });

  it('et il apparaît dès que le serveur le rend', () => {
    const avec = { ...LE_18, ecoute: { ...LE_18.ecoute, unique_genres: 40 } };
    const v = cartes(['genres-ecoutes'], avec, 'fr');
    expect(v).toHaveLength(1);
    expect(v[0].texte).toBe('40');
  });

  it('🔴 un identifiant INCONNU est ignoré sans faire tomber la ligne', () => {
    const v = cartes(['albums', 'chiffre-dun-futur-serveur', 'artistes'], LE_18, 'fr');
    expect(v.map((c) => c.id)).toEqual(['albums', 'artistes']);
  });

  it('sans aucune source, la ligne est vide et ne casse pas', () => {
    expect(cartes(CHOIX_DEFAUT, {}, 'fr')).toEqual([]);
  });

  it('chaque carte porte son icône et sa destination', () => {
    const v = cartes(['albums', 'taille'], LE_18, 'fr');
    expect(v[0].icone).toBeTruthy();
    expect(v[0].vue).toBe('library');
    // La taille n'ouvre aucun écran : rien à y montrer.
    expect(v[1].vue).toBeNull();
  });
});

describe('n’interroger que ce qu’on affiche', () => {
  it('🔴 pas de carte de genre : pas d’appel à /library/genres', () => {
    expect(sourcesNecessaires(['albums', 'lectures'])).toEqual({
      bibliotheque: true, ecoute: true, genres: false,
    });
  });

  it('une carte de genre le réclame', () => {
    expect(sourcesNecessaires(['genres']).genres).toBe(true);
  });

  it('les genres ÉCOUTÉS viennent de l’écoute, pas de /library/genres', () => {
    expect(sourcesNecessaires(['genres-ecoutes'])).toEqual({
      bibliotheque: false, ecoute: true, genres: false,
    });
  });

  it('un choix vide n’interroge rien', () => {
    expect(sourcesNecessaires([])).toEqual({
      bibliotheque: false, ecoute: false, genres: false,
    });
  });
});

/*
 * ── LOCAL ET RÉSEAU (Bertrand, 24/09/2026) ───────────────────────────────
 *
 * « Les chiffres de la bibliothèque mélangent les fichiers locaux et les
 * serveurs du réseau. Je veux pouvoir les distinguer. »
 *
 * Les deux charges de ce banc sont MESURÉES le 24/09/2026, pas inventées :
 *
 *   .18 (0.9.162, SQLite)    96 519 titres = 47 079 locaux + 49 440 réseau
 *                             9 430 albums =  3 938 locaux +  5 492 réseau
 *   .15 (0.9.162, Postgres)  50 772 titres, TOUS locaux — et la clé `upnp`
 *                            n'y est pas à zéro : elle n'existe pas.
 */
const LE_18_VENTILE: SourcesChiffres = {
  bibliotheque: {
    albums: 9430, artists: 2626, tracks: 96519,
    albums_by_source: { local: 3938, upnp: 5492 },
    tracks_by_source: { local: 47079, upnp: 49440 },
    total_duration_ms: 25_621_576_732, total_size_bytes: 3_917_133_799_137,
  },
};

/** Le .15 : une bibliothèque sans AUCUN serveur multimédia. */
const LE_15_SANS_RESEAU: SourcesChiffres = {
  bibliotheque: {
    albums: 5092, artists: 1766, tracks: 50772,
    albums_by_source: { local: 5092 },
    tracks_by_source: { local: 50772 },
    total_duration_ms: 13_508_414_988, total_size_bytes: 2_111_386_661_625,
  },
};

const PAR_SOURCE = ['titres-locaux', 'titres-reseau', 'albums-locaux', 'albums-reseau'];

describe('distinguer le local du réseau', () => {
  it('la ventilation s’affiche quand le serveur la porte', () => {
    const v = cartes(['titres', ...PAR_SOURCE], LE_18_VENTILE, 'fr');
    expect(v.map((c) => c.texte)).toEqual([
      '96 519',  // le total, inchangé
      '47 079',  // titres locaux
      '49 440',  // titres sur le réseau
      '3 938',   // albums locaux
      '5 492',   // albums sur le réseau
    ]);
  });

  it('🔴 les deux parts font bien le total que la ligne affichait seul', () => {
    const b = LE_18_VENTILE.bibliotheque as any;
    expect(b.tracks_by_source.local + b.tracks_by_source.upnp).toBe(b.tracks);
    expect(b.albums_by_source.local + b.albums_by_source.upnp).toBe(b.albums);
  });

  it('🔴 un serveur SANS ventilation n’affiche aucune carte — et surtout pas « 0 »', () => {
    // `LE_18` est la charge d'un serveur plus ancien : ni `tracks_by_source`
    // ni `albums_by_source`. « 0 titre local » affirmerait que la
    // bibliothèque n'a pas un seul fichier. On n'affiche rien.
    const v = cartes(['titres', ...PAR_SOURCE], LE_18, 'fr');
    expect(v.map((c) => c.id)).toEqual(['titres']);
    expect(v.map((c) => c.texte)).not.toContain('0');
  });

  it('🔴 sans serveur multimédia, la carte RÉSEAU s’efface ; la locale reste', () => {
    // Le .15 rend `{"local": 50772}` : la clé `upnp` est ABSENTE, pas à zéro.
    // « 0 titre sur le réseau » encombrerait la ligne de presque tout le monde.
    const v = cartes(PAR_SOURCE, LE_15_SANS_RESEAU, 'fr');
    expect(v.map((c) => c.id)).toEqual(['titres-locaux', 'albums-locaux']);
    expect(v.map((c) => c.texte)).toEqual(['50 772', '5 092']);
  });

  it('une ventilation qui n’est pas un dictionnaire ne fait pas tomber la ligne', () => {
    const tordu: SourcesChiffres = {
      bibliotheque: { tracks: 10, tracks_by_source: 47079 },
    };
    expect(cartes(['titres-locaux', 'titres'], tordu, 'fr').map((c) => c.id)).toEqual(['titres']);
  });

  it('les nouvelles cartes portent icône, destination et clé de traduction', () => {
    for (const id of PAR_SOURCE) {
      const c = chiffreParId(id)!;
      expect(c, id).not.toBeNull();
      expect(c.famille, id).toBe('bibliotheque');
      expect(c.icone, id).toBeTruthy();
      expect(c.vue, id).toBe('library');
    }
  });

  it('elles réclament /library/stats, et pas /library/genres', () => {
    expect(sourcesNecessaires(PAR_SOURCE)).toEqual({
      bibliotheque: true, ecoute: false, genres: false,
    });
  });

  it('🔴 la taille et la durée n’ont AUCUNE ventilation : on n’en invente pas', () => {
    // `/library/stats` ne porte ni `total_size_bytes_by_source` ni
    // `total_duration_ms_by_source`. Aucune carte ne prétend le contraire.
    const inventees = CHIFFRES.filter(
      (c) => /locaux|reseau/.test(c.id) && (c.format === 'octets' || c.format === 'heures'),
    );
    expect(inventees.map((c) => c.id)).toEqual([]);
  });

  it('🔴 AUCUN choix déjà enregistré n’est réécrit : le catalogue s’allonge, voilà tout', () => {
    // Le point qui décide du dessin retenu. Ajouter au catalogue ne touche
    // pas l'accueil de ceux qui ont déjà composé leur ligne.
    const enregistre = ['albums', 'artistes', 'lectures', 'heures-ecoutees', 'taille'];
    expect(choixAEnregistrer(enregistre, enregistre)).toEqual(enregistre);
    expect(cartes(enregistre, LE_18_VENTILE, 'fr').map((c) => c.id)).toEqual([
      'albums', 'artistes', 'taille',
    ]);
  });

  it('🔴 et le choix PAR DÉFAUT reste ce qu’il était : rien n’arrive tout seul', () => {
    for (const id of PAR_SOURCE) expect(CHOIX_DEFAUT).not.toContain(id);
  });
});

describe('composer sa ligne', () => {
  it('cocher ajoute à la FIN, décocher retire', () => {
    expect(basculer(['albums'], 'taille')).toEqual(['albums', 'taille']);
    expect(basculer(['albums', 'taille'], 'albums')).toEqual(['taille']);
  });

  it('🔴 le maximum ne s’ajoute pas en silence au-delà', () => {
    const six = ['albums', 'artistes', 'titres', 'genres', 'duree', 'taille'];
    expect(basculer(six, 'lectures')).toEqual(six);
  });

  it('mais décocher reste toujours possible au maximum', () => {
    const six = ['albums', 'artistes', 'titres', 'genres', 'duree', 'taille'];
    expect(basculer(six, 'genres')).toHaveLength(5);
  });

  it('un identifiant inconnu ne s’ajoute pas', () => {
    expect(basculer(['albums'], 'inventé')).toEqual(['albums']);
  });
});

describe('ce qui est enregistré', () => {
  it('🔴 un identifiant INCONNU de cette version est CONSERVÉ', () => {
    // Un chiffre ajouté par une version plus récente ne doit pas disparaître
    // parce qu'une plus ancienne a ouvert l'accueil. Défaut déjà payé sur la
    // disposition des widgets (#987).
    const ecrit = choixAEnregistrer(['albums'], ['albums', 'chiffre-dune-version-future']);
    expect(ecrit).toContain('chiffre-dune-version-future');
  });

  it('le choix courant vient en premier, l’inconnu à la suite', () => {
    expect(choixAEnregistrer(['taille'], ['albums-inconnu'])).toEqual([
      'taille', 'albums-inconnu',
    ]);
  });

  it('un chiffre CONNU décoché est bien retiré — ce n’est pas un inconnu', () => {
    // Sinon décocher « albums » ne servirait à rien : il reviendrait par la
    // porte des inconnus.
    expect(choixAEnregistrer(['taille'], ['albums', 'taille'])).toEqual(['taille']);
  });

  it('aucun doublon quand l’inconnu est déjà choisi', () => {
    const r = choixAEnregistrer(['x-inconnu'], ['x-inconnu']);
    expect(r).toEqual(['x-inconnu']);
  });

  it('sans rien d’enregistré, on écrit le choix tel quel', () => {
    expect(choixAEnregistrer(['albums'], null)).toEqual(['albums']);
  });
});
