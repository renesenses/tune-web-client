/**
 * #3307 — deux réponses serveur nouvelles que l'écran doit DIRE.
 *
 * 1. tune-server-rust#9254 : `crossfeed_status.reason == "non_local_partial"`
 *    avec `unavailable: false` (OAAT, navigateur). Le contrôle reste actif,
 *    mais le crossfeed ne s'applique qu'aux pistes converties pour la sortie :
 *    une ligne d'aide le dit.
 * 2. tune-server-rust#9250 : `favorites/artists` rend 200, liste vide, avec
 *    `portee_manquante: "user-follow-read"` quand le compte Spotify a été relié
 *    avant cette portée. L'écran invite à reconnecter Spotify.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RESERVE_PARTIELLE,
  cleReserveCrossfeed,
  indisponibiliteCrossfeed,
} from '../crossfeed';
import { chargerFavorisProgressifs, porteeManquante, type NatureFavori } from '../favorisProgressifs';
import fr from '../locales/fr';
import en from '../locales/en';

const statut = (unavailable: boolean, reason: string | null) => ({
  requested: true, effective: true, unavailable, reason,
  detail: reason ? 'phrase serveur' : null,
});

describe('#3307 — réserve crossfeed `non_local_partial`', () => {
  it('le code est celui du serveur', () => {
    expect(RESERVE_PARTIELLE).toBe('non_local_partial');
  });

  it('🔴 la réserve donne une ligne d’aide, sans verrouiller', () => {
    const s = statut(false, 'non_local_partial');
    expect(cleReserveCrossfeed(s)).toBe('dsp.crossfeedPartialNote');
    expect(indisponibiliteCrossfeed(s, 'browser').indisponible).toBe(false);
  });

  it('aucune ligne d’aide quand le réglage est honoré, ou sans statut', () => {
    expect(cleReserveCrossfeed(statut(false, null))).toBeNull();
    expect(cleReserveCrossfeed(null)).toBeNull();
    expect(cleReserveCrossfeed(undefined)).toBeNull();
  });

  it('un motif verrouillant garde son avertissement, pas la ligne d’aide', () => {
    expect(cleReserveCrossfeed(statut(true, 'non_local_partial'))).toBeNull();
    expect(cleReserveCrossfeed(statut(true, 'non_local_output'))).toBeNull();
  });

  it('la phrase attendue existe en français et en anglais', () => {
    expect((fr as Record<string, string>)['dsp.crossfeedPartialNote']).toBe(
      'Appliqué seulement quand la piste est convertie pour cette sortie.',
    );
    expect((en as Record<string, string>)['dsp.crossfeedPartialNote']).toBeTruthy();
  });
});

describe('#3307 — artistes suivis Spotify : `portee_manquante`', () => {
  // Forme exacte de tune-server-rust#9250 (`service_favorites`).
  const reponse9250 = {
    artists: [],
    portee_manquante: 'user-follow-read',
    code: 'spotify_reconnexion_artistes_suivis',
    message: 'Reconnectez Spotify…',
  };

  it('lit la portée manquante, et rien sur une réponse ordinaire', () => {
    expect(porteeManquante(reponse9250)).toBe('user-follow-read');
    expect(porteeManquante({ artists: [{ name: 'A' }] })).toBeNull();
    expect(porteeManquante(null)).toBeNull();
    expect(porteeManquante({ portee_manquante: '' })).toBeNull();
  });

  it('🔴 le chargement progressif signale la nature refusée', async () => {
    const signale: Array<[NatureFavori, string]> = [];
    const vus: Record<string, unknown[]> = {};
    await chargerFavorisProgressifs(
      async (nature) => (nature === 'artists' ? reponse9250 : { [nature]: [] }),
      (nature, items) => { vus[nature] = items; },
      () => {},
      undefined,
      (nature, portee) => signale.push([nature, portee]),
    );
    expect(signale).toEqual([['artists', 'user-follow-read']]);
    expect(vus.artists).toEqual([]);
  });

  it('l’invite existe en français et en anglais', () => {
    expect((fr as Record<string, string>)['favorites.spotifyReconnectFollowed']).toBeTruthy();
    expect((en as Record<string, string>)['favorites.spotifyReconnectFollowed']).toBeTruthy();
  });
});

/* ───────────────────────── Le câblage des écrans ───────────────────────── */

const source = (chemin: string) =>
  readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8')
    // Un commentaire qui cite un identifiant ne prouve pas qu'il est branché.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('#3307 — câblage', () => {
  it('Crossfeed v2 et « En écoute » affichent la réserve', () => {
    for (const f of ['../../components/v2/CrossfeedV2.svelte', '../../components/partages/NowPlaying.svelte']) {
      const s = source(f);
      expect(s, f).toMatch(/cleReserveCrossfeed\((status|cfStatut)\)/);
      expect(s, f).toMatch(/data-crossfeed-reserve/);
    }
  });

  it('l’écran Streaming lit la portée et mène à la reconnexion', () => {
    const s = source('../../components/v2/StreamingV2.svelte');
    expect(s).toMatch(/artistesPorteeManquante = true/);
    expect(s).toMatch(/\{#if artistesPorteeManquante\}/);
    expect(s).toMatch(/onclick=\{ouvrirReconnexionSpotify\}/);
    expect(s).toMatch(/favorites\.spotifyReconnectFollowed/);
  });
});
