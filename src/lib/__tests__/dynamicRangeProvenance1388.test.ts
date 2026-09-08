// @vitest-environment jsdom
//
// « De quel Dynamic Range parle-t-on, celui de l'album ou celui des pistes ? »
// — la question d'un testeur sur le forum, et l'objet de #1388.
//
// Le serveur v0.9.142 rend DEUX clés qui apparaissent et disparaissent
// ensemble (`tune-server/src/routes/library/albums.rs`, ~l. 350) :
// `dynamic_range` et `dynamic_range_source` ∈ {album_tag, track_average}.
// Aucun écran ne lisait la seconde : `git grep -c dynamic_range_source src/`
// rendait 0 sur `main`. Une mesure et une déduction s'affichaient à
// l'identique.
//
// 🔴 CES TÉMOINS EXERCENT LA CONDUITE. Ils MONTENT les deux vrais composants
// et lisent ce que le DOM porte réellement — texte, classe, infobulle. Aucun
// ne cherche une chaîne dans un fichier source : c'est le défaut des deux
// gardes textuelles du filtrage Oxygen, qui restent vertes quand on débranche
// la conduite. Débrancher `afficherDynamicRange` d'un des deux écrans doit
// faire ROUGIR ce fichier.
//
// Trois cas par interface : valeur MESURÉE, valeur DÉDUITE, valeur ABSENTE.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LibraryView from '../../components/LibraryView.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { selectedAlbum, albumTracks } from '../stores/library';
import { afficherDynamicRange } from '../dynamicRange';
import type { Album } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Réponse `fetch` minimale, dans la forme que `fetchJSON` consomme. */
function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const ALBUM = (dr: Partial<Album>): Album =>
  ({ id: 7, title: 'Un album mesuré', artist_name: 'X', ...dr }) as Album;

/** Monte l'ANCIENNE interface sur la fiche de cet album. */
function poserAncienne(album: Album): HTMLDivElement {
  vi.stubGlobal('fetch', vi.fn(async () => reponse({})));
  selectedAlbum.set(album);
  albumTracks.set([]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryView, { target: hote, props: {} as any });
  flushSync();
  return hote;
}

/**
 * Monte la NOUVELLE interface. Elle reçoit l'album de la GRILLE — servie par
 * la route de liste, qui ne porte AUCUNE des deux clés : c'est bien la fiche
 * qui doit aller les chercher. Le `fetch` bouchonné ne les rend donc que sur
 * `GET /library/albums/{id}`, et la grille les ignore.
 */
async function poserV2(albumComplet: Album): Promise<HTMLDivElement> {
  const appels: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      appels.push(u);
      if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse([]);
      if (/\/library\/albums\/\d+$/.test(u)) return reponse(albumComplet);
      return reponse({});
    }),
  );
  hote = document.createElement('div');
  document.body.appendChild(hote);
  // La grille ne connaît ni `dynamic_range` ni sa provenance.
  const depuisLaGrille = { id: albumComplet.id, title: albumComplet.title, artist_name: 'X' } as Album;
  monte = mount(AlbumDetailV2, {
    target: hote,
    props: { album: depuisLaGrille, onClose: () => {} },
  });
  flushSync();
  // Laisse la requête de fiche revenir, puis le rendu se poser.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  (hote as any).__appels = appels;
  return hote;
}

beforeEach(() => {
  selectedAlbum.set(null);
  albumTracks.set([]);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  selectedAlbum.set(null);
  albumTracks.set([]);
  vi.unstubAllGlobals();
});

describe('la règle d’affichage — même valeur, provenance différente', () => {
  it('une mesure d’album s’écrit nue, avec l’infobulle d’origine', () => {
    const a = afficherDynamicRange({ dynamic_range: '12', dynamic_range_source: 'album_tag' })!;
    expect(a.texte).toBe('12');
    expect(a.valeur).toBe('12');
    expect(a.deduit).toBe(false);
    expect(a.cleInfobulle).toBe('library.dynamicRangeTip');
  });

  it('une moyenne de pistes porte le tilde, et sa PROPRE infobulle', () => {
    const a = afficherDynamicRange({ dynamic_range: '12', dynamic_range_source: 'track_average' })!;
    // 🔴 La valeur n'est PAS touchée : c'est la même, seule sa provenance
    // change. Un écran qui afficherait 11 ou 13 mentirait.
    expect(a.valeur).toBe('12');
    expect(a.texte).toBe('~12');
    expect(a.deduit).toBe(true);
    expect(a.cleInfobulle).toBe('library.dynamicRangeAverageTip');
  });

  it('les deux infobulles sont DISTINCTES dans les onze langues', async () => {
    const langues = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const l of langues) {
      const m = (await import(`../locales/${l}.ts`)).default as Record<string, string>;
      const mesure = m['library.dynamicRangeTip'];
      const moyenne = m['library.dynamicRangeAverageTip'];
      expect(mesure, `${l} : infobulle de mesure`).toBeTruthy();
      expect(moyenne, `${l} : infobulle de moyenne`).toBeTruthy();
      expect(moyenne, `${l} : les deux textes se ressemblent`).not.toBe(mesure);
    }
  });

  it('rien du tout quand la clé est absente — pas un badge vide, pas un zéro', () => {
    expect(afficherDynamicRange({})).toBeNull();
    expect(afficherDynamicRange(null)).toBeNull();
    expect(afficherDynamicRange({ dynamic_range: null })).toBeNull();
    expect(afficherDynamicRange({ dynamic_range: '' })).toBeNull();
  });

  it('DR0 est une VALEUR — celle d’un master écrasé —, jamais une absence', () => {
    const a = afficherDynamicRange({ dynamic_range: '0', dynamic_range_source: 'album_tag' })!;
    expect(a.texte).toBe('0');
  });

  it('un serveur antérieur à la v0.9.142 retombe sur l’affichage d’avant', () => {
    // Il rend la valeur SANS provenance. Annoncer « déduite » faute de savoir
    // serait une invention ; le badge nu et l'infobulle d'origine restent
    // vrais dans les deux cas.
    const a = afficherDynamicRange({ dynamic_range: '9' })!;
    expect(a.texte).toBe('9');
    expect(a.deduit).toBe(false);
    expect(a.cleInfobulle).toBe('library.dynamicRangeTip');
  });
});

describe('ANCIENNE interface — le badge de LibraryView dit d’où sort la valeur', () => {
  it('MESURÉE : « DR 12 », sans marque, infobulle de mesure', () => {
    const el = poserAncienne(ALBUM({ dynamic_range: '12', dynamic_range_source: 'album_tag' }));
    const badge = el.querySelector('.dr-badge') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('DR 12');
    expect(badge.textContent).not.toContain('~');
    expect(badge.classList.contains('dr-deduit')).toBe(false);
    expect(badge.getAttribute('title')).toBe(fr['library.dynamicRangeTip']);
  });

  it('DÉDUITE : « DR ~12 », marquée, et l’infobulle parle de la moyenne', () => {
    const el = poserAncienne(ALBUM({ dynamic_range: '12', dynamic_range_source: 'track_average' }));
    const badge = el.querySelector('.dr-badge') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('DR ~12');
    // La marque visuelle est portée par une classe, pas par un style en ligne :
    // c'est elle qui déclenche le soulignement pointillé du bloc `<style>`.
    expect(badge.classList.contains('dr-deduit')).toBe(true);
    expect(badge.getAttribute('title')).toBe(fr['library.dynamicRangeAverageTip']);
    expect(badge.getAttribute('title')).not.toBe(fr['library.dynamicRangeTip']);
  });

  it('les deux cas ne se ressemblent PAS — c’est tout l’objet du contrat', () => {
    const mesure = poserAncienne(ALBUM({ dynamic_range: '12', dynamic_range_source: 'album_tag' }));
    const t1 = (mesure.querySelector('.dr-badge') as HTMLElement).textContent?.trim();
    const c1 = (mesure.querySelector('.dr-badge') as HTMLElement).className;
    const b1 = (mesure.querySelector('.dr-badge') as HTMLElement).getAttribute('title');
    unmount(monte!); monte = null; hote!.remove(); hote = null;

    const moyenne = poserAncienne(ALBUM({ dynamic_range: '12', dynamic_range_source: 'track_average' }));
    const badge2 = moyenne.querySelector('.dr-badge') as HTMLElement;
    expect(badge2.textContent?.trim()).not.toBe(t1);
    expect(badge2.className).not.toBe(c1);
    expect(badge2.getAttribute('title')).not.toBe(b1);
  });

  it('ABSENTE : aucun badge, comme avant', () => {
    const el = poserAncienne(ALBUM({}));
    expect(el.querySelector('.dr-badge')).toBeNull();
    expect(el.textContent).not.toContain('DR ');
  });
});

describe('NOUVELLE interface — AlbumDetailV2 affiche enfin un Dynamic Range', () => {
  it('MESURÉE : « DR 12 », sans marque, infobulle de mesure', async () => {
    const el = await poserV2(ALBUM({ dynamic_range: '12', dynamic_range_source: 'album_tag' }));
    const badge = el.querySelector('.facts .dr') as HTMLElement;
    expect(badge, 'la fiche v2 n’affiche aucun DR').not.toBeNull();
    expect(badge.textContent?.trim()).toBe('DR 12');
    expect(badge.classList.contains('deduit')).toBe(false);
    expect(badge.getAttribute('title')).toBe(fr['library.dynamicRangeTip']);
  });

  it('DÉDUITE : « DR ~12 », marquée, infobulle de moyenne', async () => {
    const el = await poserV2(ALBUM({ dynamic_range: '12', dynamic_range_source: 'track_average' }));
    const badge = el.querySelector('.facts .dr') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('DR ~12');
    expect(badge.classList.contains('deduit')).toBe(true);
    expect(badge.getAttribute('title')).toBe(fr['library.dynamicRangeAverageTip']);
  });

  it('ABSENTE : rien, et surtout pas un badge vide', async () => {
    const el = await poserV2(ALBUM({}));
    expect(el.querySelector('.facts .dr')).toBeNull();
    expect(el.textContent).not.toContain('DR ');
  });

  it('la fiche VA CHERCHER la clé : la grille ne la porte pas', async () => {
    const el = await poserV2(ALBUM({ dynamic_range: '12', dynamic_range_source: 'track_average' }));
    const appels: string[] = (el as any).__appels;
    // Sans cet appel, aucune des deux clés n'atteindrait jamais l'écran v2 :
    // seule la route de FICHE les rend.
    expect(appels.some((u) => /\/library\/albums\/7$/.test(u))).toBe(true);
  });
});
