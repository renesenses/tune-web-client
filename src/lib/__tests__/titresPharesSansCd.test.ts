// Recette de Bertrand, .18, rc12 (13/11/2026) : fiche Genesis › Titres phares
// › « Dance on a Volcano » → « Erreur de lecture — HTTP 500 — aucun disque dans
// le lecteur ». Le serveur avait ajouté aux titres Qobuz l'écoute la plus
// fréquente du titre : celle du CD, éjecté depuis l'extraction. Charge
// mesurée sur le .18 (`/streaming/qobuz/artists/4438885/top-tracks`).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chargerTitresPhares, titresPharesJouables } from '../titresPharesArtiste';
import type { Track } from '../types';

const charge = [
  { title: 'Dance on a Volcano', artist_name: 'Genesis', source: 'cd', source_id: 'xA6kQVeYfzh._3s2lYEibSII2pg-/1', local_play_count: 21 },
  { title: 'Abacab', artist_name: 'Genesis', source: 'local', id: 116123 },
  { title: 'Squonk', artist_name: 'Genesis', source: 'upnp', source_id: '66386d382482aabf' },
  { title: 'Duke’s Travels', artist_name: 'Genesis', source: 'tidal', source_id: 't-9' },
  { title: 'The Serpent (2026 Mix)', artist_name: 'Genesis', source_id: '453676644' },
] as unknown as Track[];

describe('titres phares : jamais un appareil (CD, UPnP)', () => {
  it('un titre désigné par le CD ou un serveur UPnP est écarté', () => {
    const titres = titresPharesJouables(charge, 'qobuz');
    expect(titres.map((t) => t.title)).toEqual(['Abacab', 'Duke’s Travels', 'The Serpent (2026 Mix)']);
    expect(titres.some((t) => ['cd', 'upnp'].includes(String(t.source)))).toBe(false);
  });

  it('la source posée par le serveur est gardée, seule l’absente est tamponnée', () => {
    const titres = titresPharesJouables(charge, 'qobuz');
    expect(titres.map((t) => t.source)).toEqual(['local', 'tidal', 'qobuz']);
  });

  it('fiche d’un artiste de la bibliothèque : aucun titre du CD n’atteint la lecture', async () => {
    const titres = await chargerTitresPhares([{ service: 'qobuz', artistId: '4438885', albums: [] }], async () => charge);
    expect(titres.find((t) => t.title === 'Dance on a Volcano')).toBeUndefined();
  });

  it('fiche d’un artiste de service : la même règle, sans écraser la source du serveur', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/ArtisteServiceV2.svelte'), 'utf8');
    expect(src).toContain('titres = titresPharesJouables(tt.value as Track[], service);');
    expect(src).not.toMatch(/titres = \(tt\.value \?\? \[\]\)\.map\(\(p\) => \(\{ \.\.\.p, source: service \}\)\)/);
  });

  it('le refus « disque absent » du serveur se lit dans sa phrase, pas en HTTP 500 brut', () => {
    const api = readFileSync(resolve(__dirname, '../api.ts'), 'utf8');
    const bloc = api.slice(api.indexOf('const MESSAGES_RENDUS_PAR_LE_SERVEUR'), api.indexOf(']);', api.indexOf('const MESSAGES_RENDUS_PAR_LE_SERVEUR')));
    expect(bloc).toContain("'cd_disc_absent'");
  });
});
