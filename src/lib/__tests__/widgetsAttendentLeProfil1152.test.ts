// @vitest-environment jsdom
//
// #1152 — « Accueil : les widgets ne chargent qu'après plusieurs
// rafraîchissements » (Belkadi Yacine, fil 1785 / ticket support 119,
// 14/09/2026 12 h 13, 0.9.14x Linux — récurrence de web#871).
//
// ## LA COURSE, LUE DANS LE CODE
//
// `charger()` commence par lire `$currentProfileId` et RENONÇAIT quand il
// valait `null` :
//
//     const pid = $currentProfileId;
//     if (pid == null) { charge = true; return; }   // et plus rien, jamais
//
// Or ce magasin part de ce que le navigateur avait retenu (`loadProfileId()`)
// et `loadProfiles()` ne le renseigne qu'APRÈS un aller-retour réseau. Sur un
// premier usage, un stockage vidé, une navigation privée, un profil supprimé —
// ou simplement un serveur lent — l'accueil se montait avant de savoir qui
// écoute. `charge` passait alors à `true`, la page se dessinait, et chaque
// bande restait sur « Chargement… ».
//
// 🔴 ET RIEN NE POUVAIT LA RELEVER. Le fichier interdit tout `$effect` qui
// appellerait `chargerWidget` (cycle de dépendances, 02/09/2026), le bouton
// « Réessayer » n'existe qu'en phase `echec` — jamais en phase `attente` — et
// `chargerTout()` n'était appelé que par `charger()`. Le seul geste restant
// était F5. Il finissait par marcher parce que
// `currentProfileId.subscribe(saveProfileId)` avait entre-temps persisté
// l'identifiant : au tour suivant, il était là dès la première ligne. D'où le
// titre du ticket, mot pour mot.
//
// ## CE QUE CE TÉMOIN NE PRÉTEND PAS RÉGLER
//
// ⚠️ Le dossier du fil 1785 documente AUSSI trois widgets tombés en
// « (delai) » — le verdict du délai de 8 s posé dans ce composant. Cette
// moitié-là n'est PAS traitée ici et reste entière : aucune durée de requête
// n'a jamais été mesurée côté serveur, c'est la mesure que web#871 réclamait
// déjà, et elle manque toujours. Allonger le délai au jugé serait une
// supposition. Ce témoin tient l'autre moitié — celle qui porte le titre du
// ticket, et qui se démontre.
//
// ## LA MESURE
//
// Il ne lit pas le source : une garde de texte serait satisfaite par une
// souscription posée n'importe où, et par la DÉFINITION même de la fonction.
// Il monte la vraie page SANS profil connu — l'état exact d'un premier
// chargement — puis fait arriver le profil, comme `loadProfiles()` le fait, et
// compte les appels réellement passés au catalogue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Les préférences du profil : aucune disposition rangée, on prend le défaut. */
function poserLeServeur() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
}

beforeEach(() => {
  poserLeServeur();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  currentProfileId.set(1);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Un widget de témoin : il compte ce qu'on lui demande, et répond. */
function widgetCompteur() {
  const appels: number[] = [];
  return {
    appels,
    widget: {
      id: 'temoin',
      cleTitre: 'v2.home.title',
      forme: 'bande' as const,
      charger: async () => {
        appels.push(appels.length + 1);
        return [{ id: 'a1', titre: 'Enfin la', sousTitre: '' }];
      },
    },
  };
}

async function poserLaPage(widget: any) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widget], dispositionDefaut: ['temoin'], cle: 'temoin_widgets' },
  });
  flushSync();
  await souffler(80);
  flushSync();
  return hote;
}

describe('#1152 — l’accueil monté AVANT que le profil soit connu', () => {
  it('🔴 le widget se charge dès que le profil arrive, sans rafraîchir la page', async () => {
    // L'état d'un premier chargement : le navigateur n'a rien retenu, et
    // `loadProfiles()` n'a pas encore répondu.
    currentProfileId.set(null);

    const { appels, widget } = widgetCompteur();
    const page = await poserLaPage(widget);

    // La prémisse du ticket, mesurée : sans profil, rien n'est demandé, et la
    // bande reste sur « Chargement… ». Si cette attente-là échouait, le témoin
    // ne mesurerait plus la course qu'il prétend mesurer.
    expect(appels.length, 'un widget a été chargé SANS profil : le décor ne vaut rien').toBe(0);
    expect(page.querySelector('.state'), 'la page ne dit rien pendant l’attente').not.toBeNull();

    // LE GESTE : `loadProfiles()` répond et désigne le profil actif.
    currentProfileId.set(1);
    await souffler(120);
    flushSync();

    expect(
      appels.length,
      'le profil est arrivé et RIEN ne s’est chargé : la page reste sur « Chargement… » ' +
      'jusqu’à ce que l’utilisateur rafraîchisse — c’est #1152',
    ).toBe(1);

    // Et l'écran le montre : plus de « Chargement… », le contenu est là.
    expect(page.textContent ?? '').toContain('Enfin la');
  });

  it('un profil DÉJÀ connu charge au montage, et une seule fois', async () => {
    // La contre-partie, et elle compte : la reprise ne doit pas ajouter un
    // second départ au cas ordinaire — ce serait le « chargement x4 » que le
    // registre `demandes` existe pour empêcher (02/09/2026).
    currentProfileId.set(1);

    const { appels, widget } = widgetCompteur();
    const page = await poserLaPage(widget);

    expect(appels.length, 'le cas ordinaire ne charge plus au montage').toBe(1);
    expect(page.textContent ?? '').toContain('Enfin la');

    // Et un changement de profil ne relance pas la page dans son dos.
    currentProfileId.set(2);
    await souffler(120);
    flushSync();
    expect(appels.length, 'la reprise repart à chaque changement de profil').toBe(1);
  });
});
