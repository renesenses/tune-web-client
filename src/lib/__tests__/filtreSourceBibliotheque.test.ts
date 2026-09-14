/**
 * La pilule « Source ▾ » de la Bibliothèque (#4152).
 *
 * ## Ce que Bertrand demande, le 14/09/2026
 *
 * Un menu de plus dans la barre de filtres : **Toutes les sources**, **Local**,
 * puis **une entrée par serveur UPnP indexé**, chacune avec son compte. Le
 * libellé d'une entrée UPnP est le **nom que le serveur s'annonce** — « Asset
 * UPnP: Mac-Studio-6 », un Sonos —, jamais `upnp` ni une IP quand un nom existe.
 *
 * ## Ce que mesure cette épreuve
 *
 * Deux choses, et elles ne se remplacent pas :
 *
 *  1. le **comptage et le filtrage** (`comptesProvenance`, `correspond`) —
 *     testés sur des données, pas sur du balisage ;
 *  2. la **présence effective de la pilule** dans la source de `LibraryV2` —
 *     un compteur juste dont personne ne peut se servir ne filtre rien. Même
 *     patron que `bibliothequeFiltresAtteignables.test.ts`, et même réserve :
 *     lire la source empêche la régression, cela ne prouve pas le rendu.
 *
 * ## Le banc : ce qu'il porte, et pourquoi
 *
 * Deux serveurs UPnP distincts, et pas un seul. Avec un serveur unique, « une
 * entrée par serveur » et « une entrée pour tout l'UPnP » rendraient la même
 * chose et l'épreuve ne les départagerait pas — c'est exactement la confusion
 * que `albums_by_source` entretient côté serveur, qui ventile par FAMILLE et
 * rend une seule clé `upnp`.
 *
 * Le format de `source_id` est celui que l'indexation pose :
 * `'<udn>|<condensat>'` (#4129). Mesuré sur le `.18` le 14/09/2026, les 51
 * albums distants portent tous `uuid:258FC2D5-E2C3-B734-0-123456789abc|…`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  correspond, comptesProvenance, comptesFormat,
  type FiltresBibliotheque, type Outils,
} from '../facettesBibliotheque';
import type { Album, Source } from '../types';

/** La règle de l'écran, recopiée ici telle quelle — voir `provenanceDe`. */
const provenanceDe = (a: Album): string => {
  const src = (a.source ?? 'local').trim() || 'local';
  if (src === 'local') return 'local';
  const udn = (a.source_id ?? '').split('|')[0]?.trim();
  return udn && udn.length < (a.source_id ?? '').trim().length ? `${src}:${udn}` : src;
};

const OUTILS: Outils = {
  qualiteDe: () => true,
  anneeDe: (a) => a.year ?? null,
  plier: (s) => (s ?? '').toLowerCase(),
  provenanceDe,
};

const AUCUN: FiltresBibliotheque = {
  qualite: null, frequence: null, annee: null, format: null, profondeur: null,
  recherche: '', compilation: null, provenance: null,
};

const ASSET = 'uuid:258FC2D5-E2C3-B734-0-123456789abc';
const SONOS = 'uuid:RINCON_B8E937B44D2201400_MS';

const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;

/** Trois locaux, deux Asset, un Sonos — et un Qobuz, qui n'est pas un serveur. */
const BIBLIO: Album[] = [
  alb({ id: 1, title: 'A', format: 'FLAC' }),
  alb({ id: 2, title: 'B', format: 'FLAC', source: 'local' }),
  // `source: ''` — une base migrée en porte. `as Source` : la chaîne vide
  // n'est pas une valeur du contrat, c'est un accident de migration, et le
  // banc doit prouver qu'elle retombe bien sur LOCAL.
  alb({ id: 3, title: 'C', format: 'WAV', source: '' as Source }),
  alb({ id: 4, title: 'D', format: 'FLAC', source: 'upnp', source_id: `${ASSET}|d50e9dad` }),
  alb({ id: 5, title: 'E', format: 'MP3', source: 'upnp', source_id: `${ASSET}|aa11bb22` }),
  alb({ id: 6, title: 'F', format: 'FLAC', source: 'upnp', source_id: `${SONOS}|cc33dd44` }),
  alb({ id: 7, title: 'G', format: 'FLAC', source: 'qobuz', source_id: '12345' }),
];

/**
 * Plancher du détecteur : un banc appauvri doit ROUGIR, pas passer à vide.
 *
 * Sans DEUX serveurs UPnP, « une entrée par serveur » et « une entrée pour
 * tout l'UPnP » sont indiscernables ; sans album local, « Local » n'a rien à
 * compter.
 */
it('le banc porte bien deux serveurs distincts et des locaux', () => {
  const cles = new Set(BIBLIO.map(provenanceDe));
  expect([...cles].filter((c) => c.startsWith('upnp:')).length).toBeGreaterThanOrEqual(2);
  expect(cles.has('local')).toBe(true);
});

describe('provenanceDe — la règle qui désigne UN serveur', () => {
  it('source absente, vide ou « local » valent toutes LOCAL', () => {
    // Une base migrée porte des NULL et des chaînes vides ; les trois cas
    // doivent tomber dans le même seau, sinon le menu montre trois entrées
    // pour une seule bibliothèque.
    expect(BIBLIO.slice(0, 3).map(provenanceDe)).toEqual(['local', 'local', 'local']);
  });

  it('l’UDN est le préfixe de source_id, et il SÉPARE les serveurs', () => {
    expect(provenanceDe(BIBLIO[3])).toBe(`upnp:${ASSET}`);
    expect(provenanceDe(BIBLIO[5])).toBe(`upnp:${SONOS}`);
    expect(provenanceDe(BIBLIO[3])).not.toBe(provenanceDe(BIBLIO[5]));
  });

  it('une source distante SANS UDN retombe sur sa famille, pas sur un UDN inventé', () => {
    // Qobuz, Tidal, radio : `source_id` n'y porte pas de séparateur. Les ranger
    // sous un UDN fabriqué ferait apparaître un « serveur » qui n'existe pas.
    expect(provenanceDe(BIBLIO[6])).toBe('qobuz');
  });
});

describe('comptesProvenance — le menu et ses comptes', () => {
  it('une entrée par provenance présente, Local en tête', () => {
    expect(comptesProvenance(BIBLIO, AUCUN, OUTILS)).toEqual([
      ['local', 3],
      [`upnp:${ASSET}`, 2],
      ['qobuz', 1],
      [`upnp:${SONOS}`, 1],
    ]);
  });

  it('Local reste en tête même quand un serveur est plus fourni', () => {
    const biblio = [
      BIBLIO[0],
      ...Array.from({ length: 5 }, (_, i) =>
        alb({ id: 100 + i, title: `X${i}`, source: 'upnp', source_id: `${ASSET}|x${i}` })),
    ];
    expect(comptesProvenance(biblio, AUCUN, OUTILS)[0]).toEqual(['local', 1]);
  });

  it('une provenance ABSENTE n’a pas d’entrée — un menu ne propose pas du vide', () => {
    const cles = comptesProvenance([BIBLIO[0]], AUCUN, OUTILS).map(([c]) => c);
    expect(cles).toEqual(['local']);
  });
});

describe('la facette se compte SANS elle-même', () => {
  it('choisir un serveur ne met pas les autres à zéro', () => {
    // Sans cette règle, choisir « Asset » mettrait « Sonos 0 » et le menu
    // deviendrait un cul-de-sac : le seul geste possible serait de revenir en
    // arrière. C'est la règle de toutes les facettes de cet écran.
    const f: FiltresBibliotheque = { ...AUCUN, provenance: `upnp:${ASSET}` };
    expect(comptesProvenance(BIBLIO, f, OUTILS)).toEqual([
      ['local', 3],
      [`upnp:${ASSET}`, 2],
      ['qobuz', 1],
      [`upnp:${SONOS}`, 1],
    ]);
  });

  it('mais elle borne bien les AUTRES facettes', () => {
    // Le pendant exact : Format doit se compter DANS la source choisie, sinon
    // la pilule promet des albums que la grille ne rendra pas.
    const f: FiltresBibliotheque = { ...AUCUN, provenance: `upnp:${ASSET}` };
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 1], ['MP3', 1]]);
  });
});

describe('correspond — ce que la grille rend', () => {
  it('un serveur choisi ne rend QUE ses albums', () => {
    const f: FiltresBibliotheque = { ...AUCUN, provenance: `upnp:${ASSET}` };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['D', 'E']);
  });

  it('« Local » ne rend que le disque, distant exclu', () => {
    const f: FiltresBibliotheque = { ...AUCUN, provenance: 'local' };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['A', 'B', 'C']);
  });

  it('« Toutes les sources » est l’ABSENCE de filtre', () => {
    expect(BIBLIO.filter((a) => correspond(a, AUCUN, OUTILS)).length).toBe(BIBLIO.length);
  });

  it('la source se CUMULE avec les autres filtres', () => {
    const f: FiltresBibliotheque = { ...AUCUN, provenance: `upnp:${ASSET}`, format: 'FLAC' };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.title)).toEqual(['D']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La pilule existe, et elle est de la même facture que ses voisines.
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_LIBRARYV2 = readFileSync(
  fileURLToPath(new URL('../../components/v2/LibraryV2.svelte', import.meta.url)),
  'utf8',
);

describe('la pilule dans la barre de filtres', () => {
  it('elle existe, et s’ouvre au CLIC comme ses voisines', () => {
    expect(SOURCE_LIBRARYV2).toContain("ddToggle('provenance')");
    expect(SOURCE_LIBRARYV2).toContain("class:open={ddOpen === 'provenance'}");
    // `aria-haspopup` : la même mécanique que Qualité/Format, donc atteignable
    // au clavier et au toucher — voir `bibliothequeFiltresAtteignables`.
    expect(SOURCE_LIBRARYV2).toMatch(/aria-expanded=\{ddOpen === 'provenance'\}/);
  });

  it('elle porte « Toutes les sources », et c’est ce qui la remet à zéro', () => {
    expect(SOURCE_LIBRARYV2).toContain("v2.lib.sourceAll");
    expect(SOURCE_LIBRARYV2).toContain('fProvenance = null;');
  });

  it('le bouton « Tout » la remet à zéro comme les autres filtres', () => {
    const reset = SOURCE_LIBRARYV2.match(/function reset\(\)[^\n]*/)?.[0] ?? '';
    expect(reset).toContain('fProvenance = null');
    // …et il ne s'allume pas tant qu'une source est choisie, sinon il
    // prétendrait qu'aucun filtre n'est posé.
    expect(SOURCE_LIBRARYV2).toContain('&& !fProvenance} onclick={reset}');
  });

  it('elle se tait au-dessous de DEUX provenances', () => {
    // Sur une bibliothèque purement locale, un menu à une entrée ne filtre
    // rien. Même règle que « Format », qui se tait au-dessous de deux valeurs.
    expect(SOURCE_LIBRARYV2).toContain('{#if provenances.length > 1}');
  });

  it('le libellé d’un serveur vient du REGISTRE, pas de l’UDN ni d’« upnp »', () => {
    // Bertrand : le nom que le serveur s'annonce, jamais `upnp` ni une IP
    // quand un nom existe. Le registre est `/network/media-servers`, dont le
    // champ `id` est ce même UDN.
    expect(SOURCE_LIBRARYV2).toContain('api.getMediaServers()');
    expect(SOURCE_LIBRARYV2).toContain('nomsServeurs[udn]');
  });
});

describe('les libellés sont traduits', () => {
  it('les trois clés existent en français ET en anglais', async () => {
    const fr = (await import('../locales/fr')).default as Record<string, string>;
    const en = (await import('../locales/en')).default as Record<string, string>;
    for (const cle of ['v2.lib.source', 'v2.lib.sourceAll', 'v2.lib.sourceLocal']) {
      expect(fr[cle], `${cle} absente du français`).toBeTruthy();
      expect(en[cle], `${cle} absente de l’anglais`).toBeTruthy();
    }
  });
});
