/**
 * renesenses/tune-server-rust#6285 — le badge « hi-res vérifié / douteux » de
 * la fiche album. Seuls `verifie` et `douteux` se montrent ; le reste (pas de
 * mesure, qualité CD conforme, non concluant, serveur antérieur) ne montre
 * rien.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { badgeHiRes } from '../badgeHiRes';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

describe('Badge hi-res (#6285)', () => {
  it('vérifié et douteux se montrent, avec la raison du doute', () => {
    expect(badgeHiRes({ verdict: 'verifie' })).toEqual({ genre: 'verifie', cle: 'v2.album.hiresVerified', cleRaison: null });
    expect(badgeHiRes({ verdict: 'douteux', raison: 'bande_de_cd' }))
      .toEqual({ genre: 'douteux', cle: 'v2.album.hiresDoubtful', cleRaison: 'v2.album.hiresWhyCd' });
    expect(badgeHiRes({ verdict: 'douteux', raison: 'bits_de_remplissage' })?.cleRaison).toBe('v2.album.hiresWhyBits');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'coupure_de_codec' })?.cleRaison).toBe('v2.album.hiresWhyCodec');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'inconnue' })?.cleRaison).toBeNull();
  });

  it('rien pour non analysé, conforme, non concluant, ni sans réponse', () => {
    for (const verdict of ['non_analyse', 'conforme', 'non_concluant']) expect(badgeHiRes({ verdict })).toBeNull();
    expect(badgeHiRes(null)).toBeNull();
  });

  it('les six libellés existent dans les 12 langues', () => {
    const tables: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, hu, vi: viLocale, ja, ko, ro, sv, zh };
    const cles = ['v2.album.hiresVerified', 'v2.album.hiresDoubtful', 'v2.album.hiresVerifiedTip', 'v2.album.hiresWhyBits', 'v2.album.hiresWhyCd', 'v2.album.hiresWhyCodec'];
    for (const [l, table] of Object.entries(tables)) for (const c of cles) expect(table[c], `${l} : ${c}`).toBeTruthy();
  });

  it('BRANCHEMENT — la fiche album lit le verdict et pose le badge', () => {
    const fiche = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
    expect(fiche).toContain('api.getAlbumHiRes(id)');
    expect(fiche).toContain('hiRes = badgeHiRes(v)');
    expect(fiche).toContain('data-hires={hiRes.genre}');
  });
});
