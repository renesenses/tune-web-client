/**
 * Les menus de filtres de la Bibliothèque doivent être ATTEIGNABLES.
 *
 * ## Le défaut
 *
 * Ils s'ouvraient au survol seul :
 *
 * ```css
 * .chip { height: 36px }        /* le chip          *\/
 * .drop { position: relative }   /* épouse le chip   *\/
 * .drop .menu { top: 44px }      /* le menu          *\/
 * .drop:hover .menu { display: flex }
 * ```
 *
 * Huit pixels morts entre le bas de `.drop` (36) et le haut du menu (44). En
 * descendant vers le menu, le pointeur quittait `.drop`, `:hover` tombait, et
 * le menu disparaissait AVANT d'être atteint. Visible, jamais cliquable.
 *
 * Signalé par Bertrand le 01/09/2026 — « les filtres ne sont pas
 * sélectionnables » — sur les Serveurs multimédia puis sur la Bibliothèque :
 * l'écran Serveurs monte le MÊME composant sur un catalogue distant, donc un
 * seul défaut se voyait à deux endroits.
 *
 * ## Ce que le garde tient
 *
 * Deux corrections, et il faut les deux — l'une sans l'autre laisse un trou :
 *
 *  1. le PONT transparent comble les 8 px, pour que le survol reste continu ;
 *  2. le chip ouvre au CLIC. Un menu au survol seul n'existe ni au clavier ni
 *     au toucher : sur tablette, aucun de ces filtres n'était atteignable,
 *     quelle que soit la géométrie. Corriger le pont seul aurait réparé la
 *     souris et laissé le reste.
 *
 * ⚠️ Ce test lit la SOURCE. Il ne remplace pas un essai à la souris — la
 * géométrie réelle dépend du rendu. Il empêche la régression, il ne prouve pas
 * le fonctionnement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/LibraryV2.svelte', import.meta.url),
);
const source = () => readFileSync(ECRAN, 'utf8');

/** Hauteur déclarée d'un sélecteur, en pixels. */
function hauteur(css: string, selecteur: string): number | null {
  const bloc = new RegExp(`\\.${selecteur}\\{[^}]*\\}`).exec(css);
  if (!bloc) return null;
  const h = /height:\s*(\d+)px/.exec(bloc[0]);
  return h ? Number(h[1]) : null;
}

describe('Bibliothèque — les menus de filtres sont atteignables', () => {
  it('aucun trou entre le chip et son menu', () => {
    const src = source();
    const hChip = hauteur(src, 'chip');
    const dessus = /\.drop \.menu\{[^}]*top:\s*(\d+)px/.exec(src);
    expect(hChip, "la hauteur du chip n'est plus déclarée").not.toBeNull();
    expect(dessus, "la position du menu n'est plus déclarée").not.toBeNull();

    const ecart = Number(dessus![1]) - hChip!;
    if (ecart <= 0) return; // menu collé au chip : rien à combler

    // Un écart doit être PONTÉ, sinon le pointeur quitte `.drop` avant
    // d'atteindre le menu et le survol tombe.
    const pont = /\.drop::after\{[^}]*top:\s*(\d+)px[^}]*height:\s*(\d+)px/.exec(src);
    expect(
      pont,
      `${ecart} px séparent le chip (${hChip}px) du menu (top:${dessus![1]}px) et aucun ` +
        'pont ne les relie : le menu sera visible et inatteignable à la souris.',
    ).not.toBeNull();

    const [, ptTop, ptH] = pont!.map(Number);
    expect(ptTop, 'le pont ne part pas du bas du chip').toBeLessThanOrEqual(hChip!);
    expect(
      ptTop + ptH,
      `le pont s'arrête à ${ptTop + ptH}px, avant le menu (${dessus![1]}px) : il reste un trou.`,
    ).toBeGreaterThanOrEqual(Number(dessus![1]));
  });

  it('les menus s’ouvrent aussi au CLIC, pas seulement au survol', () => {
    const src = source();
    // Sans clic : ni clavier, ni tablette. La géométrie n'y peut rien.
    expect(
      src.includes('.drop.open .menu'),
      "l'ouverture au clic a disparu : le menu redevient inaccessible au clavier et au toucher.",
    ).toBe(true);
    const chips = [...src.matchAll(/<button class="chip"(?![^>]*\bplain\b)[^>]*>/g)].map((m) => m[0]);
    const sansClic = chips.filter((c) => !c.includes('onclick=') && c.includes('aria-haspopup'));
    expect(sansClic, `chip(s) de menu sans onclick : ${sansClic.join(' | ')}`).toEqual([]);
  });

  it('un menu ouvert se referme : choix, clic ailleurs, Échap', () => {
    const src = source();
    for (const [quoi, motif] of [
      ['après un choix', 'ddClose()'],
      ['au clic ailleurs', "closest('.drop')"],
      ['à Échap', "e.key === 'Escape'"],
    ] as const) {
      expect(src.includes(motif), `la fermeture ${quoi} a disparu`).toBe(true);
    }
  });
});
