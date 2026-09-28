// @vitest-environment jsdom
//
// web#1653 — « Écouter plus tard », sur le modèle de Roon (FabienM, fil 1986,
// 27/09/2026 ; go de Bertrand le même jour).
//
//     « Parfois on a pas le temps d'écouter un album, un titre ou une playlist
//     […]. C'est une sorte de sas d'écoute où il est facile de déposer et de
//     retirer des objets à écouter plus tard. […] Elle se matérialise par un
//     bouton d'action disponible sur les 3 objets cités (album, titre,
//     playlist) qui permet d'ajouter et de retirer. Et une entrée dans le menu
//     permet de retrouver les objets à écouter plus tard. »
//
// 🔴 CE QUE CES TÉMOINS GARDENT AVANT TOUT : le sas est rangé SUR LE SERVEUR,
// dans l'étiquetage qui existe déjà. Mesuré sur le .18 (v0.9.167) le
// 28/09/2026, aller et retour, album + piste + playlist, bibliothèque ET
// streaming. Un sas fabriqué dans le navigateur ne survivrait pas à un
// changement de machine — c'est le défaut que ces épreuves rendent impossible.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { locale } from '../i18n';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { cibleDeService } from '../cibleEtiquette';
import {
  CLE_REGLAGE,
  NOM_ETIQUETTE,
  basculerLeSas,
  chargerSas,
  cleCible,
  cleLigne,
  estDansLeSas,
  etiquetteAdoptable,
  normaliserNom,
  oublierSas,
  rangeableDansLeSas,
  resoudreEtiquette,
  sasEcouterPlusTard,
} from '../ecouterPlusTard';
import { entreesPochette } from '../actionsPochette';
import { entreesMenuPiste } from '../menuPiste';
import { entreesObjet, objetAlbum, objetPlaylist } from '../gestesObjet';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 30_000 });

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
/**
 * Réponse par motif — le premier motif qui appareille gagne.
 *
 * 🔴 Un motif peut porter sa MÉTHODE (`'POST /tags/'`) : `GET /tags/` (la
 * liste) et `POST /tags/` (la création) ont exactement la même adresse, et un
 * motif d'URL seul rendrait la liste à la création.
 */
let reponses: [string, unknown][] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

/** L'étiquette du sas, déjà connue du profil, et vide. */
function serveurAvecSasVide(tagId = 7) {
  reponses = [
    [`/profiles/1/settings`, { [CLE_REGLAGE]: tagId }],
    [`/tags/${tagId}/albums`, { albums: [], count: 0 }],
    [`/tags/${tagId}/tracks`, { tracks: [], count: 0 }],
    [`/tags/${tagId}/playlists`, { playlists: [], count: 0 }],
    ['/tags', [{ id: tagId, name: NOM_ETIQUETTE, color: '#808080' }]],
  ];
}

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  oublierSas();
  currentProfileId.set(1);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const trouve = reponses.find(([motif]) => {
      const i = motif.indexOf(' ');
      if (i === -1) return url.includes(motif);
      return method === motif.slice(0, i) && url.includes(motif.slice(i + 1));
    });
    const charge = trouve ? trouve[1] : {};
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  oublierSas();
  currentProfileId.set(null);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — le sas est rangé SUR LE SERVEUR, dans l’étiquetage existant', () => {
  it('🔴 déposer un ALBUM de la bibliothèque part en POST /tags/{id}/items', async () => {
    serveurAvecSasVide();
    const dedans = await basculerLeSas({ itemType: 'album', itemId: 11032 });
    expect(dedans).toBe(true);
    const pose = requetes.find((r) => r.method === 'POST' && /\/tags\/7\/items$/.test(r.url));
    expect(pose, 'aucun POST /tags/7/items — le dépôt n’atteint pas le serveur').toBeTruthy();
    expect(pose!.body).toEqual({ item_type: 'album', item_id: 11032 });
  });

  it('🔴 déposer une PLAYLIST de service part en POST /tags/{id}/streaming-items, avec la PAIRE', async () => {
    serveurAvecSasVide();
    const cible = cibleDeService('playlist', {
      source: 'qobuz', source_id: '70608857', name: 'Sonde 1653',
    })!;
    await basculerLeSas(cible);
    const pose = requetes.find((r) => r.method === 'POST' && /\/streaming-items$/.test(r.url));
    expect(pose, 'aucun POST /tags/7/streaming-items pour une playlist Qobuz').toBeTruthy();
    expect(pose!.body).toMatchObject({
      item_type: 'playlist', source: 'qobuz', source_id: '70608857',
    });
  });

  it('🔴 déposer une PISTE de service passe par la même paire — les trois objets, une seule route', async () => {
    serveurAvecSasVide();
    const cible = cibleDeService('track', {
      source: 'tidal', source_id: '12345678', title: 'Sonde piste', artist_name: 'X',
    })!;
    await basculerLeSas(cible);
    const pose = requetes.find((r) => r.method === 'POST' && /\/streaming-items$/.test(r.url));
    expect(pose!.body).toMatchObject({ item_type: 'track', source: 'tidal', source_id: '12345678' });
  });

  it('🔴 retirer emprunte les routes de RETRAIT, jamais un second dépôt', async () => {
    reponses = [
      ['/profiles/1/settings', { [CLE_REGLAGE]: 7 }],
      ['/tags/7/albums', { albums: [{ id: 11032, title: 'MCMXC a.D.' }], count: 1 }],
      ['/tags/7/tracks', { tracks: [], count: 0 }],
      ['/tags/7/playlists', {
        playlists: [{ id: null, name: 'Sonde 1653', source: 'qobuz', source_id: '70608857' }],
        count: 1,
      }],
      ['/tags', [{ id: 7, name: NOM_ETIQUETTE, color: '#808080' }]],
    ];
    await chargerSas();
    expect(estDansLeSas({ itemType: 'album', itemId: 11032 })).toBe(true);

    const apresAlbum = await basculerLeSas({ itemType: 'album', itemId: 11032 });
    expect(apresAlbum, 'la bascule n’a pas retiré l’album déjà déposé').toBe(false);
    const retraitLocal = requetes.find((r) => r.method === 'DELETE');
    expect(retraitLocal, 'aucun DELETE — le retrait local n’atteint pas le serveur').toBeTruthy();
    expect(retraitLocal!.url).toMatch(/\/tags\/7\/items\/album\/11032$/);

    const cible = cibleDeService('playlist', { source: 'qobuz', source_id: '70608857', name: 'Sonde 1653' })!;
    expect(estDansLeSas(cible)).toBe(true);
    await basculerLeSas(cible);
    const retraitService = requetes.find((r) => /\/streaming-items\/remove$/.test(r.url));
    expect(retraitService, 'aucun POST …/streaming-items/remove').toBeTruthy();
    expect(retraitService!.body).toEqual({
      item_type: 'playlist', source: 'qobuz', source_id: '70608857',
    });
  });

  it('🔴 RIEN n’est écrit dans le stockage du navigateur — le sas suit l’utilisateur de machine en machine', async () => {
    serveurAvecSasVide();
    /**
     * 🔴 L'espion se pose sur `Storage.prototype`, PAS sur l'instance.
     *
     * Deux versions de ce témoin sont restées VERTES sous la contre-épreuve
     * (un `localStorage.setItem` ajouté exprès dans la bascule), et pour la
     * même raison : le `Storage` de jsdom est un PROXY. `Object.keys` ne
     * rend pas ses clés, et `vi.spyOn(localStorage, 'setItem')` n'installe
     * rien — le piège `defineProperty` range une ENTRÉE nommée « setItem » et
     * la lecture continue de rendre la méthode du prototype. Un témoin qui ne
     * rougit pas quand le défaut est là ne garde rien.
     */
    const ecrits: string[] = [];
    const vraiSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, cle: string, val: string) {
      ecrits.push(cle);
      return vraiSetItem.call(this, cle, val);
    });
    await basculerLeSas({ itemType: 'album', itemId: 11032 });
    expect(
      ecrits,
      `le sas a écrit dans le navigateur (${ecrits.join(', ')}) : il ne survivrait pas à un changement de machine`,
    ).toEqual([]);
  });

  it('l’identifiant de l’étiquette est retenu DANS LE PROFIL, côté serveur', async () => {
    reponses = [
      ['/profiles/1/settings', {}],
      ['POST /tags/', { id: 9 }],
      ['/tags', []],
    ];
    await basculerLeSas({ itemType: 'album', itemId: 11032 });
    const creation = requetes.find((r) => r.method === 'POST' && /\/tags\/$/.test(r.url));
    expect(creation, 'le premier dépôt n’a pas créé l’étiquette du sas').toBeTruthy();
    expect(creation!.body).toMatchObject({ name: NOM_ETIQUETTE });
    const reglage = requetes.find((r) => r.method === 'POST' && /\/profiles\/1\/settings$/.test(r.url));
    expect(reglage, 'l’identifiant n’est pas retenu dans le profil').toBeTruthy();
    expect(Object.keys(reglage!.body)).toContain(CLE_REGLAGE);
  });

  it('l’étiquette n’est créée qu’au PREMIER DÉPÔT, jamais à la lecture', async () => {
    reponses = [['/profiles/1/settings', {}], ['/tags', []]];
    await chargerSas();
    expect(requetes.some((r) => r.method === 'POST' && /\/tags\/$/.test(r.url))).toBe(false);
    expect(sasEcouterPlusTard && estDansLeSas({ itemType: 'album', itemId: 1 })).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — quelle étiquette tient le sas', () => {
  it('le réglage du profil l’emporte, et il est VÉRIFIÉ contre la liste du serveur', async () => {
    reponses = [
      ['/profiles/1/settings', { [CLE_REGLAGE]: 7 }],
      ['/tags', [{ id: 7, name: NOM_ETIQUETTE, color: '#808080' }]],
    ];
    await expect(resoudreEtiquette(1)).resolves.toBe(7);
  });

  it('🔴 une étiquette SUPPRIMÉE depuis l’écran Étiquettes n’est plus la nôtre', async () => {
    reponses = [
      ['/profiles/1/settings', { [CLE_REGLAGE]: 7 }],
      ['/tags', [{ id: 3, name: 'Rares', color: '#808080' }]],
    ];
    await expect(
      resoudreEtiquette(1),
      'un identifiant mort ferait ranger dans le vide, en 404 muet',
    ).resolves.toBeNull();
  });

  it('adopte l’étiquette que l’utilisateur s’est faite — FabienM, réponse 6980', () => {
    // Sa capture du fil 1990 montre « Ecouter plus tard », sans accent.
    const adoptee = etiquetteAdoptable([
      { id: 1, name: 'Bô enregistrements', color: '#808080' },
      { id: 9, name: 'Ecouter plus tard', color: '#808080' },
    ] as any);
    expect(adoptee?.id, 'l’étiquette déjà remplie par le testeur n’est pas reprise').toBe(9);
    expect(normaliserNom('Écouter  Plus TARD')).toBe('ecouter plus tard');
  });

  it('🔴 n’adopte PAS une étiquette voisine : « À écouter » est le rangement de quelqu’un', () => {
    const tags = [
      { id: 4, name: 'A écouter', color: '#808080' },
      { id: 2, name: "J'adore", color: '#808080' },
    ] as any;
    expect(
      etiquetteAdoptable(tags),
      'le sas a détourné une étiquette qui ne lui était pas destinée',
    ).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — les clés ne confondent jamais deux espaces d’identifiants', () => {
  it('le TYPE et la SOURCE font partie de la clé', () => {
    expect(cleCible({ itemType: 'album', itemId: 23 })).toBe('l:album:23');
    expect(cleCible({ itemType: 'playlist', itemId: 23 })).toBe('l:playlist:23');
    expect(cleCible({ itemType: 'album', source: 'Qobuz', sourceId: '23' } as any)).toBe('s:album:qobuz:23');
    expect(cleCible({ itemType: 'album', itemId: 23 })).not.toBe(
      cleCible({ itemType: 'album', source: 'qobuz', sourceId: '23' } as any),
    );
  });

  it('un identifiant local nul ou négatif ne désigne rien (deux lignes item_id = 0 sur le .18)', () => {
    expect(cleCible({ itemType: 'album', itemId: 0 })).toBeNull();
    expect(rangeableDansLeSas({ itemType: 'album', itemId: 0 })).toBe(false);
    expect(rangeableDansLeSas({ itemType: 'album', itemId: 12 })).toBe(true);
  });

  it('une LIGNE du serveur se range sous la même clé que la cible qui l’a déposée', () => {
    expect(cleLigne('album', { id: 11032 })).toBe(cleCible({ itemType: 'album', itemId: 11032 }));
    expect(cleLigne('playlist', { id: null, source: 'qobuz', source_id: '70608857' }))
      .toBe(cleCible({ itemType: 'playlist', source: 'qobuz', sourceId: '70608857' } as any));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — LE MÊME GESTE sur album, titre et playlist', () => {
  const traduire = (k: string) => k;

  it('🔴 l’album, la playlist et la piste portent la MÊME clé d’entrée', () => {
    const album = entreesPochette(
      { type: 'album', idBibliotheque: 12, dansEcouterPlusTard: false },
      { basculerEcouterPlusTard: () => {} },
      traduire,
    ).map((e) => e.cle);
    const playlist = entreesPochette(
      { type: 'playlist', idBibliotheque: 23, dansEcouterPlusTard: false },
      { basculerEcouterPlusTard: () => {} },
      traduire,
    ).map((e) => e.cle);
    const piste = entreesMenuPiste(
      { jouable: true, idBibliotheque: 5, artistId: null, albumId: null, dansEcouterPlusTard: false },
      { basculerEcouterPlusTard: () => {} },
    ).map((e) => e.cle);
    for (const [nom, cles] of [['album', album], ['playlist', playlist], ['piste', piste]] as const) {
      expect(cles, `le menu d’${nom === 'album' ? 'un' : 'une'} ${nom} n’offre pas « Écouter plus tard »`)
        .toContain('v2.later.add');
    }
  });

  it('🔴 la bascule CHANGE de libellé selon l’état — l’état se lit, il ne se devine pas', () => {
    const dedans = entreesMenuPiste(
      { jouable: true, idBibliotheque: 5, artistId: null, albumId: null, dansEcouterPlusTard: true },
      { basculerEcouterPlusTard: () => {} },
    );
    expect(dedans.map((e) => e.cle)).toContain('v2.later.remove');
    expect(dedans.map((e) => e.cle)).not.toContain('v2.later.add');
    // …et jamais les deux à la fois : l'objet est dans le sas ou n'y est pas.
    expect(dedans.filter((e) => e.cle.startsWith('v2.later.'))).toHaveLength(1);
  });

  it('🔴 un objet qui ne se range PAS n’a pas l’entrée — absente, pas grisée', () => {
    const sansCapacite = entreesPochette(
      { type: 'album', idBibliotheque: 12 },
      { basculerEcouterPlusTard: () => {} },
      traduire,
    ).map((e) => e.cle);
    expect(sansCapacite.some((c) => c.startsWith('v2.later.'))).toBe(false);
    const sansGeste = entreesPochette(
      { type: 'album', idBibliotheque: 12, dansEcouterPlusTard: false },
      {},
      traduire,
    ).map((e) => e.cle);
    expect(sansGeste.some((c) => c.startsWith('v2.later.'))).toBe(false);
  });

  it('🔴 le menu d’un ALBUM et celui d’une PLAYLIST le proposent VRAIMENT — capacité ET geste posés par le catalogue', async () => {
    serveurAvecSasVide();
    await chargerSas();
    const album = entreesObjet(objetAlbum({ id: 11032, title: 'MCMXC a.D.' }), traduire).map((e) => e.cle);
    const playlist = entreesObjet(objetPlaylist({ id: 23, name: 'Genesis' }), traduire).map((e) => e.cle);
    expect(album, 'le menu de l’album ne propose pas le sas').toContain('v2.later.add');
    expect(playlist, 'le menu de la playlist ne propose pas le sas').toContain('v2.later.add');
  });

  it('🔴 un album DÉJÀ dans le sas voit son menu proposer le RETRAIT', async () => {
    reponses = [
      ['/profiles/1/settings', { [CLE_REGLAGE]: 7 }],
      ['/tags/7/albums', { albums: [{ id: 11032, title: 'MCMXC a.D.' }], count: 1 }],
      ['/tags/7/tracks', { tracks: [], count: 0 }],
      ['/tags/7/playlists', { playlists: [], count: 0 }],
      ['/tags', [{ id: 7, name: NOM_ETIQUETTE, color: '#808080' }]],
    ];
    await chargerSas();
    const cles = entreesObjet(objetAlbum({ id: 11032, title: 'MCMXC a.D.' }), traduire).map((e) => e.cle);
    expect(cles).toContain('v2.later.remove');
    expect(cles).not.toContain('v2.later.add');
  });

  it('un album de SERVICE l’a aussi — la paire, pas l’entier', async () => {
    serveurAvecSasVide();
    await chargerSas();
    const cles = entreesObjet(
      objetAlbum({ id: null, title: 'Menagerie', source: 'qobuz', source_id: 'kxend2k5wdg06' }),
      traduire,
    ).map((e) => e.cle);
    expect(cles).toContain('v2.later.add');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — la ligne de piste le propose et l’envoie', () => {
  const PISTE_QOBUZ = {
    id: null, title: 'Lovely Day', artist_name: 'Bill Withers',
    source: 'qobuz', source_id: 'abc123',
  } as any;

  it('🔴 le menu « … » d’une piste montre l’entrée, et le clic part vers /tags/{id}/streaming-items', async () => {
    serveurAvecSasVide();
    monte = mount(PisteActions, { target: hote!, props: { piste: PISTE_QOBUZ } as any });
    await souffler();
    const boutonMenu = [...hote!.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-haspopup') ?? '') === 'menu' || /more|…/i.test(b.getAttribute('title') ?? ''),
    );
    expect(boutonMenu, 'la ligne de piste n’a pas de bouton « … »').toBeTruthy();
    boutonMenu!.click();
    await souffler();
    const libelle = dictionnaire('fr')['v2.later.add'];
    const entree = [...document.querySelectorAll('.fond button')].find(
      (b) => (b.textContent ?? '').trim() === libelle,
    );
    expect(entree, `« ${libelle} » est absent du menu de la piste`).toBeTruthy();
    (entree as HTMLElement).click();
    await souffler();
    const pose = requetes.find((r) => r.method === 'POST' && /\/streaming-items$/.test(r.url));
    expect(pose, 'le clic sur l’entrée n’envoie rien au serveur').toBeTruthy();
    expect(pose!.body).toMatchObject({ item_type: 'track', source: 'qobuz', source_id: 'abc123' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('#1653 — l’entrée de barre latérale et ses libellés', () => {
  // Les gardes de SOURCE lisent le fichier : un `labelKey` posé au bon rang
  // ne s'observe pas en montant la barre, qui dépend de vingt magasins.
  const lire = (chemin: string) => readFileSync(chemin, 'utf8');

  it('🔴 « Écouter plus tard » est une entrée NATIVE de la barre, au-dessus des Étiquettes', () => {
    const barre = lire('src/components/v2/Sidebar.svelte');
    const iSas = barre.indexOf("view: 'ecouterplustard'");
    const iTags = barre.indexOf("view: 'tags'");
    expect(iSas, 'aucune entrée « Écouter plus tard » dans la barre latérale').toBeGreaterThan(-1);
    expect(iTags).toBeGreaterThan(-1);
    expect(iSas, 'l’entrée n’est pas rangée avant les Étiquettes').toBeLessThan(iTags);
    expect(barre).toContain("labelKey: 'v2.nav.later'");
  });

  it('l’écran est MONTÉ par la coquille et la vue est une destination adressable', () => {
    expect(lire('src/components/v2/ShellV2.svelte')).toContain('<EcouterPlusTardV2 />');
    expect(lire('src/lib/routeAuChargement.ts')).toContain('ecouterplustard: true');
  });

  it('🔴 les sept libellés existent dans les ONZE langues — une absence ferait lire du français', () => {
    const cles = [
      'v2.nav.later', 'v2.later.add', 'v2.later.remove', 'v2.later.added',
      'v2.later.removed', 'v2.later.eyebrow', 'v2.later.items', 'v2.later.empty',
    ];
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of cles) {
        expect(d[cle], `${langue} : « ${cle} » manque`).toBeTruthy();
      }
    }
  });
});
