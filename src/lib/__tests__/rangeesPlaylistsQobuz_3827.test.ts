// #3827 — « les rangées de playlists Qobuz par catégorie n'existent pas ».
//
// FabienM, fil forum 1749 point 7 (10/09/2026) : « Accueil / Menu Streaming
// Qobuz: Widgets: il manque tous les widgets associés aux playlists Qobuz ».
//
// Sa capture n'est PAS Tune : c'est l'application Qobuz, bandeau « Playlists
// Qobuz — Créées par nos experts », avec ses onglets Hi-Res, Nouveautés,
// Thématiques, Humeurs… C'est ce qu'il ATTEND, et ce sont exactement les tags
// que le serveur sert déjà (`/streaming/{service}/featured-playlists/by-tag`,
// `tune-streaming-http/src/lib.rs:363`).
//
// L'ancienne interface les affiche depuis longtemps ; la nouvelle ne les avait
// jamais demandées — sa bande « Mises en avant » rend UNE liste plate, toutes
// catégories confondues. « Écrit, pas branché », côté consommation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueService } from '../widgetsService';
import * as api from '../api';

const GROUPES = [
  {
    id: 'hires', name: 'Hi-Res',
    playlists: [
      { id: 'p1', name: 'Hi-Res du moment', image_url: 'http://x/1.jpg' },
      { id: 'p2', name: 'Hi-Res jazz', image_url: 'http://x/2.jpg' },
    ],
  },
  { id: 'humeurs', name: 'Humeurs', playlists: [{ id: 'p3', name: 'Détente', image_url: null }] },
  // Une catégorie VIDE : elle ne doit pas donner de bande creuse.
  { id: 'vide', name: 'Partenaires', playlists: [] },
];

function bouchonner(groupes: unknown) {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue(groupes as any);
}

afterEach(() => vi.restoreAllMocks());

describe('#3827 — une rangée par catégorie de playlists', () => {
  it('chaque catégorie NON VIDE devient une bande, nommée par le service', async () => {
    bouchonner(GROUPES);
    const cat = await catalogueService('qobuz');
    const bandes = cat.filter((w) => w.id.startsWith('qobuz-tag-'));
    expect(bandes.map((b) => b.cleTitre)).toEqual(['Hi-Res', 'Humeurs']);
    // 🔴 Aucun nom en dur : « Hi-Res » vient de la charge, pas d'une liste
    // écrite dans le code — les catégories de Qobuz peuvent changer.
    expect(bandes.map((b) => b.id)).toEqual(['qobuz-tag-hires', 'qobuz-tag-humeurs']);
  });

  it('une catégorie vide ne donne PAS de bande creuse', async () => {
    bouchonner(GROUPES);
    const cat = await catalogueService('qobuz');
    expect(cat.some((w) => w.id === 'qobuz-tag-vide')).toBe(false);
  });

  it('les playlists sont DÉJÀ en main : charger ne relance aucune requête', async () => {
    bouchonner(GROUPES);
    const cat = await catalogueService('qobuz');
    const appelsAvant = (api.getStreamingFeaturedPlaylistsByTag as any).mock.calls.length;
    const bande = cat.find((w) => w.id === 'qobuz-tag-hires')!;
    const els = await bande.charger();
    expect(els.length).toBe(2);
    expect(els[0].titre).toBe('Hi-Res du moment');
    // 🔴 `source` va TOUJOURS avec l'identifiant distant : le serveur
    // n'apparie que la paire, et un identifiant seul le fait retomber sur
    // « reprendre la lecture en cours ».
    expect(els[0].source).toBe('qobuz');
    expect((api.getStreamingFeaturedPlaylistsByTag as any).mock.calls.length).toBe(appelsAvant);
  });

  it("un service SANS catégories n'obtient aucune bande — Tidal rend un tableau vide", async () => {
    bouchonner([]);
    const cat = await catalogueService('tidal');
    expect(cat.some((w) => w.id.startsWith('tidal-tag-'))).toBe(false);
    // Et le reste du catalogue tient toujours : nouveautés, mises en avant, les vôtres.
    expect(cat.length).toBeGreaterThan(0);
  });

  it('une route morte ne vide pas le catalogue', async () => {
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockRejectedValue(new Error('500'));
    const cat = await catalogueService('qobuz');
    expect(cat.length).toBeGreaterThan(0);
    expect(cat.some((w) => w.id.startsWith('qobuz-tag-'))).toBe(false);
  });
});
