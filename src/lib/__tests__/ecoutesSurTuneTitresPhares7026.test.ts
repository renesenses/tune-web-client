/**
 * #7026 — « Top tracks » d'une fiche artiste de service (Qobuz, TIDAL).
 *
 * Le serveur y pose `play_count` = le total des écoutes de TOUS les
 * utilisateurs de Tune (agrégé par mozaiklabs.fr), avec
 * `play_count_scope: 'community'`, et `last_played_at` = la dernière écoute
 * de CE serveur. La colonne « # Plays » affiche le nombre comme ailleurs ;
 * l'infobulle dit ce qu'il compte. Partout ailleurs `play_count` est local et
 * la cellule garde son infobulle d'avant (la valeur brute).
 */
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { cleInfobulleColonne, valeurColonne } from '../colonnesPistes';
import { locale, t } from '../i18n';
import type { Track } from '../types';

/** Une ligne de `GET /streaming/qobuz/artists/{id}/top-tracks` après #7026. */
const TITRE_PHARE = {
  id: 0, title: 'Summer Clothes', source: 'qobuz', source_id: '3561',
  play_count: 500, play_count_scope: 'community', local_play_count: 2,
  last_played_at: '2026-10-24 21:12:03',
} as unknown as Track;

const PISTE_LOCALE = { id: 7, title: 'So What', play_count: 4, last_played_at: '2026-09-06T12:09:53Z' } as Track;

describe('#7026 — # Plays des titres phares : les écoutes sur Tune', () => {
  it('affiche le total et le dit en infobulle', () => {
    expect(valeurColonne(TITRE_PHARE, 'plays')).toBe('500');
    expect(valeurColonne(TITRE_PHARE, 'lastPlayed')).toBe('2026-10-24');
    expect(cleInfobulleColonne(TITRE_PHARE, 'plays')).toBe('v2.tcol.playsCommunity');
  });

  it('une piste de la bibliothèque garde son infobulle d\'avant', () => {
    expect(cleInfobulleColonne(PISTE_LOCALE, 'plays')).toBeNull();
    expect(cleInfobulleColonne(TITRE_PHARE, 'lastPlayed')).toBeNull();
  });

  it('l\'infobulle est traduite', () => {
    for (const l of ['fr', 'en'] as const) {
      locale.set(l);
      const texte = String(get(t)('v2.tcol.playsCommunity' as never));
      expect(texte).not.toBe('v2.tcol.playsCommunity');
      expect(texte).toMatch(/Tune/);
    }
  });
});
