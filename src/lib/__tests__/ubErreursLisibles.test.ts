// @vitest-environment jsdom
//
// LOT UB — « l'échec doit devenir LISIBLE », deux trous qui restaient.
//
// #3732 a rendu visibles les dix-neuf `.catch(() => {})` de la coquille v2, et
// #2178 a donné au 429 du support premium une phrase qui explique. Les deux
// correctifs sont en place. Ce fichier garde ce que NI l'un NI l'autre n'a
// couvert, et qui laissait le même testeur sans rien à nous dire :
//
//  1. les écrans v2 à BANDEAU (`FavoritesV2`, `StreamingV2`, l'onglet
//     Bandcamp) n'avaient jamais eu de `.catch(() => {})` — ils affichaient
//     « Lecture impossible. ». Ils passaient donc entre les mailles du garde
//     de #3732, qui les déclare explicitement « corrects ». Sauf qu'un
//     bandeau générique SANS le message du serveur et SANS trace console ne
//     vaut pas mieux qu'un écran muet pour instruire un signalement : le
//     testeur lit « Lecture impossible. » et n'a, là encore, RIEN à nous
//     donner.
//
//  2. `messageErreurSupport` — le module qui écrit « Limite d'envoi atteinte…
//     réessaie dans 1 heure » — n'avait qu'UN appelant : `SupportView`, la
//     v1. L'écran « Support premium → Nouveau ticket » de la coquille v2,
//     celui de la capture de Reivax66, gardait son propre repli : le statut
//     HTTP NU. Le correctif de #1294 n'atteignait pas l'écran qui porte le
//     défaut de #1294.
//
// 🔴 CE FICHIER MONTE LE VRAI ÉCRAN ET LIT LE DOM pour le point 2. Vérifier
// qu'une fonction est appelée ne prouve pas qu'un utilisateur voit quelque
// chose — c'est la leçon du canal 3 de #3732, où `notifications.error()`
// partait dans le vide 119 fois.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import { notifications } from '../stores/notifications';
import { messageEchecLecture, signalerEchecLecture, signalerErreurServeur } from '../echecLecture';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fr from '../locales/fr';

const respirer = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// 1. Un échec de lecture sur un écran à BANDEAU
// ===========================================================================

describe('#3732 (suite) — le bandeau d’un écran v2 porte le MOTIF, pas un générique', () => {
  let journal: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    journal = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    journal.mockRestore();
  });

  /** L'erreur telle que `lib/api.ts` la lève sur un refus de `POST /play`. */
  function refusServeur(message: string, status = 400): Error & { status?: number } {
    const e = new Error(message) as Error & { status?: number };
    e.status = status;
    return e;
  }

  it('NIVEAU 1 — le message du serveur atteint le bandeau', () => {
    // Le refus mesuré de `routes/playback.rs`, qui ne laisse aucune trace
    // côté serveur non plus : si le client ne le dit pas, personne ne le dit.
    const vu = messageEchecLecture(refusServeur('no tracks to play'), 'v2.stream.playFailed');
    expect(
      vu,
      'le bandeau ne porte que le repli générique : le testeur lit « Lecture ' +
        'impossible. » et n’a rien de plus à nous donner qu’avant',
    ).toContain('no tracks to play');
    // Le repli traduit RESTE : « no tracks to play » seul ne dit pas à un
    // auditeur que c'est sa lecture qui a échoué.
    expect(vu).toContain(fr['v2.stream.playFailed']);
  });

  it('NIVEAU 1 bis — le motif rangé dans `.code` par `api.ts` atteint le bandeau', () => {
    // 🔴 MESURÉ DANS LE NAVIGATEUR le 12/09/2026, route `/play` coupée avec le
    // refus exact du serveur, `400 {"error":"no tracks to play"}`. Le bandeau
    // affichait « Erreur de lecture : 400 Bad Request » — le motif manquait.
    //
    // `lib/api.ts` construit ses erreurs à deux endroits qui ne se valent pas :
    // `erreurDepuisReponse()` met `body.error` dans le message, `apiError()` —
    // le chemin des lectures — le range dans `.code` et n'en fait rien. Le
    // refus le plus courant du serveur de lecture a précisément cette forme.
    //
    // Le témoin reproduit l'erreur TELLE QUE `apiError` la fabrique : message
    // = statut + statusText, motif = `.code`.
    const e = new Error('400 Bad Request') as Error & { status?: number; code?: string };
    e.status = 400;
    e.code = 'no tracks to play';

    const vu = messageEchecLecture(e, 'library.playbackError');
    expect(
      vu,
      'le motif nommé par le serveur reste dans `.code` et n’atteint pas l’écran : ' +
        'le testeur lit « 400 Bad Request », ce qui ne dit RIEN de plus que le silence',
    ).toContain('no tracks to play');
    // Le statut reste : c'est lui qu'on demande à un testeur de nous répéter.
    expect(vu).toContain('400');
  });

  it('un motif déjà présent dans le message n’est pas répété', () => {
    // La contrepartie : `erreurDepuisReponse` met DÉJÀ le motif dans le
    // message. Accoler `.code` sans regarder écrirait « 400 — no tracks to
    // play — no tracks to play ».
    const e = new Error('400 — no tracks to play') as Error & { code?: string };
    e.code = 'no tracks to play';
    const vu = messageEchecLecture(e, 'library.playbackError');
    expect(vu.match(/no tracks to play/g)?.length, 'le motif est écrit deux fois').toBe(1);
  });

  it('NIVEAU 2 — la console garde de quoi diagnostiquer', () => {
    journal.mockClear();
    messageEchecLecture(refusServeur('zone has no output device', 409), 'library.playbackError');
    expect(
      journal.mock.calls.length,
      'rien dans la console : un testeur qui ouvre les outils de développement ' +
        'n’y trouve pas plus que sur l’écran, et le diagnostic repart de zéro',
    ).toBeGreaterThan(0);
    // Ce n'est pas seulement « une ligne » : c'est l'ERREUR, avec son statut.
    const passee = journal.mock.calls[0].find((a: unknown) => a instanceof Error) as
      | (Error & { status?: number })
      | undefined;
    expect(passee?.status, 'le statut HTTP n’a pas survécu jusqu’à la console').toBe(409);
  });

  it('NIVEAU 3 — sans message serveur, le repli traduit suffit et rien ne casse', () => {
    // Coupure réseau : `fetch` rejette avec un `TypeError` sans texte utile.
    // L'écran doit rester lisible, pas afficher « undefined » ni exploser.
    for (const e of [null, undefined, {}, new Error('')]) {
      const vu = messageEchecLecture(e, 'v2.stream.playFailed');
      expect(vu, `un échec « ${String(e)} » rend un bandeau vide ou fautif`).toBe(
        fr['v2.stream.playFailed'],
      );
      expect(vu).not.toContain('undefined');
      expect(vu).not.toContain('[object Object]');
    }
  });

  it('la traduction est lue à l’instant de l’échec, jamais par `$t` dans le `.catch`', () => {
    // 🔴 Ce que la forme précédente coûtait : `$t(…)` dans un `.catch(…)` est
    // une souscription dans une fonction imbriquée — Svelte 5 la REFUSE
    // (« Cannot subscribe to stores that are not declared at the top level »).
    // esbuild transpile sans résoudre : le build passe, et la faute
    // n'apparaît QUE chez l'utilisateur, une fois la version publiée.
    // `check-svelte` l'a arrêtée ; ce témoin empêche de la réintroduire.
    for (const nom of ['FavoritesV2', 'StreamingV2', 'PisteActions']) {
      const src = readFileSync(join(process.cwd(), `src/components/v2/${nom}.svelte`), 'utf8');
      const fautifs = [...src.matchAll(/\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\{[\s\S]{0,300}?\}\s*\)/g)]
        .filter((m) => /\$t\(/.test(m[0]))
        .map((m) => `${nom}:${src.slice(0, m.index).split('\n').length}`);
      expect(
        fautifs,
        'un `$t(…)` est appelé dans un `.catch(…)` : souscription interdite en Svelte 5, ' +
          'invisible au build (esbuild transpile sans résoudre), visible chez ' +
          'l’utilisateur seul une fois la version publiée',
      ).toEqual([]);
    }
  });
});

// ===========================================================================
// 2. Le bavardage — plusieurs échecs d'affilée
// ===========================================================================

describe('#3732 (suite) — un serveur qui redémarre ne remplit pas l’écran de bandeaux', () => {
  beforeEach(() => {
    for (const n of get(notifications)) notifications.dismiss(n.id);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const n of get(notifications)) notifications.dismiss(n.id);
    vi.restoreAllMocks();
  });

  it('quatre zones qui perdent leur sortie NE font qu’un bandeau', () => {
    // Le cas réel : un redémarrage de serveur émet un `zone.playback_error`
    // PAR ZONE, tous avec le même texte. Un échec de lecture reste 10 s à
    // l'écran — quatre zones, ce sont quatre bandeaux superposés pendant dix
    // secondes pour UN événement. Moins lisible que le silence d'avant.
    const msg = 'Endpoint WASAPI demandé introuvable : « audio-gd USB audio ».';
    for (let i = 0; i < 4; i++) signalerErreurServeur({ message: msg });

    const bandeaux = get(notifications);
    expect(
      bandeaux.length,
      `${bandeaux.length} bandeaux identiques empilés : le remède est devenu le mal`,
    ).toBe(1);
    expect(bandeaux[0].message, 'le message a été perdu en chemin').toContain('audio-gd USB audio');
  });

  it('mais un message DIFFÉRENT n’est jamais masqué par le précédent', () => {
    // La contrepartie, et elle est essentielle : si dédupliquer avalait le
    // second motif, on aurait rétabli le silence de #3732 par la bande. Deux
    // pannes distinctes restent deux bandeaux.
    signalerErreurServeur({ message: 'DAC absent' });
    signalerErreurServeur({ message: 'Le dossier réseau ne répond plus' });

    const vus = get(notifications).map((n) => n.message);
    expect(vus.length, 'un motif distinct a été avalé par la déduplication').toBe(2);
    expect(vus.join(' | ')).toContain('DAC absent');
    expect(vus.join(' | ')).toContain('Le dossier réseau ne répond plus');
  });

  it('le même motif ARRIVÉ PAR /play ne s’empile pas non plus', () => {
    const e = new Error('no tracks to play');
    signalerEchecLecture(e);
    signalerEchecLecture(e);
    signalerEchecLecture(e);
    expect(get(notifications).length).toBe(1);
    // …et il porte toujours le motif, sinon la déduplication aurait tout mangé.
    expect(get(notifications)[0].message).toContain('no tracks to play');
  });
});

// ===========================================================================
// 3. #1294 — le 429 du support premium, sur l'écran de la capture
// ===========================================================================

/** Réponse HTTP minimale, à la forme que `lib/api.ts` sait lire. */
function reponse(status: number, corps: unknown, entetes: Record<string, string> = {}): Response {
  const h = new Map(Object.entries({ 'content-type': 'application/json', ...entetes }));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

describe('#1294 — « Nouveau ticket » de la coquille v2 explique le 429', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  /** Ce que le relais répondra au POST de création. */
  let refus: { status: number; corps: unknown; entetes?: Record<string, string> } | null = null;

  beforeEach(() => {
    refus = null;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        const u = String(url);
        const post = String(options?.method ?? 'GET').toUpperCase() === 'POST';
        if (post && /\/support\/tickets/.test(u) && refus) {
          return reponse(refus.status, refus.corps, refus.entetes);
        }
        if (/\/support\/tickets/.test(u)) return reponse(200, { tickets: [] });
        return reponse(200, {});
      }),
    );
    // Sans clé de licence, l'écran affiche « renseignez votre licence » et le
    // formulaire n'existe pas : le témoin serait sans objet.
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium', licenseKey: 'TEST-KEY' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    licenseState.update((s) => ({ ...s, loaded: false, tier: 'free', licenseKey: null }));
  });

  /** Monte l'écran, ouvre la rédaction, remplit et envoie. Rend le bandeau. */
  async function envoyerUnTicket(): Promise<string> {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer();
    flushSync();

    // Onglet Tickets, puis « Écrire au support ».
    const onglets = Array.from(hote.querySelectorAll('button')) as HTMLButtonElement[];
    onglets.find((b) => b.textContent?.includes(fr['v2.sup.tabTickets']))?.click();
    flushSync();
    await respirer();
    flushSync();

    const ouvrir = (Array.from(hote.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(fr['v2.sup.newTicket']),
    );
    expect(ouvrir, 'le bouton « Écrire au support » n’est pas rendu — témoin sans objet').toBeTruthy();
    ouvrir!.click();
    flushSync();

    const sujet = hote.querySelector('input.txt') as HTMLInputElement;
    const corps = hote.querySelector('textarea.zone') as HTMLTextAreaElement;
    expect(sujet && corps, 'le formulaire n’est pas rendu — témoin sans objet').toBeTruthy();
    sujet.value = 'Bug lecture avec pause';
    sujet.dispatchEvent(new Event('input', { bubbles: true }));
    corps.value = 'La lecture se bloque après une pause.';
    corps.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    (hote.querySelector('form.redac') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await respirer(120);
    flushSync();

    // Le bandeau porte son bouton de fermeture (« × ») dans le même noeud :
    // on lit le TEXTE, pas la croix, sinon toute comparaison exacte échoue.
    const bandeau = hote.querySelector('.err') as HTMLElement | null;
    if (!bandeau) return '';
    return Array.from(bandeau.childNodes)
      .filter((n) => n.nodeType === 3 /* Node.TEXT_NODE */)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
  }

  it('un 429 SANS délai dit que c’est une limite d’envoi — jamais « 429 » nu', async () => {
    // 🔴 LA CAPTURE DE REIVAX66, mot pour mot : « Une erreur est survenue.
    // Réessaie dans un instant. (429) ». Il en a conclu que la fonction était
    // cassée. Le relais mozaiklabs répond souvent sans `Retry-After`, et
    // l'écran v2 retombait alors sur `e.message` — le statut nu, ou le
    // « Too Many Attempts. » anglais du site.
    refus = { status: 429, corps: { message: 'Too Many Attempts.' } };
    const vu = await envoyerUnTicket();

    expect(vu, 'aucun bandeau : l’envoi a échoué en silence').not.toBe('');
    expect(
      vu,
      'le bandeau montre un code HTTP nu ou le message anglais du relais : c’est ' +
        'exactement ce que #1294 reproche, et le testeur en conclura de nouveau ' +
        'que la fonction est cassée',
    ).toBe(fr['support.errorRateLimited']);
    expect(vu).not.toContain('429');
    expect(vu).not.toContain('Too Many Attempts');
  });

  it('un 429 AVEC délai le dit en toutes lettres, pas en secondes brutes', async () => {
    // L'ancien chemin interpolait des SECONDES : `Retry-After: 3600`
    // s'affichait « Trop d'envois : réessayez dans 3600 secondes. » — une
    // phrase qu'aucun humain ne lit comme « dans une heure ».
    refus = { status: 429, corps: { message: '429' }, entetes: { 'retry-after': '3600' } };
    const vu = await envoyerUnTicket();

    expect(vu, 'le délai est rendu en secondes brutes').not.toContain('3600');
    expect(vu, 'le délai n’est pas rendu en unité lisible').toMatch(/heure/i);
  });

  it('un refus de licence ne se lit plus comme une panne générique', async () => {
    // 412 = pas connecté. L'écran v2 affichait `e.message`, donc « 412 ».
    refus = { status: 412, corps: { message: '412' } };
    const vu = await envoyerUnTicket();
    expect(vu).toBe(fr['support.errorNotConnected']);
    expect(vu).not.toContain('412');
  });

  it('l’écran RESTE UTILISABLE après l’échec : le formulaire et sa saisie sont là', async () => {
    refus = { status: 429, corps: { message: 'Too Many Attempts.' } };
    await envoyerUnTicket();

    // Le ticket n'a PAS été envoyé : le perdre obligerait à tout retaper, et
    // c'est le moment où l'utilisateur est déjà agacé.
    const sujet = hote!.querySelector('input.txt') as HTMLInputElement | null;
    const corps = hote!.querySelector('textarea.zone') as HTMLTextAreaElement | null;
    expect(sujet, 'le formulaire a disparu après l’échec').not.toBeNull();
    expect(sujet!.value, 'la saisie a été effacée par un envoi qui a échoué').toBe(
      'Bug lecture avec pause',
    );
    expect(corps!.value).toContain('La lecture se bloque');

    // Et le bouton d'envoi est de nouveau actionnable — sans quoi l'écran
    // serait figé sur son message d'erreur.
    const envoyer = (Array.from(hote!.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(fr['v2.sup.send']),
    );
    expect(envoyer, 'le bouton Envoyer a disparu').toBeTruthy();
    expect(envoyer!.disabled, 'l’écran reste bloqué en « envoi en cours »').toBe(false);
  });
});
