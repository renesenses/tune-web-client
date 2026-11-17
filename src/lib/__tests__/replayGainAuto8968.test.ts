// tune-server-rust#8968 (PR 4) — le mode ReplayGain « Auto » : gain d'album
// quand les pistes consécutives de la file sont du même album, gain de piste
// sinon (et toujours en aléatoire). Décision de Bertrand : un QUATRIÈME choix,
// ajouté à Off / Piste / Album, sans toucher au réglage des utilisateurs.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const lire = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8');
const CLES = ['settings.replayGainAuto', 'settings.replayGainAutoHint', 'v2.health.rgAuto'];

describe('#8968 — ReplayGain Auto', () => {
  it('le réglage propose Auto en plus de Off, Piste et Album, et l\'écrit tel quel', () => {
    const src = lire('src/components/v2/SettingsV2.svelte');
    for (const mode of ['off', 'track', 'album', 'auto']) {
      expect(src, `le bouton ${mode} manque`).toContain(`onclick={() => setRgMode('${mode}')}`);
    }
    // La valeur envoyée est celle du serveur (`replaygain_mode = auto`).
    expect(src).toContain('patch({ replaygain_mode: v }');
    expect(src).toContain("$t('settings.replayGainAuto' as any)");
  });

  it('la santé nomme le mode Auto au lieu de le prendre pour « par album »', () => {
    const src = lire('src/components/v2/TuneHealthV2.svelte');
    expect(src).toContain("mode === 'auto' ? $t('v2.health.rgAuto' as any)");
  });

  it('chaque langue a ses trois libellés, non vides', () => {
    const langues = readdirSync(join(process.cwd(), 'src/lib/locales')).filter(
      (f) => f.endsWith('.ts') && f !== 'index.ts',
    );
    expect(langues.length).toBeGreaterThanOrEqual(15);
    for (const f of langues) {
      const src = lire(`src/lib/locales/${f}`);
      for (const cle of CLES) {
        const m = src.match(new RegExp(`"${cle.replace(/\./g, '\\.')}": "([^"]+)"`));
        expect(m, `${f} : ${cle} manque`).not.toBeNull();
      }
    }
  });
});
