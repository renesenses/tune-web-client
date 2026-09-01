import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cleAleatoire,
  cleRepetition,
  libelleAleatoire,
  libelleRepetition,
} from '../etatTransport';
import type { RepeatMode } from '../types';

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

/**
 * Infobulles d'état de la barre de lecture — `renesenses/tune-server-rust#2733`.
 *
 * Marco Polo (forum, fil 1601) : « seul le mot "Aléatoire" s'affiche peu
 * importe si ON ou OFF […] j'éprouve de la difficulté à déterminer la valeur
 * du réglage seulement par la couleur du pictogramme ».
 *
 * Ce test tient trois choses :
 *   — chaque état a bien son libellé, distinct des autres, dans les 11 langues ;
 *   — le libellé garde le NOM de la commande (« combiner le nom de la fonction
 *     et son état serait encore mieux ») et ne le remplace pas par l'état ;
 *   — les quatre points d'entrée passent par la règle commune, avec le bon
 *     attribut ARIA : `aria-pressed` sur Aléatoire, jamais sur Répéter.
 */

type Dict = Record<string, string | undefined>;

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

const MODES: RepeatMode[] = ['off', 'one', 'all'];

describe('la règle commune donne une clé par état', () => {
  it('Aléatoire : deux états, deux clés', () => {
    expect(cleAleatoire(true)).toBe('transport.shuffleOn');
    expect(cleAleatoire(false)).toBe('transport.shuffleOff');
  });

  it('Répéter : TROIS états, trois clés — pas deux', () => {
    const cles = MODES.map(cleRepetition);
    expect(new Set(cles).size).toBe(3);
    expect(cleRepetition('off')).toBe('transport.repeatOff');
    expect(cleRepetition('one')).toBe('transport.repeatOne');
    expect(cleRepetition('all')).toBe('transport.repeatAll');
  });

  it('un mode inattendu retombe sur « désactivé », jamais sur une clé nue', () => {
    expect(cleRepetition('bidon' as RepeatMode)).toBe('transport.repeatOff');
  });
});

describe('les onze langues portent les cinq libellés', () => {
  it('le test couvre bien onze langues', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    const t = (cle: string) => dict[cle] ?? cle;

    it(`${nom} — les deux états d'Aléatoire sont traduits et distincts`, () => {
      const on = libelleAleatoire(t, true);
      const off = libelleAleatoire(t, false);
      for (const [etat, valeur] of [['on', on], ['off', off]] as const) {
        expect(valeur, `shuffle ${etat} manque en ${nom}`).not.toMatch(/^transport\./);
        expect(valeur.trim().length).toBeGreaterThan(0);
      }
      expect(on, `en ${nom}, les deux états d'Aléatoire se lisent pareil`).not.toBe(off);
    });

    it(`${nom} — les trois états de Répéter sont traduits et distincts`, () => {
      const libelles = MODES.map((m) => libelleRepetition(t, m));
      for (const l of libelles) {
        expect(l, `un état de Répéter manque en ${nom}`).not.toMatch(/^transport\./);
        expect(l.trim().length).toBeGreaterThan(0);
      }
      expect(
        new Set(libelles).size,
        `en ${nom}, deux états de Répéter portent le même libellé`,
      ).toBe(3);
    });

    it(`${nom} — le libellé garde le nom de la commande, il ne le remplace pas`, () => {
      // Le testeur a demandé « le nom de la fonction ET son état ». Un libellé
      // réduit à « Activé » ne dirait plus de QUOI on parle.
      const nomAleatoire = String(dict['transport.shuffle']);
      const nomRepeter = String(dict['transport.repeat']);
      for (const actif of [true, false]) {
        expect(libelleAleatoire(t, actif)).toContain(nomAleatoire);
      }
      for (const mode of MODES) {
        expect(libelleRepetition(t, mode)).toContain(nomRepeter);
      }
    });

    it(`${nom} — l'état ajoute bien quelque chose au nom seul`, () => {
      expect(libelleAleatoire(t, true)).not.toBe(dict['transport.shuffle']);
      expect(libelleRepetition(t, 'off')).not.toBe(dict['transport.repeat']);
    });
  }
});

const lire = (f: string) => readFileSync(resolve(__dirname, '../../components', f), 'utf8');
const GABARITS: Array<[string, string]> = [
  ['TransportBar.svelte', lire('TransportBar.svelte')],
  ['NowPlaying.svelte', lire('NowPlaying.svelte')],
];

describe('les quatre points d\'entrée passent par la règle commune', () => {
  for (const [nom, src] of GABARITS) {
    it(`${nom} — plus aucune infobulle figée sur le nom seul`, () => {
      expect(src).not.toMatch(/title=\{\$t\('transport\.(shuffle|repeat)'\)\}/);
    });

    it(`${nom} — Aléatoire et Répéter appellent le module partagé`, () => {
      expect(src).toContain("from '../lib/etatTransport'");
      expect(src).toMatch(/libelleAleatoire\(\$t, \$shuffleEnabled\)/);
      expect(src).toMatch(/libelleRepetition\(\$t, \$repeatMode\)/);
    });

    it(`${nom} — Aléatoire porte aria-pressed`, () => {
      expect(src).toMatch(/aria-pressed=\{\$shuffleEnabled\}/);
    });

    it(`${nom} — Répéter n'en porte pas : trois états, aria-pressed n'en dit que deux`, () => {
      expect(src).not.toMatch(/aria-pressed=\{\$repeatMode/);
      expect(src).toMatch(/aria-label=\{libelleRepetition\(\$t, \$repeatMode\)\}/);
    });
  }
});
