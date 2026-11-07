// tune-server-rust#8085 — « Reprendre l'écoute » : une règle uniforme par nature.
import { describe, expect, it } from 'vitest';
import { sousTitreReprise } from '../reprendreEcoute';

describe('Reprendre l’écoute : le sous-titre dit ce qu’on reprend (tune-server-rust#8085)', () => {
  it('album : l’album repris et son interprète', () => {
    expect(sousTitreReprise({ context_type: 'album', title: 'Dirty Edits Vol. 1', last_track_title: 'Love & Hate', artist_name: 'Pilooski' }))
      .toBe('Dirty Edits Vol. 1 · Pilooski');
  });
  it('playlist ou mix : son nom, jamais l’interprète d’une de ses pistes', () => {
    expect(sousTitreReprise({ context_type: 'playlist', title: 'My Daily Discovery', last_track_title: 'So What', artist_name: 'Miles Davis' }))
      .toBe('My Daily Discovery');
  });
  it('épisode : son podcast, une fois', () => {
    expect(sousTitreReprise({ context_type: 'podcast', title: 'Émission', last_track_title: 'Épisode 1', artist_name: 'Émission' }))
      .toBe('Émission');
    expect(sousTitreReprise({ context_type: 'podcast', title: 'Épisode 1', last_track_title: 'Épisode 1', artist_name: 'Émission' }))
      .toBe('Émission');
  });
  it('piste seule : « interprète · album », que le serveur rend désormais', () => {
    expect(sousTitreReprise({ context_type: 'track', title: 'Love & Hate', artist_name: 'Interprète', album_title: 'Album' }))
      .toBe('Interprète · Album');
  });
});
