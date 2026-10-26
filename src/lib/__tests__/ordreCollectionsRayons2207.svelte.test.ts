// @vitest-environment jsdom
// web#2207 — Didier, fil 1907, réponse 8434 (15/10/2026) : « que les
// Collections Intelligentes (tous les niveaux) soient classées dans l'ordre
// alphanumérique ou avoir la possibilité de les ranger selon son choix. Pour
// le moment elles sont classées selon leur ordre de création. »
//
// Deux ordres, une préférence du profil gardée par le serveur
// (`ui_preferences`) : `manuel` — la position du serveur
// (`collection_folder_items.position`), réglée par glisser-déposer — et
// `alpha`, à chaque niveau, sur le libellé affiché.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return {
    ...vrai,
    placeCollectionInFolder: vi.fn(async () => ({})),
    moveCollectionFolder: vi.fn(async () => ({})),
  };
});

import * as api from '../api';
import type { ArbreCollections, CollectionRangee } from '../api';
import ArbreRayons from '../../components/v2/ArbreRayons.svelte';
import { locale } from '../i18n';
import {
  estOrdreRayons, ordonnerArbre, placementsPourDeposer, ORDRE_RAYONS_DEFAUT,
} from '../rayonsCollections';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import vi_ from '../locales/vi';
import el_ from '../locales/el';
import nb_ from '../locales/nb';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const col = (
  kind: 'smart' | 'collection', id: number, name: string, folder_id: number | null, position: number | null,
): CollectionRangee => ({ kind, id, name, description: null, icon: null, color: null, folder_id, position });

/** L'arbre de Didier : dans l'ordre de CRÉATION, pas dans l'ordre des noms. */
function arbreDeDidier(): ArbreCollections {
  return {
    max_depth: 3,
    folders: [{
      id: 1, name: 'Rock', parent_id: null, position: 0, depth: 1,
      folders: [{
        id: 2, name: 'Prog', parent_id: 1, position: 0, depth: 2, folders: [],
        collections: [col('smart', 12, 'Yes', 2, 0), col('smart', 11, 'Genesis', 2, 1), col('smart', 13, 'Camel', 2, 2)],
      }],
      collections: [col('smart', 22, 'Queen', 1, 0), col('collection', 21, 'Best 10', 1, 1), col('smart', 23, 'Best 2', 1, 2)],
    }],
    // Hors rayon : deux rangées à la racine (positions 0, 1), puis deux jamais
    // rangées (`position: null`), dans l'ordre de leurs listes.
    collections: [
      col('smart', 31, 'Zappa', null, 0), col('smart', 32, 'Abba', null, 1),
      col('smart', 33, 'Muse', null, null), col('smart', 34, 'Bach', null, null),
    ],
  };
}

const noms = (cs: CollectionRangee[]) => cs.map((c) => c.name);

describe('web#2207 — ordonnerArbre', () => {
  it('« manuel » rend l’arbre du serveur tel quel', () => {
    const a = arbreDeDidier();
    expect(ordonnerArbre(a, 'manuel')).toBe(a);
  });

  it('« alpha » trie les collections à TOUS les niveaux, rayons et hors rayon', () => {
    const a = arbreDeDidier();
    const v = ordonnerArbre(a, 'alpha');
    expect(noms(v.folders[0].folders[0].collections)).toEqual(['Camel', 'Genesis', 'Yes']);
    // Alphanumérique : « Best 2 » avant « Best 10 », simples et
    // intelligentes mêlées comme dans le rayon.
    expect(noms(v.folders[0].collections)).toEqual(['Best 2', 'Best 10', 'Queen']);
    expect(noms(v.collections)).toEqual(['Abba', 'Bach', 'Muse', 'Zappa']);
    // Les rayons gardent leur ordre ; l'arbre du serveur n'est pas touché.
    expect(v.folders.map((f) => f.name)).toEqual(['Rock']);
    expect(noms(a.collections)).toEqual(['Zappa', 'Abba', 'Muse', 'Bach']);
  });

  it('« alpha » trie sur le libellé AFFICHÉ (une collection livrée se traduit)', () => {
    const a = arbreDeDidier();
    const libelle = (c: CollectionRangee) => (c.name === 'Zappa' ? 'Aaa traduit' : c.name ?? '');
    expect(noms(ordonnerArbre(a, 'alpha', libelle).collections)[0]).toBe('Zappa');
  });
});

describe('web#2207 — placementsPourDeposer (ranger à la main)', () => {
  const prog = () => arbreDeDidier().folders[0].folders[0].collections; // Yes, Genesis, Camel

  it('dans un rayon : une écriture, la place de la cible', () => {
    // Camel (dernier) déposé sur Yes (premier) : il remonte AVANT Yes.
    expect(placementsPourDeposer(prog(), { kind: 'smart', id: 13 }, { kind: 'smart', id: 12 }, 2))
      .toEqual([{ kind: 'smart', id: 13, folderId: 2, position: 0 }]);
    // Yes (premier) déposé sur Camel (dernier) : il descend APRÈS Camel.
    expect(placementsPourDeposer(prog(), { kind: 'smart', id: 12 }, { kind: 'smart', id: 13 }, 2))
      .toEqual([{ kind: 'smart', id: 12, folderId: 2, position: 2 }]);
    // Venue d'un autre rayon : avant la cible.
    expect(placementsPourDeposer(prog(), { kind: 'smart', id: 22 }, { kind: 'smart', id: 11 }, 2))
      .toEqual([{ kind: 'smart', id: 22, folderId: 2, position: 1 }]);
  });

  it('sur elle-même, ou sur une cible absente : rien', () => {
    expect(placementsPourDeposer(prog(), { kind: 'smart', id: 12 }, { kind: 'smart', id: 12 }, 2)).toEqual([]);
    expect(placementsPourDeposer(prog(), { kind: 'smart', id: 12 }, { kind: 'collection', id: 12 }, 2)).toEqual([]);
  });

  it('hors rayon : les collections jamais rangées qui précéderont reçoivent d’abord leur place', () => {
    const racine = arbreDeDidier().collections; // Zappa 0, Abba 1, Muse null, Bach null
    // Zappa déposé sur Bach (descend après Bach) : Muse et Bach doivent passer
    // devant lui, et n'avaient pas de place au serveur.
    expect(placementsPourDeposer(racine, { kind: 'smart', id: 31 }, { kind: 'smart', id: 34 }, null)).toEqual([
      { kind: 'smart', id: 33, folderId: null, position: 1 },
      { kind: 'smart', id: 34, folderId: null, position: 2 },
      { kind: 'smart', id: 31, folderId: null, position: 3 },
    ]);
    // Bach déposé sur Abba (remonte avant Abba) : une seule écriture.
    expect(placementsPourDeposer(racine, { kind: 'smart', id: 34 }, { kind: 'smart', id: 32 }, null)).toEqual([
      { kind: 'smart', id: 34, folderId: null, position: 1 },
    ]);
  });
});

describe('web#2207 — préférence', () => {
  it('deux valeurs admises, « alpha » par défaut (web#2256, Didier, 19/10)', () => {
    expect(ORDRE_RAYONS_DEFAUT).toBe('alpha');
    expect(estOrdreRayons('manuel')).toBe(true);
    expect(estOrdreRayons('alpha')).toBe(true);
    expect(estOrdreRayons('creation')).toBe(false);
    expect(estOrdreRayons(undefined)).toBe(false);
  });

  it('est traduite dans les douze langues', () => {
    const langues = { de, en, es, fr, hu, vi: vi_, el: el_, nb: nb_, it: it_, ja, ko, ro, sv, zh } as Record<string, Record<string, string>>;
    for (const [code, l] of Object.entries(langues)) {
      for (const k of ['v2.rayons.order', 'v2.rayons.orderManual', 'v2.rayons.orderAlpha', 'v2.rayons.reorderHint']) {
        expect(l[k], `${code} : ${k}`).toBeTruthy();
      }
    }
  });
});

describe('web#2207 — ArbreRayons monté', () => {
  let hote: HTMLElement;
  let composant: Record<string, any> | null = null;

  beforeEach(() => {
    locale.set('fr');
    try { localStorage.clear(); } catch { /* */ }
    hote = document.createElement('div');
    document.body.appendChild(hote);
    vi.mocked(api.placeCollectionInFolder).mockClear();
  });
  afterEach(() => {
    if (composant) unmount(composant);
    composant = null;
    hote.remove();
  });

  function monter(props: Record<string, unknown>) {
    composant = mount(ArbreRayons, {
      target: hote,
      props: { arbre: arbreDeDidier(), onOuvrir: () => {}, onChange: () => {}, ...props },
    });
    flushSync();
  }
  const lignes = (sel: string) => [...hote.querySelectorAll(`${sel} > ul > .col .nom`)].map((n) => n.textContent);

  it('« alpha » affiche chaque niveau dans l’ordre des noms, dans l’écran ET la barre', () => {
    for (const compact of [false, true]) {
      monter({ ordre: 'alpha', compact });
      const prog = [...hote.querySelectorAll('[data-rayon="2"] .col .nom')].map((n) => n.textContent);
      expect(prog, `compact=${compact}`).toEqual(['Camel', 'Genesis', 'Yes']);
      unmount(composant!);
      composant = null;
    }
    monter({ ordre: 'alpha' });
    expect(lignes('.hors')).toEqual(['Abba', 'Bach', 'Muse', 'Zappa']);
  });

  it('sans ordre choisi : l’alphabétique (web#2256) ; « manuel » : celui du serveur (création)', () => {
    monter({});
    const prog = () => [...hote.querySelectorAll('[data-rayon="2"] .col .nom')].map((n) => n.textContent);
    expect(prog()).toEqual(['Camel', 'Genesis', 'Yes']);
    unmount(composant!);
    composant = null;
    monter({ ordre: 'manuel' });
    expect(prog()).toEqual(['Yes', 'Genesis', 'Camel']);
  });

  it('le sélecteur d’ordre appelle onOrdre ; absent sans onOrdre', () => {
    const choisis: string[] = [];
    monter({ ordre: 'manuel', onOrdre: (o: string) => choisis.push(o) });
    const sel = hote.querySelector('.ordre select') as HTMLSelectElement;
    expect(sel).not.toBeNull();
    sel.value = 'alpha';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(choisis).toEqual(['alpha']);
    unmount(composant!);
    composant = null;
    monter({ ordre: 'manuel' });
    expect(hote.querySelector('.ordre select')).toBeNull();
  });

  /** Un glisser-déposer de `source` sur la ligne `cible`. */
  function glisserSur(source: string, cible: string) {
    const ligne = (cle: string) => hote.querySelector(`[data-collection="${cle}"]`) as HTMLElement;
    const donnees = new Map<string, string>();
    const dt = {
      setData: (t: string, v: string) => donnees.set(t, v),
      getData: (t: string) => donnees.get(t) ?? '',
      effectAllowed: 'move',
    };
    const ev = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as any;
      e.dataTransfer = dt;
      return e;
    };
    ligne(source).dispatchEvent(ev('dragstart'));
    ligne(cible).dispatchEvent(ev('dragover'));
    ligne(cible).dispatchEvent(ev('drop'));
  }

  it('« manuel » : déposer une collection sur une autre la range à sa place, au serveur', async () => {
    monter({ ordre: 'manuel' });
    glisserSur('smart:13', 'smart:12');
    await tick(); await tick();
    expect(api.placeCollectionInFolder).toHaveBeenCalledTimes(1);
    expect(api.placeCollectionInFolder).toHaveBeenCalledWith('smart', 13, 2, 0);
  });

  it('« alpha » : le dépôt range dans le niveau, sans position (le tri décide)', async () => {
    monter({ ordre: 'alpha' });
    glisserSur('smart:31', 'smart:11');
    await tick(); await tick();
    expect(api.placeCollectionInFolder).toHaveBeenCalledTimes(1);
    expect(api.placeCollectionInFolder).toHaveBeenCalledWith('smart', 31, 2);
  });
});

describe('web#2207 — branchement', () => {
  it('l’écran Collections et la barre latérale lisent la MÊME préférence du profil', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
    const ecran = lire('src/components/v2/CollectionsV2.svelte');
    expect(ecran).toContain('ordre={$preferences.ordreRayons}');
    expect(ecran).toContain('ordreRayons: o');
    expect(lire('src/components/v2/Sidebar.svelte')).toContain('ordre={$preferences.ordreRayons}');
    // Rangée dans `ui_preferences` (synchronisé serveur), assainie aux deux
    // lectures.
    const prefs = lire('src/lib/stores/preferences.ts');
    expect(prefs).toContain('ordreRayons: ORDRE_RAYONS_DEFAUT');
    expect((prefs.match(/estOrdreRayons\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
