import { describe, expect, it } from 'vitest';
import { compterParAuteur, filtrerParAuteur, filtreAuteurUtile } from './filtreAuteurPlaylists';

// Forme rendue par `GET /streaming/qobuz/playlists` (tune-server-rust, web#2097).
const liste = [
  { source_id: '11', name: 'Ma playlist', owner: 'fabien', editable: true },
  { source_id: '22', name: 'Horse & Desert', owner: 'Qobuz', editable: false },
  { source_id: '33', name: 'Sit Back, Relax', owner: 'Qobuz', editable: false },
  { source_id: '44', name: 'Sans drapeau', owner: null },
];

describe('#6331 — filtre « Tous / Par vous / Par Qobuz »', () => {
  it('« Par vous » ne garde que les playlists de l’utilisateur', () => {
    expect(filtrerParAuteur(liste, 'moi').map((p) => p.source_id)).toEqual(['11']);
  });

  it('« Par Qobuz » ne garde que les playlists suivies', () => {
    expect(filtrerParAuteur(liste, 'service').map((p) => p.source_id)).toEqual(['22', '33']);
  });

  it('« Tous » garde tout, y compris une playlist dont l’auteur est inconnu', () => {
    expect(filtrerParAuteur(liste, 'tous')).toHaveLength(4);
  });

  it('les comptes des pastilles', () => {
    expect(compterParAuteur(liste)).toEqual({ tous: 4, moi: 1, service: 2 });
  });

  it('le filtre ne s’offre que s’il y a des deux côtés', () => {
    expect(filtreAuteurUtile(compterParAuteur(liste))).toBe(true);
    // Un autre service, ou un serveur d'avant web#2097 : aucun drapeau.
    expect(filtreAuteurUtile(compterParAuteur([{ editable: null }, {}]))).toBe(false);
    // Que des playlists à soi : rien à trier.
    expect(filtreAuteurUtile(compterParAuteur([{ editable: true }]))).toBe(false);
  });
});
