// @vitest-environment jsdom
//
// LE PANNEAU « GENRES » DE LA PREMIÈRE LIGNE SE RANGE PAR VOLUME D'ÉCOUTE
// — Bertrand, 27/09/2026, pour la v0.9.168.
//
// ## Le défaut corrigé
//
// `PanneauGenres` triait sur le `count` de `GET /library/genres`, c'est-à-dire
// sur le nombre d'albums EN BIBLIOTHÈQUE. Pop-Rock arrivait donc en tête chez
// Bertrand parce que c'est ce qu'il POSSÈDE le plus — pas ce qu'il ÉCOUTE. La
// route sert `plays` depuis la 0.9.168 ; le panneau s'y range et ne montre QUE
// les genres réellement écoutés.
//
// ## 🔴 CE QUE CES TÉMOINS MESURENT : LE DOM MONTÉ
//
// Ils montent le VRAI composant, laissent son `$effect` appeler la route
// (`fetch` bouchonné), et lisent les LIBELLÉS DES BOUTONS dans l'ordre où le
// DOM les porte. Un témoin qui n'appellerait que `classerGenresDuPanneau`
// laisserait passer un composant qui ne s'en sert pas — le défaut « écrit mais
// pas branché ». Les trois cas de la décision y sont joués :
//
//  1. AUCUNE ÉCOUTE → repli sur l'ordre de la bibliothèque, panneau NON VIDE.
//  2. QUELQUES ÉCOUTES → seuls les écoutés, du plus au moins écouté ; les
//     genres possédés mais jamais joués DISPARAISSENT.
//  3. UN GENRE TRÈS ÉCOUTÉ → il est en TÊTE, même s'il est le moins possédé.
//
// Les jeux de données sont choisis pour que l'ordre par `count` et l'ordre par
// `plays` se CONTREDISENT : sans cela, un panneau resté sur l'ancien tri
// passerait au vert.
//
// ⚠️ Aucun délai calibré : attentes BORNÉES sur condition. Aucune vue
// navigateur n'était possible sur le poste (Chrome géré par la DSI).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PanneauGenres from '../../components/v2/ligne1/PanneauGenres.svelte';
import { classerGenresDuPanneau } from '../premiereLigne';

vi.setConfig({ testTimeout: 30_000 });

/** Ce que sert `GET /library/genres`. `plays` absent = serveur d'avant .168. */
type Servi = { name: string; count: number; plays?: number };

const reponse = (corps: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  }) as unknown as Response;

const respirer = () => new Promise((r) => setTimeout(r, 0));

/** Attendre une CONDITION, bornée — jamais une constante calibrée à la main. */
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let urls: string[] = [];

/** Monte le panneau et rend les libellés des pastilles, DANS L'ORDRE DU DOM. */
async function pastilles(servis: Servi[]): Promise<string[]> {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      urls.push(u);
      if (/\/library\/genres/.test(u)) return reponse(servis);
      return reponse([]);
    }),
  );
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PanneauGenres, { target: hote }) as Record<string, unknown>;
  await jusqua(() => !!hote && hote.querySelectorAll('button').length > 0);
  return Array.from(hote!.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver,
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('Le panneau Genres se range par volume d’écoute (v0.9.168)', () => {
  // La bibliothèque de Bertrand, en miniature : Pop-Rock est ce qu'il possède
  // le plus (40 albums) et n'écoute presque pas (3) ; le Jazz tient 4 albums et
  // 120 écoutes. Les deux ordres se contredisent, c'est le but.
  const BIBLIO: Servi[] = [
    { name: 'Pop-Rock', count: 40, plays: 3 },
    { name: 'Classique', count: 25, plays: 0 },
    { name: 'Jazz', count: 4, plays: 120 },
    { name: 'Trip Hop', count: 2, plays: 31 },
    { name: 'Variété', count: 18, plays: 0 },
  ];

  it('CAS 1 — aucune écoute : le panneau REPLIE sur la bibliothèque, il n’est pas vide', async () => {
    // Une installation neuve : la bibliothèque est scannée, rien n'a encore été
    // joué. `plays` vaut 0 partout. Un panneau vide passerait pour cassé.
    const jamaisJoue = BIBLIO.map((g) => ({ ...g, plays: 0 }));
    const vues = await pastilles(jamaisJoue);
    expect(vues, 'un panneau VIDE se lirait comme une panne').not.toHaveLength(0);
    expect(vues).toEqual(['Pop-Rock', 'Classique', 'Variété', 'Jazz', 'Trip Hop']);
    expect(vues[0], 'à défaut d’écoutes, le mieux fourni reprend la tête').toBe('Pop-Rock');
  });

  it('CAS 1 bis — un serveur d’avant la 0.9.168 ne sert pas `plays` : même repli', async () => {
    // Le client 0.9.168 peut parler à un serveur plus ancien. Sans `plays`, il
    // garde EXACTEMENT l'écran qu'il avait, au lieu de se vider.
    const sansChamp = BIBLIO.map(({ name, count }) => ({ name, count }));
    const vues = await pastilles(sansChamp);
    expect(vues).toEqual(['Pop-Rock', 'Classique', 'Variété', 'Jazz', 'Trip Hop']);
  });

  it('CAS 2 — quelques écoutes : SEULS les écoutés, du plus au moins écouté', async () => {
    // Deux genres joués sur cinq.
    const quelques: Servi[] = [
      { name: 'Pop-Rock', count: 40, plays: 0 },
      { name: 'Classique', count: 25, plays: 2 },
      { name: 'Jazz', count: 4, plays: 7 },
      { name: 'Variété', count: 18, plays: 0 },
    ];
    const vues = await pastilles(quelques);
    expect(vues, 'les genres jamais écoutés DISPARAISSENT').toEqual(['Jazz', 'Classique']);
    expect(vues).not.toContain('Pop-Rock');
    expect(vues).not.toContain('Variété');
  });

  it('CAS 3 — beaucoup d’écoutes : le plus écouté est en TÊTE, fût-il le moins possédé', async () => {
    const vues = await pastilles(BIBLIO);
    expect(vues).toEqual(['Jazz', 'Trip Hop', 'Pop-Rock']);
    expect(vues[0], 'le Jazz : 4 albums seulement, 120 écoutes').toBe('Jazz');
    // 🔴 L'assertion qui distingue ce chantier de l'ancien tri : le genre le
    // plus POSSÉDÉ n'est plus en tête, et les jamais-écoutés ont disparu.
    expect(vues[0], 'Pop-Rock en tête = le panneau trie encore sur la taille').not.toBe('Pop-Rock');
    expect(vues).not.toContain('Classique');
    // Contrôle du montage : la route a bien été appelée, et une seule fois —
    // la première ligne se peint au démarrage.
    const appels = urls.filter((u) => /\/library\/genres/.test(u));
    expect(appels, `une seule requête pour ce panneau : ${urls.join(', ')}`).toHaveLength(1);
  });

  it('le DOM monté dit la MÊME chose que la fonction de classement', async () => {
    // Le composant ne doit pas porter une seconde règle de tri : « écrit mais
    // pas branché », mais dans l'autre sens.
    const vues = await pastilles(BIBLIO);
    expect(vues).toEqual(classerGenresDuPanneau(BIBLIO).map((g) => g.name));
  });

  it('à écoutes ÉGALES, l’ordre est stable — la taille tranche, puis le nom', () => {
    // Une colonne qui se réordonne d'un rafraîchissement à l'autre sans qu'aucun
    // chiffre ait bougé se lit comme un défaut.
    const exaequo: Servi[] = [
      { name: 'Blues', count: 3, plays: 5 },
      { name: 'Ambient', count: 9, plays: 5 },
      { name: 'Rock', count: 9, plays: 5 },
    ];
    const noms = classerGenresDuPanneau(exaequo).map((g) => g.name);
    expect(noms).toEqual(['Ambient', 'Rock', 'Blues']);
    expect(classerGenresDuPanneau([...exaequo].reverse()).map((g) => g.name)).toEqual(noms);
  });
});
