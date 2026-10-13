import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLE_DOSSIERS_EXCLUS,
  CLE_GENRES_EXCLUS,
  ajouterDossierExclu,
  cheminComparable,
  estSous,
  retirerDossierExclu,
  sousDossiersExclus,
} from '../perimetreAnalyses';

/**
 * tune-server-rust#5593, étape 1 du chantier « périmètre des analyses » :
 * exclure un SOUS-DOSSIER (fil 2173) et des GENRES de toutes les analyses de
 * fond (ReplayGain, plage dynamique, empreintes, ambiances).
 */
const src = fs.readFileSync(
  fileURLToPath(new URL('../../components/v2/SettingsV2.svelte', import.meta.url)),
  'utf-8',
);

describe('#5593 étape 1 — les clés', () => {
  it('sont celles que le serveur publie', () => {
    expect(CLE_DOSSIERS_EXCLUS).toBe('background_analysis_excluded_roots');
    expect(CLE_GENRES_EXCLUS).toBe('background_analysis_excluded_genres');
  });
});

describe('#5593 étape 1 — un chemin se compare comme au serveur', () => {
  it('les deux séparateurs sont confondus, le séparateur final ignoré', () => {
    expect(cheminComparable('Z:\\NAS\\Jazz\\')).toBe('Z:/NAS/Jazz');
    expect(cheminComparable('/')).toBe('/');
    expect(estSous('Z:/NAS/Jazz/Live', 'Z:\\NAS')).toBe(true);
    expect(estSous('Z:\\NAS', 'Z:/NAS/')).toBe(true);
  });

  it('le préfixe est borné par le séparateur, et la casse compte', () => {
    expect(estSous('/music2/a', '/music')).toBe(false);
    expect(estSous('/Music/a', '/music')).toBe(false);
    expect(estSous('/srv/a', '/')).toBe(true);
  });
});

describe('#5593 étape 1 — ajouter et retirer un sous-dossier', () => {
  const racines = ['/mnt/nas', 'Z:\\Musique'];

  it('ajoute un dossier sous une racine, tel que saisi', () => {
    expect(ajouterDossierExclu([], ' /mnt/nas/Podcasts ', racines)).toEqual({ liste: ['/mnt/nas/Podcasts'] });
    expect(ajouterDossierExclu(['/mnt/nas/Podcasts'], 'Z:\\Musique\\Livres', racines)).toEqual({
      liste: ['/mnt/nas/Podcasts', 'Z:\\Musique\\Livres'],
    });
  });

  it('refuse ce qui ne correspondrait à rien, une racine, un doublon', () => {
    expect(ajouterDossierExclu([], '  ', racines)).toEqual({ refus: 'vide' });
    expect(ajouterDossierExclu([], '/ailleurs/x', racines)).toEqual({ refus: 'horsRacine' });
    expect(ajouterDossierExclu([], '/mnt/NAS/x', racines)).toEqual({ refus: 'horsRacine' });
    expect(ajouterDossierExclu([], 'Z:/Musique/', racines)).toEqual({ refus: 'racine' });
    expect(ajouterDossierExclu(['/mnt/nas'], '/mnt/nas/x', racines)).toEqual({ refus: 'deja' });
    expect(ajouterDossierExclu(['/mnt/nas/x'], '/mnt/nas/x/y', racines)).toEqual({ refus: 'deja' });
  });

  it('la liste des sous-dossiers ne montre pas les racines décochées', () => {
    expect(sousDossiersExclus(['/mnt/nas/', '/mnt/nas/x', 'Z:/Musique/y'], racines)).toEqual([
      '/mnt/nas/x',
      'Z:/Musique/y',
    ]);
    expect(retirerDossierExclu(['/mnt/nas', '/mnt/nas/x'], '/mnt/nas/x')).toEqual(['/mnt/nas']);
  });
});

describe('#5593 étape 1 — l’écran', () => {
  it('les sous-dossiers vont dans la MÊME liste que les cases, complète, avec retour en arrière', () => {
    expect(src).toContain('patch({ background_analysis_excluded_roots: r.liste }, () => { analysisExcluded = avant; });');
    expect(src).toContain('patch({ background_analysis_excluded_roots: suivant }, () => { analysisExcluded = avant; });');
    expect(src).toMatch(/\{#each sousDossiersExclus\(analysisExcluded, musicDirs\) as e \(e\)\}/);
    // La case d'une racine garde les sous-dossiers déjà exclus.
    expect(src).toContain('analyser ? avant.filter((r) => r !== d) : [...avant.filter((r) => r !== d), d]');
  });

  it('les genres de toutes les analyses : lus, cachés si non publiés, écrits avec retour en arrière', () => {
    expect(src).toContain('analysisGenresExclus = genresDepuisConfig(c?.[CLE_GENRES_EXCLUS]);');
    expect(src).toMatch(/\{#if analysisGenresExclus !== null\}/);
    expect(src).toContain('patch({ [CLE_GENRES_EXCLUS]: suivant }, () => { analysisGenresExclus = avant; });');
  });

  it('les onze langues portent chaque texte, et le libellé accessible nomme le dossier', () => {
    const dossier = fileURLToPath(new URL('../locales/', import.meta.url));
    const langues = fs.readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBe(11);
    for (const f of langues) {
      const texte = fs.readFileSync(dossier + f, 'utf-8');
      for (const cle of [
        'excludedFoldersTitle', 'excludedFolderReinclude', 'excludedFolderReincludeAria',
        'excludedFolderAdd', 'excludedFolderPlaceholder', 'excludedFolderExclude',
        'excludedFolderRefus_horsRacine', 'excludedFolderRefus_racine', 'excludedFolderRefus_deja',
        'excludedFoldersHint', 'analysisGenresExcluded', 'analysisGenresExcludedPlaceholder',
        'analysisGenresExcludedHint',
      ]) {
        expect(texte, `${f} : settings.${cle}`).toContain(`"settings.${cle}":`);
      }
      const aria = texte.match(/"settings\.excludedFolderReincludeAria": "([^"]*)"/);
      expect(aria?.[1], `${f} : le libellé accessible nomme le dossier`).toContain('{path}');
    }
  });
});
