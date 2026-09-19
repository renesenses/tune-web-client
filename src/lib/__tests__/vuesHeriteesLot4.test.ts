import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Tableau de bord, Concerts, Hors ligne, Recommandations — portés de
 * l'ancienne interface (phase 5, lot 4). Les trois écrans existaient, mais
 * AUCUNE entrée de cette coquille n'y menait : `ShellV2` tombait sur « bientôt
 * disponible », et la barre latérale ne les listait pas.
 */
const SHELL = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');
const BARRE = readFileSync('src/components/v2/Sidebar.svelte', 'utf8');

describe('les écrans hérités ont un chemin dans la coquille v2', () => {
  for (const [vue, comp] of [['concerts', 'ConcertsView'], ['offline', 'OfflineView'], ['dashboard', 'DashboardView']]) {
    it(`« ${vue} » est routé vers ${comp}, et listé dans la barre`, () => {
      expect(existsSync(`src/components/v2-heritage/${comp}.svelte`)).toBe(true);
      expect(SHELL).toMatch(new RegExp(`\\{:else if \\$activeView === '${vue}'\\}\\s*(<!--[\\s\\S]*?-->\\s*)?<${comp} />`));
      expect(BARRE, `aucune entrée de barre pour « ${vue} »`).toContain(`{ view: '${vue}',`);
    });
  }
  it('🔴 l’entrée Concerts disparaît quand le serveur n’embarque pas le greffon', () => {
    // Porté de l'ancienne barre : une entrée qui mène à une porte fermée est
    // pire que pas d'entrée. Et sans l'appel au serveur, l'état reste `null`
    // et l'entrée n'apparaît jamais.
    expect(BARRE).toContain("ADVANCED.filter((it) => it.view !== 'concerts' || $concertsUtilisable)");
    expect(BARRE).toContain('{#each avanceVisibles as it (it.view)}');
    expect(BARRE).toContain('refreshConcertsPlugin()');
  });

  it('les recommandations sont montées avec le tableau de bord', () => {
    const i = SHELL.indexOf("{:else if $activeView === 'dashboard'}");
    expect(SHELL.slice(i, SHELL.indexOf('{:else if', i + 10))).toContain('<RecommendationsSection />');
  });
});
