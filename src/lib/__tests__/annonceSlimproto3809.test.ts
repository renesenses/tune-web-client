// @vitest-environment jsdom
//
// #3809 — « Que je coche ou pas la découverte Squeezebox dans Tune ne change
// rien. »
//
// Le testeur du fil `bug-bonjour-4s0m58` (v0.9.145) voit Home Assistant se
// remplir de découvertes Squeezebox pointant sur son PC dès que Tune démarre.
// Il avait raison, et pour une raison de vocabulaire : DEUX réglages portent
// le mot « découverte » et gouvernent des sens OPPOSÉS du protocole.
//
//   squeezebox_enabled          Tune CLIENT d'un Lyrion Music Server.
//                               Le seul interrupteur que l'écran portait.
//   slimproto_discovery_enabled Tune SERVEUR : le répondeur UDP 3483, celui
//                               que Home Assistant trouve. Aucun écran.
//
// Le serveur a livré le second dans la v0.9.147 (`background.rs:1908`,
// `routes/system/config.rs:315`), **par défaut à `true`**. Un testeur inondé
// n'avait donc aucun moyen de l'arrêter.
//
// 🔴 CES TÉMOINS MONTENT LES DEUX COQUILLES ET CLIQUENT. `fetch` est bouchonné
// au plus bas niveau : ce qu'ils lisent, c'est l'URL et le CORPS réellement
// émis. Un témoin qui appellerait `basculerAnnonceSlimproto` lui-même, ou qui
// mockerait `api.updateConfig`, ne prouverait pas que la case est branchée —
// c'est exactement le défaut d'origine (« écrit mais pas branché »).
//
// 🔴 Et le serveur a le DERNIER MOT. Le cas `le serveur dément le clic` retire
// au témoin toute complaisance : le PATCH ne répond que `{"ok": true}`, donc
// seule une RELECTURE de `GET /system/config` peut dire l'état retenu. Un
// écran qui inverserait son booléen local afficherait « éteint » devant un
// serveur qui annonce toujours.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsView from '../../components/SettingsView.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { settingsInitialTab } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import {
  CLE_ANNONCE_SLIMPROTO,
  annonceSlimprotoActivee,
  annonceSlimprotoDepuisConfig,
} from '../annonceSlimproto';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** Une requête telle qu'elle est PARTIE : méthode, URL, corps. */
interface Requete {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

let requetes: Requete[] = [];
/** Ce que `GET /system/config` rend. Le serveur, et lui seul, en décide. */
let configServeur: Record<string, unknown> = {};
/** Le serveur RETIENT-IL ce que le PATCH lui demande ? */
let serveurAccepteLePatch = true;

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsParDefaut(url: string): unknown {
  if (url.includes('/system/config')) return configServeur;
  if (url.includes('/system/update/status')) return { phase: null };
  if (url.includes('/system/health')) return { status: 'ok' };
  if (url.includes('/zones')) return [];
  if (url.includes('/devices')) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

beforeEach(() => {
  requetes = [];
  configServeur = {};
  serveurAccepteLePatch = true;
  locale.set('fr');
  // La section Squeezebox est offerte à partir du niveau « intermédiaire »
  // (lib/v2Settings). Au niveau débutant, ces témoins ne verraient rien.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: Record<string, unknown> | null = null;
      if (typeof init?.body === 'string') {
        try { body = JSON.parse(init.body); } catch { body = null; }
      }
      requetes.push({ method, url, body });

      let charge: unknown = corpsParDefaut(url);
      if (method === 'PATCH' && url.includes('/system/config')) {
        // Ce que fait `update_config` : il persiste, et répond `{"ok": true}`
        // — SANS écho de la valeur posée. L'état ne peut donc venir que d'une
        // relecture.
        if (serveurAccepteLePatch && body) configServeur = { ...configServeur, ...body };
        charge = { ok: true };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

/** La case de l'ANNONCE, trouvée par son libellé — comme un humain. */
function caseAnnonce(): HTMLInputElement {
  const libelle = fr['settings.slimprotoAnnonce'];
  expect(libelle, 'le libellé français doit exister').toBeTruthy();
  const porteur = [...hote!.querySelectorAll('span, div, label')].find(
    (e) => (e.textContent ?? '').trim() === libelle,
  );
  expect(
    porteur,
    `libellé « ${libelle} » absent de l’écran — l’interrupteur de l’annonce n’est pas rendu`,
  ).toBeTruthy();
  // La case vit dans la même RANGÉE que son libellé : on remonte jusqu'à
  // trouver une rangée qui en porte une, sans jamais sortir de l'écran.
  let n: HTMLElement | null = porteur as HTMLElement;
  for (let i = 0; i < 5 && n; i++) {
    const c = n.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (c) return c;
    n = n.parentElement;
  }
  throw new Error(`aucune case à cocher auprès du libellé « ${libelle} »`);
}

/** Les PATCH de config partis, avec leur corps. */
function patchsDeConfig(): Requete[] {
  return requetes.filter((r) => r.method === 'PATCH' && r.url.includes('/system/config'));
}

async function poserCoquilleV2() {
  v2SettingsTarget.set({ tab: 'audio', section: 'squeezebox' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
}

async function poserCoquilleActuelle() {
  settingsInitialTab.set('services');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsView, { target: hote, props: {} });
  await souffler();
}

describe('#3809 — la règle de lecture est celle du serveur', () => {
  it('la clé est celle que le serveur écrit, à la lettre', () => {
    // `background.rs:1908`. Un nom approchant serait une ligne morte en base
    // et un interrupteur qui ne gouverne toujours rien.
    expect(CLE_ANNONCE_SLIMPROTO).toBe('slimproto_discovery_enabled');
    // Et surtout : PAS l'autre réglage, celui de l'autre sens du protocole.
    expect(CLE_ANNONCE_SLIMPROTO).not.toBe('squeezebox_enabled');
  });

  it('seul un « false » explicite éteint — dans les trois formes que la base peut rendre', () => {
    // `settings` ne stocke que des chaînes, et `GET /system/config` reparse
    // chaque valeur en JSON quand elle s'y prête : le même « éteint » peut
    // donc revenir en booléen, en chaîne ou en nombre.
    expect(annonceSlimprotoActivee(false)).toBe(false);
    expect(annonceSlimprotoActivee('false')).toBe(false);
    expect(annonceSlimprotoActivee(0)).toBe(false);
    expect(annonceSlimprotoActivee('0')).toBe(false);
  });

  it('l’absence de la clé vaut ARMÉ — le défaut du serveur, et son comportement d’avant', () => {
    expect(annonceSlimprotoDepuisConfig({})).toBe(true);
    expect(annonceSlimprotoDepuisConfig({ squeezebox_enabled: false })).toBe(true);
    expect(annonceSlimprotoActivee(true)).toBe(true);
    expect(annonceSlimprotoActivee(undefined)).toBe(true);
  });
});

describe('#3809 — coquille ShellV2 (SettingsV2)', () => {
  it('la case suit ce que le serveur publie : armée par défaut', async () => {
    configServeur = {}; // le serveur v0.9.147 publie `true` par défaut
    await poserCoquilleV2();
    expect(caseAnnonce().checked, 'armée tant que le serveur ne dit pas false').toBe(true);
  });

  it('un serveur qui a déjà l’annonce éteinte affiche une case DÉCOCHÉE', async () => {
    configServeur = { [CLE_ANNONCE_SLIMPROTO]: false };
    await poserCoquilleV2();
    expect(caseAnnonce().checked).toBe(false);
  });

  it('décocher ENVOIE `slimproto_discovery_enabled: false` sur PATCH /system/config', async () => {
    await poserCoquilleV2();
    const avant = patchsDeConfig().length;

    caseAnnonce().click();
    await souffler(10);

    const patchs = patchsDeConfig().slice(avant);
    expect(
      patchs.length,
      `aucun PATCH /system/config n’est parti. Requêtes vues : ${requetes
        .map((r) => `${r.method} ${r.url}`)
        .join(' | ')}`,
    ).toBe(1);
    const p = patchs[0];
    expect(p.url).toContain('/system/config');
    // 🔴 LE NOM DE CHAMP EXACT, et la valeur `false` — pas `"false"`, pas 0.
    expect(p.body).toEqual({ slimproto_discovery_enabled: false });
    expect(p.body?.[CLE_ANNONCE_SLIMPROTO]).toBe(false);
    // Et surtout : l'AUTRE réglage n'est pas touché. Les confondre est le
    // défaut même de l'issue.
    expect(Object.keys(p.body ?? {})).not.toContain('squeezebox_enabled');

    expect(caseAnnonce().checked).toBe(false);
  });

  it('recocher renvoie `true` sous le même nom', async () => {
    configServeur = { [CLE_ANNONCE_SLIMPROTO]: false };
    await poserCoquilleV2();
    const avant = patchsDeConfig().length;

    caseAnnonce().click();
    await souffler(10);

    expect(patchsDeConfig().slice(avant)[0].body).toEqual({
      slimproto_discovery_enabled: true,
    });
    expect(caseAnnonce().checked).toBe(true);
  });

  it('🔴 le serveur DÉMENT le clic : l’état affiché est le sien, pas celui de l’utilisateur', async () => {
    // Un serveur antérieur à #3809 ignore la clé : il continue de publier son
    // défaut. L'utilisateur décoche, le serveur annonce toujours — la case
    // doit revenir COCHÉE, sans quoi l'écran redirait le mensonge de l'issue.
    serveurAccepteLePatch = false;
    await poserCoquilleV2();
    expect(caseAnnonce().checked).toBe(true);

    caseAnnonce().click();
    await souffler(10);

    // La demande est bien PARTIE…
    expect(patchsDeConfig().at(-1)?.body).toEqual({ slimproto_discovery_enabled: false });
    // …et l'écran a RELU ce que le serveur a retenu.
    const relectures = requetes.filter(
      (r) => r.method === 'GET' && r.url.includes('/system/config'),
    );
    expect(
      relectures.length,
      'sans relecture, l’état affiché ne peut venir que du clic',
    ).toBeGreaterThan(1);
    expect(
      caseAnnonce().checked,
      'le serveur annonce toujours : la case doit le dire',
    ).toBe(true);
  });
});

describe('#3809 — coquille actuelle (App / SettingsView)', () => {
  it('la case existe et suit le serveur', async () => {
    configServeur = { [CLE_ANNONCE_SLIMPROTO]: false };
    await poserCoquilleActuelle();
    expect(caseAnnonce().checked).toBe(false);
  });

  it('décocher ENVOIE `slimproto_discovery_enabled: false`', async () => {
    await poserCoquilleActuelle();
    expect(caseAnnonce().checked).toBe(true);
    const avant = patchsDeConfig().length;

    caseAnnonce().click();
    await souffler(10);

    const patchs = patchsDeConfig().slice(avant);
    expect(
      patchs.length,
      `aucun PATCH /system/config n’est parti. Requêtes vues : ${requetes
        .map((r) => `${r.method} ${r.url}`)
        .join(' | ')}`,
    ).toBe(1);
    expect(patchs[0].body).toEqual({ slimproto_discovery_enabled: false });
    expect(caseAnnonce().checked).toBe(false);
  });

  it('🔴 le serveur dément le clic ici aussi', async () => {
    serveurAccepteLePatch = false;
    await poserCoquilleActuelle();

    caseAnnonce().click();
    await souffler(10);

    expect(patchsDeConfig().at(-1)?.body).toEqual({ slimproto_discovery_enabled: false });
    expect(caseAnnonce().checked).toBe(true);
  });
});

describe('#3809 — l’écran DIT qu’un redémarrage est nécessaire', () => {
  // 🔴 Le serveur du tag v0.9.147 lit la clé UNE fois, au démarrage
  // (`spawn_slimproto_server`, background.rs), et arme `discovery::spawn` —
  // qui n'a ni handle ni jeton d'annulation. Décocher ne fait donc PAS taire
  // l'annonce en cours. Taire ce fait ferait rapporter au testeur le
  // symptôme exact de l'issue : « je décoche et ça continue ».
  const texte = () => (hote?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const AVIS = () => fr['settings.slimprotoAnnonceRedemarrage'];

  it('rien n’est annoncé tant que l’utilisateur n’a rien changé', async () => {
    await poserCoquilleV2();
    expect(AVIS()).toBeTruthy();
    expect(texte()).not.toContain(AVIS());
  });

  it('ShellV2 : l’avis apparaît dès que le choix est posé', async () => {
    await poserCoquilleV2();
    caseAnnonce().click();
    await souffler(10);
    expect(texte(), 'le redémarrage nécessaire doit être dit à l’écran').toContain(AVIS());
  });

  it('coquille actuelle : le même avis', async () => {
    await poserCoquilleActuelle();
    caseAnnonce().click();
    await souffler(10);
    expect(texte()).toContain(AVIS());
  });

  it('l’avis existe dans les onze langues', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const code of langues) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      const v = dico['settings.slimprotoAnnonceRedemarrage'];
      expect(v, `${code}`).toBeTruthy();
      expect((v ?? '').trim().length, code).toBeGreaterThan(20);
    }
  });
});

describe('#3809 — l’intitulé départage les deux sens du protocole', () => {
  it('les deux clés existent dans les onze langues et ne sont pas vides', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const code of langues) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      for (const cle of ['settings.slimprotoAnnonce', 'settings.slimprotoAnnonceHint']) {
        expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
        expect((dico[cle] ?? '').trim().length, `${code} / ${cle}`).toBeGreaterThan(10);
      }
    }
  });

  it('l’intitulé ne redit pas « découverte Squeezebox » tout court', async () => {
    // C'est le libellé de l'AUTRE réglage. Deux cases voisines portant le même
    // mot rejoueraient le malentendu à l'identique.
    expect(fr['settings.slimprotoAnnonce']).not.toBe(fr['settings.squeezeboxEnabled']);
    const en = (await import('../locales/en')).default as Record<string, string>;
    expect(en['settings.slimprotoAnnonce']).not.toBe(en['settings.squeezeboxEnabled']);
    // Et il nomme ce qui est en jeu : l'annonce, et le port qu'on voit passer.
    expect(fr['settings.slimprotoAnnonceHint']).toContain('3483');
    expect(en['settings.slimprotoAnnonceHint']).toContain('3483');
  });
});
