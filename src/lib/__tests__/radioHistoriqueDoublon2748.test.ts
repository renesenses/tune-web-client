/**
 * web#2748 (FabienM, fil 2723, point 8) — dans l'Historique, le conteneur
 * d'une radio listait, en plus des titres joués, une ligne au nom de la
 * station : « BBC Radio 6 Music », vu deux fois.
 *
 * Formes mesurées sur le .18 le 10/11/2026 : la ligne de `/library/history`
 * pour une station (titre = nom de la station, sans artiste), et le
 * `current_track` d'une zone radio (titre et artiste annoncés, `album_title`
 * = nom de la station), que le carnet du navigateur note.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { entreesDepuisServeur } from '../historiqueLecture';
import { nomDObjet, regrouperParContexte, titresDuTiroir } from '../historiqueParContexte';
import type { HistoryEntry } from '../stores/history';

const FLUX = 'https://as-hls-ww-live.akamaized.net/pool_81827798/live/bbc_6music.m3u8';

const station = entreesDepuisServeur([{
  title: 'BBC Radio 6 Music', artist_name: null, album_title: null, source: 'radio', source_id: FLUX,
  context_type: 'radio', context_id: '60', context_source: 'radio', listened_at: '2026-11-09T16:15:35Z', zone_id: 10,
}])[0];

const titre = (title: string, artist: string, quand: string): HistoryEntry => ({
  track: { id: null, title, artist_name: artist, album_title: 'BBC Radio 6 Music', source: 'radio', source_id: FLUX } as any,
  playedAt: quand, zoneName: 'Salon',
});

function tiroirRadio(entrees: HistoryEntry[]) {
  const [objet] = regrouperParContexte(entrees) as any[];
  expect(objet.genre).toBe('objet');
  expect(objet.type).toBe('radio');
  return { objet, titres: titresDuTiroir(objet.type, objet.entrees, nomDObjet(objet.type, objet.entrees)) };
}

describe('web#2748 — le tiroir d’une radio', () => {
  it('🔴 la ligne de la station n’est pas répétée parmi les titres joués', () => {
    const { objet, titres } = tiroirRadio([
      titre('Idioteque', 'Radiohead', '2026-11-09T16:20:00Z'),
      station,
      titre('Hey Ya!', 'OutKast', '2026-11-09T16:17:00Z'),
    ]);
    expect(objet.entrees, 'les trois écoutes tombent dans le même conteneur').toHaveLength(3);
    expect(titres.map((e) => (e.track as any).title)).toEqual(['Idioteque', 'Hey Ya!']);
  });

  it('station écoutée sans titre annoncé : la ligne reste (le tiroir n’est pas vide)', () => {
    const { titres } = tiroirRadio([station, titre('BBC Radio 6 Music', '', '2026-11-09T16:16:00Z')]);
    expect(titres.length).toBeGreaterThan(0);
  });

  it('un titre qui porte le nom de la station MAIS un artiste reste listé', () => {
    const { titres } = tiroirRadio([titre('BBC Radio 6 Music', 'Un Groupe', '2026-11-09T16:20:00Z'), station]);
    expect(titres.map((e) => (e.track as any).artist_name)).toEqual(['Un Groupe']);
  });

  it('hors radio, rien n’est écarté', () => {
    const e = [titre('Album X', '', '2026-11-09T16:20:00Z')];
    expect(titresDuTiroir('album', e, 'Album X')).toBe(e);
  });

  it('HistoriqueV2 rend le tiroir et le compte depuis `titresDuTiroir`', () => {
    const src = readFileSync(new URL('../../components/v2/HistoriqueV2.svelte', import.meta.url), 'utf8');
    expect(src).toMatch(/\{@const titres = titresDuTiroir\(tranche\.type, lot, nom\)\}/);
    expect(src).toMatch(/pistes=\{titres\.map\(\(x\) => x\.track\)\}/);
    expect(src).toMatch(/<span class="ocompte">\{titres\.length\}<\/span>/);
  });
});
