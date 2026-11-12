// @vitest-environment jsdom
//
// #2459 (Régis, 10/11) — la flèche de retour de la fiche album porte son
// libellé « Retour » (`common.back`, comme le retour des Collections), dans
// toutes les langues, et passe par l'échelle du texte (garde rc12).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  }) as unknown as Response));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  locale.set('fr');
  vi.unstubAllGlobals();
});

function poser(onClose: () => void) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2 as any, {
    target: hote,
    props: { album: { id: 55, title: 'Album témoin', artist_name: 'Artiste témoin' }, onClose } as any,
  });
  flushSync();
  return hote.querySelector<HTMLButtonElement>('.v2-detail button.close');
}

describe('#2459 — libellé « Retour » de la fiche album', () => {
  it('la flèche dit « Retour » et ferme la fiche', () => {
    locale.set('fr');
    const fermer = vi.fn();
    const b = poser(fermer);
    expect(b, 'le bouton de retour manque').not.toBeNull();
    expect(b!.textContent?.trim()).toBe('Retour');
    expect(b!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    b!.click();
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('traduit : « Back » en anglais', () => {
    locale.set('en');
    const b = poser(() => {});
    expect(b!.textContent?.trim()).toBe('Back');
  });

  it('`common.back` existe dans les 15 langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src, l).toMatch(/['"]common\.back['"]\s*:\s*['"][^'"]+['"]/);
    }
  });

  it('visible à toute largeur : aucune règle ne masque le libellé, et sa taille suit l’échelle du texte', () => {
    const src = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
    const regle = src.match(/\n\s*\.close\{[^}]*\}/)?.[0] ?? '';
    expect(regle).toContain('var(--v2-txt-echelle, 1)');
    expect(regle).not.toMatch(/width:40px/);
    expect(src).not.toMatch(/\.close\s+span\s*\{[^}]*display:\s*none/);
  });
});
