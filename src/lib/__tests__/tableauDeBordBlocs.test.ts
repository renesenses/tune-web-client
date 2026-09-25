// @vitest-environment jsdom
//
// LE NOUVEL ÉCRAN TABLEAU DE BORD — Bertrand, 25/09/2026.
//
// Deux choses à prouver, et ce témoin ne lit pas le source pour les prouver :
// il monte la VRAIE `PageWidgets` avec le VRAI catalogue de blocs, et regarde
// ce qui arrive dans le DOM et ce qui part vers le serveur.
//
//   1. un widget `forme: 'bloc'` rend bien SON PROPRE contenu — pas une bande,
//      pas « (vide) », pas « Chargement… » ;
//   2. la disposition de cet écran se range PAR PROFIL, sous SA clé, comme
//      partout ailleurs — et ne se confond pas avec celle de l'accueil.
//
// ⚠️ Le point 1 vaut surtout par ce qu'il attrape : la branche `bloc` du
// balisage devait être posée AVANT le repli « (vide) », qui teste
// `et.elements` — qu'un bloc ne remplit jamais. Placée après, les onze blocs
// auraient tous affiché « (vide) », et l'écran aurait eu l'air de marcher.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import * as api from '../api';
import { currentProfileId } from '../stores/profile';
import {
  BLOCS_TABLEAU_DE_BORD,
  DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
  PETIT,
  MOYEN,
  GRAND,
} from '../tableauDeBordWidgets';

const CLE = 'tableau_de_bord_widgets';
const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Une réponse de `/library/history/dashboard` qui porte les onze matières. */
function reponse(extra: Record<string, unknown> = {}) {
  const jour = (i: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return {
    period: '7d',
    range: { from: null, to: '' },
    totals: { plays: 1266, listening_ms: 3_600_000 * 96, unique_tracks: 42, unique_artists: 17 },
    top_artists: [],
    top_albums: [{ album_title: 'Abbey Road', artist_name: 'The Beatles', cover_path: '/a.jpg', plays: 9, album_id: 12 }],
    top_tracks: [{ track_id: 3, title: 'Come Together', artist_name: 'The Beatles', plays: 7, listening_ms: 1 }],
    trend: [{ day: jour(0), plays: 40, listening_ms: 1 }, { day: jour(2), plays: 11, listening_ms: 1 }],
    hourly: [{ hour: 21, plays: 30 }, { hour: 9, plays: 4 }],
    weekday_hourly: [{ weekday: 3, hour: 21, plays: 12 }],
    by_zone: [{ zone_id: 1, zone_name: 'Salon', plays: 80, listening_ms: 1 }],
    by_source: [{ source: 'qobuz', plays: 51, listening_ms: 1 }],
    by_genre: [{ genre: 'Jazz', plays: 33, listening_ms: 1 }],
    streak: { current: 7, best: 19, last_day: null },
    on_this_day: [{ track_title: 'Gymnopédie', artist_name: 'Satie', album_title: null, cover_path: null, played_at: null, year: 2019 }],
    completion: { completed: 75, skipped: 25, avg_listened_ms: 0, avg_track_duration_ms: 0 },
    ...extra,
  } as any;
}

let prefs: Record<string, unknown> = {};
let ecritures: { pid: number; corps: Record<string, unknown> }[] = [];

beforeEach(() => {
  vi.restoreAllMocks();
  prefs = {};
  ecritures = [];
  currentProfileId.set(1);
  vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
  vi.spyOn(api, 'getGenreTree').mockResolvedValue({ tree: { Jazz: ['Bebop'] } } as any);
  vi.spyOn(api, 'getProfilePreferences').mockImplementation(async () => prefs as any);
  vi.spyOn(api, 'setProfilePreferences').mockImplementation(async (pid: any, corps: any) => {
    ecritures.push({ pid, corps });
    Object.assign(prefs, corps);
    return corps;
  });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
});

const souffler = (ms = 90) => new Promise((r) => setTimeout(r, ms));

/**
 * 🔴 Le premier montage paie la COMPILATION de `PageWidgets` et de tout son
 * arbre d'imports — mesuré à ~12 s sur ce Mac — et vitest la compte dans le
 * test. Les 5 s par défaut ne la couvrent pas quand ce fichier est le premier
 * du run à monter la page ; le même témoin passe ensuite en 200 ms parce que
 * le module est en cache. Un délai généreux, donc, sur les seuls cas qui
 * montent : ils mesurent un rendu, pas une durée.
 */
const MONTAGE = 40_000;
vi.setConfig({ testTimeout: MONTAGE, hookTimeout: MONTAGE });

async function poserLEcran() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: BLOCS_TABLEAU_DE_BORD,
      dispositionDefaut: DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
      cle: CLE,
      cleChiffres: 'tableau_de_bord_stats',
      cleChiffresMigre: 'tableau_de_bord_stats_migre',
      cleTitre: 'dashboard.title',
    },
  });
  flushSync();
  await souffler(140);
  flushSync();
  return hote!;
}

describe('le catalogue des blocs', () => {
  it('onze blocs, chacun avec son composant et une hauteur déclarée', () => {
    expect(BLOCS_TABLEAU_DE_BORD).toHaveLength(11);
    for (const w of BLOCS_TABLEAU_DE_BORD) {
      expect(w.forme, `${w.id} n’est pas un bloc`).toBe('bloc');
      expect(w.bloc, `${w.id} ne porte pas de contrat de bloc`).toBeTruthy();
      expect(typeof w.bloc!.composant, `${w.id} ne déclare aucun composant`).toBe('function');
      expect(typeof w.bloc!.donnees, `${w.id} ne déclare aucun chargeur`).toBe('function');
      expect(w.bloc!.hauteur, `${w.id} ne déclare pas de hauteur`).toBeGreaterThan(0);
    }
  });

  it('🔴 les hauteurs tombent sur le MODULE et ses multiples, pas sur onze valeurs de circonstance', () => {
    // La règle de Bertrand du 02/09 — refuser « l'air d'un assemblage de
    // morceaux » — ne vit plus dans la forme unique des widgets : elle doit
    // vivre dans l'échelle des hauteurs. Sans cette garde, le premier bloc
    // ajouté à la va-vite rétablirait l'empilement.
    const permises = [PETIT, MOYEN, GRAND];
    for (const w of BLOCS_TABLEAU_DE_BORD) {
      expect(permises, `${w.id} invente la hauteur ${w.bloc!.hauteur}`).toContain(w.bloc!.hauteur);
    }
  });

  it('les onze titres sont des CLÉS, traduites dans les onze langues', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const lg of LANGUES) {
      const src = readFileSync(resolve(__dirname, `../locales/${lg}.ts`), 'utf8');
      for (const w of BLOCS_TABLEAU_DE_BORD) {
        expect(src.includes(`"${w.cleTitre}"`) || src.includes(`'${w.cleTitre}'`),
          `${w.cleTitre} absente de ${lg}`).toBe(true);
      }
    }
  });

  it('🔴 les onze blocs tiennent en UNE seule requête au tableau de bord', async () => {
    // La route coûte ~300 ms par entrée de classement et ne met rien en
    // cache. Onze appels simultanés feraient tomber l'écran entier sur le
    // chien de garde de 8 s — le « (délai) » de #871.
    const dash = vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
    await Promise.all(BLOCS_TABLEAU_DE_BORD.map((w) => w.bloc!.donnees({ langue: 'fr' } as any)));
    expect(dash).toHaveBeenCalledTimes(1);
    expect(dash.mock.calls[0][0], 'trente jours dépassent le budget mesuré').toBe('7d');
  });
});

describe('🔴 un BLOC rend son contenu propre sur le nouvel écran', () => {
  it('la série affiche ses deux nombres, et non « (vide) »', async () => {
    const page = await poserLEcran();
    const texte = page.textContent ?? '';

    // Le contenu PROPRE du bloc : `BlocSerie` rend la série courante et le
    // record. Aucune bande ne saurait les produire.
    expect(texte, 'le bloc « série » n’a pas rendu sa série courante').toContain('7');
    expect(texte, 'le bloc « série » n’a pas rendu le record').toContain('19');

    // 🔴 L'assertion qui attrape l'ordre des branches du balisage. Un bloc
    // rangé APRÈS le repli `!et.elements.length` afficherait « (vide) » :
    // l'écran aurait l'air de marcher, et ne montrerait rien.
    expect(page.querySelectorAll('.blocpropre').length,
      'aucun bloc n’a été rendu : la branche `bloc` du balisage est-elle bien AVANT le repli « (vide) » ?')
      .toBe(11);
  });

  it('chaque bloc RÉSERVE la hauteur qu’il a déclarée', async () => {
    const page = await poserLEcran();
    const rendus = [...page.querySelectorAll('.blocpropre')] as HTMLElement[];
    expect(rendus).toHaveLength(11);
    rendus.forEach((el, i) => {
      const attendue = BLOCS_TABLEAU_DE_BORD[i].bloc!.hauteur;
      expect(el.style.minHeight, `le bloc ${BLOCS_TABLEAU_DE_BORD[i].id} ne réserve pas sa hauteur`)
        .toBe(`${attendue}px`);
    });
  });

  it('les autres blocs rendent aussi leur propre matière', async () => {
    const page = await poserLEcran();
    const texte = page.textContent ?? '';
    expect(texte, 'la zone du bloc « par zone » manque').toContain('Salon');
    expect(texte, 'la source du bloc « par source » manque').toContain('qobuz');
    expect(texte, 'le genre regroupé par branche manque').toContain('Jazz');
    expect(texte, 'le classement d’albums manque').toContain('Abbey Road');
    expect(texte, 'le classement de titres manque').toContain('Come Together');
    expect(texte, 'l’année de « ce jour-là » manque').toContain('2019');
    expect(texte, 'le taux de complétion manque').toContain('75%');
    // L'heure de pointe : 21 h porte 30 lectures, 9 h en porte 4.
    expect(texte, 'l’heure de pointe manque').toContain('21h');
  });
});

describe('🔴 la disposition se range PAR PROFIL, sous la clé de CET écran', () => {
  it('une disposition enregistrée sous la clé de l’écran est restituée', async () => {
    prefs = { [CLE]: ['tdb-serie'] };
    const page = await poserLEcran();
    expect(page.querySelectorAll('.blocpropre').length,
      'la disposition rangée pour ce profil n’a pas été relue').toBe(1);
    expect(page.textContent ?? '').toContain('19');
  });

  it('🔴 la clé de l’ACCUEIL est ignorée : composer l’un ne défait pas l’autre', async () => {
    // C'est la raison d'être du paramètre `cle` depuis le premier jour. Sans
    // clé propre, ouvrir le tableau de bord réécrirait la page d'accueil.
    prefs = { home_widgets: ['tdb-serie'] };
    const page = await poserLEcran();
    expect(page.querySelectorAll('.blocpropre').length,
      'l’écran a suivi la disposition de l’ACCUEIL').toBe(11);
  });

  it('retirer un bloc l’ENREGISTRE pour ce profil, sous cette clé', async () => {
    const page = await poserLEcran();

    // Le geste réel de l'utilisateur : « Modifier », puis la croix du premier
    // bloc. On ne simule pas l'appel, on clique.
    const boutons = [...page.querySelectorAll('button')] as HTMLButtonElement[];
    const modifier = boutons.find((b) => /modifier/i.test(b.textContent ?? ''));
    expect(modifier, 'le bouton « Modifier » est introuvable').toBeTruthy();
    modifier!.click();
    flushSync();

    const croix = page.querySelector('.retirer') as HTMLButtonElement | null;
    expect(croix, 'la croix de retrait n’apparaît pas en mode édition').toBeTruthy();
    croix!.click();
    flushSync();
    await souffler(60);

    expect(ecritures.length, 'rien n’a été enregistré').toBeGreaterThan(0);
    const derniere = ecritures[ecritures.length - 1];
    expect(derniere.pid, 'la disposition n’est pas rangée pour CE profil').toBe(1);
    expect(Object.keys(derniere.corps), 'la disposition n’est pas rangée sous la clé de cet écran')
      .toContain(CLE);
    const rangee = derniere.corps[CLE] as string[];
    expect(rangee, 'le bloc retiré est toujours dans la disposition enregistrée')
      .not.toContain(DISPOSITION_DEFAUT_TABLEAU_DE_BORD[0]);
    expect(rangee).toHaveLength(10);
    // Et surtout : la clé de l'accueil n'est pas touchée.
    expect(Object.keys(derniere.corps)).not.toContain('home_widgets');
  });
});
