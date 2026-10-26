import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLE_GENRES_CLAP_EXCLUS,
  CLE_GENRES_CLAP_INCLUS,
  afficherGenres,
  genresDepuisConfig,
  lireSaisieDeGenres,
} from '../genresClap';

/**
 * tune-server-rust#6198 — réserver l'analyse acoustique (CLAP) à certains
 * genres, ou en écarter. Thierry, plus de 550 000 pistes.
 */
const src = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/SettingsV2.svelte', import.meta.url)),
  'utf-8',
);

describe('#6198 — les genres de l’analyse acoustique', () => {
  it('les clés sont celles que le serveur publie', () => {
    expect(CLE_GENRES_CLAP_INCLUS).toBe('audio_embedding_genres_included');
    expect(CLE_GENRES_CLAP_EXCLUS).toBe('audio_embedding_genres_excluded');
  });

  it('se tait si le serveur ne publie pas le réglage', () => {
    expect(genresDepuisConfig(undefined)).toBeNull();
    expect(genresDepuisConfig('Jazz')).toBeNull();
    expect(genresDepuisConfig(['Jazz', 3, 'Pop'])).toEqual(['Jazz', 'Pop']);
    expect(src).toMatch(/\{#if clapGenresInclus !== null && clapGenresExclus !== null\}/);
  });

  it('lit une saisie séparée par des virgules, sans vide ni doublon', () => {
    expect(lireSaisieDeGenres(' Jazz, classique;; JAZZ ,Blues ')).toEqual(['Jazz', 'classique', 'Blues']);
    expect(lireSaisieDeGenres('  ')).toEqual([]);
    expect(afficherGenres(['Jazz', 'Blues'])).toBe('Jazz, Blues');
  });

  it('écrit la liste COMPLÈTE et revient en arrière sur un refus', () => {
    expect(src).toContain('patch({ [CLE_GENRES_CLAP_INCLUS]: suivant }, () => { clapGenresInclus = avant; });');
    expect(src).toContain('patch({ [CLE_GENRES_CLAP_EXCLUS]: suivant }, () => { clapGenresExclus = avant; });');
  });

  it('les onze langues nomment les deux champs et l’explication', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(14);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of [
        'clapGenresTitle', 'clapGenresIncluded', 'clapGenresExcluded',
        'clapGenresIncludedPlaceholder', 'clapGenresExcludedPlaceholder', 'clapGenresHint',
      ]) {
        expect(texte, `${f} : settings.${cle}`).toContain(`"settings.${cle}":`);
      }
    }
  });
});
