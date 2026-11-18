// @vitest-environment jsdom
/**
 * web#3189 — le curseur de taille des pochettes change À LA FOIS la hauteur
 * d'une rangée et le nombre de colonnes de la grille en pages. L'album en
 * haut de l'écran doit y rester.
 *
 * CONTRE-ÉPREUVE (jouée sur Shrek) : avec l'ancienne règle de trois
 * (`scrollTop *= pas / pasPrecedent`), l'album 2400 vu à 8 colonnes
 * devient ~1500 à 5 colonnes et ce témoin rougit.
 */
import { expect, it } from 'vitest';
import { tick } from 'svelte';
import { fenetreAlbumsPaginee, type TrancheAlbums } from '../fenetreAlbumsPaginee';

it('changer de taille de pochettes garde l’album du haut, colonnes comprises', async () => {
  const el = document.createElement('div');
  const geo = { cols: 8, h: 100 };
  const poserColonnes = () => { el.style.gridTemplateColumns = Array(geo.cols).fill('100px').join(' '); };
  poserColonnes(); el.style.rowGap = '0px';
  document.body.append(el);
  Object.defineProperties(el, { clientHeight: { value: 600 }, clientWidth: { value: 800 } });
  el.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600 } as DOMRect);
  let aller: ((index: number) => Promise<void>) | undefined;
  const options: any = {
    total: 4000, mode: 'grid', taille: 148,
    surPret: (f: typeof aller) => { aller = f; },
    surFenetre: (t: TrancheAlbums) => {
      const { cols, h } = geo;
      const cartes = [];
      for (let i = t.debut; i < t.fin; i++) {
        const carte = document.createElement('div'); carte.dataset.i = String(i);
        const top = t.avant + Math.floor((i - t.debut) / cols) * h;
        Object.defineProperty(carte, 'offsetHeight', { value: h });
        carte.getBoundingClientRect = () => ({ top: top - el.scrollTop, bottom: top + h - el.scrollTop, left: 0, right: 100, width: 100, height: h } as DOMRect);
        cartes.push(carte);
      }
      el.replaceChildren(...cartes);
    },
  };
  const action = fenetreAlbumsPaginee(el, options);
  try {
    await aller!(2400); await tick();
    expect(el.scrollTop).toBe(300 * 100);
    const premiere = () => [...el.querySelectorAll<HTMLElement>('[data-i]')]
      .find((c) => c.getBoundingClientRect().bottom > 0 && c.getBoundingClientRect().top < 600);
    expect(premiere()?.dataset.i).toBe('2400');
    // Le curseur : pochettes plus grandes, 5 colonnes, rangées de 160 px.
    geo.cols = 5; geo.h = 160; poserColonnes();
    action.update({ ...options, taille: 240 }); await tick(); await tick();
    expect(premiere()?.dataset.i, 'l’album du haut a changé').toBe('2400');
    expect(premiere()!.getBoundingClientRect().top).toBe(0);
    // La trame suivante remesure la NOUVELLE hauteur (les cales étaient
    // estimées à l'ancienne) : l'album reste en haut.
    await new Promise((r) => setTimeout(r, 50)); await tick(); await tick();
    expect(premiere()?.dataset.i, 'la remesure a chassé l’album du haut').toBe('2400');
  } finally { action.destroy(); el.remove(); }
});
