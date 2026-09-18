/**
 * #1156 — « afficher dans le dossier d'origine » (Tades, fil 1677).
 *
 * Deux demandes dans son message. Le FORMAT d'origine est affiché depuis
 * (le badge de qualité sur chaque vignette du Convertisseur). Le DOSSIER ne
 * l'était pas : l'écran propose de convertir sans jamais dire d'où.
 *
 * 🔴 `Album` ne porte pas de chemin. Mesuré sur le .18 le 18/09/2026 :
 * `GET /library/albums` rend `"cover_path":"f7c037a9fb1fff61ffedf708bfebcecd"`
 * — un HACHAGE, pas un chemin. Le chemin vit sur la piste :
 * `GET /library/albums/574/tracks` rend
 * `"file_path":"/data/music/NEW_FLAC/ELECTRO/Enigma/…/01. The Voice Of Enigma.mp3"`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dossierDuFichier, dossierDeLAlbum, prefixeCommun } from '../dossierDAlbum';

describe('#1156 — le dossier d\'un fichier', () => {
  it('POSIX, mesuré sur le .18', () => {
    expect(dossierDuFichier('/data/music/NEW_FLAC/ELECTRO/Enigma/Album/01. Voice.mp3'))
      .toBe('/data/music/NEW_FLAC/ELECTRO/Enigma/Album');
  });

  it('Windows aussi — une part des testeurs y tourne', () => {
    expect(dossierDuFichier('D:\\Musique\\Enigma\\Album\\01.flac'))
      .toBe('D:\\Musique\\Enigma\\Album');
  });

  it('rien plutôt qu\'un chemin inventé', () => {
    for (const mauvais of [null, undefined, 42, '', '   ', 'fichier.mp3', '/racine.mp3']) {
      expect(dossierDuFichier(mauvais as any), String(mauvais)).toBeNull();
    }
  });
});

describe('#1156 — le dossier d\'un album', () => {
  it('toutes les pistes dans un dossier : c\'est celui-là', () => {
    expect(dossierDeLAlbum([
      '/m/Enigma/MCMXC/01.mp3',
      '/m/Enigma/MCMXC/02.mp3',
    ])).toBe('/m/Enigma/MCMXC');
  });

  it('🔴 un coffret rangé en CD1/CD2 remonte au PARENT', () => {
    // Rendre le dossier de la première piste dirait « CD1 » pour l'album
    // entier — faux, et trompeur au moment de décider.
    expect(dossierDeLAlbum([
      '/m/Beethoven/Integrale/CD1/01.flac',
      '/m/Beethoven/Integrale/CD2/01.flac',
    ])).toBe('/m/Beethoven/Integrale');
  });

  it('🔴 le préfixe est pris par SEGMENT, jamais par caractère', () => {
    // Par caractère, ces deux-là rendraient `/m/Album ` — un dossier qui
    // n'existe pas.
    expect(prefixeCommun(['/m/Album Live', '/m/Album Studio'])).toBe('/m');
    expect(dossierDeLAlbum(['/m/Album Live/1.flac', '/m/Album Studio/1.flac'])).toBe('/m');
  });

  it('aucune piste, aucun chemin : rien à dire', () => {
    expect(dossierDeLAlbum([])).toBeNull();
    expect(dossierDeLAlbum([null, undefined, ''])).toBeNull();
    // Deux racines différentes n'ont pas de parent commun affichable.
    expect(dossierDeLAlbum(['/a/1.flac', '/b/1.flac'])).toBeNull();
  });

  it('la racine POSIX est restituée', () => {
    expect(prefixeCommun(['/data/music/a', '/data/music/b'])).toBe('/data/music');
  });
});

describe('#1156 — le branchement', () => {
  const vue = readFileSync('src/components/v2/ConverterV2.svelte', 'utf8');

  it('l\'écran affiche le dossier des albums RETENUS', () => {
    expect(vue).toContain('v2.conv.sourceFolder');
    expect(vue).toContain('dossierDeLAlbum(');
    expect(vue).toContain('dossiersRetenus');
  });

  it('🔴 on ne charge que les albums retenus, pas les deux cents vignettes', () => {
    const i = vue.indexOf('for (const id of picked)');
    expect(i).toBeGreaterThan(0);
    const bloc = vue.slice(i, i + 600);
    expect(bloc).toContain('api.getAlbumTracks(id)');
    // Et jamais deux fois le même : le cache et le verrou en vol.
    expect(bloc).toContain('dossiers.has(id) || dossiersEnCours.has(id)');
  });

  it('🔴 une NOUVELLE Map à chaque écriture — muter un $state ne réveille rien', () => {
    expect(vue).toContain('new Map(dossiers).set(id,');
  });

  it('le format d\'origine, lui, était déjà là', () => {
    // Premier point du même message, traité avant : la garde le fixe pour que
    // personne ne le retire en croyant le remplacer.
    expect(vue).toContain('<QualityBadge format={a.format}');
  });

  it('la clé existe dans les ONZE langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      expect(readFileSync(`src/lib/locales/${l}.ts`, 'utf8'), l).toContain('v2.conv.sourceFolder');
    }
  });
});
