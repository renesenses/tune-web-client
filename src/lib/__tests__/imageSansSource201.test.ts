/**
 * #201 — « Image(s) injoignable(s) sous localhost:8888// — ex. `/` », vue
 * Bibliothèque, deux occurrences par passage de l'exploration automatique
 * (29/07/2026).
 *
 * ## Le mécanisme, et il est exact
 *
 * `artworkUrl()` rend la **chaîne vide** quand il n'y a pas de pochette :
 *
 *     export function artworkUrl(coverPath, size): string {
 *       if (!coverPath) return '';
 *
 * C'est utile devant un `{#if}`. Dans un attribut, c'est autre chose :
 * `<img src="">` fait **redemander la page courante** au navigateur. D'où une
 * requête vers `/` par pochette manquante — ce que le rapport nommait « image
 * injoignable sous localhost:8888// ».
 *
 * Le dépôt en comptait **dix-huit** sans garde. Une bibliothèque de quelques
 * centaines d'albums sans pochette en fait autant de requêtes de page.
 *
 * ## Le correctif
 *
 * `artworkSrc()` rend `undefined` au lieu de `''`. Svelte omet un attribut
 * `undefined` : la balise part sans `src`, et le navigateur ne demande rien.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import { artworkSrc, artworkUrl } from '../api';

describe('L’adresse d’une pochette absente', () => {
  it('🔴 `artworkUrl` rend une chaîne VIDE — c’est la source du défaut', () => {
    // On le fige pour que le jour où quelqu'un « corrige » ce retour, il voie
    // que des `{#if}` en dépendent.
    expect(artworkUrl(null)).toBe('');
    expect(artworkUrl(undefined)).toBe('');
    expect(artworkUrl('')).toBe('');
  });

  it('🔴 `artworkSrc` rend `undefined` — Svelte omet alors l’attribut', () => {
    expect(artworkSrc(null)).toBeUndefined();
    expect(artworkSrc(undefined)).toBeUndefined();
    expect(artworkSrc('')).toBeUndefined();
  });

  it('et rend la MÊME adresse quand la pochette existe', () => {
    // Le correctif ne doit rien changer au cas normal.
    for (const chemin of ['abc.jpg', '/api/v1/library/artwork/x.jpg', 'https://exemple.fr/c.jpg']) {
      expect(artworkSrc(chemin)).toBe(artworkUrl(chemin));
      expect(artworkSrc(chemin, 200)).toBe(artworkUrl(chemin, 200));
    }
  });
});

describe('🔴 Aucun `<img>` du dépôt ne pose une source vide', () => {
  const FICHIERS = globSync('src/components/**/*.svelte');

  it('la garde voit bien quelque chose', () => {
    // Un balayage qui ne lit aucun fichier serait vert pour rien.
    expect(FICHIERS.length).toBeGreaterThan(50);
  });

  it('aucun attribut `src` n’appelle `artworkUrl` directement', () => {
    const fautifs: string[] = [];
    for (const f of FICHIERS) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/src=\{[^}]*\}/g)) {
        if (/\bartworkUrl\(/.test(m[0])) fautifs.push(`${f} → ${m[0].slice(0, 60)}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
