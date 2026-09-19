import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { libelleQualite, autreAlbumMeilleur } from '../meilleureQualite';

/**
 * Bibliothèque v2 — gestes portés de l'ancienne `LibraryView`, seule à les
 * offrir : note et ré-identification d'un album (#2128), signalements (pochette,
 * image et bio d'artiste), éditeur complet d'artiste (image téléversée),
 * renommer / supprimer une étiquette, proposition « meilleure qualité ».
 */
const ALBUM = readFileSync('src/components/v2/AlbumDetailV2.svelte', 'utf8');
const ARTISTE = readFileSync('src/components/v2/ArtistesV2.svelte', 'utf8');
const TAGS = readFileSync('src/components/v2/EtiquettesV2.svelte', 'utf8');
const corps = (src: string, nom: string) => {
  const i = src.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n  }\n', i));
};

describe('libelleQualite / autreAlbumMeilleur', () => {
  it('nomme format, fréquence et profondeur', () => {
    expect(libelleQualite({ format: 'flac', sample_rate: 96000, bit_depth: 24 })).toBe('FLAC 96 kHz / 24 bit');
    expect(libelleQualite({ format: 'dsf', sample_rate: 2822400, bit_depth: 1 })).toBe('DSF 2822 kHz');
  });
  it('🔴 ne propose jamais l’album qu’on vient de lancer', () => {
    expect(autreAlbumMeilleur({ album_id: 7 }, 7)).toBeNull();
    expect(autreAlbumMeilleur({ album_id: 9 }, 7)).toBe(9);
    expect(autreAlbumMeilleur(null, 7)).toBeNull();
  });
});

describe('fiche album v2', () => {
  it('note, ré-identification et signalement de pochette, sur un album local', () => {
    const i = ALBUM.indexOf('{#if album.id != null && !depot}');
    expect(i).toBeGreaterThan(-1);
    const bloc = ALBUM.slice(i, ALBUM.indexOf('{/if}\n', ALBUM.indexOf('<ReportButton entity="cover"', i)));
    expect(bloc).toContain('<AlbumRating albumId={album.id} />');
    expect(bloc).toContain('onclick={reidentifier}');
    expect(bloc).toContain('<ReportButton entity="cover"');
  });
  it('la ré-identification rend chaque verdict, y compris décevant', () => {
    const c = corps(ALBUM, 'reidentifier');
    for (const v of ["'no_tracks'", "'not_found'", "'unchanged'"]) expect(c, v).toContain(v);
  });
  it('🔴 la proposition de meilleure qualité part APRÈS la lecture', () => {
    const i = ALBUM.indexOf('playAndSync(zid, { album_id: album.id, start_index: startIndex })');
    const j = ALBUM.indexOf('void proposerMeilleureQualite(album.id);');
    expect(i).toBeGreaterThan(-1);
    expect(j, 'la proposition n’est pas faite').toBeGreaterThan(i);
  });
});

describe('fiche artiste v2', () => {
  it('l’éditeur complet (image comprise) s’ouvre depuis la fiche', () => {
    expect(ARTISTE).toContain('onclick={() => (editionComplete = artiste)}');
    expect(ARTISTE).toMatch(/\{#if editionComplete\}\s*<ArtistEditModal/);
  });
  it('image et bio se signalent', () => {
    expect(ARTISTE).toContain('<ReportButton entity="artist_image"');
    expect(ARTISTE).toContain('<ReportButton entity="bio"');
  });
});

describe('étiquettes v2 : renommer, supprimer', () => {
  it('les deux gestes sont offerts sur la fiche d’une étiquette', () => {
    expect(TAGS).toContain('onclick={() => renommer(tag)}');
    expect(TAGS).toContain('onclick={() => supprimer(tag)}');
    expect(corps(TAGS, 'renommer')).toContain('api.updateTag(tag.id, nom)');
  });
  it('🔴 supprimer demande une confirmation dangereuse AVANT l’appel', () => {
    const c = corps(TAGS, 'supprimer');
    expect(c.indexOf('dialogs.confirm(')).toBeGreaterThan(-1);
    expect(c.indexOf('dialogs.confirm(')).toBeLessThan(c.indexOf('api.deleteTag('));
    expect(c).toContain('{ danger: true }');
  });
});
