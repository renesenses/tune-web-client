import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

type Dict = Record<string, string | undefined>;

/**
 * « Correction de pièce », « profil mesuré » : dans le monde audiophile ces
 * mots désignent un traitement calculé à partir d'une MESURE acoustique. Les
 * employer sans mesure n'est pas une approximation de vocabulaire, c'est une
 * promesse que le produit ne tient pas — devant exactement le public qui
 * achète Tune pour cette raison-là (#2213).
 *
 * Tune contient les DEUX choses, et c'est pour cela que le test est
 * bidirectionnel :
 *
 * - le PROFILEUR (`EqualizerView`, bouton « Réinitialiser » du mode simple)
 *   ne mesure rien du tout. Il pose trois questions — pièce petite/moyenne/
 *   grande, enceintes contre le mur ou dégagées — puis offre trois curseurs
 *   réglés À L'OREILLE. La vue le dit elle-même : « Pas besoin de micro ! »
 *   (`eq.slidersByEar`). Son infobulle n'a donc le droit de promettre AUCUNE
 *   mesure.
 *
 * - la CORRECTION FIR (`ZoneConfigModal`), elle, part bien d'un fichier
 *   d'impulsion exporté par REW / ARTA / Dirac, c'est-à-dire d'une vraie
 *   mesure. Elle DOIT continuer à le dire : effacer le mot « mesure » là où la
 *   mesure existe vraiment appauvrirait l'interface au lieu de la rendre
 *   honnête.
 *
 * Le test redevient donc rouge dans les deux sens : si le vocabulaire de la
 * mesure revient sur le profileur à l'oreille, et s'il disparaît de la seule
 * fonction qui repose réellement sur une mesure.
 */
const LANGUES: Array<[string, Dict]> = [
  ['fr', fr as Dict],
  ['en', en as Dict],
  ['de', de as Dict],
  ['es', es as Dict],
  ['it', it_ as Dict],
  ['ja', ja as Dict],
  ['ko', ko as Dict],
  ['ro', ro as Dict],
  ['sv', sv as Dict],
  ['zh', zh as Dict],
  ['hu', hu as Dict],
];

/**
 * Le vocabulaire de la mesure, par langue. Racines volontairement courtes :
 * « mesur » attrape « mesuré », « mesurée », « mesure » ; « measur » attrape
 * « measured » et « measurement ».
 */
const MOTS_DE_MESURE: Record<string, string[]> = {
  fr: ['mesur'],
  en: ['measur'],
  de: ['gemessen', 'messung'],
  es: ['medid', 'medici'],
  it: ['misurat', 'misuraz'],
  ja: ['測定', '計測'],
  ko: ['측정'],
  ro: ['măsurat', 'masurat', 'măsurăt'],
  sv: ['uppmätt', 'mätning', 'mätt'],
  zh: ['测量', '測量'],
  hu: ['mért', 'mérés'],
};

/** Les outils cités par la description FIR : la preuve que la mesure existe. */
const OUTILS_DE_MESURE = ['REW', 'ARTA', 'Dirac'];

describe('terminologie EQ : le mot « mesure » suit la mesure (#2213)', () => {
  it("le profileur à l'oreille ne mesure rien — sa réinitialisation ne doit promettre aucune mesure", () => {
    for (const [langue, dict] of LANGUES) {
      const texte = dict['tip.eqResetProfiler'];
      expect(texte, `tip.eqResetProfiler absente en ${langue}`).toBeTruthy();

      for (const mot of MOTS_DE_MESURE[langue]) {
        expect(
          texte!.toLowerCase().includes(mot.toLowerCase()),
          `[${langue}] « ${texte} » promet une mesure (« ${mot} ») alors que le ` +
            `profileur ne fait que trois questions et trois curseurs à l'oreille ` +
            `— la vue affiche elle-même « Pas besoin de micro ! »`,
        ).toBe(false);
      }
    }
  });

  it('la correction FIR part bien d\'une mesure — elle doit continuer à le dire', () => {
    for (const [langue, dict] of LANGUES) {
      const texte = dict['zoneConfig.firDesc'];
      expect(texte, `zoneConfig.firDesc absente en ${langue}`).toBeTruthy();

      const citeUnOutil = OUTILS_DE_MESURE.some((o) => texte!.includes(o));
      expect(
        citeUnOutil,
        `[${langue}] « ${texte} » ne cite plus aucun outil de mesure ` +
          `(${OUTILS_DE_MESURE.join(', ')}) : c'est pourtant la SEULE fonction ` +
          `de Tune fondée sur une vraie mesure de la pièce, et le seul endroit ` +
          `où le vocabulaire de la correction de pièce est mérité.`,
      ).toBe(true);
    }
  });

  it("le bouton « Réinitialiser » du profileur ne touche effectivement à aucune mesure", () => {
    // Le libellé doit suivre le CODE, pas l'inverse : on vérifie ici que
    // `resetProfiler` remet à zéro les trois curseurs et le profil EQ de la
    // zone, et qu'il n'efface, ne lit ni ne poste la moindre mesure.
    const vue = readFileSync(
      fileURLToPath(new URL('../../components/EqualizerView.svelte', import.meta.url)),
      'utf8',
    );

    const debut = vue.indexOf('async function resetProfiler()');
    expect(debut, 'resetProfiler() introuvable dans EqualizerView.svelte').toBeGreaterThan(-1);
    const corps = vue.slice(debut, debut + 1200);

    for (const curseur of ['bassSlider = 0', 'midSlider = 0', 'trebleSlider = 0']) {
      expect(corps, `resetProfiler() ne remet plus ${curseur}`).toContain(curseur);
    }

    // Rien qui ressemble à une mesure ne doit apparaître dans ce chemin.
    for (const trace of ['measurement', 'room-correction', 'roomCorrection', 'ir/upload', 'fir']) {
      expect(
        corps.toLowerCase().includes(trace.toLowerCase()),
        `resetProfiler() touche « ${trace} » : si une mesure entre vraiment ` +
          `dans ce chemin, c'est le premier test qu'il faut revoir, pas celui-ci.`,
      ).toBe(false);
    }
  });
});
