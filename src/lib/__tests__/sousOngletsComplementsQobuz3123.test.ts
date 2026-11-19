// @vitest-environment jsdom
//
// renesenses/tune-web-client#3123 (FabienM, fil 2864) — sur la fiche album,
// « Compléments Qobuz » passe en SOUS-ONGLETS : Label (l'édition), Détails,
// Crédits. Un onglet vide n'existe pas ; seul, il n'affiche pas de rangée.
//
// Ces témoins montent la vraie section et répondent comme le serveur
// (`/library/albums/<id>/apports-qobuz` et `/credits`).
//
// Contre-épreuve : `ApportsQobuzAlbum.svelte` remis à `origin/main` fait
// rougir les témoins (aucun `[role="tab"]`, tout le contenu à plat).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ApportsQobuzAlbum from '../../components/v2/ApportsQobuzAlbum.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const q = (valeur: unknown) => ({ valeur, source: 'qobuz' });
let apports: Record<string, unknown> = {};
let credits: unknown[] = [];

let instance: ReturnType<typeof mount> | null = null;
let target: HTMLDivElement;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
const onglets = () => Array.from(target.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panneau = () => target.querySelector<HTMLElement>('[data-panneau-qobuz]');
async function monter(albumId = 1) { instance = mount(ApportsQobuzAlbum, { target, props: { albumId } }); await flush(); }

beforeEach(() => {
  locale.set('fr');
  localStorage.clear();
  apports = {
    statut: 'applique',
    service_album_id: 'alb-q1',
    champs: {
      label: q('Blue Note'),
      upc: q('123456789012'),
      genres: q(['Jazz']),
      hires: q({ bit_depth: 24, sample_rate: 96000 }),
    },
  };
  credits = [{ artist_name: 'Rudy Van Gelder', role: 'engineer', source: 'qobuz', track_number: 1 }];
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const path = String(url);
    const data = path.includes('/apports-qobuz') ? apports : path.includes('/credits') ? credits : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  target = document.createElement('div'); document.body.appendChild(target);
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = null;
  target.remove(); vi.unstubAllGlobals(); localStorage.clear();
});

describe('web#3123 — « Compléments Qobuz » en sous-onglets', () => {
  it('trois sous-onglets : Label, Détails, Crédits ; Label ouvert d’abord', async () => {
    await monter();
    expect(onglets().map((o) => o.textContent!.trim())).toEqual(['Label', 'Détails', 'Crédits']);
    expect(target.querySelector('[role="tablist"]')).toBeTruthy();
    expect(onglets()[0].getAttribute('aria-selected')).toBe('true');
    expect(panneau()!.getAttribute('role')).toBe('tabpanel');
    expect(panneau()!.getAttribute('aria-labelledby')).toBe(onglets()[0].id);
    expect(panneau()!.textContent).toContain('Blue Note');
    expect(panneau()!.textContent).toContain('123456789012');
    // Le reste n'est pas à plat sous le Label.
    expect(target.textContent).not.toContain('Rudy Van Gelder');
    expect(target.textContent).not.toContain('Jazz');
  });

  it('un clic ouvre l’onglet : Détails, puis Crédits', async () => {
    await monter();
    onglets()[1].click(); flushSync();
    expect(onglets()[1].getAttribute('aria-selected')).toBe('true');
    expect(panneau()!.textContent).toContain('Jazz');
    expect(panneau()!.textContent).not.toContain('Blue Note');
    onglets()[2].click(); flushSync();
    expect(panneau()!.textContent).toContain('Rudy Van Gelder');
    expect(panneau()!.textContent).not.toContain('Jazz');
  });

  it('les flèches du clavier passent d’un onglet à l’autre (motif « tabs »)', async () => {
    await monter();
    onglets()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    flushSync();
    expect(onglets()[1].getAttribute('aria-selected')).toBe('true');
    expect(onglets()[1].tabIndex).toBe(0);
    expect(onglets()[0].tabIndex).toBe(-1);
    onglets()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    flushSync();
    expect(onglets()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('un onglet sans contenu n’existe pas : sans crédits, pas d’onglet Crédits', async () => {
    credits = [];
    await monter();
    expect(onglets().map((o) => o.textContent!.trim())).toEqual(['Label', 'Détails']);
  });

  it('un seul onglet : pas de rangée, le contenu directement', async () => {
    apports = { statut: 'applique', service_album_id: 'alb-q1', champs: { label: q('Blue Note') } };
    credits = [];
    await monter();
    expect(onglets()).toHaveLength(0);
    expect(panneau()!.hasAttribute('role')).toBe(false);
    expect(panneau()!.textContent).toContain('Blue Note');
  });

  it('le panneau d’onglets se vise au clavier (tabindex 0)', async () => {
    await monter();
    expect(panneau()!.getAttribute('tabindex')).toBe('0');
  });

  it('les crédits SEULS gardent un titre visible', async () => {
    apports = { statut: 'applique', service_album_id: 'alb-q1', champs: {} };
    await monter();
    expect(onglets()).toHaveLength(0);
    expect(panneau()!.querySelector('h4')?.textContent?.trim()).toBe('Crédits repris de Qobuz');
    expect(panneau()!.textContent).toContain('Rudy Van Gelder');
  });

  it('« Retirer les apports Qobuz » reste sous les onglets, quel que soit celui ouvert', async () => {
    await monter();
    onglets()[2].click(); flushSync();
    expect(target.querySelector('[data-retirer-qobuz]')).toBeTruthy();
  });
});

describe('web#3123 — le libellé « Détails » dans les 16 langues', () => {
  const dossier = resolve(process.cwd(), 'src/lib/locales') + '/';
  const langues = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
  it('16 langues, chacune avec « v2.album.qobuz.tabDetails »', () => {
    expect(langues).toHaveLength(16);
    for (const f of langues) {
      expect(readFileSync(dossier + f, 'utf-8'), f).toMatch(/"v2\.album\.qobuz\.tabDetails": "[^"]+"/);
    }
  });
});
