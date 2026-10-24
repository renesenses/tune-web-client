import { describe, expect, it } from 'vitest';
import { sansLaPlaylistRetiree } from './playlistsSuiviesRetrait';

// Forme rendue par `GET /streaming/qobuz/playlists` (tune-server-rust, web#2097).
const liste = [
  { source_id: '11', name: 'Ma playlist', editable: true },
  { source_id: '22', name: 'Horse & Desert', editable: false },
  { source_id: '33', name: 'Sit Back, Relax', editable: false },
  { source_id: '44', name: 'Sans drapeau' },
];

describe('#6461 — le cœur retiré sort une playlist éditoriale de Qobuz › Playlists', () => {
  it('un retrait confirmé sur une playlist suivie la sort de la liste', () => {
    expect(sansLaPlaylistRetiree(liste, '22', false).map((p) => p.source_id)).toEqual(['11', '33', '44']);
  });

  it('une playlist à soi reste dans la bibliothèque, cœur ou pas', () => {
    expect(sansLaPlaylistRetiree(liste, '11', false)).toHaveLength(4);
  });

  it('une playlist sans auteur connu n’est pas devinée', () => {
    expect(sansLaPlaylistRetiree(liste, '44', false)).toHaveLength(4);
  });

  it('un ajout ou un geste revenu en arrière ne touche pas la liste', () => {
    expect(sansLaPlaylistRetiree(liste, '22', true)).toHaveLength(4);
    expect(sansLaPlaylistRetiree(liste, '22', null)).toHaveLength(4);
  });

  it('la liste d’origine n’est pas modifiée', () => {
    const copie = [...liste];
    sansLaPlaylistRetiree(liste, '22', false);
    expect(liste).toEqual(copie);
  });
});
