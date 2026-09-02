/**
 * Écrans éditoriaux Qobuz et Tidal, composables.
 *
 * Bertrand, 02/09/2026 : « je voudrais que les écrans éditorial Qobuz et Tidal
 * soient paramétrables avec des widgets Qobuz et Tidal ».
 *
 * Ce que ces gardes tiennent, mesuré sur son serveur le même jour :
 *
 * ```text
 *                        Qobuz                    Tidal
 * featured/sections      7 sections × 50 albums   VIDE
 * featured (playlists)   500                      VIDE
 * new-releases           200                      50
 * genres                 13                       20
 * ```
 *
 * D'où un catalogue CONSTRUIT à l'ouverture : déclarer les sept sections de
 * Qobuz pour Tidal aurait donné sept bandes vides, et les genres ne sont
 * connaissables qu'après un appel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '../api';
import { catalogueService, dispositionDefautService, cleService } from '../widgetsService';

afterEach(() => vi.restoreAllMocks());

/** Le serveur tel qu'il répond, service par service. */
function serveur(opts: { sections?: any[]; genres?: any[] }) {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue((opts.sections ?? []) as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue((opts.genres ?? []) as any);
}

const SECTIONS_QOBUZ = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'qobuzissims', name: 'Qobuzissimes' },
];

describe('Catalogue d’un service', () => {
  it('Qobuz porte ses sections éditoriales, nommées PAR le service', async () => {
    serveur({ sections: SECTIONS_QOBUZ, genres: [{ id: '112', name: 'Pop/Rock' }] });
    const c = await catalogueService('qobuz');
    const ids = c.map((w) => w.id);
    expect(ids).toContain('qobuz-sec-new-releases');
    expect(ids).toContain('qobuz-sec-qobuzissims');
    // Le libellé vient de la charge utile : aucune clé de traduction ne peut
    // nommer une section qu'on ne connaît qu'à l'exécution.
    expect(c.find((w) => w.id === 'qobuz-sec-qobuzissims')?.cleTitre).toBe('Qobuzissimes');
  });

  /**
   * 🔴 Le cœur de l'affaire. Tidal ne rend AUCUNE section — un catalogue
   * déclaré en dur lui aurait donné sept bandes vides.
   */
  it('Tidal, sans aucune section, tient tout de même debout par ses genres', async () => {
    serveur({ sections: [], genres: [{ id: 'Pop', name: 'Pop' }, { id: 'Rock', name: 'Rock' }] });
    const c = await catalogueService('tidal');
    const ids = c.map((w) => w.id);
    expect(ids.filter((i) => i.includes('-sec-'))).toEqual([]);
    expect(ids).toContain('tidal-genre-Pop');
    expect(ids).toContain('tidal-nouveautes');
    expect(c.length).toBeGreaterThan(4);
  });

  it('les identifiants de widgets sont uniques', async () => {
    serveur({ sections: SECTIONS_QOBUZ, genres: [{ id: '112', name: 'Pop/Rock' }] });
    const ids = (await catalogueService('qobuz')).map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('une route morte ne fait pas tomber tout le catalogue', async () => {
    vi.spyOn(api, 'getStreamingFeaturedSections').mockRejectedValue(new Error('500'));
    vi.spyOn(api, 'getStreamingGenres').mockRejectedValue(new Error('500'));
    const c = await catalogueService('qobuz');
    // Il reste les nouveautés et les deux bandes de playlists.
    expect(c.length).toBe(3);
  });

  it('chaque service range sa disposition SOUS SA PROPRE clé', () => {
    expect(cleService('qobuz')).not.toBe(cleService('tidal'));
    // Et ni l'une ni l'autre n'est celle de l'accueil, sinon composer Qobuz
    // déferait la page d'accueil.
    expect([cleService('qobuz'), cleService('tidal')]).not.toContain('home_widgets');
  });

  it('la disposition par défaut ne cite aucun identifiant en dur', async () => {
    serveur({ sections: [], genres: [{ id: 'Pop', name: 'Pop' }] });
    const c = await catalogueService('tidal');
    const d = dispositionDefautService(c);
    expect(d.length).toBeGreaterThan(0);
    // Chaque identifiant proposé existe VRAIMENT dans ce catalogue-là : une
    // valeur en dur comme `qobuz-sec-new-releases` serait vide sur Tidal.
    for (const id of d) expect(c.some((w) => w.id === id), `« ${id} » absent`).toBe(true);
  });
});

describe('Ce que joue une vignette de service', () => {
  /** Joue le premier élément d'un widget et rend le corps envoyé au serveur. */
  async function corpsDuPremier(idWidget: string, brancher: () => void) {
    serveur({ sections: SECTIONS_QOBUZ, genres: [] });
    brancher();
    const w = (await catalogueService('qobuz')).find((x) => x.id === idWidget)!;
    const els = await w.charger({ profileId: 1, albums: [], zones: [] });
    const vus: any[] = [];
    vi.spyOn(api, 'play').mockImplementation((_z: number, b: any) => {
      vus.push(b);
      return Promise.resolve({} as any);
    });
    els[0].jouer?.(1);
    return { el: els[0], corps: vus[0] };
  }

  /**
   * 🔴 `source` va TOUJOURS avec `streaming_album_id`. Le serveur n'apparie que
   * la paire ; un identifiant seul le fait retomber sur « reprendre la lecture
   * en cours » — le défaut vécu sur les playlists Qobuz le 02/09/2026.
   */
  it('un album éditorial part avec SON SERVICE', async () => {
    const { corps } = await corpsDuPremier('qobuz-sec-qobuzissims', () => {
      vi.spyOn(api, 'getStreamingFeatured').mockResolvedValue([
        { source_id: 'kxend2k5wdg06', title: 'Before The World Blows', artist_name: 'Erykah Badu' },
      ] as any);
    });
    expect(corps).toEqual({ streaming_album_id: 'kxend2k5wdg06', source: 'qobuz' });
  });

  it('une playlist éditoriale aussi, sous son propre nom de champ', async () => {
    const { corps } = await corpsDuPremier('qobuz-playlists-editoriales', () => {
      vi.spyOn(api, 'getStreamingFeaturedPlaylists').mockResolvedValue([
        { source_id: '69230603', name: 'María Dueñas', owner: 'Qobuz France' },
      ] as any);
    });
    expect(corps).toEqual({ streaming_playlist_id: '69230603', source: 'qobuz' });
  });

  it('un album éditorial s’OUVRE, et sa fiche sait qu’elle est distante', async () => {
    const { el } = await corpsDuPremier('qobuz-sec-qobuzissims', () => {
      vi.spyOn(api, 'getStreamingFeatured').mockResolvedValue([
        { source_id: 'abc', title: 'X', artist_name: 'Y' },
      ] as any);
    });
    expect(el.ouvrir).toBe('album');
    // `id` NUL : c'est ce drapeau qui fait chercher les pistes chez le service
    // plutôt que dans la bibliothèque.
    expect(el.fiche?.id).toBeNull();
    expect(el.fiche?.source_id).toBe('abc');
  });

  it('l’index fait partie de la clé — deux albums de même identifiant ne se percutent pas', async () => {
    serveur({ sections: SECTIONS_QOBUZ, genres: [] });
    vi.spyOn(api, 'getStreamingFeatured').mockResolvedValue([
      { source_id: 'meme', title: 'A' },
      { source_id: 'meme', title: 'B' },
    ] as any);
    const w = (await catalogueService('qobuz')).find((x) => x.id === 'qobuz-sec-qobuzissims')!;
    const els = await w.charger({ profileId: 1, albums: [], zones: [] });
    expect(els[0].id).not.toBe(els[1].id);
  });
});
