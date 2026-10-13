// @vitest-environment jsdom
/**
 * web#916 (FabienM, fil forum 1527, go de Bertrand du 12/10/2026) — chaque
 * suggestion de l'accueil dit POURQUOI elle est là, et « Pas pour moi »
 * l'écarte, par profil.
 *
 * Ce banc garde, sans DOM :
 *  1. la PHRASE de chaque raison, en français et en anglais — et le silence
 *     quand la raison est inconnue ou incomplète (jamais inventée) ;
 *  2. que les CHARGEURS des rangées de recommandation reprennent la raison du
 *     serveur et marquent leurs éléments comme suggestions, et que les rangées
 *     factuelles (ajouts récents) ne deviennent PAS écartables ;
 *  3. ce que « Pas pour moi » désigne pour une vignette (album local, album de
 *     service, playlist de service, artiste) ;
 *  4. le menu « … » : l'entrée n'existe que si l'accueil fournit le geste ;
 *  5. l'aller-retour écarter / annuler, son corps de requête, et le retour
 *     arrière quand le serveur refuse.
 *
 * Les gestes au clic, sur la vraie page, sont dans `accueilJustifie916.dom.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { texteRaison } from '../raisonSuggestion';
import { widgetParId, type Contexte, type Element } from '../accueilWidgets';
import {
  cibleArtiste,
  cibleDeSuggestion,
  cleEcart,
  clesEcartees,
  ecarter,
  estEcartee,
  retablir,
  suggestionsEcartees,
} from '../suggestionsEcartees';
import { entreesPochette } from '../actionsPochette';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;
const tFr = (k: string) => fr[k] ?? k;
const tEn = (k: string) => en[k] ?? k;

const ctx = { profileId: 1, albums: [], zones: [], limite: 20 } as unknown as Contexte;

/** Une réponse JSON du serveur simulé, selon l'URL. */
function serveur(routes: Record<string, unknown>, journal: { url: string; init?: RequestInit }[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: RequestInit) => {
      const u = String(url);
      journal.push({ url: u, init });
      const cle = Object.keys(routes).find((k) => u.includes(k));
      const corps = cle ? routes[cle] : [];
      const ok = !(corps instanceof Error);
      return {
        ok,
        status: ok ? 200 : 400,
        statusText: ok ? 'OK' : 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => (ok ? corps : { error: 'refus' }),
        text: async () => JSON.stringify(ok ? corps : { error: 'refus' }),
      } as unknown as Response;
    }),
  );
  return journal;
}

afterEach(() => {
  vi.unstubAllGlobals();
  suggestionsEcartees.set([]);
});

describe('1. la phrase de la raison — seulement ce que le serveur sait', () => {
  it('rend chaque type en français', () => {
    expect(texteRaison({ type: 'genre_frequent', genre: 'Jazz' }, tFr)).toBe(
      'Un genre que vous écoutez souvent : Jazz',
    );
    expect(texteRaison({ type: 'artiste_favori', artiste: 'Miles Davis' }, tFr)).toBe(
      'Parce que vous aimez Miles Davis',
    );
    expect(texteRaison({ type: 'artiste_possede', artiste: 'Miles Davis', albums: 1 }, tFr)).toBe(
      'Miles Davis : 1 album dans votre bibliothèque',
    );
    expect(texteRaison({ type: 'artiste_possede', artiste: 'Miles Davis', albums: 5 }, tFr)).toBe(
      'Miles Davis : 5 albums dans votre bibliothèque',
    );
    expect(texteRaison({ type: 'autre_version', titre: 'So What' }, tFr)).toBe(
      'Autre version de « So What », écouté récemment',
    );
    expect(texteRaison({ type: 'ajout_recent' }, tFr)).toBe('Ajouté récemment');
    // 12/10/2026 à midi UTC : la date, à la manière de la langue.
    expect(texteRaison({ type: 'ajout_recent', ajoute_le: 1791806400 }, tFr, 'fr')).toMatch(
      /^Ajouté le 12 oct\.? 2026$/,
    );
  });

  it('rend la même raison en anglais, sans un mot de français', () => {
    expect(texteRaison({ type: 'genre_frequent', genre: 'Jazz' }, tEn)).toBe('A genre you often play: Jazz');
    expect(texteRaison({ type: 'artiste_favori', artiste: 'Miles Davis' }, tEn)).toBe('Because you like Miles Davis');
    expect(texteRaison({ type: 'ajout_recent', ajoute_le: 1791806400 }, tEn, 'en')).toBe('Added on Oct 12, 2026');
  });

  it("se tait plutôt que d'inventer", () => {
    expect(texteRaison(null, tFr)).toBeNull();
    expect(texteRaison('genre_match', tFr), 'l’ancienne chaîne `reason` n’est pas une raison').toBeNull();
    expect(texteRaison({ type: 'artiste_ecoute', artiste: 'Miles Davis' }, tFr), 'type inconnu').toBeNull();
    expect(texteRaison({ type: 'genre_frequent', genre: '  ' }, tFr)).toBeNull();
    expect(texteRaison({ type: 'artiste_possede', artiste: 'X', albums: 0 }, tFr)).toBeNull();
  });
});

describe('2. les chargeurs reprennent la raison et marquent les suggestions', () => {
  it('« Recommandations » : raison du serveur, écartable, artiste connu', async () => {
    serveur({
      '/home/recommendations': [
        { id: 12, title: 'Bitches Brew', artist_name: 'Miles Davis', reason: 'genre_match',
          raison: { type: 'genre_frequent', genre: 'Jazz' } },
        { id: 13, title: 'Au hasard', artist_name: 'Quelqu’un', reason: 'random' },
      ],
    });
    const els = await widgetParId('recommandations')!.charger(ctx);
    expect(els.map((e) => e.raison)).toEqual([{ type: 'genre_frequent', genre: 'Jazz' }, null]);
    expect(els.every((e) => e.suggestion)).toBe(true);
    expect(els[0].artisteSuggere).toBe('Miles Davis');
  });

  it('« Nouveautés de vos artistes » : la raison de CHAQUE parution', async () => {
    serveur({
      '/home/artist-releases': [
        { artist_name: 'Miles Davis', is_favorite: true, library_albums: 4,
          releases: [{ service: 'qobuz', source_id: 'q-1', title: 'Live', cover_path: null, year: 2026,
            raison: { type: 'artiste_favori', artiste: 'Miles Davis' } }] },
      ],
    });
    const [el] = await widgetParId('nouveautes-artistes')!.charger(ctx);
    expect(el.raison).toEqual({ type: 'artiste_favori', artiste: 'Miles Davis' });
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'album', source: 'qobuz', item_id: 'q-1' });
    expect(cibleArtiste(el)).toMatchObject({ item_type: 'artist', item_id: 'Miles Davis' });
  });

  it('« Autres versions » : l’album local de la version devient écartable', async () => {
    serveur({
      '/home/other-versions': [
        { title: 'So What', artist_name: 'Miles Davis', played_album: 'Kind of Blue',
          raison: { type: 'autre_version', titre: 'So What' },
          versions: [{ track_id: 9, album_id: 77, album_title: 'Live at Newport', cover_path: null }] },
      ],
    });
    const [el] = await widgetParId('autres-versions')!.charger(ctx);
    expect(el.raison).toEqual({ type: 'autre_version', titre: 'So What' });
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'album', source: 'local', item_id: '77' });
  });

  it('« Nouveautés dans votre bibliothèque » dit sa date, mais ne se REFUSE pas', async () => {
    serveur({
      '/home/new-in-library': [
        { id: 5, title: 'Neuf', artist_name: 'A', raison: { type: 'ajout_recent', ajoute_le: 1791806400 } },
      ],
    });
    const [el] = await widgetParId('nouveau-bibliotheque')!.charger(ctx);
    expect(el.raison).toEqual({ type: 'ajout_recent', ajoute_le: 1791806400 });
    expect(el.suggestion, 'un ajout récent n’est pas une suggestion à refuser').toBeFalsy();
    expect(cibleDeSuggestion(el)).toBeNull();
  });

  it('la sélection de playlists Qobuz est écartable, sans raison inventée', async () => {
    serveur({ '/streaming/qobuz/featured': [{ id: 'pl-9', name: 'Jazz du soir', image_url: null }] });
    const [el] = await widgetParId('qobuz-selection')!.charger(ctx);
    expect(el.raison ?? null).toBeNull();
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'playlist', source: 'qobuz', item_id: 'pl-9' });
  });
});

describe('3. ce que « Pas pour moi » écarte, et ce qui disparaît', () => {
  const album = (e: Partial<Element>): Element =>
    ({ id: 'x', titre: 'Bitches Brew', suggestion: true, artisteSuggere: 'Miles Davis', ...e }) as Element;

  it('rien hors d’une suggestion, rien quand rien n’est désigné', () => {
    expect(cibleDeSuggestion(album({ suggestion: false, fiche: { id: 4 } }))).toBeNull();
    expect(cibleDeSuggestion(album({ fiche: null }))).toBeNull();
    expect(cibleDeSuggestion(album({ fiche: { id: null, source_id: 'u', source: 'upnp' } }))).toBeNull();
  });

  it('une vignette disparaît si elle OU son artiste est écarté — chez tous les services', () => {
    const locale = album({ fiche: { id: 4, source: null } });
    const qobuz = album({ id: 'y', fiche: { id: null, source_id: 'q-1', source: 'qobuz' } });
    let cles = new Set([cleEcart({ item_type: 'album', source: 'local', item_id: '4' })]);
    expect(estEcartee(locale, cles)).toBe(true);
    expect(estEcartee(qobuz, cles)).toBe(false);
    cles = new Set([cleEcart({ item_type: 'artist', source: 'nom', item_id: '  miles   DAVIS ' })]);
    expect(estEcartee(locale, cles) && estEcartee(qobuz, cles)).toBe(true);
    expect(estEcartee(album({ artisteSuggere: 'Bill Evans', fiche: { id: 4 } }), cles)).toBe(false);
  });
});

describe('4. le menu « … »', () => {
  const capacites = { type: 'album' as const, idBibliotheque: 4 };
  const cles = (g: Record<string, () => void>) => entreesPochette(capacites, g, tFr).map((e) => e.cle);

  it('porte « Pas pour moi » et « Ne plus me proposer cet artiste » quand l’accueil les fournit', () => {
    const e = entreesPochette(capacites, { pasPourMoi: () => {}, pasPourMoiArtiste: () => {} }, tFr);
    const libelles = e.map((x) => x.libelle);
    expect(libelles).toContain('Pas pour moi');
    expect(libelles).toContain('Ne plus me proposer cet artiste');
    expect(e.find((x) => x.cle === 'v2.dismiss.notForMe')?.danger, 'un refus se défait : pas de rouge').toBeFalsy();
  });

  it('ne les porte nulle part ailleurs', () => {
    expect(cles({ ouvrir: () => {} })).not.toContain('v2.dismiss.notForMe');
    expect(cles({ ouvrir: () => {} })).not.toContain('v2.dismiss.notForMeArtist');
  });
});

describe('5. écarter, annuler — et revenir en arrière si le serveur refuse', () => {
  const cible = { item_type: 'album' as const, source: 'local', item_id: '4', title: 'Bitches Brew' };

  beforeEach(() => suggestionsEcartees.set([]));

  it('écarter POSTE la désignation, annuler la RÉTABLIT', async () => {
    const journal = serveur({
      '/home/dismissed-suggestions/restore': { restored: true },
      '/home/dismissed-suggestions': { dismissed: true, item: cible },
    });
    await ecarter(cible);
    expect(get(clesEcartees).has('album|local|4')).toBe(true);
    const post = journal.find((j) => j.url.endsWith('/home/dismissed-suggestions'));
    expect(post?.init?.method).toBe('POST');
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ item_type: 'album', source: 'local', item_id: '4' });

    await retablir(cible);
    expect(get(clesEcartees).size).toBe(0);
    const restore = journal.find((j) => j.url.endsWith('/home/dismissed-suggestions/restore'));
    expect(JSON.parse(String(restore?.init?.body))).toEqual({ item_type: 'album', source: 'local', item_id: '4' });
  });

  it('un refus du serveur fait revenir la vignette', async () => {
    serveur({ '/home/dismissed-suggestions': new Error('400') });
    await expect(ecarter(cible)).rejects.toBeTruthy();
    expect(get(clesEcartees).size, 'la vignette ne doit pas rester cachée').toBe(0);
  });
});
