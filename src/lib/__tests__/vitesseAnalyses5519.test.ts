import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * tune-server-rust#5519 — le réglage de vitesse des analyses de fond, dans
 * Réglages. Le serveur publie `background_analysis_speed` (défaut `normal`) et
 * `background_analysis_speed_widths` ; il refuse tout autre mot que
 * `discreet` / `normal` / `fast`.
 */
const src = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/SettingsV2.svelte', import.meta.url)),
  'utf-8',
);

describe('#5519 — vitesse des analyses de fond', () => {
  it('écrit les trois mots du serveur, et eux seuls', () => {
    expect(src).toMatch(/patch\(\{ background_analysis_speed: v \}/);
    for (const mot of ['discreet', 'normal', 'fast']) {
      expect(src).toContain(`onclick={() => setBgSpeed('${mot}')}`);
    }
  });

  it('se tait face à un serveur qui ne connaît pas le réglage', () => {
    expect(src).toMatch(/bgSpeed = \['discreet', 'normal', 'fast'\]\.includes\(vitesse\) \? vitesse : null;/);
    expect(src).toMatch(/\{#if bgSpeed !== null\}/);
  });

  it('les onze langues nomment le réglage et ses trois vitesses', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of ['analysisSpeed', 'analysisSpeedHint', 'analysisSpeedDiscreet', 'analysisSpeedNormal', 'analysisSpeedFast']) {
        expect(texte, `${f} : settings.${cle}`).toContain(`"settings.${cle}":`);
      }
      expect(texte, `${f} : v2.health.drMeasuredByRg`).toContain('"v2.health.drMeasuredByRg":');
    }
  });
});
