/**
 * #1006 — Bertrand, 13/09/2026, capture à l'appui, quatre points sur la carte
 * de zone en mode Grille : le design, les badges compacts (« Hors ligne »,
 * « Éteinte récemment » faisaient des bandeaux pleine largeur), un lien vers
 * l'appareil (réglages), la pochette de ce qui joue, cliquable.
 *
 * 🔴 La contrainte : la carte était UN <button>. Une pochette cliquable et
 * un lien dedans, c'est du balisage invalide. Elle est découpée comme
 * `PochetteActions` : des cibles SŒURS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dictionnaire } from './onzeDictionnaires';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ecran = lire('src/components/v2/ZonesV2.svelte');
const debut = ecran.indexOf('<div class="grille">');
const carte = ecran.slice(debut, ecran.indexOf('{:else}', debut)).replace(/<!--[\s\S]*?-->/g, '');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('#1006 — la carte de zone en grille', () => {
  it('🔴 aucun bouton dans le bouton d’activation : pochette et réglages sont ses FRÈRES', () => {
    const i = carte.indexOf('<button class="cpick"');
    const fin = carte.indexOf('</button>', i);
    const dedans = carte.slice(i + 1, fin);
    expect(i).toBeGreaterThan(-1);
    expect(dedans).not.toContain('<button');
    expect(dedans).not.toContain('<a ');
    expect(carte).toContain('<button class="cpoch"');
    expect(carte).toContain('<MenuZone entrees={entreesDe(z)}');
  });
  it('🔴 la pochette de ce qui joue ouvre Lecture en cours SUR cette zone', () => {
    expect(carte).toContain('onclick={() => ouvrirLecture(z)}');
    expect(carte).toContain('<AlbumArt coverPath={np?.cover_path ?? null} albumId={np?.album_id ?? null}');
    const src = sansCommentaires(ecran);
    const fn = src.slice(src.indexOf('function ouvrirLecture'), src.indexOf('function reglagesDeLaZone'));
    expect(fn).toContain('select(z);');
    expect(fn).toContain("activeView.set('nowplaying');");
  });
  it('🔴 le lien vers les réglages vise CETTE zone, et les Réglages la mettent en avant', () => {
    // #1392 — le chemin vers les réglages de la zone n'est plus un bouton nu
    // sur la carte : c'est une ENTRÉE du menu, la même dans les deux vues.
    expect(sansCommentaires(ecran)).toContain('reglages: () => reglagesDeLaZone(z),');
    expect(ecran).toContain("v2SettingsTarget.set({ tab: 'devices', section: 'perZone', zone: z.id ?? undefined });");
    const reglages = lire('src/components/v2/SettingsV2.svelte');
    expect(reglages).toContain('cibleZone = target.zone ?? null;');
    expect(reglages).toContain('<div class="zc" id={`zc-${z.id}`} class:hl={cibleZone === z.id}>');
    expect(lire('src/lib/stores/v2SettingsNav.ts')).toContain('zone?: number;');
  });
  it('🔴 les états sont des PASTILLES courtes, la phrase en infobulle — et plus de français en dur', () => {
    const src = sansCommentaires(ecran);
    const reach = src.slice(src.indexOf('function reach('), src.indexOf('function ouvrirLecture'));
    expect(reach).toContain("$t('v2.zone.badgeNoOutput' as any), long: $t('v2.zone.noOutputLong' as any)");
    expect(reach).toContain("$t('v2.zone.badgeOffline' as any)");
    expect(reach).not.toContain('Aucune sortie — la lecture sera refusée');
    expect(reach).not.toContain("'Hors ligne'");
    expect(carte).toContain('<span class="rc {r.cls}" title={r.long}>{r.txt}</span>');
    expect(carte).toContain('<span class="cbadges">');
  });
  it('les pastilles courtes tiennent en deux mots, dans les onze langues', async () => {
    for (const code of ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh']) {
      const dico = dictionnaire(code);
      for (const k of ['v2.zone.badgeNoOutput', 'v2.zone.badgeBrowser', 'v2.zone.badgeOffline']) {
        expect(dico[k], `${code} ${k}`).toBeTruthy();
        expect(dico[k].length, `${code} ${k} trop long`).toBeLessThanOrEqual(16);
      }
      expect(dico['v2.zone.noOutputLong'].length).toBeGreaterThan(dico['v2.zone.badgeNoOutput'].length);
    }
  });
});
