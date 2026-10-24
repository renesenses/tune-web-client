// @vitest-environment jsdom
//
// tune-server-rust#6454, cas restant (Jean Valjean, fil 2304, rc4 comme rc6) :
// un `GET /profiles` en échec à l'ouverture de Tune n'était jamais réessayé.
// `loadProfiles()` ne faisait qu'un `console.error`, `bootstrapV2()` ne passe
// qu'une fois : sans profil retenu dans le navigateur, l'Accueil restait sur
// « Chargement… » jusqu'au rechargement de la page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId, profiles } from '../stores/profile';
import {
  chargerLesProfilsAvecReprise, delaiApresEchec, etatDesProfils, reessayerLesProfils,
  ECHECS_AVANT_MESSAGE, PLAFOND_DELAI_MS, PREMIER_DELAI_MS,
} from '../repriseDesProfils';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps, text: async () => JSON.stringify(corps),
} as unknown as Response);

/** `/profiles` tombe `echecs` fois, puis répond un profil. */
function serveur(echecs: number) {
  const appels = { profiles: 0 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (/\/profiles$/.test(u)) {
      appels.profiles += 1;
      if (appels.profiles <= echecs) throw new TypeError('NetworkError when attempting to fetch resource.');
      return reponse([{ id: 1, name: 'default', display_name: 'Default' }]);
    }
    if (u.endsWith('/profiles/dernier-choisi')) return reponse({ profile_id: 1 });
    return reponse({});
  }));
  return appels;
}

function widgetCompteur() {
  const appels: number[] = [];
  return {
    appels,
    widget: {
      id: 'temoin', cleTitre: 'v2.home.title', forme: 'bande' as const,
      charger: async () => {
        appels.push(appels.length + 1);
        return [{ id: 'a1', titre: 'Enfin la', sousTitre: '' }];
      },
    },
  };
}

function monterAccueil() {
  const { appels, widget } = widgetCompteur();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widget], dispositionDefaut: ['temoin'], cle: 'temoin_widgets', salut: true },
  });
  flushSync();
  return appels;
}

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  profiles.set([]);
  currentProfileId.set(null);
  etatDesProfils.set('jamais');
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  profiles.set([]);
  currentProfileId.set(1);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#6454 — un /profiles en échec est réessayé', () => {
  it('🔴 un premier échec suivi d’un succès débloque l’accueil', async () => {
    const serveurAppels = serveur(1);
    const appels = monterAccueil();

    const { premier, fin } = chargerLesProfilsAvecReprise({ premierDelaiMs: 20 });
    expect(await premier, 'le premier essai devait échouer (banc)').toBe(false);
    expect(appels.length, 'aucun widget sans profil').toBe(0);

    await Promise.race([fin, souffler(1_000)]);
    await souffler(120);
    flushSync();

    expect(serveurAppels.profiles, '/profiles n’a pas été redemandé après l’échec').toBe(2);
    expect(get(currentProfileId), 'le profil n’a jamais été désigné : « Chargement… » à vie (#6454)').toBe(1);
    expect(get(etatDesProfils)).toBe('charges');
    expect(appels.length, 'le profil est arrivé et le widget ne s’est pas chargé').toBe(1);
    expect(hote!.textContent ?? '').toContain('Enfin la');
  });

  it('un échec qui dure se dit, et « Réessayer maintenant » relance sans attendre', async () => {
    const serveurAppels = serveur(ECHECS_AVANT_MESSAGE);
    monterAccueil();
    // Délai de 10 s : seuls les réveils provoquent l'essai suivant à temps.
    const { fin } = chargerLesProfilsAvecReprise({ premierDelaiMs: 10_000 });
    for (let i = 0; i < 100 && get(etatDesProfils) !== 'echec'; i++) {
      await souffler(10);
      if (get(etatDesProfils) !== 'echec') reessayerLesProfils();
    }
    await souffler(20);
    flushSync();

    expect(get(etatDesProfils)).toBe('echec');
    expect(serveurAppels.profiles).toBe(ECHECS_AVANT_MESSAGE);
    const alerte = hote!.querySelector('[data-temoin="profils-echec"]');
    expect(alerte, 'l’échec durable reste muet : « Chargement… » sans fin').not.toBeNull();
    expect(alerte!.textContent).toContain('serveur');

    // Sans ce clic, l'essai suivant attendrait 40 s.
    (alerte!.querySelector('button') as HTMLButtonElement).click();
    await Promise.race([fin, souffler(1_000)]);
    await souffler(60);
    flushSync();
    expect(serveurAppels.profiles).toBe(ECHECS_AVANT_MESSAGE + 1);
    expect(hote!.querySelector('[data-temoin="profils-echec"]')).toBeNull();
  });

  it('le délai double, puis plafonne', () => {
    expect(delaiApresEchec(1)).toBe(PREMIER_DELAI_MS);
    expect(delaiApresEchec(2)).toBe(2 * PREMIER_DELAI_MS);
    expect(delaiApresEchec(3)).toBe(4 * PREMIER_DELAI_MS);
    expect(delaiApresEchec(50)).toBe(PLAFOND_DELAI_MS);
  });
});
