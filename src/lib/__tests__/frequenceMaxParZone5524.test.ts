// tune-server-rust#5524 — « Fréquence max par zone ».
//
// Yves Corbat doit limiter son Ruark Audio R5 (DLNA) à 44,1 kHz. Le serveur
// portait déjà le réglage `max_sample_rate` par zone, mais la liste de l'écran
// commençait à 48 kHz : la seule valeur dont il avait besoin n'était pas
// proposée. Au-dessus du plafond, le serveur rééchantillonne désormais dans la
// famille de la source (44,1 ou 48 kHz), profondeur conservée.
//
// Garde de TEXTE sur la liste `RATES` de `SettingsV2.svelte` (le composant est
// trop lourd à monter pour un témoin de liste) : elle compte les entrées dans le
// bloc `RATES` lui-même, pas n'importe où dans le fichier.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const source = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');

function blocRates(): string {
  const debut = source.indexOf('const RATES');
  expect(debut, 'la liste RATES existe').toBeGreaterThan(-1);
  const fin = source.indexOf('];', debut);
  return source.slice(debut, fin);
}

function valeurs(): number[] {
  return [...blocRates().matchAll(/\{\s*v:\s*(\d+)/g)].map((m) => Number(m[1]));
}

describe('#5524 — fréquence max par zone', () => {
  it('propose Auto, puis 44,1, 48, 88,2, 96, 176,4 et 192 kHz, dans cet ordre', () => {
    const v = valeurs();
    expect(v.slice(0, 7)).toEqual([0, 44100, 48000, 88200, 96000, 176400, 192000]);
  });

  it("Auto s'affiche « Auto (pas de limite) » et envoie null au serveur", () => {
    expect(blocRates()).toContain("{ v: 0, l: $t('settings.maxSampleRateAuto' as any) }");
    // 0 → null : « pas de plafond » côté serveur.
    expect(source).toContain('api.updateZoneMaxSampleRate(z.id as number, v > 0 ? v : null)');
  });

  it('les deux libellés existent dans les 11 langues', () => {
    const langues: Record<string, Record<string, string>> = {
      de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh,
    };
    expect(Object.keys(langues)).toHaveLength(11);
    for (const [code, dico] of Object.entries(langues)) {
      for (const cle of ['settings.maxSampleRateAuto', 'settings.maxSampleRateHint']) {
        expect(dico[cle], `${code} : ${cle}`).toBeTruthy();
      }
    }
    expect(fr['settings.maxSampleRateAuto']).toBe('Auto (pas de limite)');
  });
});
