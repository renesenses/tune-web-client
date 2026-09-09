/**
 * #2207 — la zone doit dire la VÉRITÉ, pas la consigne.
 *
 * Le serveur savait depuis longtemps quel périphérique il avait ouvert
 * (`opened_device_name()` côté WASAPI, le nom résolu côté cpal/ASIO/CoreAudio),
 * mais son unique lecteur était une ligne de journal. Un testeur dont la zone
 * est réglée sur un DAC et dont le son sort sur les haut-parleurs n'avait
 * aucun moyen de le constater sans poster une capture de ses logs.
 *
 * Ces tests éprouvent les trois maillons de la chaîne d'affichage :
 * la décision (pure), son BRANCHEMENT dans les deux panneaux « Chemin du
 * signal », et la présence des libellés dans les onze locales.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as locales from '../locales';
import { lecturePeripheriqueSortie } from '../peripheriqueSortieZone';
import type { Zone } from '../types';

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

const CLES = [
  'signal.outputDevice',
  'signal.outputDeviceRequested',
  'signal.outputDeviceMismatch',
];

/** Une zone minimale porteuse d'un statut de sortie locale. */
function zoneAvecDevice(device: unknown): Zone {
  return {
    id: 1,
    name: 'Salon',
    audio_backend_status: {
      active: 'WASAPI',
      requested: 'wasapi',
      fell_back: false,
      device,
    },
  } as unknown as Zone;
}

describe('#2207 — le périphérique réellement ouvert arrive à l’écran', () => {
  it('LE FAIT DE BASE : un périphérique différent du demandé porte les deux noms', () => {
    const lecture = lecturePeripheriqueSortie(
      zoneAvecDevice({
        backend: 'WASAPI',
        requested: 'Topping D90 SE',
        opened: 'Haut-parleurs (Realtek Audio)',
        opened_id: '{0.0.0.00000000}.{aaaa}',
        differs: true,
      }),
    );

    expect(lecture).not.toBeNull();
    expect(lecture!.demande).toBe('Topping D90 SE');
    expect(lecture!.ouvert).toBe('Haut-parleurs (Realtek Audio)');
    expect(lecture!.ecart).toBe(true);
    expect(lecture!.backend).toBe('WASAPI');
  });

  it('LE TÉMOIN : le DAC demandé joue, aucun écart n’est annoncé', () => {
    const lecture = lecturePeripheriqueSortie(
      zoneAvecDevice({
        backend: 'ALSA',
        requested: 'Topping D90 SE',
        opened: 'Topping D90 SE',
        opened_id: 'hw:CARD=D90',
        differs: false,
      }),
    );

    expect(lecture!.ouvert).toBe('Topping D90 SE');
    expect(lecture!.ecart).toBe(false);
  });

  it('« default » demandé et obtenu n’est pas un écart, mais reste NOMMÉ', () => {
    const lecture = lecturePeripheriqueSortie(
      zoneAvecDevice({
        backend: 'CoreAudio',
        requested: 'default',
        opened: 'MacBook Pro Speakers',
        opened_id: null,
        differs: false,
      }),
    );

    expect(lecture!.ecart).toBe(false);
    // « default » ne dit rien à personne : c'est le nom réel qu'on affiche.
    expect(lecture!.ouvert).toBe('MacBook Pro Speakers');
  });

  it('rien à dire quand le serveur ne dit rien — on ne devine pas', () => {
    // Serveur antérieur au champ, ou zone non locale (DLNA, Chromecast).
    expect(lecturePeripheriqueSortie({ id: 1, name: 'Salon' } as Zone)).toBeNull();
    // Sortie locale, mais rien n'a encore joué : `device` vaut null côté
    // serveur — c'est la réponse honnête, pas un nom plausible.
    expect(lecturePeripheriqueSortie(zoneAvecDevice(null))).toBeNull();
    // Charge utile amputée du nom ouvert : rien à afficher.
    expect(
      lecturePeripheriqueSortie(
        zoneAvecDevice({ backend: 'ALSA', requested: 'DAC', opened: '  ', differs: true }),
      ),
    ).toBeNull();
    expect(lecturePeripheriqueSortie(null)).toBeNull();
    expect(lecturePeripheriqueSortie(undefined)).toBeNull();
  });

  it('le verdict du serveur fait foi, il n’est pas recalculé ici', () => {
    // Le serveur a comparé les deux noms à l'INSTANT de l'ouverture. Refaire
    // la comparaison ici sur des chaînes normalisées entre-temps produirait un
    // second avis — et deux mécanismes pour une même intention.
    const lecture = lecturePeripheriqueSortie(
      zoneAvecDevice({
        backend: 'WASAPI',
        requested: 'DAC USB',
        opened: 'DAC USB',
        differs: true,
      }),
    );
    expect(lecture!.ecart).toBe(true);
  });

  it('sans `differs` (serveur intermédiaire), l’écart se déduit des deux noms', () => {
    const devie = lecturePeripheriqueSortie(
      zoneAvecDevice({ backend: 'ALSA', requested: 'DAC USB', opened: 'Haut-parleurs' }),
    );
    expect(devie!.ecart).toBe(true);

    const honore = lecturePeripheriqueSortie(
      zoneAvecDevice({ backend: 'ALSA', requested: 'DAC USB', opened: 'DAC USB' }),
    );
    expect(honore!.ecart).toBe(false);
  });
});

describe('#2207 — le BRANCHEMENT dans les deux panneaux « Chemin du signal »', () => {
  // Le défaut corrigé est précisément « écrit mais pas branché » : deux
  // accesseurs justes côté serveur, aucun lecteur. Un composant juste et non
  // monté referait exactement la même faute, un cran plus loin.
  for (const panneau of ['TransportBar', 'NowPlaying']) {
    it(`${panneau} monte le panneau du périphérique ouvert`, () => {
      const source = readFileSync(
        resolve(__dirname, `../../components/${panneau}.svelte`),
        'utf-8',
      );
      expect(source).toContain(
        "import ZoneOutputDeviceNotice from './ZoneOutputDeviceNotice.svelte'",
      );
      expect(source).toContain('<ZoneOutputDeviceNotice {zone} />');
    });
  }

  it('le composant lit la décision partagée, il ne la réécrit pas', () => {
    const source = readFileSync(
      resolve(__dirname, '../../components/ZoneOutputDeviceNotice.svelte'),
      'utf-8',
    );
    expect(source).toContain(
      "import { lecturePeripheriqueSortie } from '../lib/peripheriqueSortieZone'",
    );
    // Les deux noms sont affichés, et l'écart est signalé.
    expect(source).toContain("$t('signal.outputDevice')");
    expect(source).toContain("$t('signal.outputDeviceRequested')");
    expect(source).toContain("$t('signal.outputDeviceMismatch')");
  });
});

describe('#2207 — les onze locales portent les libellés', () => {
  for (const [code, dictionnaire] of Object.entries(LANGUES)) {
    it(`${code} nomme le périphérique ouvert, le demandé et l’écart`, () => {
      for (const cle of CLES) {
        const valeur = dictionnaire[cle];
        expect(valeur, `${code} : clé « ${cle} » absente`).toBeTruthy();
        expect(valeur.trim().length, `${code} : « ${cle} » vide`).toBeGreaterThan(0);
      }
      // Le message d'écart doit être une phrase, pas un mot repris du libellé.
      expect(
        dictionnaire['signal.outputDeviceMismatch'],
        `${code} : le message d’écart doit expliquer, pas étiqueter`,
      ).not.toBe(dictionnaire['signal.outputDevice']);
    });
  }

  it('aucune locale ne recopie le français hors du fr', () => {
    const fr = LANGUES.fr;
    for (const [code, dictionnaire] of Object.entries(LANGUES)) {
      if (code === 'fr') continue;
      for (const cle of CLES) {
        expect(dictionnaire[cle], `${code} : « ${cle} » laissé en français`).not.toBe(
          fr[cle],
        );
      }
    }
  });
});
