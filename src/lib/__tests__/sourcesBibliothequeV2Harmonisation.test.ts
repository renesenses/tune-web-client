// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import { writable } from 'svelte/store';

/**
 * Harmonisation UI (rc14) — sources de bibliothèque : on MONTE le panneau et
 * on lit le DOM. Plus d'uuid, de route d'API ni de nom de réglage au premier
 * niveau ; le nom une seule fois ; le bouton qui corrige désigne le bon axe ;
 * « Copy diagnostic » copie identifiants et texte brut.
 */
const mocks = vi.hoisted(() => ({ read: vi.fn(), add: vi.fn(), act: vi.fn(), copy: vi.fn() }));
vi.mock('../api', () => ({ getUpnpLibrarySources: mocks.read, addUpnpLibrarySource: mocks.add, actUpnpLibrarySource: mocks.act }));
vi.mock('../i18n', () => ({ t: writable((key: string) => (key === 'v2.ms.indexedCounts' ? '{tracks}, {albums} indexed' : key)), tn: writable((key: string, n: number) => `${key}:${n}`) }));
vi.mock('../utils', async (orig) => ({ ...(await orig<typeof import('../utils')>()), copyText: mocks.copy }));
import Panel from '../../components/v2/UpnpLibrarySourcesV2.svelte';

const UDN = 'uuid:258FC2D5-E2C3-B734-0-123456789abc';
const HORS_LIGNE = {
  key: 'a', udn: UDN, container: '0', name: 'Asset UPnP: Mac-Studio-6 · Asset UPnP: Mac-Studio-6',
  enabled: true, status: 'unavailable', pending_count: 0, generation: 'g', last_attempt: 1, last_success: null,
  report: { indexe: false, code: 'unknown_server', raison: 'Status unavailable',
    detail: `No media server registered as "${UDN}" — the list lives in GET /api/v1/network/media-servers` },
};
const TROP_PROFOND = {
  key: 'b', udn: 'uuid:tune', container: '0', name: 'Tune Server', enabled: true, status: 'partial',
  pending_count: 0, generation: 'g', last_attempt: 1, last_success: 1_764_133_200,
  report: { indexe: true, pistes: { distinctes: 1 }, albums_ajoutes: 0,
    parcours: { plafonds: { profondeur_max: 6 }, plafond: { nature: 'profondeur', valeur: 6,
      reglage: 'upnp_index_profondeur_max',
      message: "profondeur maximale atteinte (6) : relever le réglage « upnp_index_profondeur_max »" } } },
};

let instance: ReturnType<typeof mount> | undefined;
const flush = async () => { await new Promise((r) => setTimeout(r, 0)); await tick(); };
const visible = () => {
  // Le texte du premier niveau : tout, sauf le contenu replié de « Details ».
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('details > :not(summary)').forEach((n) => n.remove());
  return clone.textContent ?? '';
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ items: [HORS_LIGNE, TROP_PROFOND] });
  mocks.act.mockResolvedValue({});
  mocks.copy.mockResolvedValue(true);
});
afterEach(async () => { if (instance) await unmount(instance); instance = undefined; document.body.innerHTML = ''; });

it('ni uuid, ni route, ni nom de réglage, ni texte français au premier niveau ; le nom une fois', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const t = visible();
  expect(t).not.toContain(UDN);
  expect(t).not.toContain('/api/v1');
  expect(t).not.toContain('upnp_index_profondeur_max');
  expect(t).not.toContain('profondeur maximale');
  expect(t.split('Mac-Studio-6').length - 1, 'le nom de la source s’affiche une seule fois').toBe(1);
  // Le brut reste accessible, replié.
  expect(document.body.textContent).toContain('/api/v1/network/media-servers');
});

it('mappe les états : Offline + Try again, Incomplete + Sync now, et les messages construits côté web', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const [a, b] = [...document.querySelectorAll<HTMLElement>('article.src')];
  expect(a.dataset.etat).toBe('offline');
  expect(a.textContent).toContain('v2.ms.state.offline');
  expect(a.textContent).toContain('v2.ms.offlineMsg');
  expect(a.querySelector('.acts')!.textContent).toContain('v2.ms.retry');
  expect(b.dataset.etat).toBe('incomplete');
  expect(b.textContent).toContain('v2.ms.ceiling.depth');
  expect(b.querySelector('.acts')!.textContent).toContain('upnp.sync.refresh');
  // Pluriel des comptes : « 1 tracks » s'affichait.
  expect(b.querySelector('.meta')!.textContent).toContain('v2.common.trackCountN:1');
});

it('« Increase depth » ouvre le réglage de profondeur, sans rien écrire lui-même', async () => {
  const onrelever = vi.fn();
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [], onrelever } });
  await flush();
  const bouton = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('v2.ms.ceiling.raiseDepth'))!;
  bouton.click();
  expect(onrelever).toHaveBeenCalledWith('profondeur');
  expect(mocks.act).not.toHaveBeenCalled();
});

it('« Try again » relance la synchronisation de la source', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const bouton = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('v2.ms.retry'))!;
  bouton.click();
  await flush();
  expect(mocks.act).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), 'sync');
});

it('« Copy diagnostic » copie l’uuid, le code et le texte brut, et le dit', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const bouton = [...document.querySelectorAll('article.src')][0]
    .querySelector<HTMLButtonElement>('.diag button')!;
  bouton.click();
  await flush();
  const copie = mocks.copy.mock.calls[0][0] as string;
  expect(copie).toContain(`udn: ${UDN}`);
  expect(copie).toContain('code: unknown_server');
  expect(copie).toContain('GET /api/v1/network/media-servers');
  expect(document.body.textContent).toContain('v2.ms.copied');
});

it('« Pause syncing » est rangé dans le menu « … »', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  expect([...document.querySelectorAll('button')].some((x) => x.textContent?.includes('upnp.sync.pause'))).toBe(false);
  document.querySelector<HTMLButtonElement>('article.src .plus button')!.click();
  await flush();
  const pause = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((x) => x.textContent?.includes('upnp.sync.pause'))!;
  pause.click();
  await flush();
  expect(mocks.act).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }), 'pause');
});

it('Échap ferme le menu « … » et rend le focus à son bouton', async () => {
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const bouton = document.querySelector<HTMLButtonElement>('article.src .plus button')!;
  bouton.click();
  await flush();
  const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
  item.focus();
  item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flush();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(bouton.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(bouton);
});

// Relecture web#3448 : le refus du serveur, déjà traduit (corps_refus +
// message_key, ex. 409 « indexation déjà en cours »), s'affichait de nouveau ;
// l'harmonisation l'avait remplacé par « Indexing failed » / « Sync failed ».
it('ajout refusé : la phrase traduite du serveur, pas « Indexing failed »', async () => {
  mocks.read.mockResolvedValue({ items: [] });
  mocks.add.mockRejectedValue(new Error('Une indexation est déjà en cours pour ce serveur.'));
  instance = mount(Panel, { target: document.body, props: { server: { id: UDN, name: 'Asset' }, container: '0', servers: [] } });
  await flush();
  document.querySelector<HTMLButtonElement>('button.ajout')!.click();
  await flush();
  const alerte = document.querySelector('[role="alert"]')!;
  expect(alerte.textContent).toBe('Une indexation est déjà en cours pour ce serveur.');
});

it('action refusée : la phrase du serveur ; coupure réseau : repli sur la phrase de l’écran', async () => {
  mocks.act.mockRejectedValueOnce(new Error('Synchronisation déjà en cours.'));
  instance = mount(Panel, { target: document.body, props: { server: null, container: '0', servers: [] } });
  await flush();
  const retry = () => [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('v2.ms.retry'))!;
  retry().click();
  await flush();
  expect(document.querySelector('[role="alert"]')!.textContent).toBe('Synchronisation déjà en cours.');
  mocks.act.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  retry().click();
  await flush();
  expect(document.querySelector('[role="alert"]')!.textContent).toBe('v2.ms.genericFailure');
});
