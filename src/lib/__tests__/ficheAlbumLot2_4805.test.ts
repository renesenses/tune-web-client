// @vitest-environment jsdom
//
// tune-server-rust#4805 lot 2 — la fiche d'album : « Chercher une pochette plus
// nette » (règle de l'empreinte visuelle, #6252) et les propositions Discogs
// PÉRIMÉES (plus de six heures, conditions de l'API Discogs). Le composant est
// MONTÉ avec un `fetch` simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import EnrichissementAlbumV2 from '../../components/v2/EnrichissementAlbumV2.svelte';
import lFr from '../locales/fr';
import { phrasePochettePlusNette, propositionsEnAttente, type PropositionGardee } from '../enrichissementAlbum';

const fr = lFr as unknown as Record<string, string>;
const tr = (k: string) => fr[k] ?? k;

type Requete = { methode: string; chemin: string };
let requetes: Requete[] = [];
let pochette: { status: number; corps: unknown };
let propositions: PropositionGardee[];
let acceptation: { status: number; corps: unknown };

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function proposition(id: number, perimee: boolean): PropositionGardee {
  return {
    statut: 'proposee', cree_le: '2026-10-13T01:00:00Z', decide_le: null, perimee,
    proposition: {
      discogs_id: id, url: `https://www.discogs.com/release/${id}`, titre: `Édition ${id}`,
      annee: 1987, label: 'Label Discogs', catalog_number: 'PB 41447', credits_album: [], pistes: [],
    } as any,
  };
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  propositions = [];
  pochette = { status: 200, corps: { enriched: true, hash: 'a'.repeat(64), decision: 'plus_nette' } };
  acceptation = { status: 200, corps: { accepted: true, result: { champs_poses: [], champs_gardes: [], pistes_creditees: 0 } } };
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const chemin = String(typeof url === 'string' ? url : url?.url ?? '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, chemin });
    if (chemin.endsWith('/completeness/musicbrainz')) return json({ status: 'not_identified' });
    if (chemin.endsWith('/discogs') && methode === 'GET') return json({ proposals: propositions });
    if (chemin.includes('/discogs/') && chemin.endsWith('/accept')) return json(acceptation.corps, acceptation.status);
    if (chemin.endsWith('/bpm')) return json({ tracks: [] });
    if (chemin.endsWith('/artwork/enrich')) return json(pochette.corps, pochette.status);
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EnrichissementAlbumV2, { target: hote, props: { albumId: 5, pistes: [], ...props } as any });
  flushSync();
  await attendre();
  return hote;
}

describe('fonctions pures', () => {
  it('dit ce que la recherche de pochette plus nette a fait', () => {
    expect(phrasePochettePlusNette({ enriched: true, decision: 'plus_nette' }, tr)).toBe(fr['v2.cover.replaced']);
    expect(phrasePochettePlusNette({ enriched: false, decision: 'meme_visuel' }, tr)).toBe(fr['v2.cover.alreadyBest']);
    expect(phrasePochettePlusNette({ enriched: false, decision: 'visuel_different' }, tr)).toBe(fr['v2.cover.different']);
    expect(phrasePochettePlusNette({ enriched: false, reason: 'album already has cover art' }, tr)).toBe(fr['v2.cover.notReplaceable']);
    expect(phrasePochettePlusNette({ enriched: false, reason: 'no cover art found on Cover Art Archive' }, tr)).toBe(fr['v2.cover.noneOnCaa']);
  });

  it('sépare les propositions fraîches des périmées ; un serveur antérieur n\'a pas de périmées', () => {
    const { fraiches, perimees } = propositionsEnAttente([proposition(1, false), proposition(2, true), { ...proposition(3, false), perimee: undefined }]);
    expect(fraiches.map((p) => p.proposition.discogs_id)).toEqual([1, 3]);
    expect(perimees.map((p) => p.proposition.discogs_id)).toEqual([2]);
  });
});

describe('fiche d\'album — pochette plus nette', () => {
  it('sans pochette en place, pas de bouton', async () => {
    const h = await monter({ pochette: null });
    expect(h.querySelector('[data-pochette-plus-nette]')).toBeNull();
  });

  it('le bouton appelle la route de #6252 et remonte la nouvelle pochette', async () => {
    const posee = vi.fn();
    const h = await monter({ pochette: 'b'.repeat(64), onPochette: posee });
    const bouton = h.querySelector('[data-pochette-plus-nette]') as HTMLButtonElement;
    expect(bouton.textContent?.trim()).toBe(fr['v2.cover.sharper']);
    bouton.click();
    await attendre();
    expect(requetes.some((r) => r.methode === 'POST' && r.chemin.endsWith('/library/albums/5/artwork/enrich'))).toBe(true);
    expect(posee).toHaveBeenCalledWith('a'.repeat(64));
    expect(h.textContent).toContain(fr['v2.cover.replaced']);
  });

  it('un autre visuel : la pochette en place reste, et l\'écran le dit', async () => {
    pochette = { status: 200, corps: { enriched: false, decision: 'visuel_different', reason: 'album already has cover art' } };
    const posee = vi.fn();
    const h = await monter({ pochette: 'b'.repeat(64), onPochette: posee });
    (h.querySelector('[data-pochette-plus-nette]') as HTMLButtonElement).click();
    await attendre();
    expect(posee).not.toHaveBeenCalled();
    expect(h.textContent).toContain(fr['v2.cover.different']);
  });
});

describe('fiche d\'album — propositions Discogs périmées', () => {
  it('une proposition de plus de six heures ne montre plus son contenu', async () => {
    propositions = [proposition(7, true), proposition(8, false)];
    const h = await monter({});
    expect(h.querySelector('[data-proposition-perimee="7"]')?.textContent).toBe(fr['v2.discogs.stale']);
    expect(h.querySelector('[data-proposition-discogs="7"]')).toBeNull();
    expect(h.textContent).not.toContain('Édition 7');
    // La fraîche, elle, s'affiche avec son contenu.
    expect(h.querySelector('[data-proposition-discogs="8"]')?.textContent).toContain('Édition 8');
  });

  it('une acceptation refusée pour péremption le dit en clair', async () => {
    propositions = [proposition(8, false)];
    acceptation = { status: 409, corps: { error: 'proposition_perimee' } };
    const h = await monter({});
    const accepter = Array.from(h.querySelectorAll('[data-proposition-discogs="8"] button'))
      .find((b) => b.textContent?.trim() === fr['v2.discogs.accept']) as HTMLButtonElement;
    accepter.click();
    await attendre();
    expect(h.textContent).toContain(fr['v2.discogs.stale']);
  });
});
