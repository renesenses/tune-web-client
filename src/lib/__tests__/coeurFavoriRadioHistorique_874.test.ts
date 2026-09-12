// @vitest-environment jsdom
//
// « Historique : le cœur « favori radio » mal indexé »
// — renesenses/tune-web-client#874.
//
// Deux défauts distincts sous un seul numéro.
//
// 1. LA CLÉ. `cleFavoriRadio` recopiait mot pour mot la formule de
//    `radioFavListenKey`, qui indexe déjà exactement la même chose — un favori
//    de radio par titre et artiste — pour la barre de transport, l'écran de
//    lecture, l'écran des radios et celui des favoris. Deux formules pour un
//    seul index, c'est une divergence en attente : le jour où l'une se met à
//    découper ou normaliser autrement, le cœur de l'historique cesse de
//    s'allumer pour un titre que les quatre autres écrans tiennent pour un
//    favori — sans erreur et sans rien qui le fasse voir. Elle DÉLÈGUE
//    désormais.
//
// 2. LE SÉLECTEUR MORT. Le cœur vivait en `opacity:0`, révélé par
//    `.row:hover .fav`. Or cet écran ne rend AUCUN `.row` : les lignes
//    viennent de `ListePistesV2`, et le CSS de Svelte est de portée
//    composant. La règle ne s'appliquait à rien, et rien ne cassait
//    visiblement — le cœur d'un titre pas encore en favori restait simplement
//    invisible, survol ou pas.
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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('le cœur est VISIBLE sans dépendre du balisage d’un autre composant', () => {
    // Le défaut était invisible parce qu'il ne cassait rien : le cœur restait
    // simplement à `opacity:0`, révélé par une règle qui ne s'appliquait à
    // rien. La règle générale, tenue ici : aucun sélecteur de classe du
    // `<style>` de cet écran ne vise une classe que son propre balisage ne
    // rend pas.
    const src = lireEcran();
    const i = src.lastIndexOf('<style>');
    const balisage = src.slice(0, i);
    const style = src.slice(i, src.lastIndexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

    const rendues = new Set<string>();
    for (const m of balisage.matchAll(/class="([^"{]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) rendues.add(c);
    }
    for (const m of balisage.matchAll(/class:([A-Za-z0-9_-]+)/g)) rendues.add(m[1]);

    const visees = new Set<string>();
    for (const m of style.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) visees.add(m[1]);

    const mortes = [...visees].filter((c) => !rendues.has(c));
    expect(
      mortes,
      `HistoriqueV2 stylise des classes qu’il ne rend pas : ${mortes.join(', ')} — ` +
      'la règle ne s’applique à rien, et rien ne le signale',
    ).toEqual([]);

    // Et le cœur n'est plus caché : un bouton qu'on ne voit pas n'est pas une
    // action qu'on peut faire.
    const regleFav = /\.fav\{[^}]*\}/.exec(style)?.[0] ?? '';
    expect(regleFav, 'la règle du cœur a disparu').not.toBe('');
    expect(/opacity:\s*0\b/.test(regleFav), 'le cœur est de nouveau invisible au repos').toBe(false);
  });
});

function lireEcran(): string {
  // `import.meta.url` n'est pas un `file:` sous jsdom : on lit depuis la
  // racine du dépôt, comme les autres témoins de source de ce dossier.
  return readFileSync(resolve(process.cwd(), 'src/components/v2/HistoriqueV2.svelte'), 'utf8');
}
