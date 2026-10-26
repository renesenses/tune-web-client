// @vitest-environment jsdom
//
// Testeur Alex, 26/10/2026, client web v1.0.0-rc8, interface en anglais.
//
// #2410 — après avoir retiré les panneaux « Genres » et « My listening » de
// l'accueil, ils revenaient. Ce sont deux des trois panneaux du widget
// `premiere-ligne`. Un profil qui suit le défaut n'a pas de marqueur de
// migration ; retirer la ligne écrivait une disposition sans elle et sans
// marqueur, et `migrationPremiereLigne` la réinsérait au chargement suivant.
//
// #2411 — « This widget could not be loaded. (delai) » : le code interne
// s'affichait brut dans une interface anglaise.
//
// Les témoins MONTENT la vraie page, avec un faux serveur qui GARDE les
// préférences du profil : on retire la ligne, on démonte, on remonte, et on
// regarde ce que la page affiche.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { locale } from '../i18n';
import { marqueurAEnregistrer, migrationPremiereLigne } from '../migrationPremiereLigne';
import * as api from '../api';

vi.setConfig({ testTimeout: 30_000 });

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Les préférences du profil 1, côté « serveur » : elles survivent au démontage. */
let prefs: Record<string, any> = {};
let ecritures: Record<string, any>[] = [];
/** Le serveur occupé : la relecture des préférences échoue (réseau coupé une seconde). */
let lectureEnPanne = false;
/** Pour croiser deux écritures : chaque lecture attend ce délai. */
let delaiDeLecture = 0;

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function poserLeServeur() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    let corps: unknown = {};
    if (/\/bug-report/.test(url)) {
      corps = { status: 'ok', url: 'https://forum.example/thread', slug: 'x' };
    } else if (/\/profiles\/1\/settings/.test(url)) {
      if (methode === 'GET' && lectureEnPanne) throw new TypeError('Failed to fetch');
      if (methode === 'GET' && delaiDeLecture) await new Promise((r) => setTimeout(r, delaiDeLecture));
      if (methode === 'POST') {
        const ecrit = JSON.parse(String(init!.body));
        ecritures.push(ecrit);
        prefs = { ...prefs, ...ecrit };
      }
      corps = prefs;
    }
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
}

beforeEach(() => {
  prefs = {};
  ecritures = [];
  lectureEnPanne = false;
  delaiDeLecture = 0;
  locale.set('en');
  currentProfileId.set(1);
  poserLeServeur();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bande = (id: string, titre: string) => ({
  id,
  cleTitre: titre,
  forme: 'bande' as const,
  charger: async () => [{ id: `${id}-1`, titre: `contenu de ${id}`, sousTitre: '' }],
});

async function poser(catalogue: any[], dispositionDefaut: string[]) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue, dispositionDefaut, cle: 'accueil_temoin' },
  });
  flushSync();
  await souffler(100);
  flushSync();
  return hote;
}

async function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  await souffler(10);
}

describe('#2410 — retirer la première ligne ne la fait pas revenir', () => {
  const catalogue = () => [bande('premiere-ligne', 'v2.home.wFirstRow'), bande('temoin', 'v2.home.wStats')];
  const DEFAUT = ['premiere-ligne', 'temoin'];

  it('🔴 un profil qui suivait le défaut retire la ligne : au rechargement, elle reste retirée', async () => {
    const page = await poser(catalogue(), DEFAUT);
    expect(page.textContent, 'prémisse : la ligne est à l’écran').toContain('contenu de premiere-ligne');

    // Le geste : « Edit », puis la croix de la première ligne.
    page.querySelector<HTMLButtonElement>('button.v2-btn')!.click();
    flushSync();
    const croix = page.querySelectorAll<HTMLButtonElement>('button.retirer');
    expect(croix.length, 'les croix de retrait doivent être offertes en mode édition').toBeGreaterThan(0);
    croix[0].click();
    await souffler(60);
    flushSync();
    expect(page.textContent).not.toContain('contenu de premiere-ligne');
    expect(prefs.accueil_temoin, 'la disposition retirée doit être enregistrée').toEqual(['temoin']);

    // Le rechargement : on remonte la page sur les mêmes préférences.
    await demonter();
    const apres = await poser(catalogue(), DEFAUT);
    await souffler(100);
    flushSync();
    expect(
      apres.textContent,
      'la ligne retirée est revenue au rechargement — c’est #2410',
    ).not.toContain('contenu de premiere-ligne');
    expect(prefs.accueil_temoin, 'la migration a réécrit la disposition avec la ligne').toEqual(['temoin']);
  });

  it('le marqueur part dans le MÊME appel que la disposition', async () => {
    const page = await poser(catalogue(), DEFAUT);
    page.querySelector<HTMLButtonElement>('button.v2-btn')!.click();
    flushSync();
    page.querySelectorAll<HTMLButtonElement>('button.retirer')[0].click();
    await souffler(60);
    const ecriture = ecritures.find((e) => 'accueil_temoin' in e);
    expect(ecriture, 'aucune écriture de disposition').toBeTruthy();
    expect(ecriture!.home_l1_migre, 'disposition écrite sans marqueur : la migration la rejouera').toBe(true);
  });

  it('la migration d’un ancien accueil rangé SANS la ligne, elle, a toujours lieu', () => {
    // La contre-partie : le marqueur ne doit pas désarmer la migration de #1519.
    const m = migrationPremiereLigne(['temoin'], undefined, ['premiere-ligne', 'temoin']);
    expect(m.aMigrer).toBe(true);
    expect(m.disposition[0]).toBe('premiere-ligne');
    // Et un enregistrement fait avec le marqueur n'est plus migré.
    expect(migrationPremiereLigne(['temoin'], true, ['premiere-ligne', 'temoin']).aMigrer).toBe(false);
  });

  it('un écran dont le défaut n’a pas la ligne (Qobuz, Tidal) n’écrit pas le marqueur', () => {
    expect(marqueurAEnregistrer('k', ['a', 'b'])).toEqual({});
    expect(marqueurAEnregistrer('k', ['premiere-ligne'])).toEqual({ k: true });
  });
});

describe('#2410 — l’envoi d’un rapport de bogue ne fait pas revenir les widgets retirés', () => {
  // Alex (rc8) : « Genres » et « My playlists » retirés, ils reviennent APRÈS
  // l'envoi d'un rapport. Pendant que le serveur compose les diagnostics, une
  // relecture des préférences échoue ; une écriture qui passe à ce moment-là
  // remplaçait tout l'objet par son seul correctif.
  const catalogue = () => [
    bande('temoin', 'v2.home.wStats'),
    bande('genres', 'v2.home.wFirstRow'),
    bande('mes-playlists', 'v2.home.wFavorites'),
  ];
  const DEFAUT = ['temoin', 'genres', 'mes-playlists'];

  async function retirerGenresEtPlaylists() {
    const page = await poser(catalogue(), DEFAUT);
    page.querySelector<HTMLButtonElement>('button.v2-btn')!.click();
    flushSync();
    // Deux retraits, comme Alex : « Genres » puis « My playlists ».
    page.querySelectorAll<HTMLButtonElement>('button.retirer')[1].click();
    await souffler(60);
    flushSync();
    page.querySelectorAll<HTMLButtonElement>('button.retirer')[1].click();
    await souffler(60);
    flushSync();
    expect(prefs.accueil_temoin, 'prémisse : les deux retraits sont enregistrés').toEqual(['temoin']);
  }

  it('🔴 retirer deux widgets, envoyer un rapport (lecture en panne, autre écriture) : l’accueil ne change pas', async () => {
    await retirerGenresEtPlaylists();

    // L'envoi du rapport : le serveur est occupé, la relecture des préférences
    // échoue, et une autre écriture de préférence passe pendant ce temps.
    lectureEnPanne = true;
    const rapport = api.submitBugReport('Le bouton ne répond pas');
    const autre = api.setProfilePreferences(1, { ecouter_plus_tard: 7 }).then(() => 'ecrit', () => 'refuse');
    await rapport;
    expect(await autre, 'une lecture ratée a laissé passer une écriture qui remplace tout').toBe('refuse');
    lectureEnPanne = false;

    expect(prefs.accueil_temoin, 'la disposition enregistrée a été écrasée').toEqual(['temoin']);

    await demonter();
    const apres = await poser(catalogue(), DEFAUT);
    await souffler(100);
    flushSync();
    const texte = apres.textContent ?? '';
    expect(texte, 'prémisse : le widget gardé est là').toContain('contenu de temoin');
    expect(texte, '« Genres » est revenu').not.toContain('contenu de genres');
    expect(texte, '« My playlists » est revenu').not.toContain('contenu de mes-playlists');
  });

  it('🔴 la liste ET l’ordre des widgets sont identiques avant et après l’envoi d’un rapport', async () => {
    // Alex : le rapport remet TOUS les widgets, leur ordre et leur position à
    // la mise en page par défaut — une réinitialisation complète. Un accueil
    // réarrangé (ordre ≠ défaut, un widget retiré) est enregistré d'avance.
    prefs = { accueil_temoin: ['mes-playlists', 'temoin'], autre_reglage: 'garde' };
    const ordre = (h: HTMLElement) =>
      ['contenu de mes-playlists', 'contenu de temoin', 'contenu de genres']
        .map((m) => ({ m, i: (h.textContent ?? '').indexOf(m) }))
        .filter((x) => x.i >= 0)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.m);

    const avant = await poser(catalogue(), DEFAUT);
    const ordreAvant = ordre(avant);
    expect(ordreAvant, 'prémisse : l’accueil réarrangé s’affiche').toEqual([
      'contenu de mes-playlists', 'contenu de temoin',
    ]);
    const enregistreAvant = [...prefs.accueil_temoin];

    // Envoi du rapport : diagnostics en cours, relecture des préférences en
    // panne, deux écritures de préférences qui passent pendant ce temps.
    lectureEnPanne = true;
    const rapport = api.submitBugReport('Le bouton ne répond pas');
    const ecritures2 = [
      api.setProfilePreferences(1, { ecouter_plus_tard: 7 }).then(() => 'ecrit', () => 'refuse'),
      api.setProfilePreferences(1, { theme: 'x' }).then(() => 'ecrit', () => 'refuse'),
    ];
    await rapport;
    expect(await Promise.all(ecritures2)).toEqual(['refuse', 'refuse']);
    lectureEnPanne = false;

    expect(prefs.accueil_temoin, 'la disposition enregistrée a changé').toEqual(enregistreAvant);
    expect(prefs.autre_reglage, 'un autre réglage du profil a été effacé').toBe('garde');

    await demonter();
    const apres = await poser(catalogue(), DEFAUT);
    await souffler(100);
    flushSync();
    expect(ordre(apres), 'la liste ou l’ordre des widgets a changé après l’envoi du rapport').toEqual(ordreAvant);
  });

  it('🔴 deux écritures qui se croisent gardent chacune leur clé', async () => {
    await retirerGenresEtPlaylists();
    delaiDeLecture = 30;
    await Promise.all([
      api.setProfilePreferences(1, { cle_a: 1 }),
      api.setProfilePreferences(1, { cle_b: 2 }),
    ]);
    expect(prefs.cle_a, 'la première écriture a été remplacée par la seconde').toBe(1);
    expect(prefs.cle_b).toBe(2);
    expect(prefs.accueil_temoin).toEqual(['temoin']);
  });
});

describe('#2411 — le motif d’un widget en échec se traduit ou se tait', () => {
  const echec = (message: string) => ({
    id: 'fav',
    cleTitre: 'v2.svc.wFavAlbums',
    forme: 'bande' as const,
    charger: async () => { throw new Error(message); },
  });

  it('🔴 « delai » n’est jamais affiché brut : la phrase est traduite', async () => {
    const page = await poser([echec('delai')], ['fav']);
    const texte = page.querySelector('[data-widget-echec]')?.textContent?.trim() ?? '';
    expect(texte, 'le widget en échec doit dire pourquoi').toContain('This widget could not be loaded.');
    expect(texte, `le code interne s’affiche brut : « ${texte} »`).not.toMatch(/\bdelai\b/);
    expect(texte).toBe('This widget could not be loaded. (no response in time)');
  });

  it('en français, la phrase est dans la langue de l’interface', async () => {
    locale.set('fr');
    const page = await poser([echec('delai')], ['fav']);
    expect(page.querySelector('[data-widget-echec]')?.textContent?.trim())
      .toBe('Ce widget n’a pas pu être chargé. (délai dépassé)');
  });

  it('un motif technique inconnu n’est pas montré (il reste au journal)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = await poser([echec('502 Bad Gateway: qobuz login: 401 {"x":1}')], ['fav']);
    const texte = page.querySelector('[data-widget-echec]')?.textContent?.trim() ?? '';
    expect(texte).toBe('This widget could not be loaded.');
  });
});
