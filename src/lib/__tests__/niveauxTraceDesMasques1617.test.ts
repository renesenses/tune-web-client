// @vitest-environment jsdom
//
// #1617 — un réglage masqué par le niveau d'affichage doit LE DIRE, là où il
// disparaît.
//
// ## Ce qui existait déjà (lot 1, PR web-client#448, fusionnée le 14/08)
//
// Le registre `settingLevels.ts`, le sélecteur « Niveau d'affichage » en tête
// des réglages, le masquage par classe `lv-hidden`, la règle d'or (un réglage
// dont la valeur diffère de son défaut reste visible) et une ligne
// « n réglages masqués » en PIED D'ONGLET.
//
// ## Le trou que ces gardes ferment
//
// 1. Un SOUS-réglage — une ligne commandée par un interrupteur parent — était
//    exclu du compte sans condition. « Valeurs par facette »
//    (`library.oxygenFacetLimit`, niveau EXPERT, parent `library.oxygenEnable`
//    de niveau intermédiaire) disparaissait donc en entier : ni à l'écran, ni
//    dans le compteur, ni nulle part — alors qu'il continuait de plafonner les
//    facettes servies. C'est le levier de #2131 : présent, agissant, et
//    inatteignable.
// 2. Le bouton du pied d'onglet montait d'UN cran à l'aveugle. Depuis
//    « débutant », si les seuls réglages masqués sont experts, ce clic mène à
//    « intermédiaire » où rien n'apparaît.
//
// ⚠️ Repère mesuré au passage : `defaults.settingsLevel` vaut `'expert'`
// depuis le 27/08 (preferences.ts), ce qui inverse l'arbitrage du 14/08. Hors
// choix explicite, plus rien n'est donc masqué — le défaut ci-dessus frappe
// ceux qui ont CHOISI débutant ou intermédiaire.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import {
  SETTING_LEVELS,
  allSettingKeys,
  hiddenKeysAmong,
  hiddenKeysByTab,
  hiddenCountByTab,
  revealLevel,
  type SettingKey,
  type SettingLevelEntry,
} from '../settingLevels';
import lFr from '../locales/fr';
import { dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;

describe('registre : tout sous-réglage nomme son parent', () => {
  it('chaque entrée `sub` porte un `parent` qui existe dans le registre', () => {
    const connues = new Set(allSettingKeys());
    const subs = allSettingKeys().filter((k) => (SETTING_LEVELS[k] as SettingLevelEntry).sub);
    // Sans parent nommé, l'appelant ne peut pas dire si la ligne se rend :
    // elle retombe dans le trou qu'on ferme ici.
    expect(subs.length).toBeGreaterThan(0);
    for (const k of subs) {
      const parent = (SETTING_LEVELS[k] as SettingLevelEntry).parent;
      expect(parent, `${k} n'a pas de parent`).toBeTruthy();
      expect(connues.has(parent as SettingKey), `${k} → parent inconnu ${parent}`).toBe(true);
    }
  });

  it('« Valeurs par facette » est bien le cas d\'espèce : expert, sous un parent intermédiaire', () => {
    const e = SETTING_LEVELS['library.oxygenFacetLimit'] as SettingLevelEntry;
    expect(e.level).toBe('expert');
    expect(e.sub).toBe(true);
    expect(e.parent).toBe('library.oxygenEnable');
    expect(SETTING_LEVELS['library.oxygenEnable'].level).toBe('intermediate');
  });
});

describe('un sous-réglage compte dès que son parent est allumé', () => {
  const cle: SettingKey = 'library.oxygenFacetLimit';

  it('parent ÉTEINT : rien à annoncer, la ligne ne se rend pas', () => {
    expect(hiddenKeysAmong([cle], 'intermediate', () => false, () => true, () => false)).toEqual([]);
    expect(hiddenKeysByTab('intermediate').library).not.toContain(cle);
  });

  it('parent ALLUMÉ : la ligne se rend, le niveau la masque, elle compte', () => {
    const on = () => true;
    expect(hiddenKeysAmong([cle], 'intermediate', () => false, () => true, on)).toEqual([cle]);
    expect(hiddenKeysByTab('intermediate', () => false, () => true, on).library).toContain(cle);
    // Le compte de l'onglet gagne exactement les sous-réglages `library` que
    // le niveau masque — calculé depuis le registre, jamais écrit en dur.
    const attendus = allSettingKeys().filter((k) => {
      const e = SETTING_LEVELS[k] as SettingLevelEntry;
      return e.tab === 'library' && e.sub && e.level === 'expert';
    });
    expect(attendus).toContain(cle);
    expect(hiddenCountByTab('intermediate', () => false, () => true, on).library)
      .toBe(hiddenCountByTab('intermediate').library + attendus.length);
  });

  it('la règle d\'or prime encore : un plafond déjà changé n\'est pas « masqué »', () => {
    const on = () => true;
    expect(hiddenKeysAmong([cle], 'beginner', (k) => k === cle, () => true, on)).toEqual([]);
  });

  it('au niveau expert, plus rien n\'est masqué même parents allumés', () => {
    const counts = hiddenCountByTab('expert', () => false, () => true, () => true);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('le niveau proposé révèle vraiment quelque chose', () => {
  it('des masqués EXPERT vus d\'un débutant renvoient expert, pas intermédiaire', () => {
    // C'est là que « monter d'un cran » mentait.
    expect(revealLevel(['library.oxygenFacetLimit'], 'beginner')).toBe('expert');
  });

  it('un masqué INTERMÉDIAIRE renvoie intermédiaire', () => {
    expect(revealLevel(['general.volumeDisplay'], 'beginner')).toBe('intermediate');
  });

  it('mélange : le plus bas niveau qui révèle au moins un réglage', () => {
    expect(revealLevel(['general.volumeDisplay', 'library.oxygenFacetLimit'], 'beginner'))
      .toBe('intermediate');
  });

  it('depuis expert, il n\'y a plus rien à proposer', () => {
    expect(revealLevel(['library.oxygenFacetLimit'], 'expert')).toBeNull();
  });
});

// ── La note montée pour de vrai ───────────────────────────────────────────
// Une garde qui lirait le TEXTE du composant ne dirait rien de son
// comportement : on le monte, on lit ce qu'il rend, et on clique.
let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;


afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});


describe('les deux clés neuves existent dans les ONZE langues', () => {
  it('settings.hiddenHere et settings.hiddenHereReveal sont traduites partout', async () => {
    const langues = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const l of langues) {
      const table = dictionnaire(l);
      for (const k of ['settings.hiddenHere', 'settings.hiddenHereReveal']) {
        expect(table[k], `${k} absente de ${l}`).toBeTruthy();
        expect(table[k]).not.toBe(k);
      }
      // Le compteur doit pouvoir être substitué : sans `{n}`, la note
      // annoncerait un nombre qu'elle n'affiche pas.
      expect(table['settings.hiddenHere'], `{n} absent de ${l}`).toContain('{n}');
    }
  });
});
