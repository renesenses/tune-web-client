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

/** Les onze langues servies par le client. */
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'hu', 'ja', 'ko', 'ro', 'sv', 'zh'];

describe('#1141 — le mode Grand écran PORTE SON NOM', () => {
  it("'tv' est une vue déclarée, et la coquille l'aiguille", () => {
    expect(NAVIGATION).toContain("'tv'");
    expect(SHELL).toContain("$activeView === 'tv'");
    expect(SHELL).toContain('<TvView />');
  });

  /**
   * 🔴 LE TÉMOIN. Avant ce correctif, le bouton ne disait son nom que dans son
   * `title` et son `aria-label` — un pictogramme muet parmi quatre ronds
   * identiques. Le libellé doit être RENDU, dans le corps du bouton.
   */
  it('le bouton rend un LIBELLÉ visible, et pas seulement un `title`', () => {
    const bouton = SHELL.slice(
      SHELL.indexOf('<button class="raccourci tv"'),
      SHELL.indexOf('</button>', SHELL.indexOf('<button class="raccourci tv"')),
    );
    expect(bouton.length, 'le bouton du mode TV est introuvable').toBeGreaterThan(0);
    expect(
      bouton,
      "le nom ne vit que dans le `title` : c'est le défaut de #1141",
    ).toContain('<span class="tv-nom">{$t(\'nowplaying.tvMode\' as any)}</span>');
  });

  /**
   * Le libellé s'efface au seul palier `tiroir` (≤ 760 px), où cinq ronds
   * occupent déjà la moitié d'une fenêtre de 390 px.
   */
  it("le libellé ne s'efface qu'au palier `tiroir`", () => {
    expect(SHELL).toContain("class:nomme={$formatEcran !== 'tiroir'}");
    expect(SHELL).toContain("{#if $formatEcran !== 'tiroir'}<span class=\"tv-nom\">");
  });

  /**
   * 🔴 Bertrand, 23/09/2026 : « dis-le plutôt que de réduire la cible de clic ».
   * Le bouton nommé s'ÉTIRE (`width:auto`) et refuse d'être comprimé
   * (`flex:0 0 auto`) ; sa hauteur reste celle de ses voisins.
   */
  it('la cible de clic ne rétrécit jamais', () => {
    expect(SHELL).toContain('.raccourci{width:32px; height:32px;');
    const regle = SHELL.slice(SHELL.indexOf('.raccourci.tv.nomme{'));
    expect(regle).toContain('width:auto');
    expect(regle).toContain('flex:0 0 auto');
    // Aucune largeur/hauteur RÉDUITE n'est posée sur la variante nommée.
    const corps = regle.slice(0, regle.indexOf('}'));
    expect(corps).not.toMatch(/height:\s*(?!32px)\d/);
  });

  /**
   * 🔴 ET NON DANS LA BARRE LATÉRALE. Son ordre est celui que Bertrand a donné
   * en liste le 20/09/2026, et `ordreBarreLaterale.test.ts` le fige. Y insérer
   * une entrée serait un arbitrage produit — la garde le dit ici pour que
   * personne ne « corrige » ce choix par inadvertance.
   */
  it("n'a PAS été inséré dans la barre latérale, dont l'ordre est arbitré", () => {
    expect(SIDEBAR).not.toContain("view: 'tv'");
  });

  /**
   * 🔴 Ni dans le menu du compte. Bertrand, 23/09/2026 : il porte des réglages
   * PERSONNELS (profils, thèmes, interface, connexion) ; un mode d'affichage
   * n'y a pas sa place, et un testeur qui cherche les vu-mètres n'y clique pas.
   */
  it("n'a PAS été inséré dans le menu du compte", () => {
    expect(MENU).not.toContain('nowplaying.tvMode');
    expect(MENU).not.toContain('modeGrandEcran');
  });

  it('le libellé est TRADUIT dans les onze langues', () => {
    for (const langue of LANGUES) {
      const dico = lire(`../locales/${langue}.ts`);
      const m = dico.match(/"nowplaying\.tvMode":\s*"([^"]*)"/);
      expect(m, `nowplaying.tvMode manque en ${langue}`).not.toBeNull();
      expect((m as RegExpMatchArray)[1].trim(), `nowplaying.tvMode est vide en ${langue}`)
        .not.toBe('');
    }
    // Les deux langues de référence, en clair : une clé peut exister et porter
    // le texte d'une AUTRE entrée.
    expect((fr as Record<string, string>)['nowplaying.tvMode']).toBe('Mode Grand écran');
    expect((en as Record<string, string>)['nowplaying.tvMode']).toBe('Big screen mode');
  });

  it('le geste passe par le module partagé', () => {
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
