import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `AlbumArt` est une brique PARTAGÉE, plus un composant de l'interface
 * actuelle que la v2 emprunte.
 *
 * Premier lot de la phase 1 du chantier de bascule
 * (`docs/chantiers/basculer-la-v2-en-v1.md`). La v2 importait 26 composants de
 * `src/components/` ; `AlbumArt` en représentait **23 à lui seul**. Supprimer
 * l'interface actuelle aurait cassé la v2 à l'instant.
 *
 * ## Pourquoi ce lot est SEUL
 *
 * Un premier essai déplaçait les 22 briques d'un coup. Le rangement
 * fonctionnait, mais les gardes de ce dépôt lisent les composants PAR CHEMIN,
 * et elles le construisent de cinq façons distinctes :
 *
 *     from '../X.svelte'                        import statique
 *     import('../X.svelte')                     import dynamique
 *     resolve(cwd, 'src/components/X.svelte')   chemin depuis la racine
 *     lire('X.svelte')                          nom et dossier séparés
 *     ['NowPlaying', 'TransportBar']            nom NU, extension ajoutée après
 *
 * Chaque correction en révélait une nouvelle, à chaque relance de la suite.
 * Un lot dont on n'arrive pas à prouver le vert ne se fusionne pas, même juste :
 * d'où la découpe, brique par brique.
 */
const COMPOSANTS = resolve(__dirname, '../../components');

function importsDAlbumArt(dossier: string): string[] {
  const chemin = resolve(COMPOSANTS, dossier);
  const out: string[] = [];
  for (const f of readdirSync(chemin).filter((n) => n.endsWith('.svelte'))) {
    const src = readFileSync(resolve(chemin, f), 'utf-8');
    // Les DEUX formes : un import dynamique compte autant qu'un statique, et
    // c'est en l'oubliant que l'inventaire initial a annoncé 24 emprunts
    // là où il y en avait 26.
    for (const m of src.matchAll(/(?:from |import\()'([^']*AlbumArt\.svelte)'/g)) {
      out.push(`${dossier}/${f} → ${m[1]}`);
    }
  }
  return out;
}

describe('AlbumArt — rangé dans les briques partagées', () => {
  it('vit dans components/partages/, plus à la racine', () => {
    expect(readdirSync(resolve(COMPOSANTS, 'partages'))).toContain('AlbumArt.svelte');
    expect(readdirSync(COMPOSANTS)).not.toContain('AlbumArt.svelte');
  });

  it('n’est plus emprunté à l’interface actuelle par la v2', () => {
    // `../AlbumArt.svelte` depuis v2/ = la racine des composants = un emprunt.
    // `../partages/AlbumArt.svelte` n'en est pas un.
    const emprunts = importsDAlbumArt('v2').filter((l) => /→ '?\.\.\/AlbumArt/.test(l) || l.includes("→ ../AlbumArt.svelte"));
    expect(emprunts, 'la v2 puise encore AlbumArt dans l’interface actuelle').toEqual([]);
  });

  it('est atteint par le même chemin des DEUX côtés', () => {
    const v2 = importsDAlbumArt('v2');
    const v1 = importsDAlbumArt('.');
    // Il reste des appelants : une garde qui ne trouve rien ne garde rien.
    expect(v2.length + v1.length).toBeGreaterThan(0);
    for (const ligne of [...v2, ...v1]) {
      expect(ligne, 'chemin qui ne passe pas par partages/').toContain('partages/AlbumArt.svelte');
    }
  });

  it('ne pointe plus vers l’ancien emplacement de ses propres dépendances', () => {
    // Depuis `partages/`, la bibliothèque est à DEUX crans. Un `../lib/` resté
    // là viserait `components/lib/`, qui n'existe pas — et Svelte ne le dirait
    // qu'à l'exécution, chez l'utilisateur.
    const src = readFileSync(resolve(COMPOSANTS, 'partages/AlbumArt.svelte'), 'utf-8');
    expect(src).not.toMatch(/(?:from |import\()'\.\.\/(lib|styles|assets)\//);
  });
});
