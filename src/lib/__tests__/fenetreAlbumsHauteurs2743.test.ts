// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { tick } from 'svelte';
import { fenetreAlbumsPaginee, type TrancheAlbums } from '../fenetreAlbumsPaginee';

it('une première rangée de hauteur différente ne chasse pas l’album visible', async () => {
  const el = document.createElement('div');
  el.style.gridTemplateColumns = '100px'; el.style.rowGap = '0px';
  document.body.append(el);
  Object.defineProperties(el, { clientHeight: { value: 300 }, clientWidth: { value: 100 } });
  el.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 100, width: 100, height: 300 } as DOMRect);
  const changees = new Map<number, number>();
  const hauteur = (i: number) => changees.get(i) ?? (i % 2 ? 160 : 100);
  let aller: ((index: number) => Promise<void>) | undefined;
  let tranche: TrancheAlbums = { debut: 0, fin: 0, avant: 0, apres: 0 };
  const options = {
    total: 1000, mode: 'grid',
    surPret: (f: typeof aller) => { aller = f; },
    surFenetre: (t: TrancheAlbums) => {
      tranche = t;
      const cartes = [];
      let top = t.avant;
      for (let i = t.debut; i < t.fin; i++) {
        const carte = document.createElement('div'); carte.dataset.i = String(i);
        const position = top;
        Object.defineProperty(carte, 'offsetHeight', { get: () => hauteur(i) });
        carte.getBoundingClientRect = () => ({ top: position - el.scrollTop, bottom: position + hauteur(i) - el.scrollTop, left: 0, right: 100, width: 100, height: hauteur(i) } as DOMRect);
        top += hauteur(i); cartes.push(carte);
      }
      el.replaceChildren(...cartes);
    },
  };
  const action = fenetreAlbumsPaginee(el, options);
  try {
    await aller!(450); await tick();
    const cible = () => el.querySelector<HTMLElement>('[data-i="450"]');
    expect(cible()).not.toBeNull();
    // Même alignement que LibraryV2 après monterJusqua : le vrai rectangle
    // de la carte, et non son rang multiplié par une hauteur supposée.
    el.scrollTop += cible()!.getBoundingClientRect().top;
    expect(cible()!.getBoundingClientRect().top).toBe(0);
    changees.set(tranche!.debut, 180);
    action.update(options); await tick(); await tick();
    expect(cible(), 'le changement de hauteur a chassé l’album visible').not.toBeNull();
    expect(cible()!.getBoundingClientRect().top, 'la hauteur de la première rangée a fait dériver la position').toBe(0);
    expect(el.querySelectorAll('[data-i]').length).toBeLessThan(300);
    await aller!(999); await aller!(0); await tick();
    expect(el.querySelector('[data-i="0"]'), 'Z → A doit remonter le début').not.toBeNull();
    expect(el.scrollTop).toBe(0);
  } finally { action.destroy(); el.remove(); }
});
