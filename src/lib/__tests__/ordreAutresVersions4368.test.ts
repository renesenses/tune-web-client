// @vitest-environment jsdom
//
// tune-server-rust#4368 — « Le problème est l'ordre de présentation qui n'est
// pas respectée: (en 1er: local puis Qobuz / Tidal / Youtube et en dernier
// Bandcamp). […] Dans l'exemple suivant, on a bien local en 1er mais ensuite
// on a du Qobuz puis Bancamp puis Qobuz. Il faut grouper par source »
// (FabienM, fil 1829, 0.9.152, point 11).
//
// L'entrelacement qu'il décrit est le barème de PERTINENCE du serveur
// (`routes/versions.rs`, #2372), un arbitrage et non un défaut. Bertrand
// tranche le 20/09/2026 : l'ordre devient CONFIGURABLE, le classement par
// pertinence reste le défaut.
//
// 🔴 23/09/2026 — Bertrand tranche à nouveau : le DÉFAUT bascule sur le
// GROUPEMENT PAR SOURCE. Les deux modes restent, le sélecteur ne bouge pas ;
// c'est l'installation qui n'a jamais choisi qui s'ouvre désormais groupée.
// Ce fichier reste la garde UNIQUE de #4368 : on y déplace ce que la bascule
// déplace, on n'écrit pas une seconde garde qui dirait le contraire.
//
// 🔴 CE TÉMOIN MONTE LE VRAI PANNEAU, bascule le réglage, et lit l'ordre
// RENDU — pas celui qu'une fonction rendrait. Une garde qui n'appellerait que
// `ordonnerVersionsService` ne prouverait pas que le panneau s'en sert, ni
// qu'il écoute la préférence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import {
  ORDRE_VERSIONS_DEFAUT, estOrdreVersions, ordonnerVersionsService,
} from '../versionsPiste';
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

const TRACK = 25930;

function version(service: string, id: string, album: string) {
  return {
    kind: 'version' as const, service, source_id: id, album_id: `a${id}`,
    cover_path: null, title: 'Lovely Day', artist_name: 'Bill Withers',
    album_title: album,
  };
}

/**
 * La capture de FabienM, telle qu'il la décrit : Qobuz, puis une longue série
 * Bandcamp, puis Qobuz à nouveau. C'est l'ordre du SERVEUR — par score — et le
 * témoin le prend tel quel, sans le retrier.
 */
const STREAMING = [
  version('qobuz', '1', 'New Life Generation'),
  version('bandcamp', '2', 'Naomi Sample'),
  version('bandcamp', '3', 'Sebjak, Fahlberg'),
  version('tidal', '4', 'Trus’me'),
  version('bandcamp', '5', 'Dream Wife'),
  version('qobuz', '6', 'Lullaby Players'),
  version('deezer', '7', 'Emigre'),
];

const CHARGE = {
  track_id: TRACK,
  title: 'Lovely Day',
  artist_name: 'Bill Withers',
  played_album: 'Menagerie',
  versions: [
    { album_id: 4411, album_title: 'Menagerie', artist_name: 'Bill Withers',
      cover_path: null, duration_ms: 257000, track_id: 46940 },
  ],
  streaming: STREAMING,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let charge: unknown = CHARGE;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

beforeEach(() => {
  charge = CHARGE;
  locale.set('fr');
  try { localStorage.clear(); } catch { /* ignore */ }
  preferences.update((p) => ({ ...p, ordreAutresVersions: ORDRE_VERSIONS_DEFAUT }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const c = url.includes(`/library/tracks/${TRACK}/versions`) ? charge : {};
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

async function ouvrir() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(VersionsPistePanneau, {
    target: hote, props: { trackId: TRACK, titre: 'Lovely Day', onClose: () => {} },
  });
  await souffler();
}

/** L'album de chaque tuile, dans l'ordre où l'écran les dessine. */
function albumsRendus(): string[] {
  return [...document.querySelectorAll('.tuile .ti')].map((e) => (e.textContent ?? '').trim());
}

/** La source de chaque tuile de SERVICE, dans l'ordre rendu — lue sur la puce
 *  `<ServiceBadge>`, qui est ce que l'utilisateur voit sur la tuile. */
function sourcesRendues(): string[] {
  return [...document.querySelectorAll('.tuile .service-badge')]
    .map((e) => (e.textContent ?? '').trim().toLowerCase());
}

/** L’ordre RENDU par le serveur, tel quel — l’entrelacement de la capture. */
const ORDRE_SERVEUR = ['qobuz', 'bandcamp', 'bandcamp', 'tidal', 'bandcamp', 'qobuz', 'deezer'];
/** Le même lot, groupé : Qobuz, Tidal, l’inconnu, puis Bandcamp en dernier. */
const ORDRE_GROUPE = ['qobuz', 'qobuz', 'tidal', 'deezer', 'bandcamp', 'bandcamp', 'bandcamp'];

describe('#4368 — l’ordre des « Autres versions » est configurable', () => {
  it('contre-épreuve du montage : les huit tuiles sont bien rendues', async () => {
    await ouvrir();
    // 1 version locale + 7 de service.
    expect(albumsRendus()).toHaveLength(8);
    expect(sourcesRendues()).toHaveLength(7);
  });

  it('🔴 LE DÉFAUT est le GROUPEMENT PAR SOURCE (Bertrand, 23/09/2026)', async () => {
    expect(ORDRE_VERSIONS_DEFAUT,
      'le défaut n’est plus celui que Bertrand a tranché le 23/09/2026').toBe('source');
    await ouvrir();
    expect(sourcesRendues(),
      'le panneau ne s’ouvre pas groupé : le défaut n’a pas atteint l’écran')
      .toEqual(ORDRE_GROUPE);
  });

  it('🔴 PAR SOURCE : groupé, Qobuz avant Bandcamp, Bandcamp en dernier', async () => {
    await ouvrir();
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'source' }));
    await souffler();
    expect(sourcesRendues(),
      'le panneau n’a pas suivi le réglage, ou n’a pas groupé dans l’ordre demandé')
      .toEqual(ORDRE_GROUPE);
  });

  it('🔴 PAR PERTINENCE (choix explicite) : le barème du serveur (#2372), intact', async () => {
    await ouvrir();
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'pertinence' }));
    await souffler();
    expect(sourcesRendues(),
      'le mode « par pertinence » ne rend plus l’ordre du serveur : le barème #2372 est perdu')
      .toEqual(ORDRE_SERVEUR);
  });

  it('les deux modes rendent bien des ordres DIFFÉRENTS (sans quoi le réglage serait inerte)', async () => {
    await ouvrir();
    const groupe = sourcesRendues().join(',');
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'pertinence' }));
    await souffler();
    expect(sourcesRendues().join(',')).not.toBe(groupe);
  });

  it('la version LOCALE reste en tête dans les deux modes', async () => {
    await ouvrir();
    expect(albumsRendus()[0]).toBe('Menagerie');
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'pertinence' }));
    await souffler();
    expect(albumsRendus()[0]).toBe('Menagerie');
  });

  it('🔴 un réglage inconnu (blob venu du serveur) retombe sur le DÉFAUT, pas sur l’autre mode', async () => {
    // `syncPreferencesFromServer` adopte le blob distant sans filtrer ce champ :
    // une valeur écrite par une version ultérieure atteint bel et bien le
    // panneau. Tant que le défaut valait « pertinence », un `!== 'source'`
    // suffisait par accident ; il fait maintenant l’inverse du défaut.
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'par-couleur' as never }));
    await ouvrir();
    expect(sourcesRendues(),
      'une valeur inconnue rend l’ordre serveur au lieu du défaut groupé')
      .toEqual(ORDRE_GROUPE);
  });
});

describe('#4368 — le réglage est RETENU d’une visite à l’autre', () => {
  it('le choix part dans le blob synchronisé serveur, et se relit au rechargement', async () => {
    preferences.update((p) => ({ ...p, ordreAutresVersions: 'source' }));
    const brut = localStorage.getItem('tune-preferences');
    expect(brut, 'les préférences ne sont pas écrites').toBeTruthy();
    expect(JSON.parse(brut as string).ordreAutresVersions).toBe('source');
    // Le blob relu est celui que `loadPrefs()` retrouvera au prochain
    // chargement — et il est aussi le corps du PATCH /system/config.
    expect(estOrdreVersions(JSON.parse(brut as string).ordreAutresVersions)).toBe(true);
  });
});

/**
 * 🔴 CE QU'IL ADVIENT D'UN UTILISATEUR QUI A DÉJÀ CHOISI — le point de la
 * bascule du 23/09/2026, et celui qu'on ne suppose pas.
 *
 * On ne teste pas ici une fonction de rangement mais le CHARGEMENT réel :
 * `loadPrefs()` n'est pas exportée, donc on réimporte le module avec un
 * `localStorage` préparé, exactement comme un navigateur au démarrage.
 * `{ ...defaults, ...raw }` est une fusion PLATE : la valeur enregistrée
 * l'emporte sur le défaut, et c'est cela qu'on vérifie — pas qu'on l'espère.
 *
 * ⚠️ Ce que ces témoins établissent AUSSI, et qui est le vrai effet de la
 * bascule : le magasin ÉCRIT le blob complet dès le premier chargement. Toute
 * installation qui a ouvert une 0.9.161 ou 0.9.162 porte donc déjà
 * `ordreAutresVersions: "pertinence"` — qu'elle l'ait choisi ou non, et sans
 * qu'on puisse distinguer les deux cas. Le nouveau défaut ne s'applique donc
 * qu'aux installations NEUVES et à celles restées en 0.9.160 ou avant.
 */
describe('#4368 — basculer le défaut ne touche PAS le choix déjà enregistré', () => {
  /** Recharge le module `preferences` comme au démarrage d'un navigateur dont
   *  le `localStorage` porte `blob` (ou rien du tout quand il vaut `null`). */
  async function auDemarrage(blob: unknown | null) {
    localStorage.clear();
    if (blob !== null) localStorage.setItem('tune-preferences', JSON.stringify(blob));
    vi.resetModules();
    const mod = await import('../stores/preferences');
    return get(mod.preferences);
  }

  it('contre-épreuve : le défaut a bien basculé, sinon les témoins suivants ne prouvent rien', () => {
    expect(ORDRE_VERSIONS_DEFAUT).toBe('source');
  });

  it('🔴 il a choisi « par pertinence » : il RETROUVE « par pertinence »', async () => {
    const p = await auDemarrage({ theme: 'dark', ordreAutresVersions: 'pertinence' });
    expect(p.ordreAutresVersions,
      'le nouveau défaut a écrasé un choix enregistré — c’est précisément ce qu’il ne doit pas faire')
      .toBe('pertinence');
    // Et la valeur diffère du défaut : le témoin ne peut pas passer par hasard.
    expect(p.ordreAutresVersions).not.toBe(ORDRE_VERSIONS_DEFAUT);
  });

  it('il a choisi « par source » : il retrouve « par source »', async () => {
    const p = await auDemarrage({ theme: 'dark', ordreAutresVersions: 'source' });
    expect(p.ordreAutresVersions).toBe('source');
  });

  it('son choix RESSORT intact dans le blob réécrit (donc dans le PATCH vers le serveur)', async () => {
    await auDemarrage({ theme: 'dark', ordreAutresVersions: 'pertinence' });
    const brut = localStorage.getItem('tune-preferences');
    expect(JSON.parse(brut as string).ordreAutresVersions,
      'le rechargement a réécrit le blob avec le défaut : le choix serait perdu au prochain démarrage')
      .toBe('pertinence');
  });

  it('installation NEUVE (aucun blob) : elle s’ouvre groupée par source', async () => {
    const p = await auDemarrage(null);
    expect(p.ordreAutresVersions).toBe('source');
  });

  it('blob ANTÉRIEUR au réglage (0.9.160 et avant, la clé manque) : il adopte le nouveau défaut', async () => {
    const p = await auDemarrage({ theme: 'dark', language: 'fr' });
    expect(p.ordreAutresVersions).toBe('source');
  });

  it('valeur invalide (blob abîmé, version ultérieure) : elle retombe sur le nouveau défaut', async () => {
    const p = await auDemarrage({ theme: 'dark', ordreAutresVersions: 'par-couleur' });
    expect(p.ordreAutresVersions).toBe('source');
  });

  it('⚠️ le blob est ÉCRIT dès le chargement — d’où l’angle mort des installations 0.9.161/.162', async () => {
    // Démarrage sans blob : la clé est déjà écrite quand plus personne n’a rien
    // touché. C’est par ce mécanisme qu’une 0.9.161 a gravé « pertinence » chez
    // tout le monde, choix explicite ou non.
    await auDemarrage(null);
    const brut = localStorage.getItem('tune-preferences');
    expect(brut, 'le magasin n’écrit pas au chargement').toBeTruthy();
    expect(JSON.parse(brut as string).ordreAutresVersions).toBe('source');
  });
});

/**
 * 🔴 LA PROPRIÉTÉ DEMANDÉE : l'ordre ne bouge pas quand la liste se COMPLÈTE.
 *
 * Le regroupement partitionne au lieu de trier : une tuile qui arrive après
 * coup s'insère dans son panier, elle n'en déplace aucune. On le vérifie sur
 * la RÈGLE, en comparant l'ordre relatif des éléments déjà présents avant et
 * après l'arrivée de nouveaux — c'est exactement ce qu'un tri instable
 * casserait.
 */
describe('#4368 — l’ordre est stable quand la liste se complète', () => {
  const PARTIEL = STREAMING.slice(0, 4);
  const COMPLET = STREAMING;

  it('aucune tuile déjà affichée ne change de place relative', () => {
    const avant = ordonnerVersionsService([...PARTIEL], 'source').map((v) => v.source_id);
    const apres = ordonnerVersionsService([...COMPLET], 'source').map((v) => v.source_id);
    // La projection de l'ordre complet sur les éléments déjà connus doit
    // rendre l'ordre d'avant, à l'identique.
    expect(apres.filter((id) => avant.includes(id))).toEqual(avant);
  });

  it('elle est PURE : deux appels sur la même liste rendent le même ordre', () => {
    const a = ordonnerVersionsService([...COMPLET], 'source').map((v) => v.source_id);
    const b = ordonnerVersionsService([...COMPLET], 'source').map((v) => v.source_id);
    expect(a).toEqual(b);
  });

  it('🔴 elle ne MUTE pas le tableau reçu — sinon le $state du panneau bougerait sous le rendu', () => {
    const recu = [...COMPLET];
    const copie = [...recu];
    ordonnerVersionsService(recu, 'source');
    expect(recu).toEqual(copie);
  });

  it('en mode pertinence, le tableau reçu ressort tel quel, sans copie', () => {
    const recu = [...COMPLET];
    expect(ordonnerVersionsService(recu, 'pertinence')).toBe(recu);
  });

  it('un service inconnu du barème passe après les nommés, mais AVANT Bandcamp', () => {
    const l = [version('bandcamp', 'b', 'B'), version('spotify', 's', 'S'), version('qobuz', 'q', 'Q')];
    expect(ordonnerVersionsService(l, 'source').map((v) => v.service))
      .toEqual(['qobuz', 'spotify', 'bandcamp']);
  });
});

describe('#4368 — les libellés existent dans les ONZE langues', () => {
  const LANGUES: [string, Record<string, string>][] = [
    ['fr', lFr as never], ['en', lEn as never], ['de', lDe as never], ['es', lEs as never],
    ['it', lIt as never], ['zh', lZh as never], ['ja', lJa as never], ['ko', lKo as never],
    ['ro', lRo as never], ['sv', lSv as never], ['hu', lHu as never],
  ];
  const CLES = [
    'settings.versionsOrder', 'settings.versionsOrderHint',
    'settings.versionsOrderRelevance', 'settings.versionsOrderSource',
  ];

  it('les onze langues sont bien au rendez-vous', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [code, dict] of LANGUES) {
    it(`${code} — les quatre libellés sont traduits, et pas recopiés du français`, () => {
      for (const cle of CLES) {
        expect(dict[cle], `${code} : ${cle} manque`).toBeTruthy();
        if (code !== 'fr') {
          expect(dict[cle], `${code} : ${cle} est resté en français`)
            .not.toBe((lFr as never as Record<string, string>)[cle]);
        }
      }
    });
  }
});
