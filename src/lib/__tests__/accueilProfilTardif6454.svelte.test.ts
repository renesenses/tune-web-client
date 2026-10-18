// @vitest-environment jsdom
//
// tune-server-rust#6454 (Jean Valjean, fil 2304) — en rc6, l'Accueil reste sur
// « Chargement… » dans tous ses widgets au démarrage, jusqu'à ce qu'on change
// d'onglet ; absent en rc4.
//
// ## LA CAUSE, MESURÉE
//
// Rejouée sur Shrek avec les archives officielles rc4 et rc6 et un Chromium
// sans aucun stockage (premier lancement, ou navigateur qui efface les données
// à la fermeture) : en rc6, les 7 widgets restent sur « Chargement… » 20 s
// plus tard et `GET /profiles/1/preferences` ne part jamais. En rc4, tout se
// charge. Une trace posée dans `charger()` montre :
//
//     reprise pid= 1  →  charger  $currentProfileId = null, get() = 1
//
// `charger()` lisait `$currentProfileId`, la copie que Svelte tient du magasin
// par SA propre souscription. Sur l'accueil, cette souscription naît tard :
// `profil` (le salut) ne lit le magasin que dans le `find` de `$profiles`,
// donc seulement une fois la liste des profils arrivée — APRÈS la reprise de
// `onMount`. Quand le profil est enfin désigné, la reprise est appelée la
// première, avant que la copie de Svelte soit à jour : `charger()` y lit
// encore `null`, renonce, et plus rien ne la rappelle.
//
// Pourquoi rc6 : depuis #5916 (`profilRetenuParLeServeur`), `loadProfiles()`
// ATTEND `/profiles/dernier-choisi` entre `profiles.set(liste)` et
// `currentProfileId.set(id)`. En rc4, les deux se suivaient dans le même tour :
// la souscription de Svelte n'avait pas encore eu le temps de naître, et la
// première lecture, faite dans `charger()`, voyait la bonne valeur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId, profiles } from '../stores/profile';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
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

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

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

describe('#6454 — l’accueil SALUÉ, profil désigné après la liste des profils', () => {
  it('🔴 les widgets se chargent quand le profil arrive après un aller-retour', async () => {
    // Premier lancement : rien de retenu, aucune liste encore.
    profiles.set([]);
    currentProfileId.set(null);

    const { appels, widget } = widgetCompteur();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: { catalogue: [widget], dispositionDefaut: ['temoin'], cle: 'temoin_widgets', salut: true },
    });
    flushSync();
    await souffler(80);
    flushSync();
    expect(appels.length, 'un widget est parti SANS profil : le décor ne vaut rien').toBe(0);

    // `loadProfiles()` en rc6 : la liste arrive…
    profiles.set([{ id: 1, name: 'default', display_name: 'Default' } as any]);
    flushSync();
    await souffler(40);
    flushSync();
    // … puis, APRÈS l'aller-retour `/profiles/dernier-choisi`, le profil.
    currentProfileId.set(1);
    await souffler(120);
    flushSync();

    expect(appels.length, 'le profil est arrivé et rien ne s’est chargé : « Chargement… » à vie (#6454)').toBe(1);
    expect(hote.textContent ?? '').toContain('Enfin la');
  });
});
