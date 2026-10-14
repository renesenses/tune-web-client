import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLE_PAR_PASSE,
  PASSES,
  avecChamp,
  champEffectif,
  compteDe,
  comptesDepuisReponse,
  genresSansNormalisation,
  lireSaisieDeDossiers,
  parPasseDepuisConfig,
} from '../perimetreAnalyses';

/**
 * tune-server-rust#5593, étapes 2 et 3 (décisions de Bertrand du 13/10) :
 * un périmètre PAR PASSE, le commun par défaut ; l'avertissement « sans
 * normalisation » quand un genre est exclu du ReplayGain ; le nombre de
 * pistes que retire chaque entrée.
 */
const settings = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/SettingsV2.svelte', import.meta.url)),
  'utf-8',
);
const composant = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/PerimetreParPasse.svelte', import.meta.url)),
  'utf-8',
);
const commun = { excluded_roots: ['/nas'], excluded_genres: ['Podcast'] };

describe('#5593 étape 2 — la résolution suit celle du serveur', () => {
  it('la clé et les passes sont celles du serveur', () => {
    expect(CLE_PAR_PASSE).toBe('background_analysis_scope_by_pass');
    expect([...PASSES]).toEqual(['replaygain', 'dynamic_range', 'fingerprints', 'audio_embedding']);
  });

  it('un champ absent hérite du commun ; les empreintes héritent du ReplayGain', () => {
    const pp = { replaygain: { excluded_roots: [] as string[] } };
    expect(champEffectif(pp, commun, 'replaygain', 'excluded_roots')).toEqual([]);
    expect(champEffectif(pp, commun, 'fingerprints', 'excluded_roots')).toEqual([]);
    expect(champEffectif(pp, commun, 'dynamic_range', 'excluded_roots')).toEqual(['/nas']);
    expect(champEffectif(pp, commun, 'audio_embedding', 'excluded_genres')).toEqual(['Podcast']);
    const propre = { replaygain: { excluded_roots: [] as string[] }, fingerprints: { excluded_roots: ['/local'] } };
    expect(champEffectif(propre, commun, 'fingerprints', 'excluded_roots')).toEqual(['/local']);
  });

  it('poser puis retirer un champ rend l’objet de départ, sans passe vide', () => {
    const a = avecChamp({}, 'dynamic_range', 'excluded_genres', ['Talk']);
    expect(a).toEqual({ dynamic_range: { excluded_genres: ['Talk'] } });
    expect(avecChamp(a, 'dynamic_range', 'excluded_genres', null)).toEqual({});
  });

  it('la config se lit nettoyée ; non publiée : null', () => {
    expect(parPasseDepuisConfig(undefined)).toBeNull();
    expect(parPasseDepuisConfig({ replaygain: { excluded_roots: ['/a', 3] }, inconnue: {} })).toEqual({
      replaygain: { excluded_roots: ['/a'] },
    });
    expect(lireSaisieDeDossiers(' /a \n\n/b\r\n/a')).toEqual(['/a', '/b']);
  });
});

describe('#5593 — l’avertissement « sans normalisation »', () => {
  it('vaut dès que le ReplayGain, EN VIGUEUR, exclut un genre', () => {
    expect(genresSansNormalisation({}, ['Podcast'])).toBe(true);
    expect(genresSansNormalisation({}, [])).toBe(false);
    expect(genresSansNormalisation({ replaygain: { excluded_genres: [] } }, ['Podcast'])).toBe(false);
    expect(genresSansNormalisation({ replaygain: { excluded_genres: ['Talk'] } }, [])).toBe(true);
    // Un genre exclu du seul CLAP ne prive pas la lecture de normalisation.
    expect(genresSansNormalisation({ audio_embedding: { excluded_genres: ['Talk'] } }, [])).toBe(false);
  });

  it('l’écran l’affiche sous les genres communs et sous ceux du ReplayGain', () => {
    expect(settings).toContain('genresSansNormalisation(analysisParPasse, analysisGenresExclus)');
    expect(settings).toContain("$t('settings.analysisNoNormalizationWarning' as any)");
    expect(composant).toContain("passe === 'replaygain' && champ === 'excluded_genres'");
  });
});

describe('#5593 étape 3 — ce que retire chaque entrée', () => {
  const r = comptesDepuisReponse({
    common: { excluded_roots: [{ value: '/nas', tracks: 4212 }, { value: '/nsa', tracks: 0 }], excluded_genres: [] },
    by_pass: { dynamic_range: { excluded_roots: [{ value: '/local', tracks: 2 }], excluded_genres: [] } },
  });

  it('se lit par entrée, commun et par passe ; 0 reste 0, l’inconnu est null', () => {
    expect(compteDe(r, null, 'excluded_roots', '/nas')).toBe(4212);
    expect(compteDe(r, null, 'excluded_roots', '/nsa')).toBe(0);
    expect(compteDe(r, 'dynamic_range', 'excluded_roots', '/local')).toBe(2);
    expect(compteDe(r, 'replaygain', 'excluded_roots', '/local')).toBeNull();
    expect(compteDe(null, null, 'excluded_roots', '/nas')).toBeNull();
  });

  it('l’écran recompte après chaque réglage du périmètre, et se tait sans la route', () => {
    expect(settings).toContain('analysisComptes = comptesDepuisReponse(await api.getAnalysisScopeCounts());');
    expect(settings).toMatch(/catch \{\s*analysisComptes = null;/);
    expect(settings).toContain('patchPerimetre({ [CLE_PAR_PASSE]: suivant }, () => { analysisParPasse = avant; });');
  });
});

describe('#5593 étapes 2 et 3 — onze langues', () => {
  it('chaque texte existe partout', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of [
        'analysisNoNormalizationWarning', 'analysisScopeTracks', 'analysisPerPassTitle', 'analysisPerPassHint',
        'analysisPass_replaygain', 'analysisPass_dynamic_range', 'analysisPass_fingerprints',
        'analysisPass_audio_embedding', 'analysisPerPassFolders', 'analysisPerPassGenres',
        'analysisPerPassInheritCommon', 'analysisPerPassInheritReplaygain', 'analysisScopeTracksHint',
      ]) {
        expect(texte, `${f} : settings.${cle}`).toContain(`"settings.${cle}":`);
      }
      expect(texte.match(/"settings\.analysisScopeTracks": "([^"]*)"/)?.[1], f).toContain('{n}');
    }
  });

  it('le texte français de l’avertissement est celui de la décision', () => {
    const fr = fs.readFileSync(fileURLToPath(new URL('../locales/fr.ts', import.meta.url)), 'utf-8');
    expect(fr).toContain('"settings.analysisNoNormalizationWarning": "Ces pistes seront lues sans normalisation du volume."');
  });
});

describe('#5593 — décisions du 13/10 (suite)', () => {
  const fr = fs.readFileSync(fileURLToPath(new URL('../locales/fr.ts', import.meta.url)), 'utf-8');

  it('l’aide dit qu’une piste désignée par deux entrées compte deux fois, là où les chiffres s’affichent', () => {
    expect(fr).toMatch(/"settings\.analysisScopeTracksHint": "[^"]*compte dans les deux\."/);
    expect(settings).toMatch(/\{#if analysisComptes\}\s*<p class="hint">\{\$t\('settings\.analysisScopeTracksHint' as any\)\}<\/p>/);
    expect(composant).toContain("{#if comptes}<p class=\"hint\">{$t('settings.analysisScopeTracksHint' as any)}</p>{/if}");
  });

  it('l’aide des genres dit qu’un album sans genre est analysé en entier', () => {
    expect(fr).toMatch(/"settings\.analysisGenresExcludedHint": "[^"]*un album d'un autre genre, ou sans genre, est analysé en entier/);
    expect(fr).toContain('Seule une piste sans album se juge sur son propre genre');
  });
});
