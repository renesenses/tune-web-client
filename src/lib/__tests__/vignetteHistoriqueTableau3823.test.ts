// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3823 — « Menu historique : régression par rapport
// à la v0.9.44 : manque vignette du titre en début de ligne » (FabienM, fil
// forum 1749, v0.9.145), et le même manque relevé le MÊME JOUR, dans un autre
// fil et sans lien, par Pierre M : « [capture Historique] On peut avoir le
// "cover" ? » (fil 1671, réponse 6166).
//
// L'écran de l'ANCIEN client porte cette vignette depuis toujours et à tous les
// niveaux — `HistoryView.svelte:142`, un `AlbumArt` de 44 px. Le portage vers la
// liste partagée l'a perdue aux niveaux Essentiel et Expert, les deux qui
// rendent le TABLEAU (`MODES_BRANCHES`) ; seul le rendu en lignes (Avancé) l'a
// gardée. Le niveau par défaut est `expert` : la plupart des testeurs voient
// donc le tableau, et c'est ce que montrent les deux captures.
//
// 🔴 CE TÉMOIN MONTE ET REGARDE, IL NE LIT PAS DE SOURCE. Une garde qui
// chercherait `pochetteEnTableau` dans `HistoriqueV2.svelte` resterait verte si
// `ListePistesV2` cessait d'en faire quoi que ce soit — et c'est exactement la
// famille de défauts (« écrit mais pas branché ») que ce client passe son temps
// à corriger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { modeEnTableau } from '../colonnesPistes';

/** Une écoute telle que `/library/history` la rend (cf. `entreesDepuisServeur`). */
const ECOUTE = {
  track_id: 11,
  title: 'The Great Gig in the Sky',
  artist_name: 'Pink Floyd',
  album_title: 'The Dark Side of the Moon',
  album_id: 3,
  cover_url: '/covers/dsotm.jpg',
  duration_ms: 287000,
  source: 'local',
  listened_at: new Date().toISOString(),
  zone_id: 1,
};

const PISTE = {
  id: 11,
  title: 'The Great Gig in the Sky',
  artist_name: 'Pink Floyd',
  album_id: 3,
  cover_path: '/covers/dsotm.jpg',
  source: 'local',
} as any;

function reponsePour(url: string) {
  const corps = url.includes('/library/history') ? { items: [ECOUTE], total: 1 } : [];
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown> = {}): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  return hote;
}

const attendre = (ms = 80) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // Le niveau décide du rendu. On force `expert` — le défaut du client, et
  // celui de la capture de Pierre M (dix colonnes, dont COMPOSITEUR et BPM).
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#3823 — la vignette revient en tête de ligne, au mode TABLEAU', () => {
  it('le niveau mesuré rend bien le tableau — sinon le témoin ne mesure rien', () => {
    // La contre-épreuve de la contre-épreuve : si `expert` cessait de rendre le
    // tableau, tout ce fichier deviendrait vert contre le rendu en LIGNES, qui
    // a toujours eu sa pochette.
    expect(modeEnTableau('expert')).toBe(true);
  });

  it('🔴 l’Historique montre la vignette dans la cellule du titre', async () => {
    const el = poser(HistoriqueV2);
    await attendre();
    flushSync();
    const titre = el.querySelector('.tbl .trow .titre');
    expect(titre, 'l’Historique ne rend aucune ligne — le témoin ne mesure rien').not.toBeNull();
    expect(
      titre!.querySelector('.album-art'),
      'aucune vignette en début de ligne dans l’Historique — c’est la régression #3823',
    ).not.toBeNull();
  });

  it('la vignette est DANS la cellule du titre, pas dans une colonne de plus', async () => {
    // La règle du composant, écrite trois fois dans `ListePistesV2` : l'en-tête
    // et les lignes sont deux grilles séparées qui partagent un seul
    // `grid-template-columns`. Une colonne présente dans les lignes seules fait
    // dériver TOUS les en-têtes vers la droite — le défaut d'alignement relevé
    // par Bertrand le 07/09/2026, capture à l'appui.
    const el = poser(HistoriqueV2);
    await attendre();
    flushSync();
    const enTete = el.querySelectorAll('.tbl .thead .th').length;
    // ⚠️ PAS `:first-of-type` : `.thead` est un `div` lui aussi, et le premier
    // `div` du tableau est l'en-tête — le sélecteur ne rendait donc rien, et
    // l'assertion aurait été verte contre zéro cellule.
    const premiere = el.querySelector('.tbl .trow');
    expect(premiere, 'le tableau ne rend aucune ligne').not.toBeNull();
    const cellules = premiere!.children.length;
    expect(cellules, 'les lignes portent plus de cellules que l’en-tête n’a de colonnes')
      .toBe(enTete);
  });

  it('la vignette reste OPT-IN : le tableau partagé n’en porte pas par défaut', () => {
    // La Bibliothèque (onglet Titres), les playlists et la Recherche emploient
    // le MÊME tableau. Leur en ajouter une serait un choix de design, pas la
    // réparation d'une régression : cette assertion tient la frontière.
    const el = poser(ListePistesV2, { pistes: [PISTE], onLire: () => {} });
    flushSync();
    const titre = el.querySelector('.tbl .trow .titre');
    expect(titre, 'le tableau ne rend pas de ligne').not.toBeNull();
    expect(
      titre!.querySelector('.album-art'),
      'le tableau partagé porte une vignette sans qu’on la lui ait demandée',
    ).toBeNull();
  });

  it('… et elle apparaît dès qu’on la demande', () => {
    const el = poser(ListePistesV2, {
      pistes: [PISTE], onLire: () => {}, pochetteEnTableau: true,
    });
    flushSync();
    expect(el.querySelector('.tbl .trow .titre .album-art')).not.toBeNull();
  });
});
