// @vitest-environment jsdom
//
// « Le click sur Agnes Obel n'ouvre pas la page artiste » — Bertrand,
// 20/09/2026, capture d'un album Qobuz ouvert depuis l'écran Streaming
// (`#streaming/album:qobuz:e3j7lzexax05q`).
//
// LE MÉCANISME, établi avant d'écrire
// -----------------------------------
// `StreamAlbum` porte `artist_id` — l'identifiant de l'artiste CHEZ LE SERVICE
// (`tune-core/src/streaming/traits.rs:75`, et `map_album` le remplit pour
// Qobuz, Deezer et Amazon). Trois fabriques d'objet album le JETAIENT :
//
//   - `StreamingV2.ouvrirFiche` recopiait champ par champ et sautait celui-ci ;
//   - `ShellV2` (vue `streamingalbum`) ne portait NI le nom NI l'identifiant,
//     et `ficheAlbumService` n'avait pas de place pour eux ;
//   - `PisteActions` / `NowPlaying` ouvraient l'album sans dire qui le jouait.
//
// Sans `artist_id`, `destinationArtiste` ne peut plus rendre `artiste-service`
// (#956) : elle retombe sur `recherche`, le clic part en recherche fédérée, et
// un nom que le service ne retrouve pas ramène muettement sur l'écran
// Recherche. Sans `artist_name`, il n'y a même plus de nom à cliquer.
//
// 🔴 CE TÉMOIN MONTE LA FICHE ET CLIQUE. Une garde de texte resterait verte si
// le champ voyageait sans être lu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { gestesNavigationService } from '../stores/navigation';

const lire = (p: string) => readFileSync(p, 'utf8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/** Ce que rend `/streaming/qobuz/albums/{id}/tracks` : chaque piste porte
 *  l'identifiant de son interprète chez le service (#1361, `map_track`). */
// ⚠️ Les noms sont ceux du FIL, pas ceux de la struct Rust : `StreamTrack`
// sérialise `id` en `source_id` et `artist` en `artist_name`
// (`traits.rs:7-11`). Un décor écrit sur les noms Rust serait vert contre un
// objet que le client ne reçoit jamais.
const PISTES_QOBUZ = [
  { source_id: '1', title: 'Riverside', artist_name: 'Agnes Obel', artist_id: '610403', duration_ms: 200000 },
  { source_id: '2', title: 'Fuel to Fire', artist_name: 'Agnes Obel', artist_id: '610403', duration_ms: 300000 },
];

/** Une compilation : deux interprètes différents sur le même disque. */
const PISTES_MELANGEES = [
  { source_id: '1', title: 'A', artist_name: 'Agnes Obel', artist_id: '610403', duration_ms: 1000 },
  { source_id: '2', title: 'B', artist_name: 'Nils Frahm', artist_id: '77', duration_ms: 1000 },
];

let pistesServies: any[] = PISTES_QOBUZ;

function reponse(): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => pistesServies,
    text: async () => JSON.stringify(pistesServies),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const ouvrirArtiste = vi.fn();
const ouvrirAlbum = vi.fn();

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2 as any, { target: hote, props: props as any });
  flushSync();
  return hote;
}

const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  pistesServies = PISTES_QOBUZ;
  ouvrirArtiste.mockClear();
  ouvrirAlbum.mockClear();
  gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste } as any);
  vi.stubGlobal('fetch', vi.fn(async () => reponse()));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  gestesNavigationService.set(null);
  vi.unstubAllGlobals();
});

/** L'objet que `StreamingV2.ouvrirFiche` fabrique pour un album de service. */
const ALBUM_STREAMING = {
  id: null, source_id: 'e3j7lzexax05q', source: 'qobuz',
  title: 'Philharmonics', artist_name: 'Agnes Obel', artist_id: '610403',
  cover_path: null, year: 2010,
};

describe('l’album de service ouvre la fiche de SON artiste, sans recherche', () => {
  it('🔴 le nom est un BOUTON, pas du texte mort', async () => {
    const el = poser({ album: ALBUM_STREAMING, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    const bouton = el.querySelector('button.artist.lien');
    expect(bouton, 'le nom d’artiste n’est pas cliquable — c’est le défaut du 20/09').not.toBeNull();
    expect(bouton!.textContent).toContain('Agnes Obel');
  });

  it('🔴 et le clic ouvre la fiche PAR IDENTIFIANT (#956), pas par recherche', async () => {
    const el = poser({ album: ALBUM_STREAMING, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    el.querySelector<HTMLButtonElement>('button.artist.lien')!.click();
    flushSync();
    expect(ouvrirArtiste).toHaveBeenCalledTimes(1);
    const cible = ouvrirArtiste.mock.calls[0][0];
    expect(cible.service).toBe('qobuz');
    expect(cible.nom).toBe('Agnes Obel');
    // 🔴 SANS `id`, la coquille repart en recherche fédérée — et un nom
    // qu'elle ne retrouve pas ramène sur l'écran Recherche, en silence.
    expect(cible.id, 'l’identifiant de service ne traverse pas').toBe('610403');
  });
});

describe('le FILET : l’artiste replié sur les pistes', () => {
  it('un album sans `artist_id` le tire de ses pistes, si elles s’accordent', async () => {
    const el = poser({
      album: { ...ALBUM_STREAMING, artist_id: undefined, artist_name: '' },
      service: 'qobuz', onClose: () => {},
    });
    await attendre();
    flushSync();
    const bouton = el.querySelector<HTMLButtonElement>('button.artist.lien');
    expect(bouton, 'le repli n’a pas joué').not.toBeNull();
    expect(bouton!.textContent).toContain('Agnes Obel');
    bouton!.click();
    flushSync();
    expect(ouvrirArtiste.mock.calls[0][0].id).toBe('610403');
  });

  it('🔴 L’OBJET EXACT que l’écran Streaming fabriquait : nom, mais pas d’id', async () => {
    // C'est la fiche de Bertrand, au caractère près : « Agnes Obel » s'affiche,
    // et le clic ne menait nulle part parce que `destinationArtiste` retombait
    // sur `recherche`. La cause est réparée dans `StreamingV2` ; ce cas-ci
    // prouve que même un objet ainsi amputé retrouve sa cible.
    const el = poser({
      album: { ...ALBUM_STREAMING, artist_id: undefined },
      service: 'qobuz', onClose: () => {},
    });
    await attendre();
    flushSync();
    const bouton = el.querySelector<HTMLButtonElement>('button.artist.lien');
    expect(bouton, 'le nom reste du texte mort — c’est le défaut du 20/09').not.toBeNull();
    bouton!.click();
    flushSync();
    expect(ouvrirArtiste.mock.calls[0][0].id).toBe('610403');
  });

  it('🔴 mais PAS sur une compilation : pistes en désaccord, aucun lien', async () => {
    // Un album n'a qu'un artiste d'album. `tracks[0]` serait faux ici, et le
    // lien mènerait chez quelqu'un d'autre : pas de lien vaut mieux.
    pistesServies = PISTES_MELANGEES;
    const el = poser({
      album: { ...ALBUM_STREAMING, artist_id: undefined, artist_name: '' },
      service: 'qobuz', onClose: () => {},
    });
    await attendre();
    flushSync();
    expect(el.querySelector('button.artist.lien')).toBeNull();
  });

  it('l’artiste de l’album PRIME toujours sur les pistes', async () => {
    pistesServies = PISTES_MELANGEES;
    const el = poser({ album: ALBUM_STREAMING, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    el.querySelector<HTMLButtonElement>('button.artist.lien')!.click();
    flushSync();
    expect(ouvrirArtiste.mock.calls[0][0].id).toBe('610403');
  });
});

describe('les trois fabriques portent l’artiste', () => {
  it('l’écran Streaming ne jette plus `artist_id`', () => {
    const s = sansCommentaires(lire('src/components/v2/StreamingV2.svelte'));
    expect(s).toContain('artist_id: p?.artist_id ?? null,');
  });

  it('la coquille porte le NOM et l’identifiant jusqu’à la fiche', () => {
    const s = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
    expect(s).toContain('artist_name: $ficheAlbumService.artiste ?? null,');
    expect(s).toContain('artist_id: $ficheAlbumService.artisteId ?? null,');
    expect(s).toContain('artiste: c.artiste ?? null,');
    expect(s).toContain('artisteId: c.artisteId ?? null,');
    // Et le magasin a bien la place pour les recevoir.
    const store = lire('src/lib/stores/streaming.ts');
    expect(store).toContain('artiste?: string | null;');
    expect(store).toContain('artisteId?: string | null;');
  });

  it('la barre d’actions et « Lecture en cours » les fournissent', () => {
    const barre = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));
    // Fil forum 1906 — la charge utile n'est plus RECOPIÉE dans la barre (ni
    // dans `MenuPisteV1`) : les deux appellent `routageAlbum.albumDeServiceDe`,
    // qui la porte. `allerALAlbumServiceFil1906.test.ts` monte les deux menus
    // et lit la charge réellement émise.
    expect(barre).toContain('albumDeServiceDe(piste');
    const regle = sansCommentaires(lire('src/lib/routageAlbum.ts'));
    expect(regle).toContain('artiste: piste.artist_name ?? null,');
    const np = sansCommentaires(lire('src/components/partages/NowPlaying.svelte'));
    expect(np).toContain('artiste: displayTrack?.artist_name ?? null,');
  });
});
