// @vitest-environment jsdom
//
// FabienM, fil 1829 « v0.9.152: v1 divers bug » (17/09/2026), points 2 et 3 —
// web#1111 et web#1112. Les deux vivent dans le même en-tête du gestionnaire
// de playlists, d'où un seul fichier de gardes.
//
// 🔴 CES GARDES CLIQUENT, ELLES NE LISENT PAS LE SOURCE. On monte
// `PlaylistManagerView`, on appuie sur les onglets et sur « + Nouvelle
// playlist », et on regarde le DOM réellement peint. Une garde qui chercherait
// la chaîne `SmartAIView` dans le `.svelte` serait satisfaite par un bouton
// mort — l'angle mort « écrit mais pas branché » de ce dépôt.
//
//   • #1111 : parmi TOUS les onglets de l'écran (rangée du haut `view-tab` et
//     rangée du gestionnaire `pm-tab`), un seul doit monter le générateur
//     (`.smart-ai-view`). Avant le correctif il y en a deux.
//   • #1112 : depuis N'IMPORTE quel onglet du gestionnaire, « + Nouvelle
//     playlist » doit ouvrir le formulaire de création (`.create-form`). Avant
//     le correctif, hors de l'onglet Playlists, le clic ne peint rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { playlists, playlistsLoaded, pendingPlaylistId, streamingPlaylistsCache, streamingPlaylistsLoaded } from '../stores/playlists';
import { currentProfileId } from '../stores/profile';

// Monter une vue de 4 000 lignes compile beaucoup, et ces gardes la montent
// plusieurs fois : les 5 s par défaut donneraient un rouge de CHARGE.
vi.setConfig({ testTimeout: 60_000 });

function corpsPour(url: string): unknown {
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 42, name: 'Nocturnes', track_count: 1 }];
  if (url.includes('/streaming/services')) return {};
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 3) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

async function monterLeGestionnaire(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(4);
  return hote;
}

const onglets = (el: HTMLElement, classe: string) =>
  [...el.querySelectorAll<HTMLButtonElement>(`button.${classe}`)];

/** Le générateur est-il peint À L'ÉCRAN, maintenant ? */
const generateurMonte = () => document.querySelectorAll('.smart-ai-view').length;

/**
 * Appuie tour à tour sur chaque onglet de la rangée et compte ceux qui font
 * apparaître le générateur. Entre deux essais, on revient sur le premier
 * onglet de la rangée pour repartir d'un écran propre.
 */
async function portesVersLeGenerateur(el: HTMLElement, classe: string): Promise<number> {
  const total = onglets(el, classe).length;
  expect(total, `aucun onglet .${classe} peint`).toBeGreaterThan(0);
  let portes = 0;
  for (let i = 0; i < total; i++) {
    const rangee = onglets(el, classe);
    expect(rangee.length, `la rangée .${classe} a changé de taille en cours de route`).toBe(total);
    rangee[i].click();
    await souffler(3);
    if (generateurMonte() > 0) portes++;
    const retour = onglets(el, classe)[0];
    if (retour) {
      retour.click();
      await souffler(2);
    }
  }
  return portes;
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  localStorage.clear();
  pendingPlaylistId.set(null);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as unknown as typeof WebSocket,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const corps = corpsPour(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

describe('#1111 — le générateur de playlists n’a qu’UNE porte', () => {
  it('🔴 un seul onglet de tout l’écran monte SmartAIView', async () => {
    const el = await monterLeGestionnaire();

    // Rangée du gestionnaire d'abord : elle n'existe que tant que la rangée du
    // haut est sur son premier onglet.
    const parLeGestionnaire = await portesVersLeGenerateur(el, 'pm-tab');
    const parLeHaut = await portesVersLeGenerateur(el, 'view-tab');

    expect(
      parLeGestionnaire + parLeHaut,
      `portes vers le générateur — rangée du haut : ${parLeHaut}, rangée du gestionnaire : ${parLeGestionnaire}`,
    ).toBe(1);
  });

  it('🔴 la porte qui reste est celle de la rangée du haut', async () => {
    const el = await monterLeGestionnaire();

    expect(await portesVersLeGenerateur(el, 'view-tab')).toBe(1);
    // Retour sur le premier onglet du haut pour retrouver le gestionnaire.
    onglets(el, 'view-tab')[0].click();
    await souffler(3);
    expect(await portesVersLeGenerateur(el, 'pm-tab')).toBe(0);
  });
});

describe('#1112 — « + Nouvelle playlist » agit depuis tous les onglets', () => {
  it('🔴 le clic ouvre le formulaire de création, quel que soit l’onglet du gestionnaire', async () => {
    const el = await monterLeGestionnaire();
    const total = onglets(el, 'pm-tab').length;
    // Depuis le 22/09/2026, la rangée peut être réduite au seul onglet
    // Playlists : les quatre onglets avancés sont masqués derrière
    // `ONGLETS_AVANCES`. La garde porte sur « depuis CHAQUE onglet peint »,
    // pas sur leur nombre.
    expect(total).toBeGreaterThan(0);

    for (let i = 0; i < total; i++) {
      const rangee = onglets(el, 'pm-tab');
      const nom = rangee[i].textContent?.trim() ?? `#${i}`;
      rangee[i].click();
      await souffler(3);

      const creer = el.querySelector<HTMLButtonElement>('button.create-btn');
      expect(creer, `« + Nouvelle playlist » absent depuis l’onglet ${nom}`).not.toBeNull();
      creer!.click();
      await souffler(3);

      expect(
        el.querySelectorAll('.create-form').length,
        `depuis l’onglet ${nom}, le clic sur « + Nouvelle playlist » n’a rien peint`,
      ).toBe(1);

      // Le formulaire s'ouvre là où on peut s'en servir : l'onglet actif est
      // redevenu le premier de la rangée.
      const actif = el.querySelector<HTMLButtonElement>('button.pm-tab.active');
      expect(actif?.textContent?.trim(), `onglet actif après le clic depuis ${nom}`).toBe(
        onglets(el, 'pm-tab')[0].textContent?.trim(),
      );

      // Refermer pour l'essai suivant.
      const annuler = [...el.querySelectorAll<HTMLButtonElement>('.create-form button.cancel-btn')][0];
      annuler?.click();
      await souffler(2);
      expect(el.querySelectorAll('.create-form').length).toBe(0);
    }
  });
});
