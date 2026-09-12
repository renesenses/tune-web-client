// Les playlists Qobuz reviennent dans l'écran éditorial — Bertrand, 12/09/2026 :
// « ajouter les playlists Qobuz (qui étaient dans l'actuelle) en widget pour
// qobuz editorial ».
//
// CE QUE LA MESURE A MONTRÉ, ET QUI CHANGE LE CHANTIER
// ----------------------------------------------------
// Les widgets EXISTAIENT déjà. `catalogueService('qobuz')` en construit ~36,
// dont les treize catégories de playlists éditoriales — relevé sur la .18 le
// 12/09/2026, par `GET /streaming/qobuz/featured-playlists/by-tag` :
//
//   Hi-Res 50 · Nouveautés 50 · Thématiques 50 · Humeurs 50 · Artistes 50
//   Dans le casque de… 50 · Histoires de labels 50 · Les Pépites de l'équipe 37
//   Événements & Médias 50 · Partenaires Hi-Fi 50 · Testez vos enceintes 25
//   Discothèque Idéale 16 · Top playlists 50
//
// Ce sont exactement les onglets de l'application Qobuz, et exactement ce que
// FabienM réclame dans #3827 (fil 1749, point 7).
//
// 🔴 LE DÉFAUT ÉTAIT LA DISPOSITION PAR DÉFAUT. `catalogue.slice(0, 4)` ne
// retenait que les quatre premières bandes — toutes des ALBUMS. Les treize
// rangées de playlists étaient bâties, chargées, prêtes, et jamais affichées :
// il fallait aller les ajouter une par une en mode édition, geste dont #880
// établit qu'il n'est pas découvrable.
//
// L'interface ACTUELLE les montre sans rien demander (`StreamingView.svelte`
// appelle `loadFeaturedPlaylistGroups` dès qu'on choisit le service) : la
// nouvelle perdait une fonction que l'ancienne avait.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue `slice(0, 4)` sur le MÊME
// catalogue et exige qu'il ne retienne aucune playlist. Sans elle, une règle
// qui retiendrait tout passerait pour corrigée.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());
import { dispositionDefautService } from '../widgetsService';
import type { Widget } from '../accueilWidgets';

const bande = (id: string, categorie?: Widget['categorie']): Widget => ({
  id, cleTitre: id, forme: 'bande', charger: async () => [], ...(categorie ? { categorie } : {}),
});

/** Le catalogue Qobuz, dans son ordre réel et avec ses comptes réels. */
const TAGS = ['hi-res', 'new', 'focus', 'mood', 'artist', 'danslecasque', 'label',
  'qobuzdigs', 'event', 'auditoriums', 'speakers', 'ideal-discography', 'popular'];
const QOBUZ: Widget[] = [
  bande('qobuz-nouveautes'),
  ...['new-releases', 'best-sellers', 'press-awards', 'editor-picks', 'most-streamed',
      'ideal-discography', 'qobuzissims'].map((s) => bande(`qobuz-sec-${s}`)),
  bande('qobuz-playlists-editoriales'),
  ...TAGS.map((t) => bande(`qobuz-tag-${t}`, 'playlists-editoriales')),
  bande('qobuz-mes-playlists'),
  ...Array.from({ length: 13 }, (_, i) => bande(`qobuz-genre-${i}`)),
];

describe('l’écran éditorial Qobuz montre les playlists sans qu’on les demande', () => {
  it('🔴 les treize catégories sont dans la disposition par défaut', () => {
    const d = dispositionDefautService(QOBUZ);
    for (const t of TAGS) {
      expect(d, `la catégorie ${t} n’apparaît pas`).toContain(`qobuz-tag-${t}`);
    }
  });

  it('les quatre bandes d’albums restent en TÊTE', () => {
    const d = dispositionDefautService(QOBUZ);
    expect(d.slice(0, 4)).toEqual([
      'qobuz-nouveautes', 'qobuz-sec-new-releases',
      'qobuz-sec-best-sellers', 'qobuz-sec-press-awards',
    ]);
    // 4 bandes d'albums + 13 catégories.
    expect(d).toHaveLength(17);
  });

  it('les catégories gardent l’ordre du service, pas un ordre inventé', () => {
    const d = dispositionDefautService(QOBUZ).filter((id) => id.startsWith('qobuz-tag-'));
    expect(d).toEqual(TAGS.map((t) => `qobuz-tag-${t}`));
  });

  it('aucun doublon, même si une catégorie tombait dans les quatre premiers', () => {
    const petit: Widget[] = [
      bande('x-tag-a', 'playlists-editoriales'),
      bande('x-tag-b', 'playlists-editoriales'),
      bande('x-nouveautes'),
    ];
    const d = dispositionDefautService(petit);
    expect(new Set(d).size, 'un identifiant est rendu deux fois').toBe(d.length);
    expect(d).toEqual(['x-tag-a', 'x-tag-b', 'x-nouveautes']);
  });

  it('🔴 Tidal, qui n’a ni section ni catégorie, garde ses quatre bandes', () => {
    // Mesuré le 02/09/2026 : `featured/sections` et `featured` sont VIDES chez
    // Tidal. Son catalogue est fait de nouveautés, de ses playlists et de ses
    // vingt genres — la règle ne doit pas le vider ni le gonfler.
    const tidal: Widget[] = [
      bande('tidal-nouveautes'), bande('tidal-playlists-editoriales'),
      bande('tidal-mes-playlists'),
      ...Array.from({ length: 20 }, (_, i) => bande(`tidal-genre-${i}`)),
    ];
    expect(dispositionDefautService(tidal)).toEqual([
      'tidal-nouveautes', 'tidal-playlists-editoriales',
      'tidal-mes-playlists', 'tidal-genre-0',
    ]);
  });

  it('CONTRE-ÉPREUVE : l’ancienne règle ne retenait AUCUNE playlist', () => {
    const ancienne = QOBUZ.slice(0, 4).map((w) => w.id);
    expect(
      ancienne.some((id) => id.startsWith('qobuz-tag-')),
      'le témoin ne reproduit pas le défaut : il montrait déjà des playlists',
    ).toBe(false);
    expect(ancienne).toHaveLength(4);
    // Et la nouvelle, sur le même catalogue, en retient bien treize.
    expect(
      dispositionDefautService(QOBUZ).filter((id) => id.startsWith('qobuz-tag-')),
    ).toHaveLength(13);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 🔴 CE QUI PRÉCÈDE NE GARDAIT PAS LE BRANCHEMENT.
//
// Les épreuves ci-dessus bâtissent leur propre catalogue, marqueur compris.
// Mesuré : en retirant `categorie: 'playlists-editoriales'` de
// `widgetsService.ts`, elles restent VERTES — elles se nourrissent de ce
// qu'elles fournissent. C'est le défaut de la PR #832, où six tests
// vérifiaient une chaîne qu'ils avaient eux-mêmes posée.
//
// Ce bloc-ci appelle le VRAI `catalogueService`, sur les vraies formes que la
// .18 rend, et exige que les rangées de catégories portent le marqueur.
// ─────────────────────────────────────────────────────────────────────────
describe('le catalogue RÉEL marque bien ses catégories de playlists', () => {
  it('🔴 `catalogueService` pose le marqueur sur chaque rangée de tag', async () => {
    const { catalogueService } = await import('../widgetsService');
    const api = await import('../api');
    // Les formes exactes servies par la .18 le 12/09/2026.
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue(
      [{ id: 'new-releases', name: 'New Releases' }] as never,
    );
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue(
      [{ id: 'rock', name: 'Rock' }] as never,
    );
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([
      { id: 'hi-res', name: 'Hi-Res', playlists: [{ id: '1', name: 'p' }] },
      { id: 'mood', name: 'Humeurs', playlists: [{ id: '2', name: 'q' }] },
    ] as never);

    const cat = await catalogueService('qobuz');
    const tags = cat.filter((w) => w.id.startsWith('qobuz-tag-'));
    expect(tags.map((w) => w.id), 'les rangées de catégories ont disparu du catalogue')
      .toEqual(['qobuz-tag-hi-res', 'qobuz-tag-mood']);
    for (const w of tags) {
      expect(
        w.categorie,
        `${w.id} ne porte pas le marqueur : la disposition par défaut l’ignorera`,
      ).toBe('playlists-editoriales');
    }
    // Et la disposition par défaut les retient bien, sur ce catalogue-là.
    expect(dispositionDefautService(cat)).toContain('qobuz-tag-hi-res');
    expect(dispositionDefautService(cat)).toContain('qobuz-tag-mood');
  });

  it('une catégorie VIDE ne fabrique pas de rangée', async () => {
    const { catalogueService } = await import('../widgetsService');
    const api = await import('../api');
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([
      { id: 'vide', name: 'Vide', playlists: [] },
      { id: 'plein', name: 'Plein', playlists: [{ id: '1', name: 'p' }] },
    ] as never);
    const cat = await catalogueService('qobuz');
    expect(cat.filter((w) => w.id.startsWith('qobuz-tag-')).map((w) => w.id))
      .toEqual(['qobuz-tag-plein']);
  });
});
