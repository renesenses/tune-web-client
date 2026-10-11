// tune-server-rust#5247 — pays des Tendances YouTube Music : un réglage
// explicite (`youtube_charts_country`) dans les réglages du service, qui
// l'emporte côté serveur sur la langue du navigateur.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLE_PAYS_TENDANCES_YOUTUBE, PAYS_TENDANCES_YOUTUBE, optionsPaysTendances, paysTendancesDuReglage,
} from '../paysTendancesYoutube';

describe('pays des Tendances YouTube', () => {
  it('les options portent un nom dans la langue de l’interface, triées', () => {
    const fr = optionsPaysTendances('fr');
    expect(fr).toHaveLength(PAYS_TENDANCES_YOUTUBE.length);
    expect(fr.find((o) => o.code === 'DE')?.nom).toBe('Allemagne');
    expect(optionsPaysTendances('en').find((o) => o.code === 'DE')?.nom).toBe('Germany');
    const noms = fr.map((o) => o.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, 'fr')));
    // `ZZ` (monde) a son option à part, traduite : pas de « région indéterminée ».
    expect(fr.some((o) => o.code === 'ZZ')).toBe(false);
  });

  it('le réglage lu : un code, sinon automatique', () => {
    expect(paysTendancesDuReglage({ youtube_charts_country: 'de' })).toBe('DE');
    expect(paysTendancesDuReglage({ youtube_charts_country: 'ZZ' })).toBe('ZZ');
    for (const v of [undefined, '', null, 'FRA', 33]) {
      expect(paysTendancesDuReglage({ youtube_charts_country: v })).toBe('');
    }
    expect(paysTendancesDuReglage(null)).toBe('');
  });

  it('les réglages écrivent la clé du serveur, et offrent Automatique et Monde', () => {
    expect(CLE_PAYS_TENDANCES_YOUTUBE).toBe('youtube_charts_country');
    const S = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
    expect(S).toContain('await api.updateConfig({ [CLE_PAYS_TENDANCES_YOUTUBE]: v })');
    expect(S).toContain('paysTendancesYt = paysTendancesDuReglage(c)');
    const bloc = S.slice(S.indexOf('data-pays-tendances-youtube'), S.indexOf('</select>', S.indexOf('data-pays-tendances-youtube')));
    expect(bloc).toContain('<option value="">');
    expect(bloc).toContain('<option value="ZZ">');
    expect(bloc).toContain('optionsPaysTendances($locale)');
  });
});
