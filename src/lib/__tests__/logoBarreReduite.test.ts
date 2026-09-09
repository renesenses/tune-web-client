import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #1394 — le logo Tune était rogné à gauche.
 *
 * MESURÉ sur la vue réelle (build de production servi par `vite preview`, page
 * sonde en iframe même origine lisant getBoundingClientRect), pas déduit :
 *
 *   barre latérale   offsetWidth 64  clientWidth 52   (1px bordure + 11px de
 *                                                      barre de défilement)
 *   ligne .logo      scrollWidth 56  clientWidth 52   -> 4px de débordement
 *   .logo-img        left = -3,6px                    -> rogné, inatteignable
 *
 * `justify-content: center` répartit le débordement des DEUX côtés et
 * `overflow-x: hidden` sur la barre rend la moitié gauche définitivement
 * invisible : aucun défilement n'y mène.
 *
 * ⚠️ Ce n'est PAS une divergence de moteur. Firefox 154 et Chrome rendent des
 * chiffres identiques, au dixième de pixel près, avant comme après. Le rapport
 * disait « firefox ? » avec un point d'interrogation : c'est le palier
 * « icônes seulement » (≤ 1024px), qu'un écran Windows 1366×768 à 150 %
 * d'échelle atteint (911px CSS).
 *
 * Ce test ne rend RIEN : il rejoue le budget de largeur à partir des valeurs
 * que le CSS déclare. Il tombe si quelqu'un remet un élément dans la ligne du
 * logo, élargit le bouton, ou rétrécit la barre réduite.
 */

const sidebar = readFileSync(resolve(__dirname, '../../components/Sidebar.svelte'), 'utf-8');
const theme = readFileSync(resolve(__dirname, '../../styles/tune-theme.css'), 'utf-8');

/** Extrait le corps d'un bloc en comptant les accolades. */
function bloc(source: string, entete: string): string {
  const i = source.indexOf(entete);
  expect(i, `bloc introuvable : ${entete}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const debut = source.indexOf('{', i);
  for (let j = debut; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(debut + 1, j);
  }
  throw new Error(`accolade non fermée : ${entete}`);
}

const iconesSeules = bloc(sidebar, '@media (max-width: 1024px)');
const cache = (sel: string) =>
  new RegExp(`(^|[,{}\\s])${sel.replace('.', '\\.')}\\s*(,[^{]*)?\\{[^}]*display:\\s*none`, 'm').test(
    iconesSeules,
  ) || new RegExp(`[^{}]*${sel.replace('.', '\\.')}[^{}]*\\{[^}]*display:\\s*none`).test(iconesSeules);

describe('barre latérale réduite : le logo tient dans la colonne (#1394)', () => {
  it('la ligne du logo ne déborde pas des 52px réellement disponibles', () => {
    const collapsed = Number(/--sidebar-collapsed-width:\s*(\d+)px/.exec(theme)![1]);
    expect(collapsed).toBe(64);

    const BORDURE = 1; // .sidebar { border-right: 1px }
    const BARRE = 11; // scrollbar-width: thin — mesuré Firefox 154 ET Chrome
    const dispo = collapsed - BORDURE - BARRE;
    expect(dispo).toBe(52);

    // Le logo : 230×220 rendu à height:28px -> 29,3px de large.
    const hauteur = Number(/\.logo-img\s*\{[^}]*height:\s*(\d+)px/.exec(sidebar)![1]);
    const largeurLogo = (230 / 220) * hauteur;

    const gap = Number(/\.logo\s*\{[^}]*gap:\s*(\d+)px/.exec(sidebar)![1]);

    // Le bouton « quoi de neuf » : padding 2px de chaque côté + svg 14px.
    const padBouton = Number(/\.whatsnew-btn\s*\{[^}]*padding:\s*(\d+)px/.exec(sidebar)![1]);
    const largeurBouton = 14 + 2 * padBouton;

    const items = [largeurLogo];
    if (!cache('.whatsnew-btn')) items.push(largeurBouton);
    // .version est masquée par la règle groupée `.logo span, .version, …`.
    expect(cache('.version')).toBe(true);

    const largeurLigne = items.reduce((a, b) => a + b, 0) + gap * (items.length - 1);

    expect(
      largeurLigne,
      `la ligne du logo réclame ${largeurLigne.toFixed(1)}px pour ${dispo}px disponibles — ` +
        'le débordement est réparti des deux côtés par justify-content:center, et ' +
        'overflow-x:hidden rend la moitié gauche inatteignable',
    ).toBeLessThanOrEqual(dispo);
  });

  it("l'image du logo ne se laisse pas écraser par la ligne flex", () => {
    const regle = /\.logo-img\s*\{[^}]*\}/.exec(sidebar)![0];
    expect(regle).toMatch(/flex-shrink:\s*0/);
  });

  it('la combinaison qui rend le débordement invisible est bien celle décrite', () => {
    // Si l'un des deux disparaît un jour, le budget ci-dessus n'a plus le même
    // sens : sans overflow-x:hidden le logo dépasserait au lieu d'être rogné.
    expect(bloc(sidebar, '.sidebar {')).toMatch(/overflow-x:\s*hidden/);
    expect(iconesSeules).toMatch(/\.logo\s*\{\s*justify-content:\s*center/);
  });

  it("« Quoi de neuf » garde un point d'entrée quand son bouton est masqué", () => {
    // Masquer le bouton ne doit pas retirer la fonction : elle vit aussi dans
    // Réglages, comme la version et le nom du serveur cachés au même palier.
    if (cache('.whatsnew-btn')) {
      const reglages = readFileSync(
        resolve(__dirname, '../../components/SettingsView.svelte'),
        'utf-8',
      );
      expect(reglages).toContain("CustomEvent('tune:open-whatsnew')");
    }
  });
});
