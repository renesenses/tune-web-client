// @vitest-environment jsdom
//
// « Accueil : les widgets ne chargent qu'après plusieurs rafraîchissements »
// — renesenses/tune-web-client#1152 (Belkadi Yacine, fil 1785, 0.9.149 Linux,
// 50 093 pistes).
//
// ## CE QUE L'INSTRUCTION AVAIT DÉJÀ ÉTABLI, ET CE QUI RESTAIT
//
// Sa capture du 14/09/2026 à 12 h 13 montre trois widgets sur trois tombés
// avec le MÊME motif : « Ce widget n'a pas pu être chargé. (delai) ».
// `(delai)` n'est pas un message du serveur : c'est le verdict du
// `Promise.race` de `PageWidgets`, huit secondes. L'instruction s'arrête là —
// « reste ouvert : *où* les 8 s sont passées ».
//
// La moitié « profil » du ticket est livrée (a11665cb, PR #1387) : les widgets
// partent dès que le profil est connu. Ce témoin tient l'autre moitié.
//
// ## OÙ LES HUIT SECONDES PASSAIENT
//
// `chargerTout` lançait les widgets D'UN SEUL COUP, et chaque `chargerWidget`
// armait son compte à rebours AU MOMENT DE L'APPEL. Un navigateur n'ouvre
// pourtant que SIX connexions par origine en HTTP/1.1 : passé la sixième
// requête de la page — `DISPOSITION_DEFAUT` en compte six à elle seule, avant
// la ligne de chiffres et les appels de la coquille — les suivantes attendent
// un socket, leur budget s'écoulant PENDANT l'attente.
//
// C'est le seul mécanisme connu qui rende compte de la forme exacte de la
// capture : TROIS routes sans rapport tombant ENSEMBLE, dont deux lectures
// SQLite locales (`/library/albums/recent`, `/library/stats`). Une lenteur de
// route ne les fait pas tomber toutes les trois ; une file d'attente commune,
// si. Et « plusieurs rafraîchissements » suit : au tour suivant les réponses
// sont en cache, la file se vide, tout passe sous les huit secondes.
//
// ## CE QUE CE TÉMOIN MESURE — ET CE QU'IL NE PRÉTEND PAS MESURER
//
// ⚠️ Il ne prétend PAS que c'est ce qui est arrivé à Yacine : aucune durée de
// requête n'a jamais été relevée sur sa machine, et l'instruction le dit. Il
// tient le défaut qui se DÉMONTRE sans son journal — un compte à rebours qui
// court pendant qu'on attend son tour — et il le tient sur l'écran réel.
//
// 🔴 LE PLAFOND DU NAVIGATEUR EST MODÉLISÉ DANS LE TÉMOIN. jsdom n'a pas de
// pile réseau : la contrainte qui fait le défaut n'existe pas ici. On la pose
// donc explicitement — un serveur qui ne sert que TROIS demandes à la fois,
// cinq secondes chacune — et on regarde ce que l'écran devient. C'est la seule
// façon honnête de tenir ce cas en test.
//
// Noter ce que le correctif NE fait pas : avec un plafond égal à celui du
// navigateur, le dernier widget arrive au MÊME instant qu'avant (t = 15 s).
// Rien n'est accéléré. Ce qui change, c'est que chacun mesure le serveur au
// lieu de mesurer l'embouteillage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { creneauxParalleles } from '../creneauxParalleles';
import { currentProfileId } from '../stores/profile';
import { locale } from '../i18n';

// ───────────────────────────────────────────────────────────────────────────
// 1 · La brique, seule. Rapide, sans horloge truquée.
// ───────────────────────────────────────────────────────────────────────────
describe('creneauxParalleles — jamais plus de N tâches en vol', () => {
  it('borne le nombre de tâches simultanées et garde l’ordre de mise en file', async () => {
    const poser = creneauxParalleles(3);
    let enVol = 0;
    let maxEnVol = 0;
    const ordre: number[] = [];
    const libere: Array<() => void> = [];

    const promesses = Array.from({ length: 9 }, (_, i) =>
      poser(() => {
        enVol++;
        maxEnVol = Math.max(maxEnVol, enVol);
        ordre.push(i);
        return new Promise<number>((r) => libere.push(() => { enVol--; r(i); }));
      }),
    );

    // Rien ne s'est résolu : seules les trois premières ont pu PARTIR.
    await Promise.resolve();
    expect(ordre, 'plus de trois tâches sont parties d’un coup').toEqual([0, 1, 2]);

    // On libère une par une : chaque créneau rendu fait partir la SUIVANTE,
    // dans l'ordre de la disposition — un widget posé en haut de page ne doit
    // pas se charger en dernier.
    while (libere.length) {
      libere.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(promesses);

    expect(maxEnVol, 'le plafond de parallélisme n’est pas tenu').toBeLessThanOrEqual(3);
    expect(ordre).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('🔴 rend le créneau MÊME quand la tâche échoue — sinon la page s’assèche', async () => {
    // Le seul vrai piège de cette forme : un créneau oublié sur le chemin
    // d'erreur condamne la file pour la vie de la page, et le symptôme serait
    // celui qu'on corrige, en pire — plus rien ne charge, jamais. Or l'échec
    // est le cas ORDINAIRE ici : c'est `(delai)` qui rejette.
    const poser = creneauxParalleles(1);
    await expect(poser(() => Promise.reject(new Error('delai')))).rejects.toThrow('delai');
    // Une tâche qui jette AVANT de rendre sa promesse compte aussi.
    await expect(poser(() => { throw new Error('boum'); })).rejects.toThrow('boum');
    await expect(poser(() => Promise.resolve('servi'))).resolves.toBe('servi');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · L'écran réel, contre un serveur étranglé.
// ───────────────────────────────────────────────────────────────────────────

/** Le serveur de Yacine, modélisé : sain, mais servi par tranches. */
function serveurEtrangle(pool: number, serviceMs: number) {
  let enVol = 0;
  const attente: Array<() => void> = [];
  function servir(): Promise<void> {
    return new Promise<void>((resoudre) => {
      const lancer = () => {
        enVol++;
        setTimeout(() => {
          enVol--;
          resoudre();
          const suivant = attente.shift();
          if (suivant) suivant();
        }, serviceMs);
      };
      if (enVol < pool) lancer();
      else attente.push(lancer);
    });
  }
  return servir;
}

const NB_WIDGETS = 9;
const POOL = 3;
const SERVICE_MS = 5000; // sain : bien en dessous des 8 s du client
const DELAI_CLIENT_MS = 8000;

function catalogueDeTemoin(servir: () => Promise<void>) {
  return Array.from({ length: NB_WIDGETS }, (_, i) => ({
    id: `t${i}`,
    cleTitre: 'v2.home.title',
    forme: 'bande' as const,
    charger: async () => {
      await servir();
      return [{ id: `e${i}`, titre: `Bande ${i}`, sousTitre: '' }];
    },
  }));
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

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

async function respirer() {
  await vi.advanceTimersByTimeAsync(0);
  flushSync();
}

async function avancer(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

beforeEach(() => {
  vi.useFakeTimers();
  poserLeServeur();
  locale.set('fr');
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1152 — le délai de 8 s mesure le SERVEUR, pas la file du navigateur', () => {
  it('neuf widgets, un serveur qui en sert trois à la fois en 5 s : les neuf s’affichent', async () => {
    const servir = serveurEtrangle(POOL, SERVICE_MS);
    const catalogue = catalogueDeTemoin(servir);

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: {
        catalogue,
        dispositionDefaut: catalogue.map((w) => w.id),
        cle: 'temoin_1152',
      },
    });
    flushSync();
    await respirer();

    // Trois vagues de cinq secondes : le dernier widget part à t = 10 s et
    // arrive à t = 15 s. On laisse passer largement, plus le compte à rebours
    // de huit secondes du dernier parti.
    await avancer(SERVICE_MS * 3 + DELAI_CLIENT_MS + 1000);

    const tombes = Array.from(hote.querySelectorAll('.state.err'));
    expect(
      tombes.length,
      `${tombes.length} widget(s) sur ${NB_WIDGETS} tombés en « (delai) » alors que le serveur ` +
      'a répondu à tous en 5 s : les huit secondes ont été consommées dans la file d’attente, ' +
      'pas par le serveur — c’est #1152.',
    ).toBe(0);

    const texte = hote.textContent ?? '';
    for (let i = 0; i < NB_WIDGETS; i++) {
      expect(texte, `la bande ${i} ne s’est jamais affichée`).toContain(`Bande ${i}`);
    }
  });

  it('contre-épreuve : un serveur réellement trop lent tombe TOUJOURS en « (delai) »', async () => {
    // Sans ce second témoin, on ne saurait pas si le premier prouve quelque
    // chose : un correctif qui supprimerait purement et simplement le délai le
    // rendrait vert aussi, et l'accueil attendrait à nouveau sans fin — ce que
    // Bertrand avait précisément signalé comme « trop lent ».
    const servir = serveurEtrangle(POOL, 20_000); // 20 s : le serveur est en faute
    const catalogue = catalogueDeTemoin(servir);

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PageWidgets, {
      target: hote,
      props: {
        catalogue,
        dispositionDefaut: catalogue.map((w) => w.id),
        cle: 'temoin_1152_lent',
      },
    });
    flushSync();
    await respirer();
    await avancer(DELAI_CLIENT_MS + 1000);

    expect(
      hote.querySelectorAll('.state.err').length,
      'le délai ne dit plus rien : un serveur muet laisserait la page attendre sans fin',
    ).toBe(POOL);
  });
});
