// @vitest-environment jsdom
//
// tune-server-rust#4741 — un seul moteur de transfert de playlists, celui du
// greffon « Playlists converter ».
//
// Côté serveur, `POST /playlist-manager/batch-transfer` disparaît (il écrivait
// « started » et ne transférait rien) et `POST /playlist-manager/transfer`
// passe par le greffon, qui rend pour chaque titre introuvable sa `raison`.
// Côté client :
//
//   1. plus aucun appel à la route retirée — ni fonction, ni bouton ;
//   2. le transfert garde sa route, et son corps ;
//   3. la raison d'un titre introuvable arrive jusqu'à l'écran, dans les mots
//      de l'onglet du greffon.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { cleRaison } from '../convertisseurPlaylists';

const source = (chemin: string) => readFileSync(resolve(__dirname, chemin), 'utf-8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('#4741 — la route de transfert par lot factice a disparu du client', () => {
  it("l'API n'exporte plus batchTransfer", () => {
    expect('batchTransfer' in api).toBe(false);
  });

  it('aucun fichier du client ne cite plus /playlist-manager/batch-transfer', () => {
    for (const fichier of ['../api.ts', '../../components/v2-heritage/PlaylistManagerView.svelte']) {
      expect(source(fichier), fichier).not.toMatch(/batch-transfer|batchTransfer\(/);
    }
  });
});

describe('#4741 — le transfert garde sa route', () => {
  it('transferPlaylistV2 poste sur /playlist-manager/transfer avec le nom choisi', async () => {
    const appels: { url: string; methode: string; corps: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({
          url: String(url),
          methode: (init?.method ?? 'GET').toUpperCase(),
          corps: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ lot_id: 'lot-1', tracks: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const r = await api.transferPlaylistV2({
      source_service: 'qobuz',
      source_playlist_id: 'pl-1',
      target_service: 'local',
      target_name: 'Importée',
    });
    expect(r.lot_id).toBe('lot-1');
    expect(appels).toHaveLength(1);
    expect(appels[0].methode).toBe('POST');
    expect(appels[0].url).toMatch(/\/playlist-manager\/transfer$/);
    expect(appels[0].corps).toMatchObject({ target_service: 'local', target_name: 'Importée' });
  });
});

describe("#4741 — la raison d'un titre introuvable arrive à l'écran", () => {
  const vue = source('../../components/v2-heritage/PlaylistManagerView.svelte');

  it('les deux lectures de la réponse (fenêtre de transfert, transfert rapide) gardent la raison', () => {
    expect(vue.match(/raison: t\.raison \?\? null,/g) ?? []).toHaveLength(2);
  });

  it("les deux listes de titres l'affichent, traduite comme dans l'onglet du greffon", () => {
    const affichages =
      vue.match(/track\.status === 'not_found' && track\.raison\}<span class="transfer-raison"> — \{\$tr\(cleRaison\(track\.raison\.code\)\)\}/g) ?? [];
    expect(affichages).toHaveLength(2);
  });

  it('un code connu du greffon a sa clé, un code inconnu retombe sur « autre »', () => {
    expect(cleRaison('duree_hors_tolerance')).toBe('plconv.raison.duree_hors_tolerance');
    expect(cleRaison('code_venu_d_ailleurs')).toBe('plconv.raison.autre');
  });
});

// Bertrand, 07/10/2026 : le transfert entre services est Premium. Un compte
// gratuit reçoit `402 premium_required` (tune-server-rust#5954) ; l'écran
// l'explique, avec le lien vers l'offre, au lieu de l'ancien échec muet.
describe('#4741 — un compte gratuit voit pourquoi le transfert est refusé', () => {
  const vue = source('../../components/v2-heritage/PlaylistManagerView.svelte');

  it("le refus 402 arrive à l'écran avec son code et le lien vers l'offre", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: 'premium_required',
            code: 'playlist_transfer',
            upgrade_url: 'https://mozaiklabs.fr/pricing',
            raison: 'réservé à Tune Premium',
          }),
          { status: 402, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const err = await api
      .transferPlaylistV2({ source_service: 'qobuz', source_playlist_id: 'pl-1', target_service: 'local' })
      .then(() => null, (e) => e);
    expect(err?.status).toBe(402);
    expect(err?.code).toBe('premium_required');
    expect(err?.corps?.upgrade_url).toBe('https://mozaiklabs.fr/pricing');
  });

  it('les trois chemins de transfert (Importer, Transférer, transfert rapide) notent le refus', () => {
    const appels = vue.match(/noterRefusTransfert\(e\)/g) ?? [];
    expect(appels).toHaveLength(3);
    // Le refus ne devient plus « échec » ni bandeau d'erreur générique.
    expect(vue).toContain('if (!noterRefusTransfert(e)) importResult = { name: importName, count: -1, total: 0 };');
    expect(vue).toContain("if (!noterRefusTransfert(e)) notifications.error(e.message || 'Transfer failed');");
  });

  it("l'explication et le lien de l'offre sont peints là où le refus arrive", () => {
    const blocs = vue.match(/\{\$tr\('playlist\.transferPremium'\)\}/g) ?? [];
    expect(blocs).toHaveLength(3);
    const liens = vue.match(/<a href=\{refusTransfert\.url\}[^>]*>\{\$tr\('playlist\.transferPremiumLink'\)\}<\/a>/g) ?? [];
    expect(liens).toHaveLength(3);
  });

  it('les deux libellés existent dans les onze langues', () => {
    for (const langue of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const fichier = source(`../locales/${langue}.ts`);
      expect(fichier, langue).toContain('"playlist.transferPremium":');
      expect(fichier, langue).toContain('"playlist.transferPremiumLink":');
    }
  });
});
