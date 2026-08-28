import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as locales from '../locales';

/**
 * #2260 — l'intitulé d'une section ne doit promettre que ce que la section
 * contient.
 *
 * `settings.perZoneHint` s'affiche sous le titre « Réglages par zone » de
 * `SettingsView.svelte`. Il annonçait « … et gapless » dans les onze langues,
 * alors que le bloc n'a jamais offert le moindre contrôle de gapless : le
 * champ `gapless_enabled` du serveur n'est écrit par AUCUN écran.
 *
 * Le test est **bidirectionnel**, et c'est tout son intérêt : il ne fige pas
 * une chaîne, il lie la promesse au contenu réel. Si quelqu'un ajoute un jour
 * la case gapless au bloc, ce test devient rouge jusqu'à ce que les onze
 * intitulés la mentionnent — et s'il retire le contrôle, rouge jusqu'à ce que
 * les onze cessent de la promettre. C'est la règle, pas son résultat, qui est
 * gardée.
 *
 * ⚠️ Le contrôle serait de toute façon inerte sur une partie des sorties :
 * `supports_internal_gapless()` rend `false` pour Chromecast, SlimProto,
 * Squeezebox/LMS et les sorties locales en mode exclusif (ASIO / WASAPI
 * exclusif). Le réglage n'a d'effet que sur DLNA, BluOS, pont, OpenHome avec
 * service `playlist`, OAAT et la sortie locale partagée. Ajouter une case
 * « Gapless » indifférenciée recréerait le défaut voisin de #2154 : un réglage
 * qui répond « enregistré » sans rien changer.
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

/** Ce qui, dans chaque langue, PROMET un enchaînement sans blanc. */
const PROMESSE_GAPLESS: Record<string, RegExp> = {
  fr: /gapless|sans (?:pause|blanc|coupure)|encha[iî]nement/i,
  en: /gapless|seamless/i,
  de: /gapless|lückenlos/i,
  es: /gapless|sin (?:pausas|cortes)/i,
  it: /gapless|senza (?:pause|interruzioni)/i,
  zh: /无缝|无间隙/,
  ja: /ギャップレス|途切れ/,
  ko: /갭리스|끊김/,
  ro: /gapless|fără (?:pauze|întreruperi)/i,
  sv: /gapless|sömlös/i,
  hu: /gapless|szünetmentes/i,
};

/**
 * Le bloc « Réglages par zone » tel qu'il est réellement écrit : du titre de
 * la section à sa fermeture. On ne lit pas tout le fichier — les autres
 * sections parlent aussi de gapless ailleurs, et ce test ne juge que celle-ci.
 */
function blocReglagesParZone(): string {
  const source = readFileSync(
    resolve(__dirname, '../../components/SettingsView.svelte'),
    'utf-8',
  );
  const debut = source.indexOf("<h3>{$t('settings.perZoneSettings')}</h3>");
  expect(debut, 'section « Réglages par zone » introuvable').toBeGreaterThanOrEqual(0);
  const fin = source.indexOf('\n      </section>', debut);
  expect(fin, 'fin de la section « Réglages par zone » introuvable').toBeGreaterThan(debut);
  return source.slice(debut, fin);
}

describe('#2260 — « Réglages par zone » ne promet que ce qu\'il offre', () => {
  const bloc = blocReglagesParZone();
  /** Le bloc écrit-il vraiment `gapless_enabled` sur le serveur ? */
  const offreLeGapless = /gapless_enabled/.test(bloc);

  it('le bloc contient bien les contrôles que l\'intitulé peut nommer', () => {
    // Garde-fou du garde-fou : si ces ancres disparaissent, c'est le bloc qui
    // a bougé, et l'extraction ci-dessus ne veut plus rien dire.
    expect(bloc).toContain('updateZoneDsdMode');
    expect(bloc).toContain('updateZoneMaxSampleRate');
    expect(bloc).toContain('updateZoneFixedVolume');
  });

  for (const [code, dictionnaire] of Object.entries(LANGUES)) {
    it(`${code} : l'intitulé promet le gapless si et seulement si le bloc l'offre`, () => {
      const intitule = dictionnaire['settings.perZoneHint'];
      expect(intitule, `settings.perZoneHint manquant en ${code}`).toBeTruthy();
      expect(PROMESSE_GAPLESS[code].test(intitule)).toBe(offreLeGapless);
    });
  }
});
