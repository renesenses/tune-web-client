/**
 * #999 — « où est l'accès aux logs ? » (FabienM, fil 1774, point 3).
 *
 * Il existait, derrière une entrée de barre latérale nommée « Processing »
 * — en français comme en anglais — alors que l'écran s'annonçait lui-même
 * « État du serveur ». Deux noms pour un écran, et c'est celui de la barre
 * qu'on lit pour choisir où aller.
 *
 * Désormais : la barre, le titre de l'écran et le titre de fenêtre partagent
 * `v2.nav.processing` = le nom de l'écran ; et le bandeau (`eyebrow`) dit ce
 * qu'il contient — les traitements ET les journaux.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh'];

describe('#999 — l’entrée de la barre dit ce qu’elle ouvre', () => {
  for (const code of LANGUES) {
    it(`${code} : ni « Processing » recopié, ni le même mot que le bandeau`, async () => {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      const nav = dico['v2.nav.processing'];
      const bandeau = dico['v2.health.eyebrow'];
      expect(nav, 'v2.nav.processing').toBeTruthy();
      expect(nav.toLowerCase()).not.toBe('processing');
      expect(nav.toLowerCase()).not.toContain('processing');
      expect(bandeau).toBeTruthy();
      expect(bandeau).not.toBe(nav);
    });
  }
  it('🔴 fr et en nomment les journaux dans le bandeau — c’est ce que Fabien cherchait', async () => {
    const fr = (await import('../locales/fr')).default as Record<string, string>;
    const en = (await import('../locales/en')).default as Record<string, string>;
    expect(fr['v2.health.eyebrow'].toLowerCase()).toContain('journaux');
    expect(en['v2.health.eyebrow'].toLowerCase()).toContain('logs');
  });
  it('la barre, le titre et la fenêtre lisent la même clé', () => {
    const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
    expect(lire('src/components/v2/Sidebar.svelte')).toContain("labelKey: 'v2.nav.processing'");
    expect(lire('src/components/v2/TuneHealthV2.svelte')).toContain("<h1>{$t('v2.nav.processing' as any)}</h1>");
    expect(lire('src/components/v2/ShellV2.svelte')).toContain("diagnostics: 'v2.nav.processing'");
  });
});
