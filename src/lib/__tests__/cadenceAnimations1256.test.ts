// @vitest-environment jsdom
//
// #1256 — « high CPU/GPU usage when I open the now playing » (Levente Toth,
// fil 1848, 0.9.155, MacBook).
//
// Deux relevés ont cherché une économie qui ne se voie pas, et trouvé le
// contraire (docs/mesures/1256-cout-des-boucles-de-dessin.md, PR #1480 et
// #1499) : la minuterie par boucle coûte PLUS cher, l'horloge partagée ne
// rapporte RIEN. Le seul levier qui rapporte est la cadence elle-même, et il
// SE VOIT. Bertrand tranche le 23/09/2026 : trois crans, défaut inchangé.
//
// 🔴 CE FICHIER MESURE LE DÉFAUT, qui est la moitié de la décision. Il le
// mesure trois fois, parce qu'il y a trois façons de le perdre :
//
//   1. installation NEUVE — rien d'enregistré ;
//   2. installation EXISTANTE — et c'est le piège RÉEL : le client écrit TOUS
//      ses réglages dès la première ouverture (`createPreferences` sérialise le
//      blob entier à chaque émission), donc « aucune valeur enregistrée »
//      n'existe presque jamais. Le cas de terrain n'est pas un localStorage
//      vide : c'est un blob COMPLET à qui il manque la seule clé neuve ;
//   3. blob ABÎMÉ ou venu d'une version ultérieure — il est relu du SERVEUR
//      (`ui_preferences`), donc il peut porter n'importe quoi.
//
// Le comportement à l'écran, lui, est mesuré en montant les composants :
// `cadenceReglable1256.svelte.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  CADENCE_HZ, CLE_I18N_CRAN, CRANS_CADENCE, CRAN_CADENCE_DEFAUT, cranOuDefaut,
  estCranCadence, intervalleCreteMs, intervalleVisualiseurMs, tempsDeDessinerA,
  type CranCadence,
} from '../cadenceAnimations';
import { CADENCE_CRETE_HZ, INTERVALLE_CRETE_MS, tempsDeDessiner } from '../cadenceCreteMetre';
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

const STORAGE_KEY = 'tune-preferences';

/**
 * Le blob qu'une installation EXISTANTE porte réellement : complet pour SA
 * version — c'est-à-dire tous les réglages d'aujourd'hui — mais sans la seule
 * clé neuve. Il est construit depuis les défauts courants et non recopié à la
 * main : une liste figée ici vieillirait en silence et ne prouverait plus rien.
 */
async function blobDeLaVersionPrecedente(): Promise<Record<string, unknown>> {
  vi.resetModules();
  localStorage.clear();
  const frais = await import('../stores/preferences');
  const complet = { ...get(frais.preferences) } as Record<string, unknown>;
  expect(
    Object.prototype.hasOwnProperty.call(complet, 'cadenceAnimations'),
    'le blob de référence ne porte même pas la clé : le cas testé serait vide',
  ).toBe(true);
  delete complet.cadenceAnimations;
  return complet;
}

/** Recharge le magasin sur le `localStorage` posé juste avant. */
async function magasinRecharge() {
  vi.resetModules();
  return (await import('../stores/preferences')).preferences;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('#1256 — le cran par défaut rend EXACTEMENT la cadence d’aujourd’hui', () => {
  it('🔴 le défaut est `fluide`', () => {
    expect(CRAN_CADENCE_DEFAUT,
      'le défaut a bougé — l’arbitrage du 23/09 était « la cadence actuelle »').toBe('fluide');
    expect(CADENCE_HZ[CRAN_CADENCE_DEFAUT], 'le défaut ne vaut plus 30 images par seconde').toBe(30);
  });

  it('🔴 crête-mètre : 1000/30 ms, la valeur livrée, NON arrondie', () => {
    // La valeur livrée en 0.9.158 (#1269) est `1000 / 30 = 33,333…`.
    // L'arrondir à 33 déplacerait le défaut d'un tiers de milliseconde : c'est
    // invisible à l'œil, et c'est exactement ce qu'on s'interdit de faire sans
    // que personne l'ait demandé.
    expect(intervalleCreteMs('fluide')).toBe(1000 / 30);
    expect(INTERVALLE_CRETE_MS, 'la constante livrée ne suit plus le cran par défaut')
      .toBe(intervalleCreteMs(CRAN_CADENCE_DEFAUT));
    expect(CADENCE_CRETE_HZ).toBe(30);
  });

  it('🔴 visualiseur : 33 ms ENTIÈRES, la valeur livrée', () => {
    // `AudioVisualizer` portait `const FRAME_INTERVAL = 33` — un entier, pas
    // 33,333. Les deux composants n'ont jamais eu le même arrondi ;
    // l'uniformiser au passage aurait changé le défaut de l'un des deux.
    expect(intervalleVisualiseurMs('fluide')).toBe(33);
  });

  it('🔴 `tempsDeDessiner` sans cran se comporte comme avant, image par image', () => {
    const a60 = 1000 / 60;
    const a120 = 1000 / 120;
    // Les quatre assertions du témoin de #1269, rejouées telles quelles.
    expect(tempsDeDessiner(1000 + a60, 1000)).toBe(false);
    expect(tempsDeDessiner(1000 + 2 * a60, 1000)).toBe(true);
    expect(tempsDeDessiner(1000 + 3 * a120, 1000)).toBe(false);
    expect(tempsDeDessiner(1000 + 4 * a120, 1000)).toBe(true);
    // Et le cran explicite `fluide` ne change rien : c'est le MÊME chemin.
    for (const t of [a60, 2 * a60, 3 * a120, 4 * a120, 5 * a120, 100]) {
      expect(tempsDeDessinerA(1000 + t, 1000, 'fluide')).toBe(tempsDeDessiner(1000 + t, 1000));
    }
  });
});

describe('#1256 — les deux autres crans sont ceux qui ont été MESURÉS', () => {
  it('trois crans, et pas un de plus', () => {
    expect(CRANS_CADENCE).toEqual(['fluide', 'econome', 'minimal']);
  });

  it('20 i/s et 15 i/s — les deux lignes du tableau de #1499', () => {
    expect(CADENCE_HZ.econome, '20 i/s : −28 % mesurés').toBe(20);
    expect(CADENCE_HZ.minimal, '15 i/s : −43 % mesurés').toBe(15);
    expect(intervalleCreteMs('econome')).toBe(50);
    expect(intervalleVisualiseurMs('econome')).toBe(50);
    expect(intervalleVisualiseurMs('minimal')).toBe(67);
  });

  it('un cran plus économe est un intervalle plus LONG — jamais l’inverse', () => {
    for (let i = 1; i < CRANS_CADENCE.length; i++) {
      const avant = CRANS_CADENCE[i - 1];
      const apres = CRANS_CADENCE[i];
      expect(intervalleCreteMs(apres),
        `${apres} dessine plus souvent que ${avant} : la liste est à l’envers`)
        .toBeGreaterThan(intervalleCreteMs(avant));
    }
  });
});

describe('#1256 — la garde de relecture, parce que le blob vient du SERVEUR', () => {
  const REFUSES: unknown[] = [
    undefined, null, '', 'turbo', 'Fluide', 30, 0, true, {}, [], 'fluide ',
  ];

  it('🔴 seuls les trois crans sont acceptés', () => {
    for (const cran of CRANS_CADENCE) expect(estCranCadence(cran)).toBe(true);
    for (const v of REFUSES) {
      expect(estCranCadence(v), `« ${String(v)} » est passé pour un cran`).toBe(false);
    }
  });

  it('tout le reste retombe sur la cadence d’aujourd’hui, pas sur une cadence qui n’existe pas', () => {
    for (const v of REFUSES) expect(cranOuDefaut(v)).toBe('fluide');
    for (const cran of CRANS_CADENCE) expect(cranOuDefaut(cran)).toBe(cran);
  });
});

describe('#1256 — ce que voit un utilisateur EXISTANT : rien ne bouge', () => {
  it('🔴 installation NEUVE : `fluide`, sans rien avoir enregistré', async () => {
    localStorage.clear();
    const p = get(await magasinRecharge());
    expect(p.cadenceAnimations,
      'une installation neuve ne démarre plus à la cadence d’aujourd’hui').toBe('fluide');
  });

  it('🔴 installation EXISTANTE, blob COMPLET de la version précédente : `fluide`', async () => {
    // LE cas de terrain. Mesuré aujourd'hui sur tune-server-rust#4368 : le
    // client écrit TOUS ses réglages dès la première ouverture, donc « aucune
    // valeur enregistrée » n'existe presque jamais. Un test qui ne poserait
    // qu'un blob à trois clés passerait à côté.
    const ancien = await blobDeLaVersionPrecedente();
    expect(Object.keys(ancien).length,
      'le blob de référence est trop maigre pour être celui d’une installation réelle')
      .toBeGreaterThan(20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ancien));
    const p = get(await magasinRecharge());
    expect(Object.prototype.hasOwnProperty.call(p, 'cadenceAnimations')).toBe(true);
    expect(p.cadenceAnimations,
      'une installation existante voit ses animations ralentir sans l’avoir demandé').toBe('fluide');
  });

  it('🔴 et TOUS les autres réglages de ce blob sont rendus intacts', () => {
    // Contre-épreuve du cas précédent : s'il suffisait d'écraser le blob par
    // les défauts pour le faire passer, il ne prouverait rien.
    return (async () => {
      const ancien = await blobDeLaVersionPrecedente();
      ancien.theme = 'light';
      ancien.startupView = 'nowplaying';
      ancien.volumeDisplay = 'dB';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ancien));
      const p = get(await magasinRecharge());
      expect(p.theme).toBe('light');
      expect(p.startupView).toBe('nowplaying');
      expect(p.volumeDisplay).toBe('dB');
      expect(p.cadenceAnimations).toBe('fluide');
    })();
  });

  it('🔴 blob ABÎMÉ (cran inconnu) : `fluide`, et non une cadence qui n’existe pas', async () => {
    const ancien = await blobDeLaVersionPrecedente();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ancien, cadenceAnimations: 'turbo' }));
    const p = get(await magasinRecharge());
    expect(p.cadenceAnimations).toBe('fluide');
  });

  it('le blob venu du SERVEUR est filtré de la même façon', async () => {
    // `syncPreferencesFromServer` adopte le blob distant TEL QUEL quand le
    // navigateur n'a pas de préférences locales : c'est un second chemin
    // d'entrée, et il porte le même filtre.
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ui_preferences: JSON.stringify({ theme: 'light', cadenceAnimations: 'turbo' }) }),
      text: async () => '',
    } as unknown as Response)));
    vi.resetModules();
    const mod = await import('../stores/preferences');
    await mod.syncPreferencesFromServer();
    const p = get(mod.preferences);
    expect(p.theme, 'le blob serveur n’a pas été adopté : le cas ne prouve rien').toBe('light');
    expect(p.cadenceAnimations,
      'un cran inconnu venu du serveur a figé les animations sur une cadence inexistante').toBe('fluide');
  });
});

describe('#1256 — le choix se garde, et il vit avec les autres réglages', () => {
  it('choisi, il est relu au rechargement', async () => {
    const magasin = await magasinRecharge();
    magasin.update((p) => ({ ...p, cadenceAnimations: 'minimal' as CranCadence }));
    const brut = localStorage.getItem(STORAGE_KEY);
    expect(brut).toBeTruthy();
    expect(JSON.parse(brut as string).cadenceAnimations).toBe('minimal');
    const p = get(await magasinRecharge());
    expect(p.cadenceAnimations, 'le choix de l’utilisateur a été écrasé au rechargement').toBe('minimal');
  });

  it('aucune clé localStorage dédiée : une seconde surface finirait par diverger', async () => {
    const magasin = await magasinRecharge();
    magasin.update((p) => ({ ...p, cadenceAnimations: 'econome' as CranCadence }));
    const cles = Object.keys(localStorage);
    expect(cles.filter((c) => /cadence|animation/i.test(c))).toEqual([]);
    expect(cles).toContain(STORAGE_KEY);
  });
});

describe('#1256 — les libellés existent dans les ONZE langues', () => {
  const LANGUES: [string, Record<string, string>][] = [
    ['fr', lFr as never], ['en', lEn as never], ['de', lDe as never], ['es', lEs as never],
    ['it', lIt as never], ['zh', lZh as never], ['ja', lJa as never], ['ko', lKo as never],
    ['ro', lRo as never], ['sv', lSv as never], ['hu', lHu as never],
  ];
  const CLES = [
    'settings.animationRate', 'settings.animationRateHint',
    ...CRANS_CADENCE.map((c) => CLE_I18N_CRAN[c]),
  ];

  it('les onze langues sont bien au rendez-vous', () => {
    expect(LANGUES).toHaveLength(11);
    expect(CLES).toHaveLength(5);
  });

  for (const [code, dict] of LANGUES) {
    it(`${code} — les cinq clés sont traduites, et pas recopiées du français`, () => {
      for (const cle of CLES) {
        expect(dict[cle], `${code} : ${cle} manque`).toBeTruthy();
        if (code !== 'fr') {
          expect(dict[cle], `${code} : ${cle} est resté en français`)
            .not.toBe((lFr as never as Record<string, string>)[cle]);
        }
      }
    });

    it(`${code} — chaque cran économe ANNONCE ce qu’il rapporte`, () => {
      // C'est la demande, mot pour mot : « avec l'indication de ce qu'on y
      // gagne ». Un cran qui ne dit pas ce qu'il rapporte ne se choisit pas —
      // et un chiffre est la seule forme qui se vérifie ici sans lire onze
      // langues à la main.
      for (const cran of ['econome', 'minimal'] as CranCadence[]) {
        const libelle = dict[CLE_I18N_CRAN[cran]];
        expect(libelle, `${code} : ${cran} n’annonce aucun gain chiffré`).toMatch(/\d{2}/);
      }
    });

    it(`${code} — l’explication dit que le SON n’est pas touché`, () => {
      // 🔴 Un réglage nommé « cadence » au milieu des réglages d'un lecteur
      // audiophile se lit comme un rééchantillonnage. L'explication doit être
      // assez longue pour lever l'ambiguïté ; une étiquette nue ne suffit pas.
      const hint = dict['settings.animationRateHint'];
      // Le chinois, le japonais et le coréen disent la même chose en deux fois
      // moins de signes : un seuil unique en caractères mesurerait l'écriture,
      // pas le contenu.
      const mini = ['zh', 'ja', 'ko'].includes(code) ? 20 : 40;
      expect(hint!.length, `${code} : l’explication est trop courte pour lever l’ambiguïté`)
        .toBeGreaterThan(mini);
      expect(hint!.length, `${code} : l’explication n’en dit pas plus que l’étiquette`)
        .toBeGreaterThan(dict['settings.animationRate']!.length);
    });
  }
});
