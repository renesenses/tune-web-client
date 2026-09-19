// @vitest-environment jsdom
//
// PHASE 5 — « aucune perte d'accès » (Bertrand, 19/09/2026).
//
// Quinze fonctions de `api.ts` n'étaient appelées que par l'ancienne
// interface (`docs/capacites-sans-chemin-phase5.md`, section Bibliothèque) :
// la retirer, c'était perdre la note d'un album, la ré-identification, le
// signalement, l'édition d'une piste, la gestion des étiquettes, les fiches
// d'artiste enrichies. Chacune a désormais un chemin dans le nouveau client.
//
// 🔴 CES TÉMOINS MONTENT L'ÉCRAN ET CLIQUENT. Ils ne lisent pas le source :
// une garde qui cherche « rateAlbum » dans un fichier resterait verte si le
// bouton disparaissait du balisage (leçon de la PR #832).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

const espions = vi.hoisted(() => ({
  getAlbumRating: vi.fn(),
  rateAlbum: vi.fn(),
  reidentifyAlbum: vi.fn(),
  albumBetterQuality: vi.fn(),
  trackBetterQuality: vi.fn(),
  reportMetadata: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  getTags: vi.fn(),
  getArtistMetadata: vi.fn(),
  getArtistCredits: vi.fn(),
  enrichArtist: vi.fn(),
  uploadArtistImage: vi.fn(),
  updateTrack: vi.fn(),
  createArtist: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  const surcharges: Record<string, unknown> = {};
  for (const [nom, fn] of Object.entries(espions)) {
    surcharges[nom] = (...a: unknown[]) => (fn as any)(...a);
  }
  return { ...reel, ...surcharges };
});

import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import EtiquettesV2 from '../../components/v2/EtiquettesV2.svelte';
import OutilsArtisteV2 from '../../components/v2/OutilsArtisteV2.svelte';
import ArtistesV2 from '../../components/v2/ArtistesV2.svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { dialogs } from '../stores/dialogs';
import { currentZoneId, zones } from '../stores/zones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(C: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  return hote;
}
const respirer = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};
const boutonParTexte = (racine: ParentNode, texte: string) =>
  ([...racine.querySelectorAll('button')] as HTMLButtonElement[])
    .find((b) => (b.textContent ?? '').trim() === texte.trim()) ?? null;

/** Répond au PREMIER dialogue de l'application (prompt/confirm v2). */
async function repondreDialogue(valeur: boolean | string | null) {
  await respirer();
  const d = get(dialogs)[0];
  expect(d, 'aucun dialogue de l’application ouvert').toBeDefined();
  dialogs.settle(d.id, valeur);
  await respirer();
}

beforeEach(() => {
  for (const f of Object.values(espions)) f.mockReset();
  espions.getAlbumRating.mockResolvedValue({ rating: 0, note: '' });
  espions.albumBetterQuality.mockResolvedValue({ better: null });
  espions.trackBetterQuality.mockResolvedValue({ better: null });
  espions.getArtistMetadata.mockResolvedValue({ data: {} });
  espions.getArtistCredits.mockResolvedValue([]);
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  // Tout le reste du réseau : une réponse vide mais valide.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = /\/(zones|albums|tracks|artists|services|tags|playlists)(\?|$)/.test(String(url)) ? [] : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  zones.set([{ id: 1, name: 'Salon', state: 'stopped' }] as any);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const ALBUM = { id: 12, title: 'Kind of Blue', artist_name: 'Miles Davis', cover_path: 'covers/12.jpg' };

describe('fiche album — note, ré-identification, signalement, meilleure version', () => {
  it('lit la note à l’ouverture, et une étoile ÉCRIT la note', async () => {
    espions.rateAlbum.mockResolvedValue({});
    const h = poser(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await respirer();
    expect(espions.getAlbumRating).toHaveBeenCalledWith(12);
    const etoiles = h.querySelectorAll<HTMLButtonElement>('.etoiles button');
    expect(etoiles.length, 'les étoiles ne sont pas rendues').toBe(5);
    etoiles[2].click();
    await respirer();
    expect(espions.rateAlbum).toHaveBeenCalledWith(12, 3, '');
    expect(h.querySelectorAll('.etoile.pleine').length).toBe(3);
  });

  it('une note ENREGISTRÉE est relue et affichée', async () => {
    espions.getAlbumRating.mockResolvedValue({ rating: 4, note: 'le meilleur' });
    const h = poser(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await respirer();
    expect(h.querySelectorAll('.etoile.pleine').length).toBe(4);
    expect(h.querySelector<HTMLInputElement>('.commentaire')?.value).toBe('le meilleur');
  });

  it('« Ré-identifier » appelle la route pour CET album', async () => {
    espions.reidentifyAlbum.mockResolvedValue({ album_id: 12, verdict: 'unchanged', tracks_total: 5 });
    const h = poser(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await respirer();
    const b = boutonParTexte(h, fr['library.reidentify']);
    expect(b, 'le bouton Ré-identifier est absent').not.toBeNull();
    b!.click();
    await respirer();
    expect(espions.reidentifyAlbum).toHaveBeenCalledWith(12);
  });

  it('« Signaler » la pochette envoie la raison choisie', async () => {
    espions.reportMetadata.mockResolvedValue({ reported: true, entity: 'cover', image_cleared: false, pushed: false });
    const h = poser(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await respirer();
    const b = boutonParTexte(h, fr['report.action']);
    expect(b, 'le bouton Signaler est absent').not.toBeNull();
    b!.click();
    flushSync();
    const raison = boutonParTexte(document.body, fr['report.reason.poor_quality']);
    expect(raison, 'le menu des raisons ne s’ouvre pas').not.toBeNull();
    raison!.click();
    await respirer();
    expect(espions.reportMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'cover', entity_id: 12, reason: 'poor_quality' }),
    );
  });

  it('annonce la meilleure version possédée', async () => {
    espions.albumBetterQuality.mockResolvedValue({
      better: { album_id: 99, album_title: 'Kind of Blue (Hi-Res)', format: 'flac', sample_rate: 96000, bit_depth: 24 },
    });
    const h = poser(AlbumDetailV2, { album: ALBUM, onClose: () => {} });
    await respirer();
    expect(espions.albumBetterQuality).toHaveBeenCalledWith(12);
    expect(h.textContent).toContain(fr['library.betterQualityAvailable']);
    expect(h.textContent).toContain('FLAC 96 kHz / 24 bit');
  });

  it('un album de SERVICE n’a aucun de ces gestes (routes de bibliothèque)', async () => {
    const h = poser(AlbumDetailV2, { album: { ...ALBUM, id: null, source_id: 'q1' }, service: 'qobuz', onClose: () => {} });
    await respirer();
    expect(espions.getAlbumRating).not.toHaveBeenCalled();
    expect(boutonParTexte(h, fr['library.reidentify'])).toBeNull();
  });
});

describe('« Autres versions » — la meilleure piste possédée', () => {
  it('interroge la route et l’annonce en tête', async () => {
    espions.trackBetterQuality.mockResolvedValue({
      better: { track_id: 77, album_id: 9, format: 'flac', sample_rate: 192000, bit_depth: 24 },
    });
    poser(VersionsPistePanneau, { trackId: 5, titre: 'So What', onClose: () => {} });
    await respirer();
    expect(espions.trackBetterQuality).toHaveBeenCalledWith(5);
    expect(document.body.textContent).toContain('FLAC 192 kHz / 24 bit');
    expect(boutonParTexte(document.body, fr['library.playBetterQuality'])).not.toBeNull();
  });
});

describe('étiquettes — renommer et supprimer', () => {
  const TAG = { id: 4, name: 'Jazz modal', color: null };
  async function ouvrirTag() {
    espions.getTags.mockResolvedValue([TAG]);
    const h = poser(EtiquettesV2, {});
    await respirer();
    const t = [...h.querySelectorAll<HTMLButtonElement>('button.tag')].find((b) => b.textContent?.includes(TAG.name));
    expect(t, 'l’étiquette n’est pas listée').toBeDefined();
    t!.click();
    await respirer();
    return h;
  }

  it('« Renommer » passe par le dialogue de l’application puis PUT /tags/{id}', async () => {
    espions.updateTag.mockResolvedValue(undefined);
    const h = await ouvrirTag();
    boutonParTexte(h, fr['library.renameTag'])!.click();
    await repondreDialogue('Jazz cool');
    expect(espions.updateTag).toHaveBeenCalledWith(4, 'Jazz cool');
    expect(h.querySelector('h1')?.textContent).toContain('Jazz cool');
  });

  it('« Supprimer » demande confirmation puis DELETE /tags/{id}', async () => {
    espions.deleteTag.mockResolvedValue(undefined);
    const h = await ouvrirTag();
    boutonParTexte(h, fr['library.deleteTag'])!.click();
    await repondreDialogue(true);
    expect(espions.deleteTag).toHaveBeenCalledWith(4);
    // Retour à la liste, sans l'étiquette supprimée.
    expect(h.querySelector('button.tag')).toBeNull();
  });

  it('annuler la confirmation ne supprime RIEN', async () => {
    const h = await ouvrirTag();
    boutonParTexte(h, fr['library.deleteTag'])!.click();
    await repondreDialogue(false);
    expect(espions.deleteTag).not.toHaveBeenCalled();
  });
});

describe('fiche artiste — métadonnées, crédits, enrichissement, image, signalement', () => {
  it('la fiche ouverte dans ArtistesV2 charge métadonnées et crédits', async () => {
    const ARTISTE = { id: 5, name: 'Bill Evans', image_path: null };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      const corps = /\/library\/artists(\?|$)/.test(u) ? [ARTISTE]
        : /\/(zones|albums|tracks|services)(\?|$)/.test(u) || /\/artists\/5\/albums/.test(u) ? [] : {};
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }));
    poser(ArtistesV2, { ouvrirId: 5, onOuvert: () => {} });
    await respirer(12);
    expect(espions.getArtistMetadata, 'la fiche artiste ne monte pas ses outils').toHaveBeenCalledWith(5);
    expect(espions.getArtistCredits).toHaveBeenCalledWith(5);
  });

  it('montre membres, similaires et crédits', async () => {
    espions.getArtistMetadata.mockResolvedValue({
      data: { members: [{ name: 'Scott LaFaro', role: 'contrebasse' }], similar_artists: [{ name: 'Keith Jarrett', reason: '' }] },
    });
    espions.getArtistCredits.mockResolvedValue([
      { id: 1, track_id: 1, artist_id: 5, artist_name: 'Bill Evans', role: 'performer', instrument: 'piano', position: 0 },
    ]);
    const vus: string[] = [];
    const h = poser(OutilsArtisteV2, { artistId: 5, onSimilaire: (n: string) => vus.push(n) });
    await respirer();
    expect(h.textContent).toContain(fr['artist.members']);
    expect(h.textContent).toContain('Scott LaFaro');
    expect(h.textContent).toContain(fr['artist.credits']);
    expect(h.textContent).toContain('piano');
    boutonParTexte(h, 'Keith Jarrett')!.click();
    expect(vus).toEqual(['Keith Jarrett']);
  });

  it('« Enrichir la biographie » appelle la route et remonte la bio', async () => {
    espions.enrichArtist.mockResolvedValue({ data: { bio_fr: 'Pianiste américain.' } });
    const bios: string[] = [];
    const h = poser(OutilsArtisteV2, { artistId: 5, onBio: (b: string) => bios.push(b) });
    await respirer();
    boutonParTexte(h, fr['library.enrichBio'])!.click();
    await respirer();
    expect(espions.enrichArtist).toHaveBeenCalledWith(5);
    expect(bios).toEqual(['Pianiste américain.']);
  });

  it('« Envoyer image » téléverse le fichier choisi', async () => {
    espions.uploadArtistImage.mockResolvedValue({ id: 5, name: 'Bill Evans', image_path: 'artists/5.jpg' });
    const images: (string | null)[] = [];
    const h = poser(OutilsArtisteV2, { artistId: 5, onImage: (p: string | null) => images.push(p) });
    await respirer();
    const champ = h.querySelector<HTMLInputElement>('input[type="file"]');
    expect(champ, 'pas de sélecteur de fichier').not.toBeNull();
    const fichier = new File(['x'], 'bill.jpg', { type: 'image/jpeg' });
    Object.defineProperty(champ!, 'files', { value: [fichier], configurable: true });
    champ!.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer();
    expect(espions.uploadArtistImage).toHaveBeenCalledWith(5, fichier);
    expect(images).toEqual(['artists/5.jpg']);
  });

  it('« Signaler » la biographie envoie l’entité bio', async () => {
    espions.reportMetadata.mockResolvedValue({ reported: true, entity: 'bio', image_cleared: false, pushed: true });
    const h = poser(OutilsArtisteV2, { artistId: 5, aBio: true });
    await respirer();
    boutonParTexte(h, fr['report.action'])!.click();
    flushSync();
    boutonParTexte(document.body, fr['report.reason.incorrect'])!.click();
    await respirer();
    expect(espions.reportMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'bio', entity_id: 5, reason: 'incorrect' }),
    );
  });
});

describe('menu « … » d’une piste — « Modifier la piste »', () => {
  async function ouvrirEdition(piste: Record<string, unknown>) {
    const h = poser(PisteActions, { piste });
    const plus = h.querySelector<HTMLButtonElement>('button.plus, button[aria-haspopup]')
      ?? ([...h.querySelectorAll('button')].pop() as HTMLButtonElement);
    plus.click();
    flushSync();
    const entree = boutonParTexte(document.body, fr['metadata.editTrack']);
    expect(entree, 'l’entrée « Modifier » manque au menu').not.toBeNull();
    entree!.click();
    // La modale est chargée à la demande (`import()`) : on attend qu'elle arrive.
    for (let i = 0; i < 100 && !document.body.querySelector('.btn-save'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      flushSync();
    }
    const modale = document.body.querySelector('.btn-save');
    expect(modale, 'la modale d’édition ne s’ouvre pas').not.toBeNull();
    return document.body;
  }

  it('enregistre la piste modifiée (PUT /library/tracks/{id})', async () => {
    espions.updateTrack.mockResolvedValue({ status: 'ok', track_id: 42 });
    const racine = await ouvrirEdition({ id: 42, title: 'Ancien', artist_id: 3, artist_name: 'Miles Davis', album_id: 7, source: 'local' });
    const titre = racine.querySelector<HTMLInputElement>('.fields input[type="text"]')!;
    titre.value = 'Nouveau';
    titre.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (racine.querySelector('.btn-save') as HTMLButtonElement).click();
    await respirer(10);
    expect(espions.updateTrack).toHaveBeenCalledWith(42, expect.objectContaining({ title: 'Nouveau' }));
  });

  it('crée l’artiste saisi quand il n’existe pas (POST /library/artists)', async () => {
    espions.createArtist.mockResolvedValue({ id: 88, name: 'Inconnu' });
    espions.updateTrack.mockResolvedValue({ status: 'ok', track_id: 43 });
    const racine = await ouvrirEdition({ id: 43, title: 'Sans artiste', artist_id: null, artist_name: 'Inconnu', album_id: 7, source: 'local' });
    (racine.querySelector('.btn-save') as HTMLButtonElement).click();
    await respirer(10);
    expect(espions.createArtist).toHaveBeenCalledWith('Inconnu');
    expect(espions.updateTrack).toHaveBeenCalledWith(43, expect.objectContaining({ artist_id: 88 }));
  });
});
