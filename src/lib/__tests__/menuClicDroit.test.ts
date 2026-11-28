// @vitest-environment jsdom
// Itération 12 (Néomorphique, 28/11/2026) — clic droit sur une ligne de piste :
// le menu « … » existant s'ouvre, le menu du navigateur ne s'affiche pas.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ouvrirMenuDeLaLigne } from '../menuClicDroit';

function ligne(html: string) {
  const d = document.createElement('div');
  d.className = 'trow';
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}
function clicDroit(l: Element, cible: Element = l) {
  const preventDefault = vi.fn();
  const ouvert = ouvrirMenuDeLaLigne({ currentTarget: l, target: cible, preventDefault } as any);
  return { ouvert, preventDefault };
}

describe('clic droit sur une ligne de piste', () => {
  it('ouvre le « … » de la ligne et retient le menu du navigateur', () => {
    const l = ligne('<span class="titre">Suit Yourself</span><button class="pa" aria-haspopup="menu" aria-expanded="false">…</button>');
    const bouton = l.querySelector('button')!;
    const clic = vi.fn();
    bouton.addEventListener('click', clic);
    const r = clicDroit(l, l.querySelector('.titre')!);
    expect(r.ouvert).toBe(true);
    expect(r.preventDefault).toHaveBeenCalled();
    expect(clic).toHaveBeenCalledTimes(1);
  });
  it('un menu déjà ouvert n’est pas refermé par un second clic droit', () => {
    const l = ligne('<button class="pa" aria-haspopup="menu" aria-expanded="true">…</button>');
    const clic = vi.fn();
    l.querySelector('button')!.addEventListener('click', clic);
    expect(clicDroit(l).ouvert).toBe(true);
    expect(clic).not.toHaveBeenCalled();
  });
  it('sans « … » sur la ligne, ou dans un champ, le navigateur garde son menu', () => {
    const sans = clicDroit(ligne('<span>Piste sans menu</span>'));
    expect(sans.ouvert).toBe(false);
    expect(sans.preventDefault).not.toHaveBeenCalled();
    const l = ligne('<input class="rn" /><button class="pa" aria-haspopup="menu">…</button>');
    const champ = clicDroit(l, l.querySelector('input')!);
    expect(champ.ouvert).toBe(false);
    expect(champ.preventDefault).not.toHaveBeenCalled();
  });
  it('la ligne de ListePistesV2 est raccordée', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'ListePistesV2.svelte'), 'utf8');
    expect(src).toMatch(/<div class="trow"[^>]*\n?[^>]*oncontextmenu=\{ouvrirMenuDeLaLigne\}/);
  });
});
