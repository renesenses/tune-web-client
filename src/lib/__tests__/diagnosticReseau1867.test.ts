// @vitest-environment jsdom
//
// renesenses/tune-web-client#1867 — Santé › Diagnostic réseau affichait trois
// croix rouges sur TOUTE installation.
//
// `TuneHealthV2` lisait `multicast_ssdp`, `port_8888`, `internet`,
// `dns_resolution` et `renderers`, que `GET /system/diagnostics/network` n'a
// jamais rendus (serveur Rust, `diagnostics_network`). `undefined` ⇒ ❌ trois
// fois, quel que soit l'état du réseau.
//
// Ce banc sert la forme RÉELLE de la réponse (relue dans
// `tune-server/src/routes/system/diagnostics.rs` et les `EtatEcoute*` de
// `tune-core`), MONTE l'écran Santé, déplie le panneau et lit le DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { lireDiagnosticReseau, iconeVerdict } from '../diagnosticReseau';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

/** Réponse d'un serveur sain, à la forme exacte de `diagnostics_network`. */
const SAIN = {
  discovered_devices: 2,
  discovered_media_servers: 1,
  registered_outputs: 4,
  slimproto: { port: 3483, ecoute: true, cause: null, message: null, erreur_systeme: null },
  lms_cli: { port: 9090, protocole: 'tcp', ecoute: true, cause: null, message: null, erreur_systeme: null },
  slimproto_udp: null,
  ssdp: { port: 1900, ecoute: true, message: null, erreur_systeme: null, echecs: 0, reponses_msearch: 17 },
  devices: [
    { id: 'u1', name: 'Marantz AV7706', host: '192.168.1.20', type: 'Upnp' },
    { id: 'u2', name: 'WiiM', host: '192.168.1.21', type: 'Upnp' },
  ],
};

let reponseReseau: unknown = SAIN;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function enveloppe(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirPanneau(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const b = [...hote.querySelectorAll('button')].find(
    (x) => (x.textContent ?? '').trim() === fr['diagnostics.network'],
  );
  expect(b, 'bouton « Diagnostic réseau » introuvable').toBeDefined();
  (b as HTMLButtonElement).click();
  await attendre();
  const ul = hote.querySelector<HTMLElement>('ul.reseau');
  expect(ul, 'panneau réseau non rendu').not.toBeNull();
  return ul!;
}

beforeEach(() => {
  reponseReseau = SAIN;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (input: any) => {
    const u = typeof input === 'string' ? input : String(input?.url ?? input);
    if (u.includes('/system/diagnostics/network')) return enveloppe(reponseReseau);
    if (/\/(zones|devices|profiles|shortcuts|collections)(\?|\/|$)/.test(u)) return enveloppe([]);
    return enveloppe({});
  }));
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1867 — lecture de la forme réelle', () => {
  it('écoute en service ⇒ ok ; `null` ⇒ inconnu ; `ecoute: false` ⇒ échec avec la phrase du serveur', () => {
    const d = lireDiagnosticReseau({
      ...SAIN,
      slimproto: { port: 3483, ecoute: false, cause: 'port_occupe', message: 'Un autre serveur tient le port 3483.', erreur_systeme: 'os error 98' },
    });
    const par = Object.fromEntries(d.ecoutes.map((e) => [e.cle, e]));
    expect(par.ssdp).toMatchObject({ verdict: 'ok', port: 1900, reponsesMsearch: 17, message: null });
    expect(par.lms_cli).toMatchObject({ verdict: 'ok', port: 9090 });
    expect(par.slimproto_udp).toMatchObject({ verdict: 'inconnu', port: null });
    expect(par.slimproto).toMatchObject({ verdict: 'echec', message: 'Un autre serveur tient le port 3483.' });
    expect(d).toMatchObject({ appareilsDecouverts: 2, serveursDecouverts: 1, sortiesEnregistrees: 4 });
    expect(d.appareils.map((a) => a.nom)).toEqual(['Marantz AV7706', 'WiiM']);
  });

  it('🔴 une réponse vide ou ancienne ne produit AUCUN échec : tout est « inconnu »', () => {
    for (const r of [{}, null, { multicast_ssdp: false, port_8888: false, internet: false }]) {
      const d = lireDiagnosticReseau(r);
      expect(d.ecoutes.every((e) => e.verdict === 'inconnu')).toBe(true);
      expect(d.appareilsDecouverts).toBeNull();
    }
    expect(iconeVerdict('inconnu')).not.toBe('❌');
  });

  it('les nouveaux libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of ['netSsdp', 'netSlimproto', 'netSlimprotoUdp', 'netLmsCli', 'netPort', 'netMsearch', 'netUnknown', 'netDevices', 'netMediaServers', 'netOutputs']) {
        expect(d[`diagnostics.${k}`], `${code} : diagnostics.${k}`).toBeTruthy();
      }
      expect(d['diagnostics.netPort']).toContain('{port}');
      expect(d['diagnostics.netMsearch']).toContain('{n}');
    }
  });
});

describe('#1867 — le panneau Santé › Diagnostic réseau', () => {
  it('serveur sain : coches vertes, aucune croix, compteurs et appareils affichés', { timeout: 60_000 }, async () => {
    const ul = await ouvrirPanneau();
    const texte = ul.textContent ?? '';
    expect(texte).not.toContain('❌');
    expect(ul.querySelector('[data-ecoute="ssdp"]')?.textContent).toContain('✅');
    expect(ul.querySelector('[data-ecoute="ssdp"]')?.textContent).toContain('1900');
    expect(ul.querySelector('[data-ecoute="slimproto"]')?.textContent).toContain('✅');
    // Écoute jamais tentée : « inconnu », pas une croix.
    expect(ul.querySelector('[data-ecoute="slimproto_udp"]')?.textContent).toContain(fr['diagnostics.netUnknown']);
    expect(ul.querySelector('[data-compte="devices"]')?.textContent).toContain('2');
    expect(ul.querySelector('[data-compte="outputs"]')?.textContent).toContain('4');
    expect(texte).toContain('Marantz AV7706');
    // Les lignes sans mesure ont disparu.
    expect(texte).not.toContain('8888');
  });

  it('🔴 réponse sans aucun des champs attendus : « inconnu » partout, jamais de croix', { timeout: 60_000 }, async () => {
    reponseReseau = {};
    const ul = await ouvrirPanneau();
    expect(ul.textContent).not.toContain('❌');
    for (const cle of ['ssdp', 'slimproto', 'slimproto_udp', 'lms_cli']) {
      expect(ul.querySelector(`[data-ecoute="${cle}"]`)?.textContent, cle).toContain(fr['diagnostics.netUnknown']);
    }
  });

  it('une vraie panne (bind refusé) est une croix, avec la phrase du serveur', { timeout: 60_000 }, async () => {
    reponseReseau = { ...SAIN, ssdp: { port: 1900, ecoute: false, message: 'Le port 1900 est déjà pris.', erreur_systeme: 'os error 98', echecs: 3, reponses_msearch: 0 } };
    const ul = await ouvrirPanneau();
    const l = ul.querySelector('[data-ecoute="ssdp"]')!;
    expect(l.textContent).toContain('❌');
    expect(l.textContent).toContain('Le port 1900 est déjà pris.');
  });
});
