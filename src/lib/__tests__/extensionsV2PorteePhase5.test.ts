// @vitest-environment jsdom
//
// Phase 5 (web#1257) — « aucune perte d'accès ». Trois fonctions d'`api.ts`
// n'étaient atteintes que par l'ancien écran `PluginsView` :
//
//   getMarketplaceCatalog  GET    /marketplace/plugins
//   uninstallPlugin        DELETE /plugins/{name}
//   updatePlugin           POST   /plugins/{name}/update
//
// 🔴 CES TÉMOINS MONTENT LE VRAI `PluginsV2`. On moque `../api`, on regarde ce
// qui se peint, on clique, et on regarde QUELLE fonction est partie. La
// confirmation de désinstallation est observée dans le bus `dialogs` : le
// témoin ne fait que RÉPONDRE, comme `DialogContainer` sous le doigt d'un
// humain.
//
// Contre-épreuve (faite à la main, consignée dans la PR) : retirer l'appel
// `api.getMarketplaceCatalog()` ⇒ 1 rouge ; faire repasser la désinstallation
// par le seul marketplace ⇒ 3 rouge ; retirer le bouton de mise à jour ⇒ 4 rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getMergedPlugins: vi.fn(),
  getMarketplaceCatalog: vi.fn(),
  uninstallPlugin: vi.fn(),
  uninstallMarketplacePlugin: vi.fn(),
  updatePlugin: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  installPlugin: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
}));
vi.mock('../api', () => mocks);

import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { dialogs } from '../stores/dialogs';
import { fusionnerCatalogue, routeDeDesinstallation } from '../catalogueGreffons';

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 5; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PluginsV2, { target: hote });
  flushSync();
  await laisserCharger();
  return hote;
}

const carte = (el: HTMLElement, nom: string) =>
  [...el.querySelectorAll('article.pl')].find((a) => a.querySelector('h2')?.textContent === nom) as HTMLElement | undefined;
const boutonDe = (c: HTMLElement | undefined, texte: string) =>
  [...(c?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const onglet = (el: HTMLElement, i: number) => el.querySelectorAll('nav.tabs button')[i] as HTMLButtonElement;

/** Répond à la confirmation en attente, comme le ferait l'humain. */
async function repondre(oui: boolean) {
  for (let i = 0; i < 10 && !get(dialogs).length; i++) await respirer();
  const d = get(dialogs)[0];
  expect(d, 'aucune confirmation demandée').toBeTruthy();
  expect(d.danger).toBe(true);
  dialogs.settle(d.id, oui);
  await laisserCharger();
}

const DJ = {
  name: 'dj', display_name: 'DJ', description: 'Mixage', version: '1.0.0', category: 'playback',
  compatible: true, installed: true, enabled: true, update_available: true, status: 'active',
};
const WASM = {
  name: 'lyrics-plus', display_name: 'Paroles+', description: 'Paroles', version: '0.2.0', category: 'metadata',
  compatible: true, installed: true, enabled: true, update_available: false, status: 'active', type: 'wasm',
};
const CATALOGUE = {
  count: 3,
  plugins: [
    { slug: 'visualiseur', name: 'Visualiseur', description: 'Spectre', version: '1.1.0', author: 'Mozaik',
      category: 'tools', installed: false, platforms: 'wasm' },
    { slug: 'vieux-python', name: 'Vieux', description: 'Héritage', version: '0.1', author: 'x',
      category: 'tools', installed: false, platforms: 'python' },
    // Déjà connu localement : ne doit pas apparaître deux fois.
    { slug: 'lyrics-plus', name: 'Paroles+', description: 'Paroles', version: '0.2.0', author: 'x',
      category: 'metadata', installed: true, platforms: 'wasm' },
  ],
};

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getMergedPlugins.mockResolvedValue([DJ, WASM]);
  mocks.getMarketplaceCatalog.mockResolvedValue(CATALOGUE);
  mocks.uninstallPlugin.mockResolvedValue({ status: 'uninstalled', restart_required: true });
  mocks.uninstallMarketplacePlugin.mockResolvedValue({ status: 'uninstalled', restart_required: true });
  mocks.updatePlugin.mockResolvedValue({ name: 'dj', status: 'updated' });
});

afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
});

describe('Extensions v2 — ce que seule l’ancienne interface atteignait', () => {
  it('1. getMarketplaceCatalog : le catalogue distant rejoint l’onglet Catalogue, sans doublon', async () => {
    const el = await poser();
    expect(mocks.getMarketplaceCatalog).toHaveBeenCalledTimes(1);
    onglet(el, 1).click();
    flushSync();
    const vis = carte(el, 'Visualiseur');
    expect(vis, 'le greffon du marketplace manque au catalogue').toBeTruthy();
    expect(el.querySelectorAll('article.pl').length).toBe(4); // DJ, Paroles+, Visualiseur, Vieux
    // Le python hérité est montré, mais pas installable.
    const vieux = carte(el, 'Vieux');
    expect(vieux?.querySelector('button.go')?.hasAttribute('disabled')).toBe(true);
    // Installer une ligne du marketplace passe ENFIN par sa route.
    mocks.installMarketplacePlugin.mockResolvedValue({ status: 'installed', restart_required: true });
    (vis!.querySelector('button.go') as HTMLButtonElement).click();
    await laisserCharger();
    expect(mocks.installMarketplacePlugin).toHaveBeenCalledWith('visualiseur');
  });

  it('2. catalogue distant hors ligne ⇒ l’installé s’affiche quand même', async () => {
    mocks.getMarketplaceCatalog.mockRejectedValue(new Error('offline'));
    const el = await poser();
    expect(el.querySelector('.err')).toBeNull();
    expect(carte(el, 'DJ')).toBeTruthy();
  });

  it('3. uninstallPlugin : un greffon intégré se retire par DELETE /plugins/{name}, après confirmation', async () => {
    const el = await poser();
    boutonDe(carte(el, 'DJ'), 'Désinstaller')!.click();
    await repondre(true);
    expect(mocks.uninstallPlugin).toHaveBeenCalledWith('dj');
    expect(mocks.uninstallMarketplacePlugin).not.toHaveBeenCalled();
    expect(el.querySelector('.restart')).not.toBeNull();
  });

  it('3bis. un greffon wasm passe par le marketplace ; refuser la confirmation ne retire rien', async () => {
    const el = await poser();
    boutonDe(carte(el, 'Paroles+'), 'Désinstaller')!.click();
    await repondre(false);
    expect(mocks.uninstallMarketplacePlugin).not.toHaveBeenCalled();
    boutonDe(carte(el, 'Paroles+'), 'Désinstaller')!.click();
    await repondre(true);
    expect(mocks.uninstallMarketplacePlugin).toHaveBeenCalledWith('lyrics-plus');
    expect(mocks.uninstallPlugin).not.toHaveBeenCalled();
  });

  it('4. updatePlugin : « Mettre à jour » n’est offert qu’avec update_available, et appelle la route', async () => {
    const el = await poser();
    expect(boutonDe(carte(el, 'Paroles+'), 'Mettre à jour')).toBeUndefined();
    const b = boutonDe(carte(el, 'DJ'), 'Mettre à jour');
    expect(b, 'le bouton « Mettre à jour » manque').toBeTruthy();
    b!.click();
    await laisserCharger();
    expect(mocks.updatePlugin).toHaveBeenCalledWith('dj');
    expect(mocks.getMergedPlugins).toHaveBeenCalledTimes(2); // rechargé après
  });
});

describe('lib/catalogueGreffons', () => {
  it('fusion : ni doublon, ni ligne déjà installée, compatibilité = wasm', () => {
    const r = fusionnerCatalogue([DJ as any, WASM as any], CATALOGUE.plugins as any);
    expect(r.map((p) => p.name)).toEqual(['dj', 'lyrics-plus', 'visualiseur', 'vieux-python']);
    expect(r[2].marketplace).toBe(true);
    expect(r[2].compatible).toBe(true);
    expect(r[3].compatible).toBe(false);
  });
  it('route de désinstallation', () => {
    expect(routeDeDesinstallation(DJ as any)).toBe('serveur');
    expect(routeDeDesinstallation(WASM as any)).toBe('marketplace');
  });
});
