import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  readVuInstrument,
  vuInstrumentLegacyFlag,
  isVuInstrument,
  VU_INSTRUMENTS,
  VU_INSTRUMENT_DEFAULT,
} from '../tvVuMode';
import {
  BAR_SCALES,
  BAR_SCALE_IDS,
  BAR_SCALE_DEFAULT,
  barFraction,
  barScaleLabel,
  readBarScale,
  redFraction,
} from '../tvBarScale';
import { RED_FROM_DB } from '../tvVuScale';

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

const tvView = readFileSync(resolve(__dirname, '../../components/TvView.svelte'), 'utf-8');
const bars = readFileSync(resolve(__dirname, '../../components/TvVuBars.svelte'), 'utf-8');
const barScaleSrc = readFileSync(resolve(__dirname, '../tvBarScale.ts'), 'utf-8');
const vuModeSrc = readFileSync(resolve(__dirname, '../tvVuMode.ts'), 'utf-8');

/* ------------------------------------------------------------------------ *
 * 1. Migration de la préférence — personne ne perd son réglage (#2514).
 * ------------------------------------------------------------------------ */
describe('migration du booléen `vuMeters` vers un choix d’instrument', () => {
  it('celui qui avait les cadrans allumés garde les cadrans', () => {
    expect(readVuInstrument({ vuMeters: true })).toBe('needle');
  });

  it('celui qui les avait masqués reste sans instrument', () => {
    expect(readVuInstrument({ vuMeters: false })).toBe('off');
  });

  it('celui qui n’avait jamais touché au réglage garde le défaut historique', () => {
    // `vuMeters` absent valait « affichés » (`p.vuMeters !== false`).
    expect(readVuInstrument({ lyrics: true, size: 'M' })).toBe('needle');
    expect(VU_INSTRUMENT_DEFAULT).toBe('needle');
  });

  it('AUCUN réglage existant n’atterrit sur le bargraphe', () => {
    // Le bargraphe est un choix neuf : il se prend, il ne s'hérite pas d'une
    // migration. Un utilisateur ne doit pas trouver son écran changé.
    for (const legacy of [{ vuMeters: true }, { vuMeters: false }, {}, { vuMeters: 1 }]) {
      expect(readVuInstrument(legacy)).not.toBe('bars');
    }
  });

  it('une fois le choix pris, il l’emporte sur l’ancien booléen', () => {
    expect(readVuInstrument({ vuMeter: 'bars', vuMeters: true })).toBe('bars');
    expect(readVuInstrument({ vuMeter: 'off', vuMeters: true })).toBe('off');
    expect(readVuInstrument({ vuMeter: 'needle', vuMeters: false })).toBe('needle');
  });

  it('un choix corrompu retombe sur l’ancien booléen, pas sur le défaut', () => {
    // C'est encore l'intention de l'utilisateur qu'on lit.
    expect(readVuInstrument({ vuMeter: 'bargraphe', vuMeters: false })).toBe('off');
    expect(readVuInstrument({ vuMeter: null, vuMeters: false })).toBe('off');
    expect(readVuInstrument({ vuMeter: 3, vuMeters: true })).toBe('needle');
  });

  it('des réglages illisibles donnent le défaut sans lever', () => {
    for (const junk of [null, undefined, 'off', 42, []]) {
      expect(() => readVuInstrument(junk)).not.toThrow();
    }
    expect(readVuInstrument(null)).toBe('needle');
    expect(readVuInstrument(undefined)).toBe('needle');
    expect(readVuInstrument('bars')).toBe('needle'); // une chaîne n'est pas des réglages
  });

  it('le miroir booléen écrit reste exact pour un retour en arrière', () => {
    expect(vuInstrumentLegacyFlag('off')).toBe(false);
    expect(vuInstrumentLegacyFlag('needle')).toBe(true);
    expect(vuInstrumentLegacyFlag('bars')).toBe(true);
    // Aller-retour : ce qu'une version antérieure relirait ne perd que la
    // distinction aiguille/bargraphe, jamais le « masqué ».
    for (const inst of VU_INSTRUMENTS) {
      const relu = readVuInstrument({ vuMeters: vuInstrumentLegacyFlag(inst) });
      if (inst === 'off') expect(relu).toBe('off');
      else expect(relu).toBe('needle');
    }
  });

  it('les trois instruments, et seulement eux', () => {
    expect([...VU_INSTRUMENTS]).toEqual(['off', 'needle', 'bars']);
    expect(isVuInstrument('bars')).toBe(true);
    expect(isVuInstrument('vu')).toBe(false);
    expect(isVuInstrument(undefined)).toBe(false);
  });

  it('TvView écrit le miroir à côté du choix', () => {
    expect(tvView).toContain('vuMeters: vuInstrumentLegacyFlag(settings.vuMeter)');
    expect(tvView).toContain('vuMeter: readVuInstrument(p)');
  });
});

/* ------------------------------------------------------------------------ *
 * 2. L'échelle dit du dBFS, et rien d'autre.
 * ------------------------------------------------------------------------ */
describe('le bargraphe affiche du dBFS — jamais de la sonie', () => {
  it('aucune échelle ne monte au-dessus de la pleine échelle numérique', () => {
    // C'est l'invariant qui interdit mécaniquement les échelles +9 / +18 des
    // instruments de sonie : au-dessus de 0 dBFS il n'y a rien à afficher.
    for (const id of BAR_SCALE_IDS) {
      const s = BAR_SCALES[id];
      expect(s.maxDb, `${id}.maxDb`).toBe(0);
      for (const tick of s.ticks) {
        expect(tick, `${id} : graduation ${tick}`).toBeLessThanOrEqual(0);
      }
      expect(s.minDb).toBeLessThan(s.maxDb);
    }
  });

  it('ni R128, ni LUFS, ni LKFS nulle part dans l’instrument', () => {
    for (const [nom, src] of [['tvBarScale.ts', barScaleSrc], ['TvVuBars.svelte', bars]] as const) {
      // Le module d'échelle NOMME ces unités pour dire qu'il ne les affiche
      // pas ; on ne cherche donc que les emplois, pas les mentions en
      // commentaire.
      const code = src
        .split('\n')
        .filter((l) => {
          const s = l.trim();
          return !(s.startsWith('//') || s.startsWith('///') || s.startsWith('*') || s.startsWith('/*'));
        })
        .join('\n');
      expect(code, `${nom} : R128`).not.toMatch(/R128/i);
      expect(code, `${nom} : LUFS`).not.toMatch(/LUFS/i);
      expect(code, `${nom} : LKFS`).not.toMatch(/LKFS/i);
    }
  });

  it('l’unité écrite sur l’instrument est « dBFS »', () => {
    expect(bars).toContain("ctx.fillText('dBFS'");
  });

  it('aucun libellé traduit ne promet une mesure de sonie', () => {
    const DICTS = { fr, en, de, es, it: it_, ja, ko, ro, sv, zh, hu } as Record<
      string,
      Record<string, string | undefined>
    >;
    const KEYS = ['tv.vuInstrument', 'tv.vuInstrument.bars', 'tv.vuBarScale', 'tv.stereoVuBars'];
    for (const [locale, dict] of Object.entries(DICTS)) {
      for (const key of KEYS) {
        const value = dict[key] ?? '';
        expect(value, `${locale} / ${key}`).not.toMatch(/R128|LUFS|LKFS/i);
      }
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 3. Le libellé d'échelle ne peut pas mentir sur ce qui est dessiné.
 * ------------------------------------------------------------------------ */
describe('le libellé d’échelle est dérivé de la plage dessinée', () => {
  it('il porte la borne basse réelle et l’unité', () => {
    expect(barScaleLabel(BAR_SCALES.wide)).toBe('−60 dBFS');
    expect(barScaleLabel(BAR_SCALES.zoom)).toBe('−20 dBFS');
  });

  it('il suit la constante, il ne la double pas', () => {
    for (const id of BAR_SCALE_IDS) {
      const s = BAR_SCALES[id];
      expect(barScaleLabel(s)).toBe(`−${Math.abs(s.minDb)} dBFS`);
    }
  });

  it('le panneau affiche ce libellé calculé, pas une chaîne écrite à la main', () => {
    expect(tvView).toContain('barScaleLabel(BAR_SCALES[id])');
  });
});

/* ------------------------------------------------------------------------ *
 * 4. La conversion dBFS → longueur de barre.
 * ------------------------------------------------------------------------ */
describe('placement sur la barre', () => {
  it('les bornes tombent à 0 et à 1', () => {
    for (const id of BAR_SCALE_IDS) {
      const s = BAR_SCALES[id];
      expect(barFraction(s.minDb, s)).toBe(0);
      expect(barFraction(s.maxDb, s)).toBe(1);
    }
  });

  it('un décibel occupe la même longueur partout (linéaire en dB)', () => {
    const s = BAR_SCALES.wide;
    const pas = barFraction(-59, s) - barFraction(-60, s);
    expect(barFraction(-30, s) - barFraction(-31, s)).toBeCloseTo(pas, 12);
    expect(barFraction(0, s) - barFraction(-1, s)).toBeCloseTo(pas, 12);
  });

  it('rien ne déborde de la barre', () => {
    const s = BAR_SCALES.zoom;
    expect(barFraction(-200, s)).toBe(0);
    expect(barFraction(12, s)).toBe(1); // au-dessus de 0 dBFS : plaqué en butée
  });

  it('la zone rouge démarre au même seuil que le cadran à aiguille', () => {
    // Un seul seuil de « on approche de la saturation » pour les deux
    // instruments : le bargraphe importe RED_FROM_DB, il n'en redéfinit pas un.
    expect(barScaleSrc).toContain("from './tvVuScale'");
    for (const id of BAR_SCALE_IDS) {
      const s = BAR_SCALES[id];
      expect(redFraction(s)).toBe(barFraction(RED_FROM_DB, s));
      expect(s.ticks).toContain(RED_FROM_DB);
    }
  });

  it('la plage large est le défaut ; on montre tout avant de zoomer', () => {
    expect(BAR_SCALE_DEFAULT).toBe('wide');
    expect(BAR_SCALES.wide.minDb).toBeLessThan(BAR_SCALES.zoom.minDb);
    expect(readBarScale({})).toBe('wide');
    expect(readBarScale({ vuBarScale: 'zoom' })).toBe('zoom');
    expect(readBarScale({ vuBarScale: 'r128' })).toBe('wide');
    expect(readBarScale(null)).toBe('wide');
  });
});

/* ------------------------------------------------------------------------ *
 * 5. Ce que l'instrument lit vraiment.
 * ------------------------------------------------------------------------ */
describe('le bargraphe ne dessine que ce que le serveur publie', () => {
  it('il lit les crêtes ET les moyennes des mêmes événements audio_levels', () => {
    expect(bars).toContain("from '../lib/stores/audioLevels'");
    expect(bars).toContain('levels.rms_left_db');
    expect(bars).toContain('levels.rms_right_db');
    expect(bars).toContain('levels.peak_left_db');
    expect(bars).toContain('levels.peak_right_db');
  });

  it('il ne fabrique aucune valeur : pas de tirage aléatoire', () => {
    // Même règle que l'analyseur de spectre (#2081) : la hauteur d'une barre
    // vient de la mesure, jamais d'un `Math.random()` ni d'une heuristique
    // tirée des métadonnées de la piste.
    expect(bars).not.toMatch(/Math\.random/);
    expect(bars).not.toMatch(/getEnergyProfile/);
    expect(bars).not.toMatch(/sample_rate|bit_depth/);
  });

  it('la crête et la moyenne restent deux traits distincts', () => {
    // Les confondre était l'erreur du cadran d'origine : c'est la crête qui
    // dit l'écrêtage, pas la moyenne.
    expect(bars).toContain('rmsDb');
    expect(bars).toContain('peakDb');
    expect(bars).toContain('peakMark');
  });

  it('rien ne prétend mesurer une « amplitude dynamique »', () => {
    // Quatrième fonction demandée, laissée de côté : la demande est ambiguë et
    // sans réponse. On ne la devine pas, donc on n'en affiche aucune.
    for (const src of [bars, barScaleSrc, vuModeSrc]) {
      expect(src).not.toMatch(/dynamicRange|dynamic_range|crestFactor|crest_factor|\bDR\b/);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 6. Le montage dans le mode Grand écran.
 * ------------------------------------------------------------------------ */
describe('les trois choix arrivent bien à l’écran', () => {
  it('« aucun » n’affiche aucun instrument', () => {
    // Le gabarit n'a que deux branches : ni l'une ni l'autre pour 'off'.
    expect(tvView).toContain("{#if settings.vuMeter === 'needle'}");
    expect(tvView).toContain("{:else if settings.vuMeter === 'bars'}");
    expect(tvView).not.toContain("settings.vuMeters}");
  });

  it('chaque instrument a son composant', () => {
    expect(tvView).toContain('<TvVuMeters playing={isPlaying}');
    expect(tvView).toContain('<TvVuBars playing={isPlaying} scale={settings.vuBarScale}');
  });

  it('le choix d’échelle n’apparaît qu’avec le bargraphe', () => {
    expect(tvView).toContain("{#if settings.vuMeter === 'bars'}");
  });

  it('le réglage reste un choix dans le panneau, pas une case', () => {
    expect(tvView).toContain("aria-label={$t('tv.vuInstrument' as any)}");
    expect(tvView).toContain('{#each VU_INSTRUMENTS as inst}');
  });
});

/* ------------------------------------------------------------------------ *
 * 7. Les onze langues.
 * ------------------------------------------------------------------------ */
describe('les onze langues portent les libellés du choix d’instrument', () => {
  const DICTS: Record<string, Record<string, string | undefined>> = {
    fr, en, de, es, it: it_, ja, ko, ro, sv, zh, hu,
  };
  const KEYS = [
    'tv.vuInstrument',
    'tv.vuInstrument.off',
    'tv.vuInstrument.needle',
    'tv.vuInstrument.bars',
    'tv.vuBarScale',
    'tv.stereoVuBars',
  ];

  it('les onze dictionnaires sont bien onze', () => {
    expect(Object.keys(DICTS)).toHaveLength(11);
  });

  for (const [locale, dict] of Object.entries(DICTS)) {
    it(`${locale} : les six clés existent et se distinguent`, () => {
      for (const key of KEYS) expect(dict[key], `${locale} / ${key}`).toBeTruthy();
      const options = VU_INSTRUMENTS.map((i) => dict[`tv.vuInstrument.${i}`]);
      expect(new Set(options).size, `${locale} : trois libellés distincts`).toBe(3);
    });
  }
});
