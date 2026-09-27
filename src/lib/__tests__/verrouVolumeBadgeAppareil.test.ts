// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount, flushSync } from 'svelte';

import {
  volumeLockBadge,
  volumeLockLabelKey,
  volumeLockOriginKey,
} from '../audiophileLockBadge';
import { ONZE_LANGUES, dictionnaire, fr } from './onzeDictionnaires';
import type { AudiophileModeState } from '../api';

/**
 * 🔴 L'ÉCRAN EST IMPORTÉ À LA COLLECTE, PAS DANS LE CAS — #1326 / #1333.
 * Un `await import('….svelte')` dans un cas ferait payer la compilation du
 * composant au chronomètre de ce cas ; sous charge, la continuation abandonnée
 * reprend et monte dans l'hôte du cas SUIVANT. Gardé par
 * `composantsALaCollecte1333.test.ts`.
 */
import BadgeVerrouVolumeZone from '../../components/v2/BadgeVerrouVolumeZone.svelte';

/**
 * Badge de verrou de volume sur la carte de l'appareil (#2395, #2506).
 *
 * Le coût d'erreur est matériel : un testeur a détruit une paire de
 * haut-parleurs à 800 € pièce sur une topologie sans atténuation. Un badge qui
 * dirait « non verrouillé » sur une zone qui part à 100 % serait donc pire que
 * pas de badge du tout. Ces tests couvrent EXHAUSTIVEMENT les trois cas de
 * l'énoncé — hérité activé, hérité désactivé, surchargé — plus le cas où l'on
 * ne sait pas.
 *
 * ── CE QUE CE FICHIER NE PROUVAIT PLUS ───────────────────────────────────────
 *
 * Mesuré le 27/09/2026 sur `main` : la boucle des onze langues avait un CORPS
 * VIDE, sous un `describe` qui promettait « les onze langues portent les
 * libellés du badge » ; seul un `toHaveLength(11)` subsistait. Et le bloc « ce
 * qu'il affiche » n'avait plus qu'un cas sur les trois annoncés par son propre
 * en-tête. Le fichier ne gardait donc aucun des deux états que le badge doit
 * savoir distinguer.
 *
 * Pire : son tableau `KEYS` — qui ne vérifiait rien — donnait aux quatre clés
 * `devices.volumeLock*` un second site littéral, les faisant passer pour
 * vivantes aux yeux de `check-i18n`. Elles le sont désormais pour de vrai, et
 * c'est le montage ci-dessous qui l'établit.
 */
describe('badge de verrou : ce qu’il affiche', () => {
  it('verrou hérité ARMÉ : verrouillé, et la provenance est l’héritage', () => {
    expect(volumeLockBadge({ lock_volume: null, effective_lock_volume: true })).toEqual({
      locked: true,
      inherited: true,
    });
  });

  it('verrou hérité DÉSARMÉ : non verrouillé, provenance l’héritage', () => {
    expect(volumeLockBadge({ lock_volume: null, effective_lock_volume: false })).toEqual({
      locked: false,
      inherited: true,
    });
  });

  it('surcharge de zone : la provenance n’est PLUS l’héritage', () => {
    // Le cas qui a coûté un long échange avec un testeur : la zone part à
    // 100 % alors que le réglage général est désarmé. Dire « verrouillé » ne
    // suffit pas — il faut dire que c'est CETTE zone qui le décide, sinon
    // l'utilisateur va désarmer le général et ne rien changer.
    expect(volumeLockBadge({ lock_volume: true, effective_lock_volume: true })).toEqual({
      locked: true,
      inherited: false,
    });
    expect(volumeLockBadge({ lock_volume: false, effective_lock_volume: false })).toEqual({
      locked: false,
      inherited: false,
    });
  });

  it('`lock_volume` ABSENT vaut « hérité », pas « surchargé »', () => {
    // `== null` couvre `null` ET `undefined`. Un `=== null` classerait un
    // champ absent comme surcharge de zone : mauvaise provenance affichée.
    expect(volumeLockBadge({ effective_lock_volume: true })).toEqual({
      locked: true,
      inherited: true,
    });
  });
});

describe('badge de verrou : quand il se tait', () => {
  it('sans `effective_lock_volume`, aucun badge — on ne devine pas', () => {
    // Serveur antérieur à 0.9.127 : il publie la surcharge mais pas la valeur
    // résolue. Afficher `lock_volume` tel quel annoncerait « non verrouillé »
    // sur une zone héritant d'un général armé. On se tait.
    expect(volumeLockBadge({ lock_volume: null })).toBeNull();
    expect(volumeLockBadge({ lock_volume: true })).toBeNull();
    expect(volumeLockBadge({})).toBeNull();
  });

  it('état absent (requête en vol ou en échec) : aucun badge', () => {
    expect(volumeLockBadge(null)).toBeNull();
    expect(volumeLockBadge(undefined)).toBeNull();
  });

  it('un `effective_lock_volume` non booléen ne passe pas pour vrai', () => {
    // Un serveur qui renverrait `"true"`, `1` ou `null` ne doit pas allumer le
    // badge par coercition : `typeof … === 'boolean'`, rien d'autre.
    for (const bogus of ['true', 1, 0, null, {}, []] as unknown[]) {
      expect(
        volumeLockBadge({ effective_lock_volume: bogus as boolean }),
        `valeur ${JSON.stringify(bogus)}`,
      ).toBeNull();
    }
  });
});

/* ========================================================================== *
 * LE BADGE SUR LE DOM MONTÉ
 *
 * Une garde de source aurait accepté une fonction exportée que personne
 * n'appelle : c'est précisément l'état dans lequel `volumeLockBadge()` a passé
 * huit jours après la phase 5 (d5ed7deb), qui a emporté
 * `DevicesSettings.svelte` et le badge avec lui. On MONTE donc le composant
 * dans jsdom — `mount` de Svelte 5, avec la condition de résolution `browser`
 * déjà posée par `vitest.config.ts` (sans elle `$effect` est un no-op et tout
 * passerait au vert sans rien exécuter).
 * ========================================================================== */

/**
 * ⏱️ Délai porté à 60 s pour les cas qui MONTENT. Le coût n'est pas le test,
 * c'est la transformation Svelte, payée à froid au premier montage — au-dessus
 * du plafond de 5 s de Vitest dès que la machine a autre chose à faire. Même
 * raison et même valeur que `sortieMonoZone.test.ts`.
 */
const DELAI_MONTAGE = 60_000;

const lireMode = vi.fn<(id: number) => Promise<AudiophileModeState>>();

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  // Seul l'appel qu'on éprouve est remplacé. Le reste du module reste réel : un
  // module d'API entièrement inventé rendrait le montage vert quoi qu'il arrive
  // au vrai contrat.
  return { ...reel, getAudiophileMode: (id: number) => lireMode(id) };
});

let cible: HTMLElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  lireMode.mockReset();
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
});

/** Monte le badge pour une zone dont le serveur rend `etat`. */
async function monterBadge(etat: AudiophileModeState | 'injoignable'): Promise<HTMLElement> {
  if (etat === 'injoignable') lireMode.mockRejectedValue(new Error('hors ligne'));
  else lireMode.mockResolvedValue(etat);
  monte = mount(BadgeVerrouVolumeZone, { target: cible, props: { zoneId: 21 } });
  flushSync();
  await vi.waitFor(() => expect(lireMode).toHaveBeenCalledWith(21));
  flushSync();
  return cible;
}

/** Le texte du badge, ou `null` s'il n'est pas rendu du tout. */
function texteDuBadge(racine: HTMLElement): { etat: string; provenance: string } | null {
  const el = racine.querySelector('.vl');
  if (!el) return null;
  return {
    etat: el.querySelector('.vl-etat')!.textContent!.trim(),
    provenance: el.querySelector('.vl-prov')!.textContent!.trim(),
  };
}

describe('#2395 — le badge est RENDU sur la carte de zone', () => {
  it('verrou HÉRITÉ armé : « verrouillé » et « suit le réglage général »', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await monterBadge({
      enabled: true,
      lock_volume: null,
      effective_lock_volume: true,
    });
    await vi.waitFor(() => expect(texteDuBadge(racine)).not.toBeNull());

    // Les libellés RENDUS sont ceux du dictionnaire : si la clé manquait,
    // l'écran afficherait « devices.volumeLockOn » — un badge muet, ce que
    // l'issue interdit.
    expect(texteDuBadge(racine)).toEqual({
      etat: fr['devices.volumeLockOn'],
      provenance: fr['devices.volumeLockInherited'],
    });
    expect(racine.textContent).not.toContain('devices.');
    // Et la couleur d'alerte : l'état qui a un coût se voit.
    expect(racine.querySelector('.vl')!.classList.contains('on')).toBe(true);
  });

  it('verrou PROPRE à la zone : « verrouillé » et « réglage de cette zone »', { timeout: DELAI_MONTAGE }, async () => {
    // Le cas du testeur : le général est désarmé, la zone part à 100 % quand
    // même. Annoncer « suit le réglage général » ici enverrait désarmer un
    // réglage déjà désarmé — et les enceintes prendraient le plein niveau.
    const racine = await monterBadge({
      enabled: true,
      lock_volume: true,
      effective_lock_volume: true,
    });
    await vi.waitFor(() => expect(texteDuBadge(racine)).not.toBeNull());

    expect(texteDuBadge(racine)).toEqual({
      etat: fr['devices.volumeLockOn'],
      provenance: fr['devices.volumeLockOwn'],
    });
  });

  it('zone NON verrouillée : le badge le dit, sans couleur d’alerte', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await monterBadge({
      enabled: false,
      lock_volume: false,
      effective_lock_volume: false,
    });
    await vi.waitFor(() => expect(texteDuBadge(racine)).not.toBeNull());

    expect(texteDuBadge(racine)!.etat).toBe(fr['devices.volumeLockOff']);
    expect(racine.querySelector('.vl')!.classList.contains('on')).toBe(false);
  });

  it('un serveur qui ne résout pas l’héritage : AUCUN badge', { timeout: DELAI_MONTAGE }, async () => {
    // Antérieur à 0.9.127. Se taire est le seul repli acceptable : afficher
    // `lock_volume` tel quel annoncerait « non verrouillé » sur une zone
    // héritant d'un général armé.
    const racine = await monterBadge({ enabled: true, lock_volume: null });
    expect(texteDuBadge(racine)).toBeNull();
  });

  it('serveur injoignable : aucun badge, pas un badge périmé', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await monterBadge('injoignable');
    expect(texteDuBadge(racine)).toBeNull();
  });
});

describe('#2395 — la carte de zone monte bien ce badge', () => {
  // Le montage ci-dessus prouve ce que le badge DIT ; il ne prouve pas qu'un
  // écran le porte. La carte de zone vit dans `SettingsV2.svelte` (section
  // `perZone`, onglet Appareils) depuis que la phase 5 a supprimé
  // `DevicesSettings.svelte` — c'est ce branchement-là qu'on lit ici.
  const settingsV2 = readFileSync(
    resolve(__dirname, '../../components/v2/SettingsV2.svelte'),
    'utf-8',
  );

  it('le badge est monté DANS l’en-tête de la carte de zone', () => {
    expect(settingsV2).toContain(
      "import BadgeVerrouVolumeZone from './BadgeVerrouVolumeZone.svelte';",
    );

    const carte = settingsV2.indexOf('<div class="zch">');
    expect(carte, 'la carte de zone doit exister').toBeGreaterThan(-1);
    const montage = settingsV2.indexOf('<BadgeVerrouVolumeZone zoneId={z.id} />', carte);
    expect(montage, 'le badge doit être monté après l’en-tête de carte').toBeGreaterThan(carte);
    // Et dans CETTE carte, pas trente lignes plus bas dans une autre section :
    // la fermeture de l'en-tête ne doit pas s'intercaler.
    expect(montage).toBeLessThan(settingsV2.indexOf('{#if atLeast(level,', carte));
  });
});

/* ========================================================================== *
 * LES ONZE LANGUES
 * ========================================================================== */

describe('les onze langues portent les libellés du badge', () => {
  const DICTS: Record<string, Record<string, string | undefined>> = Object.fromEntries(
    ONZE_LANGUES.map((code) => [code, dictionnaire(code)]),
  );

  /**
   * Les quatre clés que le badge REND. Chacune est produite par
   * `volumeLockLabelKey()` ou `volumeLockOriginKey()` sur l'un des quatre états
   * possibles — le tableau n'est donc plus une liste d'intentions, il est
   * l'image exacte de ce que le code demande au dictionnaire.
   */
  const KEYS = [
    volumeLockLabelKey({ locked: true, inherited: true }),
    volumeLockLabelKey({ locked: false, inherited: true }),
    volumeLockOriginKey({ locked: true, inherited: true }),
    volumeLockOriginKey({ locked: true, inherited: false }),
  ];

  /**
   * 🔴 `devices.volumeLockHint` n'est PAS dans `KEYS`, et ce n'est pas un oubli.
   *
   * L'infobulle disait « Information seule. Ce verrou se règle dans Réglages →
   * Général → Lecture. » Depuis le portage v2, le verrou se règle AUSSI par
   * zone, depuis le panneau « chemin du signal » (`audiophile.lockVolumeZone`) :
   * le texte est incomplet dans onze langues, et le rendre enverrait
   * l'utilisateur au mauvais écran. Le badge est donc rendu SANS infobulle en
   * attendant l'arbitrage de Bertrand — une rédaction dans onze langues est une
   * décision produit.
   *
   * La clé reste vérifiée pour ce qu'elle est : traduite partout, prête à
   * servir. Et il est dit ici à voix haute qu'AUCUN écran ne la rend.
   */
  const CLE_EN_ATTENTE_ARBITRAGE = 'devices.volumeLockHint';

  it('les onze dictionnaires sont bien onze', () => {
    expect(Object.keys(DICTS)).toHaveLength(11);
  });

  it('les quatre clés du badge sont bien quatre, et distinctes', () => {
    expect(new Set(KEYS).size).toBe(4);
  });

  for (const [locale, dict] of Object.entries(DICTS)) {
    it(`${locale} traduit les quatre libellés du badge, sans les confondre`, () => {
      for (const cle of KEYS) {
        const libelle = dict[cle];
        expect(libelle, `${locale} ne déclare pas ${cle}`).toBeTypeOf('string');
        expect(libelle!.trim(), `${locale} laisse ${cle} vide`).not.toBe('');
        // Une valeur qui répète sa propre clé est une non-traduction : l'écran
        // afficherait « devices.volumeLockOn » à l'utilisateur.
        expect(libelle, `${locale} recopie la clé ${cle}`).not.toContain(cle);
      }

      // ÉTAT : « verrouillé » et « non verrouillé » doivent différer, sinon le
      // badge annonce le même mot dans les deux cas — le défaut exact que
      // l'en-tête de `audiophileLockBadge.ts` interdit, et il se paye en
      // matériel.
      expect(
        dict[volumeLockLabelKey({ locked: true, inherited: true })],
        `${locale} dit la même chose verrouillé et non verrouillé`,
      ).not.toBe(dict[volumeLockLabelKey({ locked: false, inherited: true })]);

      // PROVENANCE : « hérité » et « propre à la zone » doivent différer, sinon
      // l'utilisateur va désarmer le réglage général d'une zone qui ne
      // l'écoute pas.
      expect(
        dict[volumeLockOriginKey({ locked: true, inherited: true })],
        `${locale} confond héritage et surcharge de zone`,
      ).not.toBe(dict[volumeLockOriginKey({ locked: true, inherited: false })]);

      // L'infobulle reste traduite, même si aucun écran ne la rend encore.
      expect(
        dict[CLE_EN_ATTENTE_ARBITRAGE],
        `${locale} ne déclare pas ${CLE_EN_ATTENTE_ARBITRAGE}`,
      ).toBeTypeOf('string');
    });
  }
});
