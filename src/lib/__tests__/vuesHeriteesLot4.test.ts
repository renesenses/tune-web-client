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
  // « offline » / `OfflineView` a été RETIRÉ le 20/09/2026, sur demande de
  // Bertrand. Les deux autres écrans hérités gardent leur chemin, et c'est ce
  // que cette boucle vérifie toujours.
  for (const [vue, comp] of [['concerts', 'ConcertsView'], ['dashboard', 'DashboardView']]) {
    it(`« ${vue} » est routé vers ${comp}, et listé dans la barre`, () => {
      expect(existsSync(`src/components/v2-heritage/${comp}.svelte`)).toBe(true);
      // ⚠️ On mesure le CONTENU de la branche, et non l'adjacence immédiate
      // du composant. Le motif exigeait `{:else if …}` puis, au plus un
      // commentaire près, `<DashboardView />` : #1344 a dû envelopper le
      // tableau de bord et ses recommandations dans un conteneur de
      // défilement (`<div class="dash">`), et cette garde rougissait sans
      // qu'aucun routage ne bouge. Le contrat gardé est le routage, pas la
      // mise en page — c'est déjà ainsi que le témoin des recommandations,
      // juste en dessous, s'y prend.
      const i = SHELL.indexOf(`{:else if $activeView === '${vue}'}`);
      expect(i, `« ${vue} » n’est routé nulle part dans la coquille`).toBeGreaterThan(-1);
      const branche = SHELL.slice(i, SHELL.indexOf('{:else if', i + 10));
      expect(branche, `la branche « ${vue} » ne monte pas ${comp}`).toContain(`<${comp} />`);
      expect(BARRE, `aucune entrée de barre pour « ${vue} »`).toContain(`{ view: '${vue}',`);
    });
  }
  it('🔴 « Écoute hors-ligne » a bien DISPARU, sans laisser de moignon', () => {
    // Bertrand, 20/09/2026 : « écran écoute hors-ligne à supprimer ». Un écran
    // à moitié retiré est pire que présent : une entrée de barre qui mène au
    // vide, ou une branche morte dans la coquille.
    expect(existsSync('src/components/v2-heritage/OfflineView.svelte')).toBe(false);
    expect(SHELL).not.toContain('OfflineView');
    expect(SHELL).not.toContain("$activeView === 'offline'");
    expect(BARRE).not.toContain("view: 'offline'");
  });

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
