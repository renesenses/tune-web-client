// @vitest-environment jsdom
//
// renesenses/tune-web-client#3122 (FabienM, fil 2864) — page artiste allégée :
//  1. plus de titre BIOGRAPHIE au-dessus du texte (la section garde son nom
//     pour les lecteurs d'écran) ;
//  2. le favori réduit au cœur — vérifié sur la fiche montée par
//     `coeurFicheArtisteService2094.test.ts` (texte vide, infobulle et
//     libellé accessible).
//
// Contre-épreuve : `BioEtTitresPhares.svelte` remis à `origin/main` fait
// rougir le premier témoin (un `<h2>` « Biographie »).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('web#3122 — la biographie sans son titre', () => {
  it('pas de titre BIOGRAPHIE ; le texte est là, la section nommée pour l’accessibilité', () => {
    monte = mount(BioEtTitresPhares, { target: hote, props: { bio: 'Radiohead est un groupe anglais.' } as any });
    flushSync();
    const section = hote.querySelector<HTMLElement>('.bio-bloc');
    expect(section, 'la section de biographie a disparu').toBeTruthy();
    expect(section!.querySelector('h2'), 'un titre est encore posé au-dessus de la biographie').toBeNull();
    expect(hote.textContent).not.toContain(fr['v2.art.bio']);
    expect(section!.getAttribute('aria-label')).toBe(fr['v2.art.bio']);
    expect(section!.textContent).toContain('Radiohead est un groupe anglais.');
  });

  it('sans biographie, pas de section', () => {
    monte = mount(BioEtTitresPhares, { target: hote, props: { bio: '' } as any });
    flushSync();
    expect(hote.querySelector('.bio-bloc')).toBeNull();
  });
});
