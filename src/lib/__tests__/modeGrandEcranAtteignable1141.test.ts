/**
 * #1141 — « Plus d'affichage avec les vu-mètres ?? » (Bilou, fil 1770).
 *
 * Le testeur a précisé le 13/09 : « en nouvelle version V1 il n'y a pas le
 * choix vu-mètres dans lecture en cours et ce choix n'apparaît pas dans les
 * paramètres d'ailleurs », et, deux lignes plus bas, « comment passer au mode
 * grand écran en nouvelle version V1 ??? ».
 *
 * ## Ce que ces gardes tiennent
 *
 * Les deux phrases n'en font qu'une, et le code le prouve : les vu-mètres à
 * aiguille n'existent QUE dans le mode Grand écran, et cet écran n'avait qu'une
 * porte d'entrée — une icône sans libellé, rendue sur un seul écran.
 *
 * ⚠️ Une vue déclarée et aiguillée qu'aucun bouton n'atteint compile
 * parfaitement : ni `svelte-check`, ni la vérification i18n, ni les tests
 * unitaires ne voient l'absence de porte d'entrée. C'est la leçon de
 * `ecranConcertsAtteignable`, et ces gardes lisent les sources pour la même
 * raison : un CHAÎNAGE (type de vue → aiguillage → entrée → geste) ne se
 * vérifie pas autrement.
 *
 * ## Ce qu'elles ne tiennent PAS
 *
 * Que ce soit ce que Bilou voyait. Il n'a fourni ni capture de son écran
 * « Lecture en cours », ni version pour ce point-là, et rien ne dit si le
 * bouton de la grappe était absent, recouvert (#1140) ou simplement illisible.
 * Ces gardes tiennent qu'il existe désormais un chemin NOMMÉ vers l'écran,
 * depuis n'importe où.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demanderPleinEcran, entrerEnModeGrandEcran } from '../modeGrandEcran';
import fr from '../locales/fr';
import en from '../locales/en';

const lire = (chemin: string) => readFileSync(resolve(__dirname, chemin), 'utf8');

const MENU = lire('../../components/v2/AvatarMenu.svelte');
const SIDEBAR = lire('../../components/v2/Sidebar.svelte');
const SHELL = lire('../../components/v2/ShellV2.svelte');
const NAVIGATION = lire('../stores/navigation.ts');

describe('#1141 — le mode Grand écran est ATTEIGNABLE par son nom', () => {
  it("'tv' est une vue déclarée, et la coquille l'aiguille", () => {
    expect(NAVIGATION).toContain("'tv'");
    expect(SHELL).toContain("$activeView === 'tv'");
    expect(SHELL).toContain('<TvView />');
  });

  /**
   * 🔴 LE TÉMOIN. Avant ce correctif, `activeView.set('tv')` n'avait qu'UN
   * appelant dans tout le dépôt : le bouton muet de la grappe de `ShellV2`.
   */
  it('le menu de compte porte une entrée NOMMÉE, rendue une seule fois', () => {
    const occurrences = MENU.split("{$t('nowplaying.tvMode' as any)}").length - 1;
    expect(
      occurrences,
      "l'entrée « Mode Grand écran » est absente du menu, ou dupliquée",
    ).toBe(1);
    expect(MENU).toContain('entrerEnModeGrandEcran((vue) => activeView.set(vue)); close();');
  });

  /**
   * 🔴 ET NON DANS LA BARRE LATÉRALE. Son ordre est celui que Bertrand a donné
   * en liste le 20/09/2026, et `ordreBarreLaterale.test.ts` le fige. Y insérer
   * une entrée serait un arbitrage produit, pas un correctif — la garde le dit
   * ici pour que personne ne « corrige » ce choix par inadvertance.
   */
  it("n'a PAS été inséré dans la barre latérale, dont l'ordre est arbitré", () => {
    expect(SIDEBAR).not.toContain("view: 'tv'");
  });

  it("l'entrée porte un LIBELLÉ traduit, non une icône muette", () => {
    // Tout le défaut tient là : le bouton de la grappe ne dit son nom que dans
    // son `title` et son `aria-label`.
    expect((fr as Record<string, string>)['nowplaying.tvMode']).toBe('Mode Grand écran');
    expect((en as Record<string, string>)['nowplaying.tvMode']).toBe('Big screen mode');
  });

  /**
   * Le menu de compte est rendu par la grappe SANS garde de vue, là où le
   * bouton du mode TV vit sous `{#if $activeView === 'nowplaying'}`. C'est
   * toute la différence : une porte depuis n'importe quel écran.
   */
  it('le menu est rendu depuis TOUS les écrans, sans garde de vue', () => {
    const grappe = SHELL.slice(SHELL.indexOf('<GlobalSearchBar />'));
    expect(grappe).toContain('<AvatarMenu />');
    const avant = grappe.slice(0, grappe.indexOf('<AvatarMenu />'));
    expect(avant, 'une garde de vue s’est glissée devant le menu')
      .not.toContain("{#if $activeView ===");
  });

  it('les DEUX portes passent par le même geste', () => {
    // Sans cela, l'entrée du menu ouvrirait la vue sans plein écran — deux
    // portes, deux comportements, la divergence qu'on vient de corriger.
    expect(MENU).toContain("import { entrerEnModeGrandEcran } from '../../lib/modeGrandEcran'");
    expect(SHELL).toContain("import { entrerEnModeGrandEcran } from '../../lib/modeGrandEcran'");
    expect(SHELL).toContain('entrerEnModeGrandEcran((vue) => activeView.set(vue));');
  });

  /**
   * 🔴 Le réglage des vu-mètres ne vit que dans cet écran — c'est ce qui fait
   * de l'accès à l'écran la réponse à la phrase de Bilou sur les vu-mètres.
   * Si `vuMeter` apparaissait un jour dans les Réglages, cette garde tomberait,
   * et c'est bien : les deux phrases cesseraient d'avoir la même cause.
   */
  it('le choix d’instrument ne vit QUE dans cet écran', () => {
    const TV = lire('../../components/v2-heritage/TvView.svelte');
    expect(TV).toContain('vuMeter');
    for (const ecran of ['../../components/v2/SettingsV2.svelte']) {
      expect(lire(ecran), `vuMeter ne devrait pas être réglé dans ${ecran}`)
        .not.toContain('vuMeter');
    }
  });
});

describe('#1141 — le geste lui-même', () => {
  it('ouvre la vue APRÈS avoir demandé le plein écran', () => {
    const ordre: string[] = [];
    const racine = { requestFullscreen: () => { ordre.push('pleinEcran'); } };
    entrerEnModeGrandEcran((v) => { ordre.push(`vue:${v}`); }, racine);
    expect(ordre).toEqual(['pleinEcran', 'vue:tv']);
  });

  /**
   * 🔴 Le navigateur REFUSE le plein écran hors d'un geste utilisateur — et
   * Safari LÈVE au lieu de rendre une promesse rejetée. Une porte qui n'ouvre
   * rien dans ce cas serait exactement le défaut qu'on corrige.
   */
  it('ouvre la vue même quand le plein écran LÈVE', () => {
    const aller = vi.fn();
    entrerEnModeGrandEcran(aller, { requestFullscreen: () => { throw new Error('refusé'); } });
    expect(aller).toHaveBeenCalledWith('tv');
  });

  it('ouvre la vue même quand la promesse du plein écran est REJETÉE', () => {
    const aller = vi.fn();
    // Une promesse rejetée non rattrapée ferait tomber la suite de tests.
    entrerEnModeGrandEcran(aller, { requestFullscreen: () => Promise.reject(new Error('refusé')) });
    expect(aller).toHaveBeenCalledWith('tv');
  });

  it("ouvre la vue même sans racine, ou sans l'API plein écran", () => {
    for (const racine of [null, undefined, {}]) {
      const aller = vi.fn();
      entrerEnModeGrandEcran(aller, racine as any);
      expect(aller, String(racine)).toHaveBeenCalledWith('tv');
    }
  });

  it('`demanderPleinEcran` ne lève jamais', () => {
    expect(() => demanderPleinEcran(null)).not.toThrow();
    expect(() => demanderPleinEcran({ requestFullscreen: () => { throw new Error('x'); } })).not.toThrow();
  });
});
