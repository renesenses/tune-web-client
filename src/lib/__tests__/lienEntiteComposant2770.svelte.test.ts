// @vitest-environment jsdom
//
// web#2770 — `LienEntite.svelte`, le seul composant qui dessine un nom
// d'entité. Monté DANS un bouton (la carte d'un album, la ligne de la file) :
// le clic sur le nom ouvre l'entité et N'ATTEINT PAS le bouton derrière lui ;
// sans cible, le nom est un texte sans rôle de lien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const { ouvrirArtisteDepuis } = vi.hoisted(() => ({ ouvrirArtisteDepuis: vi.fn(async (_a: any, _d: any) => {}) }));
vi.mock('../ouvrirArtisteDepuis', async (orig) => ({ ...(await orig<object>()), ouvrirArtisteDepuis }));

import LienEntite from '../../components/partages/LienEntite.svelte';
import { activeView } from '../stores/navigation';

let hote: HTMLButtonElement;
let monte: Record<string, unknown> | null = null;
const surLeBouton = vi.fn();

function monter(props: Record<string, unknown>) {
  monte = mount(LienEntite, { target: hote, props: props as any });
  flushSync();
}

beforeEach(() => {
  ouvrirArtisteDepuis.mockClear();
  surLeBouton.mockClear();
  activeView.set('library');
  hote = document.createElement('button');
  hote.addEventListener('click', surLeBouton);
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  document.body.innerHTML = '';
});

describe('LienEntite', () => {
  it('🔴 le nom d’un artiste est un lien ; le clic ouvre l’artiste et s’arrête là', () => {
    monter({ entite: { type: 'artiste', nom: 'Air', artiste: { id: 42, name: 'Air', source: 'local' } } });
    const lien = hote.querySelector<HTMLElement>('[role="link"]');
    expect(lien, 'un span au rôle de lien, valide dans un bouton').not.toBeNull();
    expect(lien!.textContent).toBe('Air');
    expect(lien!.tabIndex).toBe(0);
    lien!.click();
    expect(ouvrirArtisteDepuis).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), 'library');
    expect(surLeBouton, 'le bouton qui entoure le nom ne doit PAS recevoir le clic').not.toHaveBeenCalled();
  });

  it('le clavier ouvre aussi (Entrée), et s’arrête là', () => {
    monter({ entite: { type: 'artiste', nom: 'Air', artiste: { id: 42, name: 'Air', source: 'local' } } });
    const lien = hote.querySelector<HTMLElement>('[role="link"]')!;
    lien.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(ouvrirArtisteDepuis).toHaveBeenCalledTimes(1);
    expect(surLeBouton).not.toHaveBeenCalled();
  });

  it('« A & B » : deux liens, un séparateur en texte', () => {
    monter({ entite: { type: 'artiste', nom: 'Simon & Garfunkel' } });
    const liens = [...hote.querySelectorAll('[role="link"]')].map((l) => l.textContent);
    expect(liens).toEqual(['Simon', 'Garfunkel']);
    expect(hote.querySelector('.separateur')?.textContent).toBe(' & ');
    expect(hote.textContent).toBe('Simon & Garfunkel');
  });

  it('sans cible connue : un texte, aucun rôle de lien, et rien ne se passe au clic', () => {
    monter({ entite: { type: 'album', nom: 'Moon Safari', piste: { source: 'local' } } });
    expect(hote.querySelector('[role="link"]')).toBeNull();
    expect(hote.textContent).toBe('Moon Safari');
    hote.querySelector<HTMLElement>('.texte')!.click();
    expect(surLeBouton, 'un texte simple laisse le bouton derrière lui faire son geste').toHaveBeenCalledTimes(1);
  });

  it('`texte` remplace l’affichage sans changer la cible (l’année entre parenthèses)', () => {
    monter({ entite: { type: 'annee', annee: 1998 }, texte: '(1998)' });
    expect(hote.querySelector('[role="link"]')!.textContent).toBe('(1998)');
    expect(hote.querySelector('[role="link"]')!.getAttribute('title')).toBe('1998');
  });

  it('sans nom : rien n’est rendu', () => {
    monter({ entite: { type: 'artiste', nom: '' } });
    expect(hote.querySelector('.lien-entite')).toBeNull();
  });
});
