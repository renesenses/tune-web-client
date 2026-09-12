// @vitest-environment jsdom
//
// #3660 — « cet appareil n'EST PAS un Eversolo ».
//
// La chaîne vide sur `brand` / `model` efface l'OVERRIDE, et c'est juste : on
// retombe alors sur la détection UPnP. Mais rien ne permettait de récuser la
// DÉTECTION elle-même, qui se repeuple au balayage suivant. Treize zones sur
// quatorze, mesurées sur le .18 le 08/09, n'ont QUE leur détection — dont un
// `detected_model = "AV Renderer Device"` qui ne désigne aucun modèle et sert
// pourtant de clef au catalogue.
//
// Le serveur a livré le vide FORCÉ dans la v0.9.147 :
//
//   PATCH /zones/{id}  { "identite_appareil_effacee": true }   ecriture.rs:533
//   GET   /zones/{id}  → "identite_appareil_effacee": bool     zones.rs:355
//                        + detected_manufacturer / detected_model à `null`
//
// Aucun écran ne l'envoyait : `git grep identite_appareil_effacee src/` rendait
// 0 sur `main`. Dire « ce n'est pas celui-là » était impossible.
//
// 🔴 CE TÉMOIN MONTE L'ÉDITEUR ET CLIQUE, avec `fetch` bouchonné au plus bas
// niveau : ce qu'il lit, c'est la MÉTHODE, l'URL et le CORPS réellement émis.
// Vérifier qu'une fonction d'`api` a été appelée ne prouverait ni le nom du
// champ ni qu'il part sur la bonne route.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ZoneDeviceEditor from '../../components/ZoneDeviceEditor.svelte';
import { locale } from '../i18n';
import type { Zone } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

interface Requete {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

let requetes: Requete[] = [];

/**
 * La zone du ticket : QUE de la détection, et une détection qui ne désigne
 * rien. C'est le cas mesuré sur le .18.
 */
const ZONE_EVERSOLO = (): Zone =>
  ({
    id: 7,
    name: 'Salon',
    brand: null,
    model: null,
    detected_manufacturer: 'EVERSOLO',
    detected_model: 'AV Renderer Device',
    identite_appareil_effacee: false,
  }) as unknown as Zone;

/** Ce que le serveur rend APRÈS le vide forcé : le drapeau, et deux `null`. */
const ZONE_RECUSEE = {
  id: 7,
  name: 'Salon',
  brand: null,
  model: null,
  detected_manufacturer: null,
  detected_model: null,
  identite_appareil_effacee: true,
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
/** Ce que le PATCH de zone rend. Le SERVEUR décide, jamais l'écran. */
let reponsePatchZone: unknown = ZONE_RECUSEE;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 6) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

beforeEach(() => {
  requetes = [];
  reponsePatchZone = ZONE_RECUSEE;
  locale.set('fr');
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
      let charge: unknown = {};
      if (url.includes('/devices/catalog')) charge = { brands: [] };
      if (method === 'PATCH' && /\/zones\/\d+$/.test(url)) charge = reponsePatchZone;
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
  if (monte) unmount(monte, { outro: false });
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function poser(zone: Zone) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ZoneDeviceEditor, { target: hote, props: { zone } });
  await souffler();
  return hote;
}

/** La case « ce n'est pas l'appareil détecté », trouvée par son libellé. */
function caseRecuser(): HTMLInputElement {
  const libelle = fr['zoneConfig.identiteEffacee'];
  expect(libelle, 'le libellé français doit exister').toBeTruthy();
  const porteur = [...hote!.querySelectorAll('span, label')].find(
    (e) => (e.textContent ?? '').trim() === libelle,
  );
  expect(
    porteur,
    `libellé « ${libelle} » absent de l’éditeur — rien ne permet de récuser la détection`,
  ).toBeTruthy();
  let n: HTMLElement | null = porteur as HTMLElement;
  for (let i = 0; i < 5 && n; i++) {
    const c = n.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (c) return c;
    n = n.parentElement;
  }
  throw new Error(`aucune case à cocher auprès du libellé « ${libelle} »`);
}

function patchsDeZone(): Requete[] {
  return requetes.filter((r) => r.method === 'PATCH' && /\/zones\/\d+$/.test(r.url));
}

const texte = () => (hote?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#3660 — l’écran ENVOIE le vide forcé', () => {
  it('cocher émet `PATCH /zones/7 {"identite_appareil_effacee": true}`', async () => {
    await poser(ZONE_EVERSOLO());
    caseRecuser().click();
    await souffler(8);

    const patchs = patchsDeZone();
    expect(
      patchs.length,
      `aucun PATCH de zone n’est parti. Requêtes vues : ${requetes
        .map((r) => `${r.method} ${r.url}`)
        .join(' | ')}`,
    ).toBe(1);
    expect(patchs[0].url).toMatch(/\/zones\/7$/);
    // 🔴 LE NOM DE CHAMP EXACT du serveur, et rien d'autre dans le corps.
    expect(patchs[0].body).toEqual({ identite_appareil_effacee: true });
  });

  it('🔴 ce n’est PAS `{brand: "", model: ""}` — deux gestes, deux intentions', async () => {
    // La chaîne vide efface l'OVERRIDE et laisse REVENIR la détection, qui se
    // repeuple au balayage suivant. Envoyer cela ici ne récuserait rien, et
    // l'« AV Renderer Device » serait de retour au prochain scan.
    await poser(ZONE_EVERSOLO());
    caseRecuser().click();
    await souffler(8);

    const corps = patchsDeZone()[0].body ?? {};
    expect(Object.keys(corps)).not.toContain('brand');
    expect(Object.keys(corps)).not.toContain('model');
  });

  it('décocher renvoie `false` sous le même nom — le chemin de retour', async () => {
    const zone = ZONE_EVERSOLO();
    zone.identite_appareil_effacee = true;
    zone.detected_manufacturer = null;
    zone.detected_model = null;
    reponsePatchZone = { ...ZONE_RECUSEE, identite_appareil_effacee: false,
      detected_manufacturer: 'EVERSOLO', detected_model: 'AV Renderer Device' };

    await poser(zone);
    // Le bloc doit RESTER visible alors que la détection est déjà effacée :
    // sinon il disparaîtrait avec elle et l'utilisateur serait coincé.
    expect(caseRecuser().checked).toBe(true);

    caseRecuser().click();
    await souffler(8);

    expect(patchsDeZone()[0].body).toEqual({ identite_appareil_effacee: false });
  });
});

describe('#3660 — l’écran AFFICHE ce que le serveur a retenu', () => {
  it('l’identité récusée disparaît de la ligne « Détecté »', async () => {
    await poser(ZONE_EVERSOLO());
    expect(texte(), 'la détection doit être visible AVANT').toContain('EVERSOLO');

    caseRecuser().click();
    await souffler(8);

    // Le serveur sert les deux champs à `null` : l'écran doit le refléter,
    // et non garder à l'affichage une identité qu'il vient de récuser.
    expect(texte(), 'la détection récusée ne doit plus être affichée').not.toContain('EVERSOLO');
    expect(texte()).not.toContain('AV Renderer Device');
    expect(caseRecuser().checked).toBe(true);
  });

  it('🔴 un serveur qui REFUSE ne fait pas mentir la case', async () => {
    // Un serveur antérieur à #3660 ignore le champ : sa réponse ne porte pas
    // le drapeau. La case doit rester DÉCOCHÉE — afficher « récusé » devant
    // un serveur qui continue de servir l'identité serait le mensonge qu'on
    // est venu corriger.
    reponsePatchZone = {
      id: 7, brand: null, model: null,
      detected_manufacturer: 'EVERSOLO', detected_model: 'AV Renderer Device',
    };
    await poser(ZONE_EVERSOLO());

    caseRecuser().click();
    await souffler(8);

    expect(patchsDeZone()[0].body).toEqual({ identite_appareil_effacee: true });
    expect(
      caseRecuser().checked,
      'le serveur n’a pas confirmé : la case ne doit pas l’affirmer',
    ).toBe(false);
    expect(texte()).toContain('EVERSOLO');
  });

  it('une zone SANS aucune détection ne propose rien à récuser', async () => {
    // Il n'y a rien à démentir : proposer la case poserait une question sans
    // objet, et le serveur n'a aucune identité à effacer.
    const nue = { id: 9, name: 'Bureau', brand: null, model: null } as unknown as Zone;
    await poser(nue);
    expect(texte()).not.toContain(fr['zoneConfig.identiteEffacee']);
  });
});

describe('#3660 — les DEUX coquilles portent l’éditeur', () => {
  // L'éditeur est un composant PARTAGÉ : le brancher une fois couvre les deux
  // interfaces. Encore faut-il que ce soit vrai — ces deux lignes le mesurent,
  // et rougiraient le jour où une coquille s'en fabriquerait un autre.
  const lire = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

  it('la coquille actuelle le monte (DevicesSettings, onglet Appareils)', () => {
    expect(lire('components/DevicesSettings.svelte')).toContain('<ZoneDeviceEditor');
  });

  it('la coquille ShellV2 le monte (SettingsV2)', () => {
    expect(lire('components/v2/SettingsV2.svelte')).toContain('<ZoneDeviceEditor');
  });
});

describe('#3660 — l’intitulé, dans les onze langues', () => {
  it('les deux clés existent partout et ne sont pas vides', async () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'];
    for (const code of langues) {
      const dico = (await import(`../locales/${code}`)).default as Record<string, string>;
      for (const cle of ['zoneConfig.identiteEffacee', 'zoneConfig.identiteEffaceeHint']) {
        expect(dico[cle], `${code} / ${cle}`).toBeTruthy();
        expect((dico[cle] ?? '').trim().length, `${code} / ${cle}`).toBeGreaterThan(5);
      }
    }
  });
});
