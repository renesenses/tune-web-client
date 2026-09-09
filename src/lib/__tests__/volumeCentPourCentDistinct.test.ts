import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as locales from '../locales';

/**
 * Deux réglages qui poussent le volume à 100 % ne doivent pas se lire pareil —
 * `renesenses/tune-server-rust#2506`.
 *
 * Marco Polo (forum, fil 1546) avait vérifié la case « Volume fixe » de son
 * Denon RCD-N12 — décochée, captures à l'appui — puis vu le volume partir à
 * 100 % en passant en mode Audiophile. Il en a conclu, logiquement, que la
 * protection annoncée n'existait pas.
 *
 * Elle existait. Ce n'était pas le bon réglage. Le saut vient du réglage
 * GLOBAL (`audiophile_lock_volume`), pas de la case PAR APPAREIL
 * (`zones.fixed_volume`) — deux clés, deux écrans, et deux libellés qui
 * promettaient tous les deux « 100 % » sans jamais dire ni QUAND ni SUR QUOI.
 *
 * Il a confirmé lui-même, le 27/08 : « l'item "Lecture - Volume à 100% en mode
 * audiophile..." était bel et bien coché. »
 *
 * Ces réglages touchent au risque matériel — un testeur a écrit publiquement
 * qu'un volume à 100 % « peut flinguer vos enceintes ». Un libellé qui prête à
 * confusion n'est donc pas ici un détail cosmétique, et ce test est là pour
 * que la distinction ne se reperde pas à la prochaine relecture de libellés.
 *
 * ⚠️ Ce test ne touche QUE des libellés. Aucun comportement, aucune valeur par
 * défaut, aucune logique de volume n'est en jeu ici.
 */

const LANGUES = {
  fr: locales.fr,
  en: locales.en,
  de: locales.de,
  es: locales.es,
  it: locales.it,
  zh: locales.zh,
  ja: locales.ja,
  ko: locales.ko,
  ro: locales.ro,
  sv: locales.sv,
  hu: locales.hu,
} as Record<string, Record<string, string>>;

describe('les onze langues séparent le réglage par appareil du réglage global', () => {
  it('le test couvre bien onze langues', () => {
    expect(Object.keys(LANGUES)).toHaveLength(11);
  });

  for (const [code, dict] of Object.entries(LANGUES)) {
    it(`${code} — les deux libellés ne se lisent pas pareil`, () => {
      const appareil = dict['settings.fixedVolume'];
      const global = dict['audiophile.lockVolume'];
      expect(appareil?.trim()).toBeTruthy();
      expect(global?.trim()).toBeTruthy();
      expect(appareil).not.toBe(global);
    });

    it(`${code} — chaque aide porte plus qu'une phrase de rappel`, () => {
      // Les deux aides doivent renvoyer à l'AUTRE réglage : c'est le seul
      // endroit où l'utilisateur peut apprendre qu'il en existe deux. Un
      // texte redevenu court est le signe que le renvoi a sauté.
      const aideAppareil = dict['settings.fixedVolumeHint'];
      const aideGlobal = dict['audiophile.lockVolumeHelp'];
      expect(aideAppareil.length).toBeGreaterThan(40);
      expect(aideGlobal.length).toBeGreaterThan(40);
      expect(aideAppareil).not.toBe(aideGlobal);
    });

    it(`${code} — le réglage de zone ne se confond pas avec le défaut global`, () => {
      expect(dict['audiophile.lockVolumeZone']).not.toBe(dict['audiophile.lockVolume']);
      expect(dict['audiophile.lockVolumeZone']?.trim()).toBeTruthy();
    });
  }
});

/**
 * Le contenu des renvois n'est vérifié qu'en français et en anglais : ce sont
 * les deux langues relues mot à mot ici. Les neuf autres sont traduites et
 * tenues structurellement par le bloc ci-dessus — une assertion de sous-chaîne
 * y buterait sur les déclinaisons (« dauerhaft feste » / « dauerhaft festen »)
 * et n'apporterait qu'un test fragile.
 */
const RENVOIS: Record<string, { versGlobal: string; versAppareil: string; quand: string; ou: string }> = {
  fr: {
    versGlobal: "Volume à 100 % quand le mode Audiophile s'active",
    versAppareil: 'Volume fixe permanent',
    quand: "quand le mode Audiophile s'active",
    ou: 'cet appareil',
  },
  en: {
    versGlobal: 'Full volume when Audiophile mode turns on',
    versAppareil: 'Permanent fixed volume',
    quand: 'when Audiophile mode turns on',
    ou: 'this device',
  },
};

describe('chaque aide nomme explicitement l’autre réglage (fr, en)', () => {
  for (const [code, r] of Object.entries(RENVOIS)) {
    const dict = LANGUES[code];

    it(`${code} — l'aide de la case par appareil renvoie au réglage global`, () => {
      expect(dict['settings.fixedVolumeHint']).toContain(r.versGlobal);
    });

    it(`${code} — l'aide du réglage global renvoie à la case par appareil`, () => {
      expect(dict['audiophile.lockVolumeHelp']).toContain(r.versAppareil);
    });

    it(`${code} — le réglage global est nommé par son DÉCLENCHEUR`, () => {
      // « Volume à 100 % en mode Audiophile » ne disait pas quand il agit.
      // Nommé par son déclencheur, il ne peut plus être pris pour un réglage
      // permanent, ce qui était toute la confusion.
      expect(dict['audiophile.lockVolume']).toContain(r.quand);
    });

    it(`${code} — la case par appareil est nommée par sa PORTÉE`, () => {
      expect(dict['settings.fixedVolume']).toContain(r.ou);
    });
  }
});

describe('les libellés restent branchés sur les mêmes écrans', () => {
  const settings = readFileSync(
    resolve(__dirname, '../../components/SettingsView.svelte'),
    'utf-8',
  );

  it('la case par appareil garde son libellé et son aide', () => {
    expect(settings).toContain("$t('settings.fixedVolume')");
    expect(settings).toContain("$t('settings.fixedVolumeHint')");
  });

  it('le réglage global garde son libellé et son aide', () => {
    expect(settings).toContain("$t('audiophile.lockVolume'");
    expect(settings).toContain("$t('audiophile.lockVolumeHelp'");
  });
});
