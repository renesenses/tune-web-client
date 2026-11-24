/**
 * Fil 3047 — les ISO SACD compressés en DST écartés par le scan.
 *
 * Le serveur rend `sacd_dst` : nombre exact, chemins complets, plafond dit.
 * L'écran montre le nombre, le contournement, et la liste repliable — pas
 * seulement « Format non pris en charge » noyé parmi les autres formats.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isosSacdDst } from '../rapportEcartes';

const SEPT = Array.from({ length: 7 }, (_, i) => `/Volumes/musique/SACD/Disque DST ${i + 1}.iso`);

describe('fil 3047 — ISO SACD en DST', () => {
  it('sept ISO DST donnent une liste complète de sept', () => {
    const d = isosSacdDst({ sacd_dst: { count: 7, paths: SEPT, truncated: false } });
    expect(d).not.toBeNull();
    expect(d!.nombre).toBe(7);
    expect(d!.chemins).toEqual(SEPT);
    expect(d!.tronquee).toBe(false);
  });

  it('une liste plafonnée par le serveur le dit', () => {
    const d = isosSacdDst({ sacd_dst: { count: 2500, paths: SEPT, truncated: true } });
    expect(d!.nombre).toBe(2500);
    expect(d!.tronquee).toBe(true);
  });

  it('aucun ISO DST : rien à afficher, et un ancien serveur ne fait rien tomber', () => {
    expect(isosSacdDst({ sacd_dst: { count: 0, paths: [] } })).toBeNull();
    expect(isosSacdDst({})).toBeNull();
    expect(isosSacdDst(null)).toBeNull();
    expect(isosSacdDst({ sacd_dst: 'oups' })).toBeNull();
    expect(isosSacdDst({ sacd_dst: { count: 2, paths: [null, '', '/a.iso'] } })!.chemins).toEqual(['/a.iso']);
  });

  it('le message existe dans les 20 langues, avec le nombre et le contournement', () => {
    const dossier = 'src/lib/locales';
    const langues = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues).toHaveLength(20);
    for (const f of langues) {
      const texte = readFileSync(join(dossier, f), 'utf8');
      const msg = texte.match(/"v2\.scan\.sacdDst": "(.*)",/)?.[1];
      const liste = texte.match(/"v2\.scan\.sacdDstList": "(.*)",/)?.[1];
      expect(msg, f).toBeTruthy();
      expect(liste, f).toContain('{n}');
      expect(msg, f).toContain('{n}');
      expect(msg, f).toContain('sacd_extract');
      expect(msg, f).toContain('DSF');
      expect(msg, f).toContain('DST');
      expect(texte, f).not.toContain('Ã');
    }
  });

  it("l'écran branche le bloc dans le rapport de scan", () => {
    const ecran = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(ecran).toContain('isosSacdDst(scanReport)');
    expect(ecran).toContain("'v2.scan.sacdDst'");
    expect(ecran).toContain("'v2.scan.sacdDstList'");
  });
});
