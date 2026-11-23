// @vitest-environment jsdom
//
// Fil 3009, point 12 (FabienM, v1.0.0-rc13) — « Menu bibliothèque : quand on
// clique sur un album, il manque le label de l'album. »
//
// Mesuré sur le .18 le 23/11/2026 : « Trio in Tokyo » (album 19859) a
// `label: null` — ses fichiers n'en portent pas — et pourtant son
// rapprochement Qobuz APPLIQUÉ l'a apporté (`apports_qobuz.champs.label` =
// « Dreyfus Jazz »), dans la réponse même de `GET /library/albums/{id}`. La
// colonne « Détails » ne lisait que `albums.label` : pas de ligne Label.
//
// Contre-épreuve : sur `origin/main` (a10e4118), `labelAffiche` n'existe pas
// et la colonne de la fiche n'a pas de ligne Label : les deux témoins
// rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { labelAffiche, labelApporte } from '../apportsQobuz';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const APPORTS = {
  source: 'qobuz', statut: 'applique' as const,
  champs: { label: { source: 'qobuz', valeur: 'Dreyfus Jazz' } },
};

describe('labelAffiche — le label que la fiche montre', () => {
  it('celui de l’album prime ; sinon la fiche ; sinon l’apport Qobuz appliqué ; sinon le catalogue', () => {
    expect(labelAffiche({ label: 'Columbia' }, { label: null, apports_qobuz: APPORTS })).toBe('Columbia');
    expect(labelAffiche({ label: null }, { label: 'Blue Note' })).toBe('Blue Note');
    expect(labelAffiche({ label: '  ' }, { label: null, apports_qobuz: APPORTS })).toBe('Dreyfus Jazz');
    expect(labelAffiche({ label: null }, null, 'Sony')).toBe('Sony');
    expect(labelAffiche({}, {}, null)).toBeNull();
  });

  it('un rapprochement à confirmer ou retiré n’apporte rien', () => {
    expect(labelApporte({ ...APPORTS, statut: 'a_confirmer' })).toBeNull();
    expect(labelApporte({ ...APPORTS, statut: 'retire' })).toBeNull();
    expect(labelApporte({ statut: 'applique', champs: { label: { source: 'qobuz', valeur: 42 } } })).toBeNull();
    expect(labelApporte(null)).toBeNull();
    expect(labelApporte(APPORTS)).toBe('Dreyfus Jazz');
  });
});

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function corpsPour(u: string): unknown {
  if (/\/library\/albums\/19859\/bio/.test(u)) return { bio: null, source: null };
  if (/\/library\/albums\/19859\/apports-qobuz/.test(u)) return APPORTS;
  if (/\/library\/albums\/19859(\?|$)/.test(u)) {
    return { id: 19859, title: 'Trio in Tokyo', source: 'local', label: null, apports_qobuz: APPORTS };
  }
  if (/\/config/.test(u)) return {};
  return [];
}

async function laisserFaire(n = 60, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (jusqua?.()) return;
  }
}

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    return reponse(corpsPour(u));
  }));
  (Element.prototype as any).scrollIntoView = () => {};
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('fil 3009, point 12 — la fiche d’un album de la bibliothèque', () => {
  it('« Trio in Tokyo » sans label dans ses fichiers : la colonne Détails montre celui que Qobuz a apporté', async () => {
    const album = { id: 19859, title: 'Trio in Tokyo', source: 'local', artist_name: 'Michel Petrucciani', label: null } as any;
    monte = mount(AlbumDetailV2, { target: hote, props: { album, onClose: () => {} } });
    await laisserFaire(80, () => !!hote.querySelector('[data-detail="v2.album.fiche.label"]'));
    const ligne = hote.querySelector('[data-detail="v2.album.fiche.label"]');
    expect(ligne, 'la ligne Label manque à la colonne Détails').not.toBeNull();
    expect(ligne!.textContent?.trim()).toBe('Dreyfus Jazz');
  });
});
