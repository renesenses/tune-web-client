// @vitest-environment jsdom
//
// renesenses/tune-web-client#2837 — Didier, fil 2768 : sur la fiche album,
// pouvoir replier « Compléments Qobuz » à son seul titre, avec un petit
// triangle, et que ce repli tienne d'un album à l'autre.
//
// Ces témoins montent la vraie section, répondent comme le serveur
// (`/library/albums/<id>/apports-qobuz`), replient, puis remontent la section
// pour un AUTRE album.
//
// Contre-épreuve : `ApportsQobuzAlbum.svelte` remis à `origin/main` fait rougir
// les quatre témoins de composant (aucun bouton `data-replier-qobuz`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ApportsQobuzAlbum from '../../components/v2/ApportsQobuzAlbum.svelte';

vi.setConfig({ testTimeout: 30_000 });

const CLE_STOCKAGE = 'tune_v2_ecran_v2.album.qobuz.replie';
const apports = {
  statut: 'applique',
  service_album_id: 'alb-q1',
  champs: { label: { valeur: 'Label Qobuz', source: 'qobuz' } },
};

let instance: ReturnType<typeof mount> | null = null;
let target: HTMLDivElement;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); flushSync(); };
const triangle = () => target.querySelector<HTMLButtonElement>('[data-replier-qobuz]');
const corps = () => target.querySelector<HTMLElement>('[data-apports-qobuz] .corps')!;
async function monter(albumId: number) { instance = mount(ApportsQobuzAlbum, { target, props: { albumId } }); await flush(); }
async function demonter() { if (instance) await unmount(instance); instance = null; }

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const path = String(url);
    const data = path.includes('/apports-qobuz') ? apports : path.includes('/credits') ? [] : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  target = document.createElement('div'); document.body.appendChild(target);
});
afterEach(async () => {
  await demonter(); target.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear();
});

describe('web#2837 — « Compléments Qobuz » se replie, et le repli est retenu', () => {
  it('le triangle replie la zone à son titre, puis la déplie', async () => {
    await monter(1);
    const b = triangle();
    expect(b, 'bouton triangle').toBeTruthy();
    expect(b!.getAttribute('aria-expanded')).toBe('true');
    expect(b!.getAttribute('aria-controls')).toBe(corps().id);
    // Nom stable = le titre ; l'état est dans aria-expanded, l'action dans l'infobulle.
    expect(b!.textContent!.trim()).toBe('Compléments Qobuz');
    expect(b!.hasAttribute('aria-label')).toBe(false);
    expect(b!.getAttribute('title')).toBe('Replier');
    expect(corps().hidden).toBe(false);
    expect(target.textContent).toContain('Label Qobuz');

    b!.click(); flushSync();
    expect(b!.getAttribute('aria-expanded')).toBe('false');
    expect(b!.getAttribute('title')).toBe('Déplier');
    expect(corps().hidden).toBe(true);
    // Le titre reste à l'écran.
    expect(target.querySelector('[data-apports-qobuz] h3')!.textContent).toContain('Compléments Qobuz');

    b!.click(); flushSync();
    expect(corps().hidden).toBe(false);
  });

  it('replié sur un album, replié sur le suivant', async () => {
    await monter(1);
    triangle()!.click(); flushSync();
    await demonter();
    await monter(2);
    expect(triangle()!.getAttribute('aria-expanded')).toBe('false');
    expect(corps().hidden).toBe(true);
  });

  it('un stockage indisponible laisse la zone dépliée et le triangle utilisable', async () => {
    // Seule la clé du repli est bloquée : le client lit aussi le stockage pour
    // parler au serveur, et ce n'est pas ce qu'on mesure ici.
    const lire = Storage.prototype.getItem, ecrire = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === CLE_STOCKAGE) throw new Error('bloqué'); return lire.call(this, k);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === CLE_STOCKAGE) throw new Error('bloqué'); ecrire.call(this, k, v);
    });
    await monter(1);
    expect(corps().hidden).toBe(false);
    triangle()!.click(); flushSync();
    expect(corps().hidden).toBe(true);
  });

  it('une valeur stockée inconnue vaut « déplié »', async () => {
    localStorage.setItem(CLE_STOCKAGE, 'peut-être');
    await monter(1);
    expect(corps().hidden).toBe(false);
  });
});

describe('web#2837 — libellés du triangle dans les 15 langues', () => {
  const dossier = resolve(process.cwd(), 'src/lib/locales') + '/';
  const langues = readdirSync(dossier).filter(f => f.endsWith('.ts') && f !== 'index.ts');
  it('15 langues, chacune avec « replier » et « déplier »', () => {
    expect(langues).toHaveLength(15);
    for (const f of langues) {
      const s = readFileSync(dossier + f, 'utf-8');
      expect(s, f).toMatch(/"v2\.album\.qobuz\.collapse": "[^"]+"/);
      expect(s, f).toMatch(/"v2\.album\.qobuz\.expand": "[^"]+"/);
    }
  });
});
