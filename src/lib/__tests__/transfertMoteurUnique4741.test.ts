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
