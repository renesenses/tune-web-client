import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
 * « Ouvrez Réglages › Plugins » — le fil de navigation est FAUX (#2104, même
 * famille que le renvoi de l'analyse acoustique).
 *
 * « Plugins » n'est pas un onglet des Paramètres : c'est une rubrique de
 * premier niveau du menu latéral (`nav.plugins`, Sidebar.svelte). Les sept
 * onglets des Paramètres sont Général, Bibliothèque, Services, Réseau,
 * Système, CLAP et Appareils — aucun ne s'appelle Plugins. Le seul point
 * d'entrée depuis les Paramètres est un bouton « Parcourir les plugins »
 * enfoui dans l'onglet Système, lui-même masqué sous le niveau d'affichage
 * requis : un utilisateur qui suit l'indication à la lettre ne trouve rien.
 *
 * La forme « X › Y » affirme une imbrication qui n'existe pas. Le message ne
 * doit plus la porter, et doit nommer la rubrique avec le libellé RÉEL de
 * l'écran — interpolé depuis `nav.plugins`, pour qu'un renommage n'oblige pas
 * à rouvrir onze locales (le correctif de #2104 a posé ce motif).
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

const CLE = 'bandcamp.dormantInstall';

const vue = readFileSync(
  resolve(__dirname, '../../components/BandcampView.svelte'),
  'utf8',
);

describe('renvoi « installez le plugin bandcamp » — la rubrique Plugins', () => {
  it('les onze langues sont couvertes par ce test', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const [nom, dict] of LANGUES) {
    it(`${nom} ne présente plus Plugins comme un sous-niveau`, () => {
      const valeur = dict[CLE];
      expect(valeur, `${CLE} manque en ${nom}`).toBeDefined();
      // « › » (ou « > ») encode un chemin parent → enfant. Il n'y en a pas.
      expect(
        String(valeur),
        `${nom} : le message décrit encore un chemin imbriqué`,
      ).not.toMatch(/[›>]/);
    });

    it(`${nom} nomme la rubrique par interpolation`, () => {
      const valeur = String(dict[CLE]);
      expect(
        valeur,
        `${nom} : la rubrique doit venir de nav.plugins, pas être écrite en dur`,
      ).toContain('{rubrique}');
    });

    it(`${nom} traduit nav.plugins`, () => {
      const libelle = dict['nav.plugins'];
      expect(libelle, `nav.plugins manque en ${nom}`).toBeDefined();
      expect(String(libelle).trim().length).toBeGreaterThan(0);
      expect(libelle).not.toBe('nav.plugins');
    });
  }

  it('la vue interpole {rubrique} depuis nav.plugins', () => {
    expect(vue).toContain("replace('{rubrique}'");
    expect(vue).toContain("nav.plugins");
  });

  it('la vue offre un accès cliquable à la rubrique Plugins', () => {
    // Le motif existe déjà ailleurs (SettingsView « Parcourir les plugins »,
    // StreamingView « Aller aux Réglages ») : une indication textuelle seule
    // laisse l'utilisateur chercher.
    expect(vue).toContain("activeView.set('plugins')");
  });
});
