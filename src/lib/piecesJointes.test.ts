import { describe, it, expect } from 'vitest';
import { cumulerFichiers, retirerFichier } from './piecesJointes';

// renesenses/tune-server-rust#4664 — trois captures annoncées, une seule
// arrive. Le champ remplaçait sa liste à chaque sélection : choisir ses
// fichiers un par un n'en gardait que le dernier.

function fichier(nom: string, taille = 10, date = 1): File {
  return new File([new Uint8Array(taille)], nom, { type: 'image/png', lastModified: date });
}

describe('cumulerFichiers (#4664)', () => {
  it('trois sélections successives d’un fichier chacune donnent TROIS pièces', () => {
    let liste: File[] = [];
    for (const nom of ['a.png', 'b.png', 'c.png']) {
      liste = cumulerFichiers(liste, [fichier(nom)]);
    }
    expect(liste.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('une sélection multiple d’un seul geste reste acceptée telle quelle', () => {
    const liste = cumulerFichiers([], [fichier('a.png'), fichier('b.png')]);
    expect(liste.map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });

  it('le même fichier choisi deux fois n’est joint qu’une fois', () => {
    const a = fichier('a.png', 10, 5);
    const liste = cumulerFichiers(cumulerFichiers([], [a]), [fichier('a.png', 10, 5)]);
    expect(liste).toHaveLength(1);
  });

  it('deux fichiers homonymes mais différents restent deux', () => {
    const liste = cumulerFichiers([fichier('capture.png', 10, 1)], [fichier('capture.png', 20, 2)]);
    expect(liste).toHaveLength(2);
  });

  it('une sélection annulée (liste vide ou nulle) ne vide pas la liste', () => {
    const avant = [fichier('a.png')];
    expect(cumulerFichiers(avant, null)).toHaveLength(1);
    expect(cumulerFichiers(avant, [])).toHaveLength(1);
  });
});

describe('retirerFichier (#4664)', () => {
  it('retire la pièce désignée et elle seule', () => {
    const liste = [fichier('a.png'), fichier('b.png'), fichier('c.png')];
    expect(retirerFichier(liste, 1).map((f) => f.name)).toEqual(['a.png', 'c.png']);
  });

  it('un indice hors bornes ne change rien', () => {
    const liste = [fichier('a.png')];
    expect(retirerFichier(liste, 5)).toHaveLength(1);
  });
});
