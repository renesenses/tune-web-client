// @vitest-environment jsdom
//
// #1360 — FabienM, forum fil 1859, 20/09/2026 09 h 04, 0.9.158, Windows,
// point 1 sur 6 : « Il manque des vignettes à mon historique (cf. logs) ».
//
// ## CE QUE CE TÉMOIN ÉTABLIT — ET CE QU'IL N'ÉTABLIT PAS
//
// ⚠️ Le journal promis n'a jamais été joint : celui du fil 1862 ne porte
// aucune erreur de pochette, celui du fil 1859 manque. On ne sait donc PAS
// quelles lignes précises Fabien a vues vides, ni pour quelle source. Ce
// témoin ne prétend pas le deviner.
//
// Il tient le seul défaut de cet écran qui se démontre SANS son journal : la
// ligne d'OBJET est la seule, de toutes les lignes de l'historique, qui peut
// n'avoir AUCUNE vignette — pas même la boîte grise de remplacement.
//
//     {#if vignette}
//       <span class="ovig"><AlbumArt … /></span>
//     {/if}
//
// et `pochetteDObjet` rend `null` dès qu'aucune piste du lot ne porte ni
// `cover_path` ni `album_id` — une radio, une piste UPnP, un album local sans
// pochette. Les lignes de PISTE, elles, montent `AlbumArt` sans condition
// (`ListePistesV2`, `pochetteEnTableau`), et `AlbumArt` dessine sa propre
// image de remplacement quand il n'a rien : elles ont donc toujours leur
// boîte. L'objet replié est pourtant la seule ligne qu'on voit — c'est le
// motif même de #991.
//
// Résultat à l'écran : une colonne de vignettes régulière, trouée là où
// l'objet n'a pas su en trouver une, et dont le texte glisse à gauche.
// « Il manque des vignettes à mon historique », mot pour mot.
//
// ## LA MESURE, ET POURQUOI ELLE EST FAITE AINSI
//
// Le témoin ne lit pas le source : une garde de texte serait satisfaite par
// la DÉFINITION d'un `AlbumArt` posé n'importe où dans le fichier. Il monte
// le vrai écran avec un historique sans pochette — exactement la charge utile
// que sert `/library/history` pour ces cas — et compte les boîtes rendues.
//
// 🔴 La CONTRE-ÉPREUVE est dans le même fichier, et elle est indispensable :
// les lignes de piste du même écran, avec la même absence de pochette, ont
// leur boîte. Sans elle, on ne saurait pas si l'écran est troué ou si le
// décor est simplement vide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

/**
 * Quatre écoutes d'un MÊME album, servies par `/library/history`, SANS
 * pochette et SANS `album_id` : le cas où `pochetteDObjet` ne trouve rien.
 *
 * C'est une charge utile ordinaire — le serveur ne retient `cover_url` que
 * s'il a su la résoudre, et `album_id` est nul dès que l'écoute n'est pas
 * rattachée à un album de la bibliothèque locale.
 */
const LIGNES_SANS_POCHETTE = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1,
  track_id: null,
  title: `Piste ${i + 1}`,
  artist_name: 'Un artiste',
  album_title: 'Un album',
  source: 'qobuz',
  source_id: String(700 + i),
  album_id: null,
  cover_url: null,
  duration_ms: 180_000,
  listened_at: `2026-09-20T09:0${i}:00Z`,
  zone_id: 99,
  context_type: 'album',
  context_id: 'album-4242',
  context_position: i,
  context_name: 'Un album',
}));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HistoriqueV2, { target: hote });
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

function corpsPour(url: string): unknown {
  if (url.includes('/library/history')) return { items: LIGNES_SANS_POCHETTE, total: LIGNES_SANS_POCHETTE.length };
  return [];
}

beforeEach(() => {
  locale.set('fr');
  playbackHistory.clear();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = corpsPour(url);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  playbackHistory.clear();
  try { localStorage.clear(); } catch { /* idem */ }
  vi.unstubAllGlobals();
});

describe('#1360 — « il manque des vignettes à mon historique »', () => {
  it('🔴 une ligne d’objet SANS pochette garde quand même sa vignette', async () => {
    const el = await poserEcran();

    // Contre-épreuve du décor : l'objet est bien rendu, et c'est bien le cas
    // du ticket — aucune de ses pistes ne porte de pochette.
    const objet = el.querySelector<HTMLElement>('.objet');
    expect(objet, 'aucune ligne d’objet rendue : le décor n’a pas pris').not.toBeNull();
    expect(objet!.querySelector('.otitre')?.textContent?.trim()).toBe('Un album');

    expect(
      objet!.querySelector('.onom .ovig'),
      'la ligne d’objet n’a AUCUNE vignette — pas même la boîte de remplacement que ' +
      'porte chaque ligne de piste du même écran : c’est le trou de #1360',
    ).not.toBeNull();

    // Et la boîte contient bien un `AlbumArt`, pas un espaceur vide : c'est
    // lui qui dessine l'image de remplacement.
    expect(
      objet!.querySelector('.onom .ovig .album-art'),
      'la vignette de l’objet n’est pas un AlbumArt : rien ne sera dessiné',
    ).not.toBeNull();
  });

  it('la CONTRE-ÉPREUVE : les lignes de piste, elles, ont toujours leur boîte', async () => {
    const el = await poserEcran();

    // On déplie l'objet : ses pistes sont servies par `ListePistesV2`, avec
    // la même absence totale de pochette.
    const objet = el.querySelector<HTMLElement>('.objet')!;
    objet.click();
    for (let i = 0; i < 12; i++) await respirer();
    flushSync();

    const vignettes = el.querySelectorAll('.tiroir .album-art');
    expect(
      vignettes.length,
      'le tiroir n’a rendu aucune piste : la contre-épreuve ne mesure rien',
    ).toBe(LIGNES_SANS_POCHETTE.length);
  });
});
