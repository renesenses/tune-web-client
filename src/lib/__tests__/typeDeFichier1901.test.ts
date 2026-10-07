/**
 * #1901 (Fredouille40, fil 2131) — le type de fichier sous l'album et en
 * colonne.
 *
 * Tenu ici :
 *  1. `formatDeFichier` : le type, court, en capitales, MIME compris ;
 *  2. `qualiteCompacte` (troisième ligne des vignettes) : le DSD dit son vrai
 *     multiple et son conteneur — il plafonnait à « DSD128 » ;
 *  3. la colonne « Format » est proposée à TOUS les niveaux, Essentiel compris ;
 *  4. la vue LISTE de la Bibliothèque dit le type même hors hi-res, et le
 *     badge posé SUR la pochette reste réservé au DSD et au hi-res.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatDeFichier, qualiteCompacte } from '../typeDeFichier';
import { DEFAUTS, PAR_CLE, colonnesRetenues, offerteAu } from '../colonnesPistes';

describe('#1901 — formatDeFichier', () => {
  it.each([
    ['flac', 'FLAC'], ['wav', 'WAV'], ['mp3', 'MP3'], ['dsf', 'DSF'], ['dff', 'DFF'],
    ['audio/x-dsf', 'DSF'], ['audio/flac', 'FLAC'], [' Flac ', 'FLAC'],
  ])('%s → %s', (brut, attendu) => {
    expect(formatDeFichier(brut)).toBe(attendu);
  });

  it('rien quand le format est inconnu', () => {
    expect(formatDeFichier(null)).toBeNull();
    expect(formatDeFichier('')).toBeNull();
    expect(formatDeFichier('  ')).toBeNull();
  });
});

describe('#1901 — la troisième ligne des vignettes', () => {
  it('un FLAC 44,1/16 et un MP3 disent leur type', () => {
    expect(qualiteCompacte({ format: 'flac', sample_rate: 44100, bit_depth: 16 })).toBe('FLAC 44.1/16');
    expect(qualiteCompacte({ format: 'mp3', sample_rate: 44100 })).toBe('MP3 44.1');
    expect(qualiteCompacte({ format: 'wav' })).toBe('WAV');
  });

  it('🔴 le DSD dit son VRAI multiple et son conteneur', () => {
    // L'ancienne règle : « ≥ 5 MHz ⇒ DSD128 » — un DSD256 et un DSD512
    // s'annonçaient DSD128, et le DSF n'était jamais nommé.
    expect(qualiteCompacte({ format: 'dsf', sample_rate: 2822400 })).toBe('DSF DSD64');
    expect(qualiteCompacte({ format: 'dsf', sample_rate: 11289600 })).toBe('DSF DSD256');
    expect(qualiteCompacte({ format: 'dff', sample_rate: 22579200 })).toBe('DFF DSD512');
    expect(qualiteCompacte({ format: 'dsd', sample_rate: 5644800 })).toBe('DSD128');
  });

  it('un DXD est une fréquence, dans son conteneur', () => {
    expect(qualiteCompacte({ format: 'wav', sample_rate: 352800, bit_depth: 24 })).toBe('WAV 352.8/24');
  });

  it('rien à dire, rien d’affiché', () => {
    expect(qualiteCompacte(null)).toBeNull();
    expect(qualiteCompacte({})).toBeNull();
  });
});

describe('#1901 — la colonne « Format »', () => {
  it('est proposée à tous les niveaux, Essentiel compris', () => {
    for (const m of ['beginner', 'intermediate', 'expert'] as const) {
      expect(offerteAu(PAR_CLE.format, m), m).toBe(true);
    }
    expect(colonnesRetenues(['title', 'format'], 'beginner').map((c) => c.cle)).toContain('format');
  });

  it('reste décochée d’office', () => {
    for (const m of ['beginner', 'intermediate', 'expert'] as const) {
      expect(DEFAUTS[m], m).not.toContain('format');
    }
  });
});

describe('#1901 — branché dans la Bibliothèque et les vignettes', () => {
  const lib = readFileSync(resolve(__dirname, '../../components/v2/LibraryV2.svelte'), 'utf8');
  const qa = readFileSync(resolve(__dirname, '../../components/v2/QualiteAlbum.svelte'), 'utf8');

  it('les lignes de la vue liste disent le type, même hors hi-res', () => {
    const lignes = lib.match(/<span class="lb">\{#if badgeListe\(a\)\}/g) ?? [];
    expect(lignes.length, 'la vue liste ne dit pas le type de fichier').toBe(2);
    expect(lib).toMatch(/return badge\(a\) \?\? formatDeFichier\(a\.format\);/);
  });

  it('le badge posé sur la pochette reste réservé au DSD et au hi-res', () => {
    expect(lib).toMatch(/\{#if showBadges\}\{#key badge\(a\)\}\{#if badge\(a\)\}<span class="bdg">\{badge\(a\)\}/);
  });

  it('la troisième ligne passe par qualiteCompacte', () => {
    expect(qa).toMatch(/const qualite = \$derived\(qualiteCompacte\(objet\)\);/);
  });
});
