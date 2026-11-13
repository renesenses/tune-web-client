// @vitest-environment jsdom
//
// web#2707 (Bertrand, 07/11 ; discussion tune-server-rust#8304, go du 12/11
// pour la rc12) — le panneau Spectrogramme disait « plus c'est clair, plus
// c'est fort » sans échelle. Une barre graduée en dBFS, aux couleurs de
// l'image (palette du serveur, `tune-core/src/audio/spectrogramme.rs`), se
// tient désormais à droite de l'image.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SpectrogrammePanneau from '../../components/v2/SpectrogrammePanneau.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { degradeEchelleDb, graduationsDb, libelleDb, PALETTE_SPECTROGRAMME, PLANCHER_DB } from '../spectrogramme';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

describe('#2707 — l’échelle, calculée', () => {
  it('la palette et le plancher sont ceux du serveur', () => {
    // Recopie de `couleur()` et de `PLANCHER_DB` côté serveur (07/11/2026).
    expect(PLANCHER_DB).toBe(-120);
    expect(PALETTE_SPECTROGRAMME).toHaveLength(7);
    expect(PALETTE_SPECTROGRAMME[0]).toEqual([0, 0, 0]);
    expect(PALETTE_SPECTROGRAMME[PALETTE_SPECTROGRAMME.length - 1]).toEqual([255, 255, 255]);
  });

  it('0, −20 … −120 ; 0 dBFS en haut, le plancher en bas', () => {
    const g = graduationsDb();
    expect(g.map((x) => x.db)).toEqual([0, -20, -40, -60, -80, -100, -120]);
    expect(g[0].bas).toBe(100);
    expect(g[g.length - 1].bas).toBe(0);
    expect(g[3].bas).toBe(50);
  });

  it('dégradé du noir (bas) au blanc (haut), sept arrêts réguliers', () => {
    const d = degradeEchelleDb();
    expect(d.startsWith('linear-gradient(to top, rgb(0, 0, 0) 0%')).toBe(true);
    expect(d.endsWith('rgb(255, 255, 255) 100%)')).toBe(true);
    expect(d.match(/rgb\(/g)).toHaveLength(7);
  });

  it('libellés au vrai signe moins', () => {
    expect(libelleDb(0)).toBe('0');
    expect(libelleDb(-40)).toBe('−40');
  });
});

describe('#2707 — le panneau monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  beforeEach(() => {
    locale.set('fr');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:spectro-test'), revokeObjectURL: vi.fn() }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: '', headers: new Headers(),
      blob: async () => new Blob(['PNG'], { type: 'image/png' }), text: async () => 'PNG', json: async () => ({}),
    }) as unknown as Response));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null; hote?.remove(); hote = null;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function image() {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SpectrogrammePanneau, { target: hote, props: { trackId: 7, titre: 'X', onClose: () => {} } as any });
    flushSync();
    const avant = document.querySelector('[data-echelle-db]');
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button.bouton')][0].click();
    for (let i = 0; i < 20 && !document.querySelector('img.image'); i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
    return avant;
  }

  it('🔴 l’image arrive avec son échelle graduée en dBFS, à droite', async () => {
    const avant = await image();
    expect(avant, 'pas d’échelle avant l’image').toBeNull();
    const ech = document.querySelector('[data-echelle-db]');
    expect(ech, 'aucune échelle de couleurs à côté du spectrogramme').not.toBeNull();
    expect(ech!.previousElementSibling?.tagName).toBe('IMG');
    expect([...ech!.querySelectorAll('[data-db]')].map((e) => e.textContent)).toEqual(
      ['0', '−20', '−40', '−60', '−80', '−100', '−120'],
    );
    expect(ech!.textContent).toContain('dBFS');
    expect(ech!.getAttribute('aria-label')).toBe(fr['spectro.scale']);
    expect((ech!.querySelector('.barre') as HTMLElement).getAttribute('style')).toContain('linear-gradient');
  });

  it('la phrase de l’échelle existe dans les quinze langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(__dirname, '../locales', `${l}.ts`), 'utf8');
      expect(src, `spectro.scale manquant en ${l}`).toContain('"spectro.scale":');
    }
  });
});
