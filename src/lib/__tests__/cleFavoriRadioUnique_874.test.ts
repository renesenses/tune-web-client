// @vitest-environment jsdom
//
// « Historique : le cœur « favori radio » mal indexé » — #874, ce qu'il en
// RESTE après #952.
//
// ⚠️ DEUX SESSIONS ONT TRAVAILLÉ SUR CETTE ISSUE LE MÊME JOUR. Lisez d'abord
// `coeurRadioFavoris857_874.test.ts` : il tient le SÉLECTEUR MORT
// (`.row:hover .fav`, puis `.lh`), livré par #952, avec un détecteur de
// classes orphelines plus complet que ce que ce fichier tenait — il lit les
// trois formes que Svelte emploie, `class="x"`, `class:x={…}` et `class:x`.
// Rien de tout cela n'est repris ici : ce serait une seconde vérité sur le
// même sujet, et c'est précisément ce que ce fichier combat.
//
// CE QUI RESTE, ET QUE #952 N'A PAS TRAITÉ : LA CLÉ.
//
// `cleFavoriRadio` recopiait mot pour mot la formule de `radioFavListenKey`,
// qui indexe déjà exactement la même chose — un favori de radio par titre et
// artiste — pour la barre de transport, l'écran de lecture, l'écran des
// radios et celui des favoris. Les deux rendaient la même chaîne : ce n'était
// pas une divergence, c'était une DUPLICATION, donc une divergence en
// attente. Le jour où l'une se met à découper ou normaliser autrement, le
// cœur de l'historique cesse de s'allumer pour un titre que les quatre autres
// écrans tiennent pour un favori — sans erreur, sans message, et sans rien
// qui le fasse voir. Elle DÉLÈGUE désormais ; il n'y a plus qu'une formule.
//
// 🔴 CE QUE CE FICHIER NE TRANCHE PAS.
//
// #952 laisse ouverte une question de produit : deux LIGNES d'historique du
// même titre ET du même artiste partagent leur état de favori, ce qui est
// peut-être correct — un favori de radio EST un couple titre/artiste, pas une
// ligne. Rien ici n'y répond : la clé reste le couple titre/artiste. Ce
// fichier tient seulement qu'elle est UNE, et qu'elle garde l'artiste.
//
// 🔴 LE PIÈGE DE CE TÉMOIN, ET COMMENT IL EST ÉVITÉ.
//
// Deux pistes de TITRES DIFFÉRENTS ne peuvent pas entrer en collision : le
// témoin serait alors vert contre n'importe quelle clé, y compris une clé
// réduite au seul titre. Les deux pistes d'ici portent donc le MÊME titre et
// des artistes différents, et une seule des deux est en favori. Une clé qui
// perdrait l'artiste allumerait les deux cœurs, et le compte passerait de un
// à deux.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { cleFavoriRadio, chargerFavorisRadio } from '../historiqueLecture';
import { radioFavListenKey } from '../radioFavListenAt';

/** Le même titre, deux artistes. C'est tout l'objet du témoin. */
const TITRE = 'Hallelujah';
const EN_FAVORI = 'Leonard Cohen';
const PAS_EN_FAVORI = 'Jeff Buckley';

/**
 * Deux écoutes de radio, du même titre, par deux artistes différents.
 *
 * ⚠️ Les instants sont choisis pour que l'ordre chronologique NE SUIVE PAS
 * l'ordre alphabétique des artistes : sans cela, un témoin qui se tromperait
 * de ligne tomberait juste par accident.
 */
const ECOUTES = [
  {
    track_id: null, title: TITRE, artist_name: PAS_EN_FAVORI, album_title: 'Radio Temoin',
    source: 'radio', source_id: 'https://exemple.invalid/flux-a', listened_at: '2026-09-12T08:00:00Z',
    zone_id: 1,
  },
  {
    track_id: null, title: TITRE, artist_name: EN_FAVORI, album_title: 'Radio Temoin',
    source: 'radio', source_id: 'https://exemple.invalid/flux-b', listened_at: '2026-09-12T09:00:00Z',
    zone_id: 1,
  },
];

/** Le serveur ne connaît QU'UN des deux en favori. */
const FAVORIS = [{ id: 7, title: TITRE, artist: EN_FAVORI, station_name: 'Radio Temoin' }];

function corpsPour(url: string): unknown {
  if (url.includes('/radio-favorites')) return FAVORIS;
  if (url.includes('/library/history')) return { items: ECOUTES, total: ECOUTES.length };
  if (/\/(zones|devices|profiles|shortcuts|collections|tags)(\?|\/|$)/.test(url)) return [];
  return {};
}

function poserLeServeur(sur: (u: string) => unknown = corpsPour) {
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const u = typeof input === 'string' ? input : String(input?.url ?? input);
    const corps = sur(u);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => poserLeServeur());
afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('#874 — deux homonymes d’artistes différents, deux favoris distincts', () => {
  it('la clé n’est plus une COPIE : elle emprunte celle du reste du client', () => {
    // Une seule vérité pour l'index des favoris de radio. Si l'une des deux
    // change sans l'autre, ce témoin le dit avant l'utilisateur.
    expect(cleFavoriRadio(TITRE, EN_FAVORI)).toBe(radioFavListenKey(TITRE, EN_FAVORI));
    expect(cleFavoriRadio(null, null)).toBe(radioFavListenKey(null, null));
    expect(cleFavoriRadio(TITRE, undefined)).toBe(radioFavListenKey(TITRE, undefined));
  });

  it('deux titres homonymes d’artistes différents ne partagent PAS une clé', () => {
    expect(cleFavoriRadio(TITRE, EN_FAVORI)).not.toBe(cleFavoriRadio(TITRE, PAS_EN_FAVORI));
  });

  it('l’index chargé du serveur ne reconnaît QUE celui qui est en favori', async () => {
    // Le vrai chemin de l'écran, pas seulement la fonction de clé : c'est ce
    // `Set` qui décide quel cœur s'allume.
    const index = await chargerFavorisRadio();
    expect(index.has(cleFavoriRadio(TITRE, EN_FAVORI)), 'le favori connu n’est pas reconnu').toBe(true);
    expect(
      index.has(cleFavoriRadio(TITRE, PAS_EN_FAVORI)),
      'l’homonyme est pris pour un favori : la clé perd l’artiste',
    ).toBe(false);
  });

  it("à l'écran, UN SEUL des deux cœurs est allumé", async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(HistoriqueV2, { target: hote });
    flushSync();
    await souffler(120);
    flushSync();

    const coeurs = Array.from(hote.querySelectorAll('button.fav'));
    expect(coeurs.length, 'les deux écoutes de radio ne sont pas rendues').toBe(2);

    const allumes = coeurs.filter((b) => b.classList.contains('on'));
    expect(
      allumes.length,
      'les deux cœurs partagent le même état : le titre suffit à les confondre',
    ).toBe(1);
  });

});
