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
import { get } from 'svelte/store';
import { t } from '../i18n';

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

// 🔄 Fil forum 3009 (FabienM, points 2 et 3 ; go de Bertrand du 23/11/2026) —
// « Lire à partir d'ici » quitte la barre de la ligne (le clic sur le titre
// fait déjà ce geste) et devient une ENTRÉE du menu « … », juste sous « Lire ».
// Les témoins ci-dessous montent, OUVRENT le menu de la ligne, cliquent
// l'entrée et regardent où part la lecture : rien ne change de ce que le
// geste fait, seulement d'où on le lance.
const LIBELLE_DEPUIS = () => (get(t) as (k: string) => string)('common.playFromHere');
function menuDe(el: HTMLElement, rang: number): HTMLButtonElement[] {
  const plus = el.querySelectorAll<HTMLButtonElement>('.tbl .trow button[aria-haspopup="menu"]')[rang];
  expect(plus, `la ligne ${rang} n'a pas de menu « … »`).toBeDefined();
  plus.click();
  flushSync();
  return [...document.querySelectorAll<HTMLButtonElement>('.menu button.item')];
}
const entreeDepuis = (el: HTMLElement, rang: number) =>
  menuDe(el, rang).find((b) => b.textContent?.trim() === LIBELLE_DEPUIS());

describe('le geste est sur CHAQUE ligne, sans que l’écran ait à le demander', () => {
  it('🔴 fil 3009 — plus de bouton dans la barre : l’entrée est au menu « … » des trois lignes', () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const lignes = el.querySelectorAll('.tbl .trow');
    expect(lignes.length, 'le tableau ne rend aucune ligne — le témoin ne mesure rien').toBe(3);
    expect(el.querySelectorAll('.tbl .trow button[data-depuis]').length).toBe(0);
    for (const rang of [0, 1, 2]) {
      const items = menuDe(el, rang);
      const i = items.findIndex((b) => b.textContent?.trim() === LIBELLE_DEPUIS());
      expect(i, `ligne ${rang} : « Lire à partir d’ici » absent du menu`).toBeGreaterThan(-1);
      // Juste sous « Lire » : les deux gestes de lecture se suivent.
      expect(i).toBe(1);
    }
  });

  it('🔴 et il LANCE la suite : le rang choisi, puis ce qui suit', async () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    entreeDepuis(el, 1)!.click();
    flushSync();
    await Promise.resolve();
    expect(espions.zones, 'la zone courante n’a pas été consultée').toContain(7);
    expect(espions.lire).toHaveBeenCalledTimes(1);
    // #5770 — la liste ENTIÈRE, la lecture au rang cliqué : 11 reste dans la
    // file, derrière, pour que « Précédent » y revienne.
    expect(espions.lire.mock.calls[0][0]).toEqual({ track_ids: [11, 12, 13], start_index: 1 });
  });

  it('l’écran garde la main quand sa suite n’est pas la liste rendue', async () => {
    const sien = vi.fn();
    const el = poser({ pistes: PISTES, onLire: () => {}, onLireDepuis: sien });
    entreeDepuis(el, 2)!.click();
    flushSync();
    await Promise.resolve();
    expect(sien).toHaveBeenCalledTimes(1);
    expect(sien.mock.calls[0][1], 'le rang n’est pas transmis').toBe(2);
    // Et le défaut ne part PAS en plus : une double lecture serait pire que
    // pas de geste du tout.
    expect(espions.lire).not.toHaveBeenCalled();
  });

  it('sans zone, rien ne part — mais l’entrée reste proposée', async () => {
    currentZoneId.set(null);
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const entree = entreeDepuis(el, 0);
    expect(entree, 'l’entrée disparaîtrait selon l’état des zones').toBeDefined();
    entree!.click();
    flushSync();
    await Promise.resolve();
    expect(espions.lire).not.toHaveBeenCalled();
  });

  it('le mode Avancé le porte aussi (tableau depuis #1470)', () => {
    // `intermediate` = « Avancé » : il rendait des LIGNES jusqu'au 07/10/2026 ;
    // il rend désormais le tableau, comme Essentiel et Expert (#1470).
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    const el = poser({ pistes: PISTES, onLire: () => {} });
    expect(el.querySelector('.tbl'), 'Avancé devrait rendre le tableau').not.toBeNull();
    expect(entreeDepuis(el, 0)).toBeDefined();
  });
});

describe('la colonne d’actions n’a plus qu’UNE largeur', () => {
  const liste = lireFichier('src/components/v2/ListePistesV2.svelte');

  it('les deux constantes d’avant ont disparu', () => {
    // Elles n'existaient que parce que le bouton était optionnel. Les garder
    // avec la même valeur serait la prochaine divergence.
    expect(liste).not.toContain('LARGEUR_ACTIONS_DEPUIS');
    // Fil forum 3009 — trois cases : 88 px (118 px avec quatre, web#3121).
    expect(liste).toContain("export const LARGEUR_ACTIONS = '88px';");
    expect(liste).toContain('export const LARGEUR_ACTIONS_PX = 88;');
  });

  it('la largeur rendue est bien celle des TROIS boutons (fil 3009)', () => {
    const el = poser({ pistes: PISTES, onLire: () => {} });
    const tbl = el.querySelector<HTMLElement>('.tbl');
    expect(tbl, 'pas de tableau').not.toBeNull();
    expect(tbl!.style.getPropertyValue('--tcols')).toContain('88px');
    expect(tbl!.style.getPropertyValue('--tcols')).not.toContain('118px');
  });
});

describe('les écrans qui montaient la barre SANS fournir la suite', () => {
  it('la file d’attente : « à partir d’ici » = le saut de file', () => {
    const s = sansCommentaires(lireFichier('src/components/v2/QueueV2.svelte'));
    // web#3121 — « Lire » saute aussi au titre : la file reste intacte.
    expect(s).toContain('<PisteActions piste={t} onLire={() => jump(idx)} onLireDepuis={() => jump(idx)} />');
    expect(s).toContain('<PisteActions piste={current} onLire={() => jump(pos)} onLireDepuis={() => jump(pos)} />');
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
    // Fil forum 3009 (23/11/2026) — `step-forward` (« Lire à partir d'ici »)
    // a quitté la barre à son tour : l'entrée est au menu « … ».
    // web#3121 (16/11/2026) — `list-start`, `list-plus`, `list-music` et `tag`
    // ont quitté la barre : lire ensuite, file, playlist et étiquettes sont au
    // menu « … », qui a ses propres icônes (`lib/menuPiste`).
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
    // #1771 — `coeurPlein` : l'état du favori de la piste, ou celui du cœur
    // fourni par l'écran (favori radio de l'Historique).
    expect(barre).toContain("fill={coeurPlein ? 'currentColor' : 'none'}");
    expect(barre).toContain('const coeurPlein = $derived(coeur ? coeur.favori : favori);');
  });
});
