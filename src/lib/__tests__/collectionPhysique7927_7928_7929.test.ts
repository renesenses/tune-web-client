// tune-server-rust#7927, #7928, #7929 — « Ma collection physique » :
// l'état des pochettes et le nouvel essai des cases vides (#7927), « Chercher
// sur les services » (#7928), les filtres par dossier, genre et style (#7929).
import { describe, expect, it } from 'vitest';
import {
  messagePochettes, peutChercherSurLesServices, pochetteDuDisque, pochettesEnAttente,
  urlCollection, urlPochette, versSurUnService, type Disque, type EtatPochettes,
} from '../collectionPhysique';
import fr from '../locales/fr';
import en from '../locales/en';

const traduire = (cle: string) => (fr as Record<string, string>)[cle] ?? cle;

function disque(p: Partial<Disque> = {}): Disque {
  return {
    instance_id: 1, release_id: 7024, artiste: 'Various', titre: 'The Haçienda',
    annee: 1996, labels: [], numeros_catalogue: [], formats: ['CD'], precisions: [],
    format: 'cd', lien_discogs: 'https://www.discogs.com/release/7024', pochette: true,
    bibliotheque: null, streaming: [], etat: 'nulle_part', copie: false, proposer_extraction: true,
    ...p,
  };
}

describe('#7927 — les pochettes des disques absents de la bibliothèque', () => {
  it('une case vide se retente quand le cache avance : autre adresse à chaque version', () => {
    const d = disque();
    const avant = pochetteDuDisque(d).coverPath;
    const apres = pochetteDuDisque(d, 2).coverPath;
    expect(avant).toBe('/api/v1/ext/collection-physique/pochettes/7024');
    expect(apres).toBe('/api/v1/ext/collection-physique/pochettes/7024?v=2');
    expect(apres).not.toBe(avant);
    expect(urlPochette(7024, 0)).toBe(avant);
  });

  it('la pochette de l’album local passe toujours devant', () => {
    const d = disque({
      bibliotheque: {
        album_id: 3, titre: 'x', artiste: null, qualite: null, format: null,
        sample_rate: null, bit_depth: null, cover_path: 'a.jpg', par: 'artiste_titre',
      },
    });
    expect(pochetteDuDisque(d, 5)).toEqual({ coverPath: 'a.jpg', albumId: 3, directe: false });
  });

  it('l’écran dit que Discogs limite, et quand ça reprend', () => {
    const p: EtatPochettes = {
      en_cours: true, en_cache: 10, restantes: 40, echecs: 0,
      limitees: true, reprise_dans_s: 90, derniere_erreur: 'discogs_limite',
    };
    expect(messagePochettes(p, traduire)).toBe(
      'Discogs limite les téléchargements de pochettes (40 restantes) : reprise dans 2 min environ',
    );
    expect(messagePochettes({ ...p, derniere_erreur: 'discogs_refuse' }, traduire)).toContain('refuse');
    expect(pochettesEnAttente(p)).toBe(true);
  });

  it('les téléchargements en cours se disent, un cache complet ne dit rien', () => {
    expect(messagePochettes({ en_cours: true, en_cache: 3, restantes: 2 }, traduire))
      .toBe('Pochettes : 2 en cours de téléchargement');
    const fini = { en_cours: false, en_cache: 5, restantes: 0, echecs: 0, limitees: false };
    expect(messagePochettes(fini, traduire)).toBeNull();
    expect(pochettesEnAttente(fini)).toBe(false);
    expect(messagePochettes({ ...fini, echecs: 1 }, traduire)).toBe('1 pochettes n’existent plus chez Discogs');
    // Un serveur antérieur (sans les champs de #7927) ne casse rien.
    expect(messagePochettes(undefined, traduire)).toBeNull();
  });
});

describe('#7928 — chercher sur les services', () => {
  it('proposé seulement pour un disque ni dans la bibliothèque ni déjà trouvé', () => {
    expect(peutChercherSurLesServices(disque())).toBe(true);
    expect(peutChercherSurLesServices(disque({
      streaming: [{ service: 'qobuz', id: 'q', titre: 't', artiste: 'a', par: 'code_barre' }],
    }))).toBe(false);
  });

  it('la proposition la plus proche s’ouvre ou se lance comme un album de service', () => {
    expect(versSurUnService({
      service: 'spotify', id: 'S-7024', titre: 'The Hacienda', artiste: 'Various Artists',
      par: 'catalogue', score: 100, exact: true,
    })).toEqual({ service: 'spotify', id: 'S-7024', titre: 'The Hacienda', artiste: 'Various Artists', par: 'code_barre' });
  });
});

describe('#7929 — parcourir par dossier, genre et style', () => {
  it('les filtres passent au greffon et se combinent', () => {
    expect(urlCollection(null, null, { dossier: 101, genre: 'Funk / Soul', style: null }))
      .toMatch(/\/ext\/collection-physique\/collection\?dossier=101&genre=Funk\+%2F\+Soul$/);
    expect(urlCollection('cd', 'nulle_part', { dossier: null, genre: null, style: 'House' }))
      .toMatch(/\/collection\?format=cd&etat=nulle_part&style=House$/);
    expect(urlCollection(null, null)).toMatch(/\/ext\/collection-physique\/collection$/);
  });
});

describe('les textes existent en français et en anglais', () => {
  it.each([
    'collectionPhysique.pochettes.limitees', 'collectionPhysique.recherche.bouton',
    'collectionPhysique.navigation.dossier', 'collectionPhysique.navigation.dossierNumero',
  ])('%s', (cle) => {
    expect((fr as Record<string, string>)[cle]).toBeTruthy();
    expect((en as Record<string, string>)[cle]).toBeTruthy();
  });
});
