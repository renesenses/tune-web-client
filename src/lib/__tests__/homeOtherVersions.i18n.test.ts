import { describe, it, expect } from 'vitest';

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
 * Les libellés de la section « Autres versions » ne doivent RIEN promettre sur
 * la journée en cours.
 *
 * `GET /home/other-versions` ne borne pas sur le jour civil : elle part des
 * 200 dernières écoutes (`tune-server/src/routes/home.rs`, `ECOUTES_EXAMINEES`).
 * La borne journalière a été retirée délibérément — minuit UTC coupait la
 * soirée du testeur, et un jour ordinaire ne contenait pas assez de matière
 * pour remplir la section. Le libellé, lui, était resté à « du jour » dans les
 * onze langues : il envoyait chercher une logique qui n'existe plus.
 *
 * Deux clés sont concernées, toutes deux dessinées par cette seule section
 * (`HomeView.svelte`) : son titre, et la mention de l'album d'où vient
 * l'écoute, affichée sur CHAQUE groupe.
 *
 * Ce test verrouille le contrat dans les deux sens : les clés existent
 * partout, et aucune traduction ne parle de la journée. Refs #2359.
 */
const CLES = ['home.otherVersions', 'home.playedFrom'] as const;

/**
 * Un mot entier, frontières comprises au sens Unicode : `\b` de JavaScript ne
 * connaît que l'ASCII et couperait « más » ou « ascultărilor » en deux.
 */
const mot = (...formes: string[]) =>
  new RegExp(`(?<!\\p{L})(?:${formes.join('|')})(?!\\p{L})`, 'iu');

const LANGUES: [string, Dict, RegExp][] = [
  ['fr', fr as Dict, /aujourd|jour/iu],
  ['en', en as Dict, mot('today', "today's", 'todays')],
  ['de', de as Dict, /heut/iu],
  ['es', es as Dict, mot('hoy')],
  ['it', it_ as Dict, mot('oggi')],
  ['ja', ja as Dict, /今日|本日/u],
  ['ko', ko as Dict, /오늘/u],
  ['ro', ro as Dict, mot('azi', 'astăzi', 'astazi')],
  ['sv', sv as Dict, /dagens|idag|i dag/iu],
  ['zh', zh as Dict, /今日|今天/u],
  ['hu', hu as Dict, mot('mai', 'ma')],
];

describe('Autres versions — aucun libellé ne promet « du jour »', () => {
  it('couvre bien les onze langues livrées', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const cle of CLES) {
    for (const [langue, dict, interdit] of LANGUES) {
      it(`${cle} — ${langue} : la clé existe`, () => {
        expect(dict[cle], `${cle} manque en ${langue}`).toBeTruthy();
      });

      it(`${cle} — ${langue} : le libellé ne borne pas sur la journée`, () => {
        const valeur = dict[cle] ?? '';
        expect(
          interdit.test(valeur),
          `« ${valeur} » (${langue}, ${cle}) promet la journée en cours, ` +
            `alors que la route part des 200 dernières écoutes`,
        ).toBe(false);
      });
    }
  }

  it('l\'ancienne clé « home.playedToday » a bien disparu partout', () => {
    for (const [langue, dict] of LANGUES) {
      expect(
        dict['home.playedToday'],
        `home.playedToday subsiste en ${langue} : la section n'affiche plus ` +
          `« aujourd'hui », la clé ne doit plus exister`,
      ).toBeUndefined();
    }
  });
});
