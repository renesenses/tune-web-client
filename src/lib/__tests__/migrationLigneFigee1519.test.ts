// @vitest-environment jsdom
//
// #1519 — RÉÉCRIRE LES LIGNES DE CHIFFRES QUI N'ONT JAMAIS ÉTÉ CHOISIES.
//
// ## Le piège, mesuré
//
// La ligne de chiffres de l'accueil est configurable par profil depuis le
// 19/09/2026 (`home_stats`). Mais `enregistrer()` dans `PageWidgets` écrit les
// DEUX clés d'un coup — `home_widgets` ET `home_stats`. Déplacer un widget, un
// geste qui ne parle pas des chiffres, figeait donc le défaut du 19/09 dans le
// profil de qui n'avait rien composé.
//
// Vérifié le 24/09/2026 sur le serveur de Bertrand : son propre profil portait
// exactement `['albums','artistes','lectures','heures-ecoutees','taille']` —
// le défaut d'alors, mot pour mot, qu'il n'avait jamais choisi.
//
// Conséquence : la carte « titres » entrée au défaut ce matin (#1541)
// n'atteignait personne, `choixAuChargement` rendant le tableau enregistré tel
// quel. Bertrand a arbitré le 24/09 : ces lignes-là se réécrivent.
//
// ## Ce que ce témoin mesure
//
// D'abord le prédicat, à nu. Puis la vraie page MONTÉE, en comptant les appels
// réellement passés à `setProfilePreferences` : une garde de texte dirait que
// la fonction existe, pas qu'elle écrit une fois et une seule, ni qu'elle ne
// se rejoue pas contre l'utilisateur qui décoche la carte derrière elle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import * as api from '../api';
import { currentProfileId } from '../stores/profile';
import {
  CHOIX_DEFAUT,
  CHOIX_DEFAUT_19_09,
  estLaLigneFigeeDu1909,
  migrationLigneChiffres,
} from '../chiffresAccueil';

/** Le défaut du 19/09, écrit ici en toutes lettres : c'est la donnée mesurée. */
const FIGE = ['albums', 'artistes', 'lectures', 'heures-ecoutees', 'taille'];

describe('#1519 — le prédicat « cette ligne n’a jamais été choisie »', () => {
  it('🔴 la constante historique est bien celle mesurée chez Bertrand', () => {
    // Si elle dérivait du défaut courant, l'ajout d'une septième carte
    // déplacerait la cible de la migration : une ligne réellement composée
    // deviendrait migrable du jour au lendemain.
    expect([...CHOIX_DEFAUT_19_09]).toEqual(FIGE);
    expect([...CHOIX_DEFAUT_19_09]).not.toEqual([...CHOIX_DEFAUT]);
  });

  it('🔴 le défaut du 19/09 à l’identique : jamais un choix', () => {
    expect(estLaLigneFigeeDu1909([...FIGE])).toBe(true);
  });

  it('🔴 L’ORDRE COMPTE — les cinq mêmes autrement rangés sont une composition', () => {
    // `basculer` range dans l'ordre où l'on coche : ces cinq-là dans cet
    // ordre-ci ne peuvent venir que d'une suite de gestes.
    expect(estLaLigneFigeeDu1909(['artistes', 'albums', 'lectures', 'heures-ecoutees', 'taille'])).toBe(false);
    expect(estLaLigneFigeeDu1909([...FIGE].reverse())).toBe(false);
  });

  it('🔴 toute autre différence laisse la ligne tranquille', () => {
    for (const ligne of [
      ['taille', 'albums'],
      [],
      FIGE.slice(0, 4),
      [...FIGE, 'genres'],
      [...FIGE, 'chiffre-dun-futur-serveur'],
      [...CHOIX_DEFAUT],
      ['albums', 'artistes', 'titres', 'lectures', 'heures-ecoutees'],
    ]) {
      expect(estLaLigneFigeeDu1909(ligne), ligne.join(',')).toBe(false);
    }
  });

  it('ce qui n’est pas une liste n’est pas une ligne figée', () => {
    for (const rien of [undefined, null, {}, 'albums,artistes', 5, true]) {
      expect(estLaLigneFigeeDu1909(rien), String(rien)).toBe(false);
    }
  });
});

describe('#1519 — `migrationLigneChiffres` : qui bouge, qui ne bouge pas', () => {
  it('🔴 la ligne figée passe au défaut COURANT, et se déclare à écrire', () => {
    const m = migrationLigneChiffres([...FIGE], undefined);
    expect(m.aMigrer).toBe(true);
    expect(m.choix).toEqual([...CHOIX_DEFAUT]);
    expect(m.choix).toContain('titres');
    // `enregistres` doit refléter ce qu'on s'apprête à écrire : c'est lui que
    // `choixAEnregistrer` consultera au prochain geste de l'utilisateur.
    expect(m.enregistres).toEqual([...CHOIX_DEFAUT]);
  });

  it('🔴 une ligne composée n’est pas touchée et ne demande AUCUNE écriture', () => {
    const m = migrationLigneChiffres(['taille', 'albums'], undefined);
    expect(m.aMigrer).toBe(false);
    expect(m.choix).toEqual(['taille', 'albums']);
    expect(m.enregistres).toEqual(['taille', 'albums']);
  });

  it('🔴 une ligne VIDE reste vide : « aucun chiffre » est un choix', () => {
    const m = migrationLigneChiffres([], undefined);
    expect(m.aMigrer).toBe(false);
    expect(m.choix).toEqual([]);
    expect(m.enregistres).toEqual([]);
  });

  it('🔴 un profil qui n’a RIEN rangé n’est pas migré — il voit déjà le défaut', () => {
    const m = migrationLigneChiffres(undefined, undefined);
    expect(m.aMigrer).toBe(false);
    expect(m.choix).toEqual([...CHOIX_DEFAUT]);
    expect(m.enregistres).toBeNull();
  });

  it('🔴 LE MARQUEUR ferme la porte : déjà migré, plus jamais migré', () => {
    // Le cas qui compte : quelqu'un décoche « titres » après la migration et
    // retombe pile sur les cinq du 19/09. Sans marqueur, le chargement suivant
    // les lui remettrait — une carte qu'on ne peut plus enlever.
    const m = migrationLigneChiffres([...FIGE], true);
    expect(m.aMigrer).toBe(false);
    expect(m.choix).toEqual([...FIGE]);
    expect(m.choix).not.toContain('titres');
  });

  it('🔴 rejouée sur un profil DÉJÀ migré, elle ne change rien', () => {
    const premier = migrationLigneChiffres([...FIGE], undefined);
    const second = migrationLigneChiffres(premier.enregistres, true);
    expect(second.aMigrer).toBe(false);
    expect(second.choix).toEqual(premier.choix);
    // Et même sans marqueur, la ligne migrée n'est plus le défaut du 19/09 :
    // deux verrous, pas un.
    expect(migrationLigneChiffres(premier.enregistres, undefined).aMigrer).toBe(false);
  });

  it('un marqueur autre que `true` ne vaut pas marqueur', () => {
    // On lit une donnée de serveur : seule la valeur qu'on écrit compte.
    for (const faux of [undefined, null, false, 0, '', 'oui']) {
      expect(migrationLigneChiffres([...FIGE], faux).aMigrer, String(faux)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* LA VRAIE PAGE, montée, et ce qu'elle écrit réellement              */
/* ------------------------------------------------------------------ */

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Un widget de témoin qui ne demande rien au réseau. */
const TEMOIN = {
  id: 'temoin',
  cleTitre: 'v2.home.title',
  forme: 'bande' as const,
  charger: async () => [{ id: 'a1', titre: 'un', sous: '' }],
};

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/**
 * Monte la page avec les préférences DU SERVEUR données, et rend les écritures
 * qu'elle a réellement passées.
 */
async function poserLaPage(prefs: Record<string, any>) {
  const ecritures: Record<string, any>[] = [];
  vi.spyOn(api, 'getProfilePreferences').mockResolvedValue(prefs as any);
  vi.spyOn(api, 'setProfilePreferences').mockImplementation(async (_pid: number, patch: any) => {
    ecritures.push(patch);
    Object.assign(prefs, patch);
    return prefs as any;
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [TEMOIN], dispositionDefaut: ['temoin'], cle: 'temoin_widgets' },
  });
  flushSync();
  await souffler(80);
  flushSync();
  return { ecritures, prefs };
}

function demonter() {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
}

beforeEach(() => {
  currentProfileId.set(1);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  demonter();
  currentProfileId.set(1);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1519 — ce que l’accueil écrit vraiment au chargement', () => {
  it('🔴 ligne figée du 19/09 → migrée, et écrite UNE SEULE FOIS', async () => {
    const { ecritures, prefs } = await poserLaPage({ home_stats: [...FIGE] });

    expect(ecritures, 'la migration n’a pas eu lieu').toHaveLength(1);
    expect(ecritures[0].home_stats).toEqual([...CHOIX_DEFAUT]);
    expect(ecritures[0].home_stats).toContain('titres');
    expect(ecritures[0].home_stats_migre).toBe(true);
    // 🔴 La disposition des widgets n'est PAS réécrite : c'est le piège même
    // qui a créé #1519, on ne le rejoue pas dans l'autre sens.
    expect(Object.keys(ecritures[0]).sort()).toEqual(['home_stats', 'home_stats_migre']);
    expect(prefs.home_widgets).toBeUndefined();
  });

  it('🔴 le rechargement d’un profil DÉJÀ migré n’écrit rien', async () => {
    const prefs: Record<string, any> = { home_stats: [...FIGE] };
    const premier = await poserLaPage(prefs);
    expect(premier.ecritures).toHaveLength(1);
    demonter();
    vi.restoreAllMocks();

    // Les préférences portent maintenant le marqueur : deuxième ouverture.
    const second = await poserLaPage(prefs);
    expect(second.ecritures, 'la migration s’est rejouée').toHaveLength(0);
    expect(prefs.home_stats).toEqual([...CHOIX_DEFAUT]);
  });

  it('🔴 L’UTILISATEUR DÉCOCHE « titres » APRÈS la migration : elle reste décochée', async () => {
    // Le défaut qui serait pire que celui qu'on corrige : décocher la carte
    // rend exactement les cinq du 19/09, et sans marqueur le chargement
    // suivant la remettrait. Pour toujours.
    const prefs: Record<string, any> = { home_stats: [...FIGE] };
    await poserLaPage(prefs);
    demonter();
    vi.restoreAllMocks();

    // Le geste : il retire « titres ». La ligne redevient celle du 19/09.
    prefs.home_stats = [...CHOIX_DEFAUT].filter((id) => id !== 'titres');
    expect(prefs.home_stats).toEqual([...FIGE]);

    const apres = await poserLaPage(prefs);
    expect(apres.ecritures, 'la migration a remis la carte décochée').toHaveLength(0);
    expect(prefs.home_stats).toEqual([...FIGE]);
    expect(prefs.home_stats).not.toContain('titres');
  });

  it('🔴 ligne composée → aucune écriture du tout', async () => {
    const { ecritures, prefs } = await poserLaPage({ home_stats: ['taille', 'albums'] });
    expect(ecritures).toHaveLength(0);
    expect(prefs.home_stats).toEqual(['taille', 'albums']);
    expect(prefs.home_stats_migre).toBeUndefined();
  });

  it('🔴 ligne VIDE → aucune écriture, et elle reste vide', async () => {
    const { ecritures, prefs } = await poserLaPage({ home_stats: [] });
    expect(ecritures).toHaveLength(0);
    expect(prefs.home_stats).toEqual([]);
  });

  it('🔴 profil muet → aucune écriture : ouvrir l’accueil ne fige toujours rien', async () => {
    const { ecritures, prefs } = await poserLaPage({});
    expect(ecritures).toHaveLength(0);
    expect(prefs.home_stats).toBeUndefined();
    expect(prefs.home_stats_migre).toBeUndefined();
  });
});

/**
 * 🔴 UNE INCOHÉRENCE PRÉEXISTANTE, SIGNALÉE ET NON TOUCHÉE.
 *
 * `accueilWidgets.ts` traite une liste vide comme « prends le défaut » au
 * moment de DESSINER (`ctx.chiffresChoisis?.length ? … : CHOIX_DEFAUT`), tandis
 * que `PageWidgets` la traite comme un choix au moment d'ENREGISTRER. Les deux
 * ne disent donc pas la même chose de la même donnée.
 *
 * Ce témoin l'épingle sans la corriger : la trancher est une décision de
 * produit — « aucun chiffre » doit-il être possible ? — et elle n'appartient
 * pas à une migration. Le jour où elle sera prise, ce témoin ira au rouge et
 * dira où.
 */
describe('#1519 — l’incohérence du VIDE, épinglée telle qu’elle est', () => {
  it('la migration ne change rien au vide, ni d’un côté ni de l’autre', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/accueilWidgets.ts', 'utf8');
    expect(src).toContain('ctx.chiffresChoisis?.length ? ctx.chiffresChoisis : CHOIX_DEFAUT');
    // Et côté migration, le vide n'est pas une ligne figée.
    expect(estLaLigneFigeeDu1909([])).toBe(false);
    expect(migrationLigneChiffres([], undefined).choix).toEqual([]);
  });
});
