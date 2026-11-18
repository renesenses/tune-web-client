/**
 * renesenses/tune-server-rust#6285 — le badge « hi-res vérifié / douteux » de
 * la fiche album. Seuls `verifie` et `douteux` se montrent ; le reste (pas de
 * mesure, qualité CD conforme, non concluant, serveur antérieur) ne montre
 * rien.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { badgeHiRes, compteBadgeHiRes, infobulleHiRes, libelleBadgeHiRes } from '../badgeHiRes';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import plLocale from '../locales/pl';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import trLocale from '../locales/tr';

describe('Badge hi-res (#6285)', () => {
  it('vérifié et douteux se montrent, avec la raison du doute', () => {
    expect(badgeHiRes({ verdict: 'verifie' })).toEqual({ genre: 'verifie', cle: 'v2.album.hiresVerified', cleRaison: null, coupureHz: null, pistes: null });
    expect(badgeHiRes({ verdict: 'douteux', raison: 'bande_de_cd' }))
      .toEqual({ genre: 'douteux', cle: 'v2.album.hiresDoubtful', cleRaison: 'v2.album.hiresWhyCd', coupureHz: null, pistes: null });
    expect(badgeHiRes({ verdict: 'douteux', raison: 'bits_de_remplissage' })?.cleRaison).toBe('v2.album.hiresWhyBits');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'coupure_spectrale' })?.cleRaison).toBe('v2.album.hiresWhyCutoffGeneric');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'signature_de_codec' })?.cleRaison).toBe('v2.album.hiresWhyCodecSigGeneric');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'inconnue' })?.cleRaison).toBeNull();
  });

  it('rien pour non analysé, conforme, non concluant, ni sans réponse', () => {
    for (const verdict of ['non_analyse', 'conforme', 'non_concluant']) expect(badgeHiRes({ verdict })).toBeNull();
    expect(badgeHiRes(null)).toBeNull();
  });

  it('les libellés existent dans les 16 langues, et les {freq}, {n}, {total} y sont', () => {
    const tables: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, hu, vi: viLocale, el: elLocale, nb: nbLocale, pl: plLocale, ja, ko, ro, sv, zh, tr: trLocale };
    const cles = ['v2.album.hiresVerified', 'v2.album.hiresDoubtful', 'v2.album.hiresVerifiedTip', 'v2.album.hiresWhyBits', 'v2.album.hiresWhyCd',
      'v2.album.hiresWhyCdAt', 'v2.album.hiresWhyCutoff', 'v2.album.hiresWhyCutoffGeneric', 'v2.album.hiresWhyCodecSig', 'v2.album.hiresWhyCodecSigGeneric', 'v2.album.hiresTracks',
      'v2.album.hiresDoubtfulTrack', 'v2.album.hiresDoubtfulTracks'];
    for (const [l, table] of Object.entries(tables)) {
      for (const c of cles) expect(table[c], `${l} : ${c}`).toBeTruthy();
      for (const c of ['v2.album.hiresWhyCdAt', 'v2.album.hiresWhyCutoff', 'v2.album.hiresWhyCodecSig']) expect(table[c], `${l} : ${c}`).toContain('{freq}');
      expect(table['v2.album.hiresTracks'], l).toContain('{n}');
      expect(table['v2.album.hiresTracks'], l).toContain('{total}');
      expect(table['v2.album.hiresDoubtfulTracks'], l).toContain('{n}');
      // #9035 — l'ancien libellé « coupé comme par un codec » ne sert plus.
      expect(table['v2.album.hiresWhyCodec'], l).toBeUndefined();
    }
  });

  it('BRANCHEMENT — la fiche album lit le verdict et pose le badge', () => {
    const fiche = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
    expect(fiche).toContain('api.getAlbumHiRes(id)');
    expect(fiche).toContain('hiRes = badgeHiRes(v)');
    expect(fiche).toContain('data-hires={hiRes.genre}');
  });

  // tune-server-rust#9035 — la raison dit la coupure mesurée et combien de
  // pistes sont en cause ; « codec » seulement sur signature mesurée.
  const fausseTr = (c: string) => (fr as Record<string, string>)[c] ?? c;

  it('#9035 — une coupure seule dit sa fréquence et « codec OU mastering », jamais « codec » tout court', () => {
    const b = badgeHiRes({ verdict: 'douteux', raison: 'coupure_spectrale', coupure_hz: 16100, pistes_douteuses: 6, pistes_mesurees: 10 });
    expect(b).toEqual({ genre: 'douteux', cle: 'v2.album.hiresDoubtful', cleRaison: 'v2.album.hiresWhyCutoff', coupureHz: 16100, pistes: { douteuses: 6, mesurees: 10 } });
    const texte = infobulleHiRes(b, fausseTr, 'fr');
    expect(texte).toContain('Spectre coupé net vers 16,1 kHz');
    expect(texte).toContain('ou un filtrage au mastering');
    expect(texte).toContain('Pistes en cause : 6 sur 10');
    expect(compteBadgeHiRes(b)).toBe('6/10');
  });

  it('#9035 — la signature mesurée, elle, dit « codec avec perte »', () => {
    const b = badgeHiRes({ verdict: 'douteux', raison: 'signature_de_codec', coupure_hz: 16000 });
    expect(b?.cleRaison).toBe('v2.album.hiresWhyCodecSig');
    expect(infobulleHiRes(b, fausseTr, 'fr')).toContain('vers 16 kHz, avec les bandes vides intermittentes d\'un codec avec perte (MP3, AAC)');
  });

  it('#9035 — compatibilité : un serveur antérieur envoie `coupure_de_codec` sans compte ni coupure d album', () => {
    const b = badgeHiRes({
      verdict: 'douteux', raison: 'coupure_de_codec',
      pistes: [
        { verdict: 'douteux', raison: 'coupure_de_codec', coupure_hz: 17800 },
        { verdict: 'douteux', raison: 'coupure_de_codec', coupure_hz: 18200 },
        { verdict: 'douteux', raison: 'coupure_de_codec', coupure_hz: 18000 },
        { verdict: 'verifie', raison: null, coupure_hz: null },
        { verdict: 'non_concluant', raison: null, coupure_hz: null },
      ],
    });
    expect(b?.cleRaison).toBe('v2.album.hiresWhyCutoff');
    expect(b?.coupureHz).toBe(18000);
    expect(b?.pistes).toEqual({ douteuses: 3, mesurees: 4 });
    const texte = infobulleHiRes(b, fausseTr, 'fr');
    expect(texte).not.toMatch(/comme par un codec/);
    expect(texte).toContain('18');
    // Sans pistes ni coupure : la raison générique, sans fréquence inventée.
    const nu = badgeHiRes({ verdict: 'douteux', raison: 'coupure_de_codec' });
    expect(nu?.cleRaison).toBe('v2.album.hiresWhyCutoffGeneric');
    expect(infobulleHiRes(nu, fausseTr, 'fr')).not.toContain('{freq}');
    expect(compteBadgeHiRes(nu)).toBe('');
  });

  it('#9035 — BRANCHEMENT : le badge montre le compte et l infobulle la raison, la fiche piste aussi', () => {
    const fiche = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
    expect(fiche).toContain('infobulleHiRes(hiRes');
    expect(fiche).toContain('compteBadgeHiRes(hiRes)');
    const piste = readFileSync('src/components/v2/FicheTechniquePanneau.svelte', 'utf8');
    expect(piste).toContain('infobulleHiRes(badgeHiRes(fiche.faux_hires)');
  });

  // Décision de Bertrand du 18/11 (fil 2902) : douteux à partir de la moitié.
  it('#9035 — 2 bonus douteux sur 10 : l album n est pas douteux, le badge dit « 2 pistes douteuses »', () => {
    const b = badgeHiRes({ verdict: 'verifie', raison: null, pistes_douteuses: 2, pistes_mesurees: 10, raison_pistes: 'coupure_spectrale', coupure_hz: 17800 });
    expect(b?.genre).toBe('pistes');
    expect(b?.cleRaison).toBe('v2.album.hiresWhyCutoff');
    expect(libelleBadgeHiRes(b, fausseTr)).toBe('2 pistes douteuses');
    expect(compteBadgeHiRes(b)).toBe('');
    const texte = infobulleHiRes(b, fausseTr, 'fr');
    expect(texte).toContain('Spectre coupé net vers 17,8 kHz');
    expect(texte).toContain('Pistes en cause : 2 sur 10');
    expect(libelleBadgeHiRes(badgeHiRes({ verdict: 'conforme', pistes_douteuses: 1, pistes_mesurees: 10 }), fausseTr)).toBe('1 piste douteuse');
  });

  it('#9035 — 6 sur 10 : Hi-res douteux ; la moitié pile aussi', () => {
    expect(badgeHiRes({ verdict: 'douteux', raison: 'coupure_spectrale', pistes_douteuses: 6, pistes_mesurees: 10 })?.genre).toBe('douteux');
    expect(badgeHiRes({ verdict: 'douteux', raison: 'coupure_spectrale', pistes_douteuses: 5, pistes_mesurees: 10 })?.genre).toBe('douteux');
  });

  it('#9035 — serveur antérieur (douteux dès une piste) : corrigé par le compte des pistes', () => {
    const pistes = Array.from({ length: 10 }, (_, i) => i < 2
      ? { verdict: 'douteux', raison: 'coupure_de_codec', coupure_hz: 16000 }
      : { verdict: 'verifie', raison: null, coupure_hz: null });
    const b = badgeHiRes({ verdict: 'douteux', raison: 'coupure_de_codec', pistes });
    expect(b?.genre).toBe('pistes');
    expect(b?.pistes).toEqual({ douteuses: 2, mesurees: 10 });
    expect(b?.cleRaison).toBe('v2.album.hiresWhyCutoff');
    expect(b?.coupureHz).toBe(16000);
    // Sans pistes ni compte : on garde le verdict du serveur.
    expect(badgeHiRes({ verdict: 'douteux', raison: 'bande_de_cd' })?.genre).toBe('douteux');
  });
});
