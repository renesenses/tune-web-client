// @vitest-environment jsdom
//
// tune-server-rust#4741, après la rc3 — les liens et les sauvegardes de
// `/playlist-manager` doublonnaient le greffon « Playlists converter ». Le
// serveur ne les garde plus qu'une version, comme alias dépréciés (en-tête
// `Deprecation`), pour les anciens clients. Côté client :
//
//   1. plus aucun appel vers `/playlist-manager/links*` ni `/backup(s)*` ;
//   2. le panneau Sauvegardes de l'écran v2 passe par le greffon : une copie
//      datée par playlist, et « Restaurer » recrée depuis la plus récente ;
//   3. un refus Premium (402) ou un greffon absent (404) est EXPLIQUÉ, pas
//      montré comme une panne.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as api from '../api';
import {
  copierTout,
  motifSauvegardeImpossible,
  playlistsACopier,
  recreerDepuisLaPlusRecente,
} from '../sauvegardesGreffon';

const RACINE_SRC = resolve(__dirname, '../..');
const source = (chemin: string) => readFileSync(resolve(__dirname, chemin), 'utf-8');

function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function fichiersDuClient(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__' || nom === 'locales') continue;
      sortie.push(...fichiersDuClient(chemin));
    } else if (/\.(ts|svelte)$/.test(nom)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

type Appel = { url: string; methode: string; corps: any };

/** `fetch` simulé : enregistre chaque appel, répond par `repondre`. */
function simulerFetch(repondre: (a: Appel) => { status: number; corps: unknown }): Appel[] {
  const appels: Appel[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const appel = {
        url: String(url),
        methode: (init?.method ?? 'GET').toUpperCase(),
        corps: init?.body ? JSON.parse(String(init.body)) : null,
      };
      appels.push(appel);
      const { status, corps } = repondre(appel);
      return new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  return appels;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('#4741 — plus aucun appel vers les doublons de /playlist-manager', () => {
  it("l'API n'exporte plus les anciennes fonctions de liens et de sauvegardes", () => {
    for (const nom of [
      'backupPlaylists',
      'listPlaylistSnapshots',
      'getPlaylistSnapshot',
      'deletePlaylistSnapshot',
      'restorePlaylistSnapshot',
      'getPlaylistLinks',
      'createPlaylistLink',
      'triggerPlaylistSync',
      'deletePlaylistLink',
    ]) {
      expect(nom in api, `${nom} est encore exportée`).toBe(false);
    }
  });

  it('aucun fichier du client ne vise /playlist-manager/links ni /playlist-manager/backup', () => {
    const fautifs = fichiersDuClient(RACINE_SRC).filter((f) =>
      /playlist-manager\/(links|backup)/.test(sansCommentaires(readFileSync(f, 'utf-8'))),
    );
    expect(fautifs).toEqual([]);
  });

  it("l'écran de gestion n'a plus d'onglets Synchro ni Sauvegarde à lui", () => {
    const vue = sansCommentaires(source('../../components/v2-heritage/PlaylistManagerView.svelte'));
    expect(vue).not.toMatch(/managerTab === 'sync'|managerTab === 'backup'/);
    // Les onglets du greffon, eux, restent.
    expect(vue).toContain("managerTab === 'conv-snapshots'");
    expect(vue).toContain("managerTab === 'conv-synchro'");
  });
});

describe('#4741 — le panneau Sauvegardes passe par le greffon', () => {
  it('la liste à copier prend la bibliothèque, puis chaque service', () => {
    expect(
      playlistsACopier(
        [{ id: 7, name: 'Locale' }, { id: null, name: 'sans id' }],
        { qobuz: [{ source_id: 'q-1', name: 'Q' }, { source_id: null, name: 'sans id' }] },
      ),
    ).toEqual([
      { service: 'local', playlist_id: '7', nom: 'Locale' },
      { service: 'qobuz', playlist_id: 'q-1', nom: 'Q' },
    ]);
  });

  it('« Tout sauvegarder » prend une copie datée de chaque playlist chez le greffon', async () => {
    const appels = simulerFetch(() => ({ status: 200, corps: { snapshot: { snapshot_id: 'snap-1-1' } } }));
    const r = await copierTout([
      { service: 'local', playlist_id: '7', nom: 'Locale' },
      { service: 'qobuz', playlist_id: 'q-1', nom: 'Q' },
    ]);
    expect(r).toEqual({ reussies: 2, echecs: 0, impossible: null });
    expect(appels.map((a) => `${a.methode} ${a.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'POST /plugins/playlists-converter/snapshot',
      'POST /plugins/playlists-converter/snapshot',
    ]);
    expect(appels[0].corps).toEqual({ service: 'local', playlist_id: '7', nom: 'Locale' });
  });

  it('« Restaurer » recrée depuis la copie la plus récente : aperçu en mode recreer, puis accord', async () => {
    const appels = simulerFetch((a) => {
      if (a.url.includes('/snapshots?')) {
        return { status: 200, corps: { count: 2, snapshots: [{ snapshot_id: 'snap-1-2' }, { snapshot_id: 'snap-1-1' }] } };
      }
      if (a.url.endsWith('/snapshot/restauration/apercu')) {
        return { status: 200, corps: { plan: { plan_id: 'plan-3' }, a_rajouter: [], a_retirer_par_vous: [] } };
      }
      return { status: 200, corps: { plan: { plan_id: 'plan-3', etat: 'termine' }, a_retirer_par_vous: [] } };
    });
    await recreerDepuisLaPlusRecente('qobuz', 'q 1');
    expect(appels.map((a) => `${a.methode} ${a.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'GET /plugins/playlists-converter/snapshots?service=qobuz&playlist_id=q%201',
      'POST /plugins/playlists-converter/snapshot/restauration/apercu',
      'POST /plugins/playlists-converter/snapshot/restauration',
    ]);
    expect(appels[1].corps).toEqual({ snapshot_id: 'snap-1-2', mode: 'recreer' });
    expect(appels[2].corps).toEqual({ plan_id: 'plan-3', accord: true });
  });

  it("l'écran v2 appelle ce module, et n'a plus de bouton Supprimer", () => {
    const ecran = sansCommentaires(source('../../components/v2/PlaylistsV2.svelte'));
    expect(ecran).toMatch(/copierTout\(playlistsACopier\(local, services\)\)/);
    expect(ecran).toMatch(/recreerDepuisLaPlusRecente\(snap\.service, snap\.playlist_id\)/);
    expect(ecran).toMatch(/api\.convertisseurPlaylistsGardees\(\)/);
    expect(ecran).not.toMatch(/supprimerInstantane|deletePlaylistSnapshot/);
  });
});

describe('#4741 — un refus est expliqué, pas montré comme une panne', () => {
  it('un compte gratuit : 402 premium_required, avec le lien vers l’offre', async () => {
    simulerFetch(() => ({
      status: 402,
      corps: { error: 'premium_required', code: 'plugin_marketplace', upgrade_url: 'https://mozaiklabs.fr/pricing' },
    }));
    const r = await copierTout([
      { service: 'local', playlist_id: '7', nom: 'A' },
      { service: 'local', playlist_id: '8', nom: 'B' },
    ]);
    expect(r).toEqual({ reussies: 0, echecs: 0, impossible: { motif: 'premium', url: 'https://mozaiklabs.fr/pricing' } });
    expect((fetch as any).mock.calls).toHaveLength(1);
  });

  it("un lien d'offre qui n'est pas en http(s) n'est pas peint", async () => {
    simulerFetch(() => ({ status: 402, corps: { error: 'premium_required', upgrade_url: 'ftp://exemple.invalid/offre' } }));
    const err = await api.convertisseurPlaylistsGardees().then(() => null, (e) => e);
    expect(motifSauvegardeImpossible(err)).toEqual({ motif: 'premium', url: null });
  });

  it('greffon absent : 404 → « greffon non chargé »', async () => {
    simulerFetch(() => ({ status: 404, corps: { error: 'plugin not found', id: 'playlists-converter' } }));
    const err = await api.convertisseurPlaylistsGardees().then(() => null, (e) => e);
    expect(motifSauvegardeImpossible(err)).toEqual({ motif: 'greffon', url: null });
  });

  it('une vraie panne reste une panne', async () => {
    simulerFetch(() => ({ status: 500, corps: { error: 'boom' } }));
    const r = await copierTout([{ service: 'local', playlist_id: '7', nom: 'A' }]);
    expect(r).toEqual({ reussies: 0, echecs: 1, impossible: null });
  });

  it("l'écran peint l'explication et le lien, dans les onze langues", () => {
    const ecran = source('../../components/v2/PlaylistsV2.svelte');
    expect(ecran).toContain("$t('v2.pl.backupPremium' as any)");
    expect(ecran).toContain("$t('v2.pl.backupNoPlugin' as any)");
    expect(ecran).toMatch(/<a href=\{sauvegardeImpossible\.url\}[^>]*>\{\$t\('v2\.pl\.backupPremiumLink' as any\)\}<\/a>/);
    for (const langue of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const fichier = source(`../locales/${langue}.ts`);
      for (const cle of ['backupPremium', 'backupNoPlugin', 'backupRing', 'backupPartial', 'backupPremiumLink']) {
        expect(fichier, `${langue} : v2.pl.${cle}`).toContain(`"v2.pl.${cle}":`);
      }
    }
  });
});
