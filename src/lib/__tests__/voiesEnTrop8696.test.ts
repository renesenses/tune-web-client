/**
 * tune-server-rust#8696 — un fichier multicanal (DSF 6 canaux) vers une
 * sortie WASAPI exclusive stéréo : le serveur émet `zone.playback_error`
 * avec le code `exclusive_channels_exceed_device` et ses paramètres ; le
 * client compose la phrase dans sa langue, la phrase française du serveur
 * reste dans le détail.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { lireEvenementErreur } from '../messageServeur';
import { CHARGEURS, type Locale } from '../locales';

const LOCALES = Object.keys(CHARGEURS) as Locale[];
const CODE = 'exclusive_channels_exceed_device';
const FRANCAIS = 'Cette sortie a refusé en mode exclusif les 6 voies de ce fichier (Windows ne lui en déclare que 2)';

afterEach(() => { locale.set('fr'); });

describe('#8696 — voies en trop pour la sortie exclusive', () => {
  for (const l of LOCALES) {
    it(`${l} : le code est traduit, les deux nombres de voies interpolés`, () => {
      locale.set(l);
      const lu = lireEvenementErreur(
        { zone_id: 1, fatal: true, error: FRANCAIS, code: CODE, params: { source_channels: 6, device_channels: 2 } },
        'erreursServeur.generique',
      );
      expect(lu.message, l).not.toBe(get(t)('erreursServeur.generique'));
      expect(lu.message).toContain('6');
      expect(lu.message).toContain('2');
      expect(lu.message).not.toMatch(/\{\w+\}/);
      expect(lu.detail).toContain(FRANCAIS);
    });

    it(`${l} : le dictionnaire porte la clé et ses deux paramètres`, async () => {
      const dico = (await CHARGEURS[l]()).default as Record<string, string>;
      const texte = dico[`erreursServeur.${CODE}`];
      expect(texte, `${l} : erreursServeur.${CODE}`).toBeTruthy();
      expect(texte).toContain('{source_channels}');
      expect(texte).toContain('{device_channels}');
    });
  }
});
