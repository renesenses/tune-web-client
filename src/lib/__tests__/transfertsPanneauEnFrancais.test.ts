// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
//
// Bertrand, au navigateur sur la .18 (v0.9.153), 18/09/2026 — pas d'issue,
// constat direct : l'écran Playlists → onglet **Transferts** s'affiche en
// ANGLAIS au milieu d'une interface en français. « Transfer a playlist from
// one service to another. », « Source », « Target », « -- Service -- ».
//
// 🔴 CETTE GARDE REGARDE LE RENDU, PAS LE FICHIER. On monte
// `PlaylistManagerView`, on CLIQUE l'onglet Transferts, et on lit le DOM
// réellement peint. Chercher la chaîne « Transfer a playlist… » dans le
// `.svelte` serait satisfait par un texte mort, ou raté dès qu'il repasse par
// une constante — les deux angles morts connus de ce dépôt.
//
// La règle mesurée est générale et ne nomme aucune phrase : **tout texte
// alphabétique peint dans le panneau doit être une valeur du dictionnaire
// français**. Ce qui n'en est pas une est soit de la donnée (nom de playlist,
// nom de service, chiffre), soit un texte en dur — et c'est exactement le
// défaut. Une phrase anglaise nouvellement ajoutée rougira sans qu'on ait à
// la prévoir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';
import {
  playlists,
  playlistsLoaded,
  pendingPlaylistId,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';
import { licenseState } from '../stores/license';

// Monter une vue de 4 000 lignes compile beaucoup : 5 s donneraient un rouge
// de CHARGE, pas de contenu.
vi.setConfig({ testTimeout: 60_000 });

/** La donnée servie par le faux serveur : elle a le droit de s'afficher telle quelle. */
const DONNEES = ['Nocturnes', 'Local', 'Qobuz', 'Tidal', 'Spotify', 'Deezer'];

/**
 * Ce qui ne se traduit pas : ponctuation, chiffres, flèches, noms propres.
 * Liste volontairement COURTE — chaque entrée est une renonciation, et une
 * liste qui grossit est le signe qu'on cache un défaut au lieu de le corriger.
 */
const INTRADUISIBLE = /^(?:[\W\d\s]+|ok|OK|Tune|Playlists?)$/;

/**
 * Le dictionnaire français, en motifs : « {count} playlists » doit accepter
 * « 3 playlists » tel qu'il est peint.
 */
const MOTIFS_FR = Object.values(fr as Record<string, string>)
  .filter((v) => typeof v === 'string' && v.trim().length > 0)
  .map((v) => {
    const echappe = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Les {jetons} échappés deviennent des jokers ; les balises <strong> aussi.
    const motif = echappe.replace(/\\\{[a-zA-Z]+\\\}/g, '.*').replace(/<\/?strong>/g, '');
    return new RegExp(`^${motif}$`, 's');
  });

const traduit = (texte: string) => MOTIFS_FR.some((r) => r.test(texte));

/** Tout ce qu'un œil voit dans ce sous-arbre : texte peint et attributs lus à voix haute. */
function textesPeints(racine: Element): string[] {
  const vus: string[] = [];
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t) vus.push(t);
  }
  for (const el of racine.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(attr)?.replace(/\s+/g, ' ').trim();
      if (v) vus.push(v);
    }
  }
  return vus;
}

/** Les textes peints qui ne passent NI par le dictionnaire NI par la donnée. */
function enDur(racine: Element): string[] {
  return [...new Set(textesPeints(racine))].filter(
    (t) =>
      /[A-Za-zÀ-ÿ]{2}/.test(t) &&
      !INTRADUISIBLE.test(t) &&
      !DONNEES.includes(t) &&
      !traduit(t),
  );
}

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

/**
 * L'onglet Transferts est-il MASQUÉ ? (Bertrand, 22/09/2026 : « Masque tout
 * cela en attendant Tune Circle ».)
 *
 * On lit l'interrupteur à la source plutôt que de supposer : le jour où il
 * repasse à vrai, ces gardes reprennent leur travail toutes seules, sans
 * qu'on ait à se souvenir de les réveiller.
 */
function ongletsAvancesMasques(): boolean {
  const vue = readFileSync(
    resolve(__dirname, '../../components/v2-heritage/PlaylistManagerView.svelte'),
    'utf-8',
  );
  return /const ONGLETS_AVANCES = false;/.test(vue);
}

async function ouvrirLesTransferts(): Promise<HTMLElement | null> {
  if (ongletsAvancesMasques()) {
    // Masqué : il n'y a rien à peindre, et la garde ne doit pas rougir pour
    // ça. Ce qu'on vérifie alors, c'est que l'onglet est bien ABSENT — pas
    // peint en anglais dans un coin.
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
    flushSync();
    await souffler(4);
    const libelles = [...hote.querySelectorAll<HTMLButtonElement>('button.pm-tab')].map(
      (b) => b.textContent?.trim(),
    );
    expect(libelles).not.toContain(fr['playlistManager.tabTransfers']);
    return null;
  }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } });
  flushSync();
  await souffler(4);

  const onglets = [...hote.querySelectorAll<HTMLButtonElement>('button.pm-tab')];
  expect(onglets.length, 'aucun onglet du gestionnaire peint').toBeGreaterThan(1);
  const transferts = onglets.find((b) => b.textContent?.trim() === fr['playlistManager.tabTransfers']);
  expect(transferts, "l'onglet Transferts n'est pas peint sous son libellé français").toBeTruthy();
  transferts!.click();
  await souffler(4);

  const panneau = hote.querySelector<HTMLElement>('.pm-tab-content');
  expect(panneau, "le panneau Transferts n'a rien peint").not.toBeNull();
  expect(panneau!.querySelector('.qt-section'), 'section Transfert rapide absente').not.toBeNull();
  return panneau!;
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  // 🔴 LICENCE PREMIUM POSÉE POUR CE TEST (21/09/2026). Le panneau Transferts
  // est passé derrière une coupure premium : sans licence, il ne peint plus
  // son contenu mais le message qui l'explique, et la garde ne trouvait plus
  // « Transfert rapide ». Ce n'est pas la garde qui se trompait — c'est
  // l'écran qui a changé de contrat, et le test dit désormais lequel.
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  localStorage.clear();
  locale.set('fr');
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
  locale.set('fr');
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

describe('Playlists → Transferts : le panneau est peint en français', () => {
  it("🔴 aucun texte en dur n'est peint dans le panneau Transferts", async () => {
    const panneau = await ouvrirLesTransferts();
    if (!panneau) return; // onglet masqué : rien à peindre
    const fautes = enDur(panneau);
    expect(
      fautes,
      `textes peints hors du dictionnaire français :\n  ${fautes.join('\n  ')}`,
    ).toEqual([]);
  });

  it("🔴 la rangée d'onglets du gestionnaire est peinte en français", async () => {
    await ouvrirLesTransferts();
    const rangee = hote!.querySelector<HTMLElement>('.pm-tabs')!;
    // Masqué ou non, la rangée existe : ce qu'elle peint doit venir du
    // dictionnaire, y compris réduite au seul onglet Playlists.
    const fautes = enDur(rangee);
    expect(fautes, `onglets peints en dur :\n  ${fautes.join('\n  ')}`).toEqual([]);
  });

  // 🔴 UN ROUGE QUI N'EST PAS VENU, consigné plutôt que livré.
  //
  // Troisième garde écrite puis JETÉE : « peindre le panneau en fr, puis en
  // en, et exiger que le texte global change ». Elle a été exécutée AVANT le
  // correctif, sur le panneau bel et bien anglais, et elle est passée au
  // VERT — le panneau contient assez de chaînes déjà traduites (« Transférer »,
  // « Historique des transferts »…) pour que l'ensemble bouge quoi qu'il
  // arrive. Une garde globale ne peut pas voir trois chaînes figées au milieu
  // de trente qui remuent.
  //
  // On ne la livre pas : un vert qui ne garde rien coûte plus qu'il ne
  // rapporte. La garde par le dictionnaire, elle, est venue rouge.
});
