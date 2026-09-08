/**
 * « Autres versions : le click sur la cover ne doit pas lancer l'album mais la
 * chanson ! » (Bertrand, 07/09/2026)
 *
 * C'était le cas pour les versions de SERVICE : le corps envoyé était
 * `streaming_album_id` dès qu'un album était connu, et `source_id` — la PISTE
 * chez le service — ne servait que de repli. On demandait une autre version
 * d'un morceau et on obtenait un disque entier, qui ne commençait même pas
 * par lui.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { corpsVersionLocale, corpsVersionService, type VersionService } from '../versionsPiste';

const panneau = () =>
  readFileSync(resolve(process.cwd(), 'src/components/v2/VersionsPistePanneau.svelte'), 'utf-8');

const QOBUZ: VersionService = {
  service: 'qobuz', source_id: '52528016', album_id: 'eyx2hkl5rxofa',
  title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Lean On Me',
  cover_path: 'https://…/cover.jpg',
};

describe('Le corps de lecture d’une autre version', () => {
  it('🔴 une version de SERVICE lance LA PISTE, même quand l’album est connu', () => {
    const corps = corpsVersionService(QOBUZ);
    expect(corps, 'aucun corps produit').not.toBeNull();
    expect(corps!.source_id, 'la piste n’est plus désignée').toBe('52528016');
    expect(corps, 'l’album est de nouveau envoyé : c’est le disque entier qui partirait')
      .not.toHaveProperty('streaming_album_id');
  });

  it('les métadonnées accompagnent la piste', () => {
    // Sans elles, la barre de lecture reste sans titre ni pochette le temps que
    // le service réponde.
    const corps = corpsVersionService(QOBUZ)!;
    expect(corps.title).toBe('Lovely Day');
    expect(corps.artist_name).toBe('Bill Withers');
    expect(corps.cover_path).toBe('https://…/cover.jpg');
  });

  it('l’album ne sert QUE de dernier recours', () => {
    // Mieux vaut le bon disque que rien : un service qui ne nomme pas la piste
    // existe (les reprises Bandcamp n'ont qu'une URL d'album).
    const corps = corpsVersionService({ ...QOBUZ, source_id: null })!;
    expect(corps.streaming_album_id).toBe('eyx2hkl5rxofa');
    expect(corps.source).toBe('qobuz');
  });

  it('une version qui ne désigne RIEN ne produit aucun corps', () => {
    expect(corpsVersionService({ ...QOBUZ, source_id: null, album_id: null })).toBeNull();
  });

  it('une version de la BIBLIOTHÈQUE a toujours désigné la piste', () => {
    expect(corpsVersionLocale({ track_id: 2450 })).toEqual({ track_id: 2450 });
    expect(corpsVersionLocale({ track_id: null })).toBeNull();
  });

  it('le panneau emploie bien ces règles, et pas une copie', () => {
    const src = panneau();
    expect(src).toContain('corpsVersionService(v)');
    expect(src).toContain('corpsVersionLocale(v)');
    // Plus aucun corps monté à la main dans le composant : c'est là que
    // l'album avait pris le pas sur la piste. On lit le CODE, pas les
    // commentaires — le défaut y est justement raconté.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(/streaming_album_id/.test(code),
      'un corps est de nouveau monté dans le composant').toBe(false);
  });

  it('la tuile est INERTE quand la version ne mène nulle part', () => {
    // Une reprise sans identifiant ne mène nulle part : on la MONTRE — c'est
    // une information — mais elle ne porte pas de geste.
    expect(panneau()).toContain('{@const destination = v.source_id ?? v.album_id}');
  });
});
