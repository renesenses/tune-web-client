// @vitest-environment jsdom
//
// « Lire à partir d'ici » SUR TOUTES LES LIGNES — Bertrand, 20/09/2026 :
//
// > « Sur toutes les lignes où il y a une piste, ajoute le bouton lire à
// > partir de après celui de Lire. »
//
// #1061 (FabienM, fil 1812, point 9) avait posé le bouton et laissé la
// propriété OPT-IN : « seul l'ÉCRAN sait ce que la suite veut dire ». Six
// écrans sur douze ne la passaient pas — les titres phares d'un artiste,
// l'Historique, les titres voisins de la Recherche, les résultats et les
// favoris d'un service, la file d'attente — et le bouton y manquait.
//
// L'argument ne tenait pas : `pistes` EST l'ordre d'affichage, puisque c'est
// ce que l'écran remet au composant, et `lectureEnMasse.planDeLecture` tranche
// déjà la source d'une liste mixte. Le défaut fait donc ce que les cinq écrans
// qui passaient la prop écrivaient à la main.
//
// 🔴 CE TÉMOIN MONTE, CLIQUE ET REGARDE OÙ PART LA LECTURE. Une garde qui
// chercherait `onLireDepuis=` dans les sources resterait verte si le bouton
// cessait d'être branché — « écrit mais pas branché », la famille de défauts
// que ce client passe son temps à corriger.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';

const espions = vi.hoisted(() => ({
  lire: vi.fn(async (_corps: Record<string, unknown>) => ({})),
  enfiler: vi.fn(async (_corps: Record<string, unknown>) => ({})),
  zones: [] as number[],
}));

vi.mock('../gestesDeZone', () => ({
  gestesDeZone: (zid: number) => {
    espions.zones.push(zid);
    return { lire: espions.lire, enfiler: espions.enfiler };
  },
}));

import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { currentZoneId } from '../stores/zones';

const lireFichier = (p: string) => readFileSync(p, 'utf8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/** Trois pistes LOCALES : `planDeLecture` en fait un seul `track_ids`. */
const PISTES = [
  { id: 11, title: 'Riverside', artist_name: 'Agnes Obel', source: 'local' },
  { id: 12, title: 'Fuel to Fire', artist_name: 'Agnes Obel', source: 'local' },
  { id: 13, title: 'Dorian', artist_name: 'Agnes Obel', source: 'local' },
] as any[];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(props: Record<string, unknown>): HTMLDivElement {
  // `mount` veut les props EXACTES du composant ; ce témoin en pose trois ou
  // quatre selon le cas, et le typage strict ne sert à rien ici.
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2 as any, { target: hote, props: props as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  espions.lire.mockClear();
  espions.enfiler.mockClear();
  espions.zones.length = 0;
  currentZoneId.set(7);
  // `expert` rend le TABLEAU — le rendu que voient la plupart des testeurs.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('le bouton est sur CHAQUE ligne, sans que l’écran ait à le demander', () => {
  it('🔴 une liste posée SANS `onLireDepuis` rend le bouton sur les trois lignes', () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const lignes = el.querySelectorAll('.tbl .trow');
    expect(lignes.length, 'le tableau ne rend aucune ligne — le témoin ne mesure rien').toBe(3);
    expect(el.querySelectorAll('.tbl .trow button[data-depuis]').length).toBe(3);
  });

  it('🔴 et il LANCE la suite : le rang cliqué, puis ce qui suit', async () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const boutons = el.querySelectorAll<HTMLButtonElement>('.tbl .trow button[data-depuis]');
    boutons[1].click();
    flushSync();
    await Promise.resolve();
    expect(espions.zones, 'la zone courante n’a pas été consultée').toContain(7);
    expect(espions.lire).toHaveBeenCalledTimes(1);
    // La SUITE, pas la liste entière : 12 et 13, jamais 11.
    expect(espions.lire.mock.calls[0][0]).toEqual({ track_ids: [12, 13] });
  });

  it('l’écran garde la main quand sa suite n’est pas la liste rendue', async () => {
    const sien = vi.fn();
    const el = poser({ pistes: PISTES, onLire: () => {}, onLireDepuis: sien });
    el.querySelectorAll<HTMLButtonElement>('.tbl .trow button[data-depuis]')[2].click();
    flushSync();
    await Promise.resolve();
    expect(sien).toHaveBeenCalledTimes(1);
    expect(sien.mock.calls[0][1], 'le rang n’est pas transmis').toBe(2);
    // Et le défaut ne part PAS en plus : une double lecture serait pire que
    // pas de bouton du tout.
    expect(espions.lire).not.toHaveBeenCalled();
  });

  it('sans zone, rien ne part — mais le bouton reste rendu', async () => {
    currentZoneId.set(null);
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const boutons = el.querySelectorAll<HTMLButtonElement>('.tbl .trow button[data-depuis]');
    expect(boutons.length, 'la colonne changerait de largeur selon l’état des zones').toBe(3);
    boutons[0].click();
    flushSync();
    await Promise.resolve();
    expect(espions.lire).not.toHaveBeenCalled();
  });

  it('le rendu en LIGNES le porte aussi (mode Avancé)', () => {
    // `intermediate` = « Avancé » : le seul niveau qui rende encore des
    // LIGNES, Expert étant passé au tableau le 09/09/2026.
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const el = poser({ pistes: PISTES, onLire: () => {} });
    expect(el.querySelector('.tbl'), 'ce mode devrait rendre des lignes, pas le tableau').toBeNull();
    expect(el.querySelectorAll('button[data-depuis]').length).toBe(3);
  });
});

describe('la colonne d’actions n’a plus qu’UNE largeur', () => {
  const liste = lireFichier('src/components/v2/ListePistesV2.svelte');

  it('les deux constantes d’avant ont disparu', () => {
    // Elles n'existaient que parce que le bouton était optionnel. Les garder
    // avec la même valeur serait la prochaine divergence.
    expect(liste).not.toContain('LARGEUR_ACTIONS_DEPUIS');
    expect(liste).toContain("export const LARGEUR_ACTIONS = '238px';");
    expect(liste).toContain('export const LARGEUR_ACTIONS_PX = 238;');
  });

  it('la largeur rendue est bien celle des HUIT boutons', () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const tbl = el.querySelector<HTMLElement>('.tbl');
    expect(tbl, 'pas de tableau').not.toBeNull();
    expect(tbl!.style.getPropertyValue('--tcols')).toContain('238px');
  });
});

describe('les écrans qui montaient la barre SANS fournir la suite', () => {
  it('la file d’attente : « à partir d’ici » = le saut de file', () => {
    const s = sansCommentaires(lireFichier('src/components/v2/QueueV2.svelte'));
    expect(s).toContain('<PisteActions piste={t} onLireDepuis={() => jump(idx)} />');
    expect(s).toContain('<PisteActions piste={current} onLireDepuis={() => jump(pos)} />');
    // Contre-épreuve : plus aucune barre nue dans cet écran.
    expect(s).not.toContain('<PisteActions piste={t} />');
    expect(s).not.toContain('<PisteActions piste={current} />');
  });

  it('l’Ambiance acoustique : la suite est le classement affiché', () => {
    const s = sansCommentaires(lireFichier('src/components/v2-heritage/AmbianceView.svelte'));
    expect(s).toContain('onLireDepuis={() => playFrom(i)}');
    expect(s).toContain('lireListeDepuis(tracks, index, gestesDeZone(zid))');
    expect(s).not.toContain('<PisteActions piste={track} />');
  });

  it('les serveurs média : la suite est le reste du dossier', () => {
    // Un item UPnP n'est pas un `Track` : `lireListeDepuis` ne s'y applique
    // pas, et `enchainer` est le geste que l'écran a déjà.
    const s = sansCommentaires(lireFichier('src/components/v2/MediaServersV2.svelte'));
    expect(s).toContain('enchainer(vue.items.slice(i)');
    expect(s).toContain("$t('common.playFromHere'");
  });
});

describe('🔴 les icônes sont les tracés OFFICIELS de lucide', () => {
  // Bertrand, 20/09/2026 : « Tous les boutons utilisés doivent être tirés de :
  // https://github.com/lucide-icons/lucide ». Les huit boutons de la barre
  // étaient des dessins maison qui s'en approchaient. Les tracés ci-dessous
  // sont copiés tels quels depuis `icons/<nom>.svg` du dépôt lucide ; une
  // retouche, même d'un dixième, les fait rougir.
  const LUCIDE: [string, string][] = [
    ['play', 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'],
    ['step-forward', 'M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z'],
    ['list-start', 'M21 19V7a2 2 0 0 0-2-2h-6'],
    ['list-plus', 'M18 9v6'],
    ['list-music', 'M21 16V5'],
    ['tag', 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'],
    ['heart', 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'],
  ];
  const barre = lireFichier('src/components/v2/PisteActions.svelte');

  for (const [nom, d] of LUCIDE) {
    it(`la barre porte le tracé lucide \`${nom}\``, () => {
      expect(barre, `${nom} : le tracé n'est pas celui de lucide`).toContain(d);
    });
  }

  it('et les dessins maison qu’ils remplacent ont disparu', () => {
    for (const ancien of [
      'M6 4l14 8-14 8z',              // l'ancien « lire », plein
      'M4 6.5l5 3-5 3z',              // l'ancien « à partir d'ici »
      'M4 7h9M4 12h9M4 17h6',         // l'ancien « lire ensuite »
      'M18 14.5v6M15 17.5h6',         // l'ancien « à la file »
      'M20.84 4.61',                  // l'ancien cœur
    ]) {
      expect(barre, `${ancien} est encore là`).not.toContain(ancien);
    }
  });

  it('le cœur reste PLEIN quand la piste est en favori', () => {
    // Le tracé vient de lucide ; le remplissage, lui, porte l'état — le
    // reprendre tel quel (toujours `fill="none"`) aurait effacé l'information.
    expect(barre).toContain("fill={favori ? 'currentColor' : 'none'}");
  });
});
