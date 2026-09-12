// @vitest-environment jsdom
//
// « Accueil : les quatre widgets tombent ensemble en (délai) et ne repartent
// jamais » — renesenses/tune-web-client#871.
//
// 🔴 LE DÉFAUT N'EST PAS LA CHUTE, C'EST QU'ELLE EST DÉFINITIVE.
//
// `PageWidgets` tient un registre non réactif, `demandes`, qui refuse la
// seconde demande d'un même widget : c'est lui qui empêche les « chargements
// x4 ». Mais l'identifiant y restait même quand le chargement avait ÉCHOUÉ. Le
// garde ne distinguait pas « déjà chargé » de « déjà tombé », et plus aucun
// geste de la page ne pouvait relever un widget : tous passent par
// `chargerWidget`, qui repartait aussitôt. Il fallait recharger l'onglet — sur
// une tablette posée dans le salon, c'est-à-dire jamais.
//
// 🔴 CE TÉMOIN CLIQUE, IL NE LIT PAS.
//
// Il monte la vraie page avec un catalogue d'un seul widget dont le premier
// chargement échoue et le second réussit, puis il clique « Réessayer ». Ce
// qu'il compte, c'est le nombre de fois où le CATALOGUE a été sollicité :
// remettre l'identifiant dans le registre après l'échec fait rester ce nombre
// à un, et le témoin rougit.
//
// ⚠️ Ce que ce témoin ne verrait PAS, et pourquoi il est écrit ainsi :
//   - compter les appels réseau ne suffirait pas : le widget de témoin n'en
//     fait aucun, tout se joue dans le registre ;
//   - se contenter de vérifier que le bouton existe laisserait passer un
//     bouton mort — c'est précisément la forme du défaut de ce dépôt ;
//   - lire `demandes` de l'extérieur est impossible (const de composant) :
//     seule la RELANCE OBSERVABLE prouve qu'il a été vidé.
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
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/**
 * Un widget de témoin : il tombe au premier appel, il répond au second.
 *
 * C'est exactement la séquence de Bertrand — le serveur redémarre, les widgets
 * tombent, le serveur revient.
 */
function widgetCapricieux() {
  const appels: number[] = [];
  return {
    appels,
    widget: {
      id: 'temoin',
      cleTitre: 'v2.home.title',
      forme: 'bande' as const,
      charger: async () => {
        appels.push(appels.length + 1);
        if (appels.length === 1) throw new Error('serveur muet');
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

describe('#871 — un widget tombé peut repartir SANS recharger la page', () => {
  it('après un échec, la relance rappelle réellement la source', async () => {
    const { appels, widget } = widgetCapricieux();
    const page = await poserLaPage(widget);

    // 1. Le widget est bien tombé, et il le DIT.
    expect(appels.length, 'le widget n’a jamais été chargé').toBe(1);
    const echec = page.querySelector('.state.err');
    expect(echec, 'la chute n’est pas annoncée à l’écran').toBeTruthy();

    // 2. La relance est ATTEIGNABLE : un bouton, dans le message d'échec.
    const relancer = echec!.querySelector('button');
    expect(
      relancer,
      'un widget tombé n’offre aucun moyen de repartir : seul F5 le relève — c’est #871',
    ).toBeTruthy();

    // 3. Et elle RELANCE. C'est ici que le registre se prouve : s'il garde la
    //    demande qui a échoué, `chargerWidget` repart aussitôt et le compteur
    //    reste à un.
    relancer!.click();
    await souffler(80);
    flushSync();

    expect(
      appels.length,
      'la demande en échec est restée dans le registre : la relance n’a rien rappelé',
    ).toBe(2);

    // 4. Et l'écran repart vraiment : plus de message d'échec, le contenu est là.
    expect(page.querySelector('.state.err'), 'la carte est restée sur son échec').toBeNull();
    expect(page.textContent ?? '').toContain('Enfin la');
  });

  it('un widget QUI A RÉUSSI n’est pas rechargé deux fois', async () => {
    // La contre-partie : le registre doit continuer à refuser la seconde
    // demande d'un widget servi, sinon on réintroduit les « chargements x4 »
    // que ce registre existe pour empêcher (02/09/2026).
    const appels: number[] = [];
    const widget = {
      id: 'temoin',
      cleTitre: 'v2.home.title',
      forme: 'bande' as const,
      charger: async () => { appels.push(1); return [{ id: 'a1', titre: 'Du premier coup' }]; },
    };
    const page = await poserLaPage(widget);
    expect(appels.length).toBe(1);
    expect(page.querySelector('.state.err')).toBeNull();

    // Le geste qui relance tout — celui du chargement initial — ne doit rien
    // redemander.
    await souffler(80);
    flushSync();
    expect(appels.length, 'un widget déjà servi a été rechargé').toBe(1);
  });

  it('le `.catch` ne SOUSCRIT à rien : aucun `$t(…)` n’y est appelé', async () => {
    // Svelte 5 : un `$t(…)` dans un `.catch` est une souscription que le
    // compilateur transpile sans la résoudre — invisible au build, visible
    // chez l'utilisateur seul, et seul `svelte-check` l'attrape. Ce `.catch`
    // est précisément celui que #871 fait modifier : on tient la règle ici.
    // `import.meta.url` n'est pas un `file:` sous jsdom : on lit depuis la
    // racine du dépôt, comme les autres témoins de source de ce dossier.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Les COMMENTAIRES sont retirés d'abord : celui de ce `.catch` cite la
    // règle mot pour mot, et une recherche naïve se prendrait elle-même.
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const i = src.indexOf('.catch((err: any) => {');
    expect(i, 'le `.catch` des widgets a disparu').toBeGreaterThan(-1);
    const fin = src.indexOf('\n      });', i);
    expect(fin, 'le `.catch` des widgets n’a plus la forme attendue').toBeGreaterThan(i);
    const bloc = src.slice(i, fin);
    expect(/\$t\(/.test(bloc), 'un `$t(…)` a été posé dans le `.catch` des widgets').toBe(false);
    expect(bloc.includes('demandes.delete(id)'), 'le registre ne rend plus la demande en échec').toBe(true);
  });
});
