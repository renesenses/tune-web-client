// @vitest-environment jsdom
//
// tune-server-rust#4201 — critère « état consultable après navigation ou
// redémarrage : dernier bilan, erreur et comptes ». Le serveur porte depuis la
// v0.9.165 le champ `upnp_import` de `GET /library/stats` (bilan PERSISTÉ de
// chaque source synchronisée) ; aucun écran ne le lisait. Réglages ›
// Bibliothèque le montre désormais.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { t, locale } from '../i18n';
import { dateDeSynchro, etatImportUpnpDe } from '../etatImportUpnp';
import EtatImportUpnp from '../../components/partages/EtatImportUpnp.svelte';

/** La forme de `etat_d_import` (tune-server/src/routes/synchronisation_upnp.rs). */
const UPNP_IMPORT = {
  sources: 2,
  complet: false,
  sources_incompletes: 1,
  raisons: ['NAS salon : plafond de conteneurs atteint ; 34 pagination(s) interrompue(s)'],
  plafonds_atteints: ['conteneurs'],
  erreurs: 34,
  paginations_interrompues: 34,
  pistes_distinctes: 50_395,
  items_vus: 52_000,
  conteneurs_visites: 1_000,
  ecartees_sans_url_de_lecture: 0,
  par_source: [
    { key: 'uuid:a|0', name: 'NAS salon', udn: 'uuid:a', container: '0', status: 'ok',
      last_attempt: 1_760_000_000, last_success: 1_760_000_000, complet: false,
      raison: 'plafond de conteneurs atteint ; 34 pagination(s) interrompue(s)', plafond_atteint: 'conteneurs',
      erreurs: 34, paginations_interrompues: 34, pistes_distinctes: 49_395, items_vus: 51_000, conteneurs_visites: 1_000 },
    { key: 'uuid:b|0', name: 'Minim bureau', udn: 'uuid:b', container: '0', status: 'ok',
      last_attempt: 1_760_100_000, last_success: null, complet: true, raison: null, plafond_atteint: null,
      erreurs: 0, paginations_interrompues: 0, pistes_distinctes: 1_000, items_vus: 1_000, conteneurs_visites: 12 },
  ],
};

let stats: unknown;
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  stats = { tracks: 60_000, albums: 5_000, artists: 900, upnp_import: UPNP_IMPORT };
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => stats, text: async () => JSON.stringify(stats),
  } as unknown as Response)));
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  vi.unstubAllGlobals();
});

async function monter() {
  monte = mount(EtatImportUpnp, { target: cible! });
  for (let i = 0; i < 50; i++) { flushSync(); await new Promise((r) => setTimeout(r, 5)); }
  return cible!.querySelector('[data-etat-import-upnp]') as HTMLElement | null;
}
const texte = (cle: string) => get(t)(cle as any);

describe('Réglages › Bibliothèque : état de la bibliothèque UPnP (#4201)', () => {
  it('🔴 dernière synchronisation, nombre de pistes et erreurs, par source', async () => {
    const bloc = await monter();
    expect(bloc, 'upnp_import est servi et rien ne l’affiche').not.toBeNull();
    expect(bloc!.textContent).toContain(texte('v2.set.upnpImportTitle'));

    const nas = bloc!.querySelector('[data-source-upnp="uuid:a|0"]')!;
    expect(nas.textContent).toContain('NAS salon');
    expect(nas.textContent).toContain(dateDeSynchro(1_760_000_000, get(locale))!);
    expect(nas.textContent).toMatch(/49[\s  ,.]?395/);
    expect(nas.textContent).toMatch(/34/);
    expect(nas.querySelector('[data-raison]')!.textContent).toContain('plafond de conteneurs atteint');

    const minim = bloc!.querySelector('[data-source-upnp="uuid:b|0"]')!;
    expect(minim.textContent).toContain(texte('v2.set.upnpImportNeverSynced'));
    expect(minim.querySelector('[data-raison]'), 'source complète : pas de motif').toBeNull();

    expect(bloc!.querySelector('.resume')!.textContent).toContain(
      texte('v2.set.upnpImportIncomplete').replace('{n}', '1').replace('{total}', '2'),
    );
  });

  it('serveur ancien (champ absent), lecture en échec (null) ou aucune source : rien ne s’affiche', async () => {
    for (const s of [{ tracks: 1 }, { tracks: 1, upnp_import: null },
      { tracks: 1, upnp_import: { ...UPNP_IMPORT, sources: 0, complet: null, par_source: [] } }]) {
      expect(etatImportUpnpDe(s)).toBeNull();
    }
    stats = { tracks: 1, upnp_import: null };
    expect(await monter()).toBeNull();
  });

  it('le bloc est monté dans la section Bibliothèque des Réglages', () => {
    const v2 = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    const i = v2.indexOf("{:else if s.id === 'library'}");
    expect(i).toBeGreaterThan(-1);
    // La section va jusqu'à la suivante (`{:else if s.id === …}`) : elle
    // contient ses propres `{:else if}` imbriqués (web#2324).
    const section = v2.slice(i, v2.indexOf('{:else if s.id ===', i + 10));
    expect(section).toMatch(/<EtatImportUpnp \/>/);
  });
});
