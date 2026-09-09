import { describe, it, expect, vi } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));

const { normalizeFileTags, normalizeTrackAllTags, parseTagItemRust } = await import('./metadata');

/** Payload actually returned by GET /library/tracks/{id}/all-tags on 0.9.119. */
const SERVER_FLAT = {
  id: 48702,
  title: 'Oye Como Va',
  album_id: 2746,
  album_title: 'Éxitos eternos',
  artist_id: 90,
  artist_name: 'Tito Puente',
  comments: null,
  composer: null,
  format: 'mp3',
  sample_rate: 44100,
  bit_depth: null,
  channels: 2,
  duration_ms: 351007,
  file_path: '\\\\nas\\Musique\\01 - Oye Como Va.mp3',
  file_mtime: 1320769998.0,
  musicbrainz_recording_id: '9af57c4e-012c-4266-84a1-c87bc5eeacc9',
  file_tags: [
    {
      tag_type: 'Id3v2',
      items: [
        'TagItem { item_key: TrackTitle, item_value: Text("Oye Como Va") }',
        'TagItem { item_key: Genre, item_value: Text("Salsa") }',
      ],
    },
  ],
};

describe('normalizeTrackAllTags', () => {
  it('maps the flat Rust Track payload into db_fields so the drawer has rows to show', () => {
    const out = normalizeTrackAllTags(SERVER_FLAT, 48702);
    expect(out.track_id).toBe(48702);
    expect(out.db_fields.title).toBe('Oye Como Va');
    expect(out.db_fields.artist_name).toBe('Tito Puente');
    expect(out.db_fields.mtime).toBe(1320769998.0);
    expect(out.db_fields.mb_recording_id).toBe('9af57c4e-012c-4266-84a1-c87bc5eeacc9');
    expect(out.audio_info.format).toBe('mp3');
    expect(out.audio_info.sample_rate).toBe(44100);
  });

  it('turns the server file_tags array into Record<string, string[]> (vals.join-safe)', () => {
    const out = normalizeTrackAllTags(SERVER_FLAT, 48702);
    expect(Array.isArray(out.file_tags)).toBe(false);
    expect(() => Object.entries(out.file_tags).map(([, v]) => v.join(' / '))).not.toThrow();
  });

  it('LIT la paire du fichier : une ligne par balise, pas un pavé de Debug Rust', () => {
    // 🔴 RÉORIENTÉE le 06/09/2026. Le correctif de #661 avait arrêté le
    // plantage en groupant tout sous le nom du CONTENEUR (`Id3v2`) : le
    // tiroir affichait alors UNE ligne contenant quatorze chaînes de débogage
    // Rust collées bout à bout. Mesuré sur le .18 :
    //
    //   TagItem { lang: [88, 88, 88], description: "", item_key: TrackArtist,
    //             item_value: Text("Paco de Lucia") }
    //
    // « Tous les champs piste » ne montrait donc aucun champ. La garde
    // vérifie maintenant ce qu'on peut LIRE, pas seulement que rien n'explose.
    const out = normalizeTrackAllTags(SERVER_FLAT, 48702);
    expect(out.file_tags.TrackTitle).toEqual(['Oye Como Va']);
    expect(out.file_tags.Genre).toEqual(['Salsa']);
    expect(out.file_tags.Id3v2, 'plus de pavé sous le nom du conteneur').toBeUndefined();
  });

  it('keeps an already-nested contract intact', () => {
    const nested = {
      track_id: 9,
      file_path: '/a.flac',
      file_exists: false,
      db_fields: { title: 'Nested', comment: 'hi' },
      db_credits: [{ role: 'performer', artist_name: 'A' }],
      file_tags: { TITLE: ['Nested'] },
      audio_info: { format: 'flac' },
    };
    const out = normalizeTrackAllTags(nested, 9);
    expect(out.file_exists).toBe(false);
    expect(out.db_fields.title).toBe('Nested');
    expect(out.db_credits).toHaveLength(1);
    expect(out.file_tags.TITLE).toEqual(['Nested']);
    expect(out.audio_info.format).toBe('flac');
  });
});

describe('normalizeFileTags', () => {
  it('does not throw when given the raw server array (the pre-fix crash)', () => {
    const tags = normalizeFileTags(SERVER_FLAT.file_tags);
    expect(() => Object.entries(tags).map(([, vals]) => vals.join(' / '))).not.toThrow();
  });
});

describe('parseTagItemRust — le Debug de TagItem, mesuré sur le .18', () => {
  it('lit la paire clé / valeur', () => {
    const p = parseTagItemRust(
      'TagItem { lang: [88, 88, 88], description: "", item_key: TrackArtist, item_value: Text("Paco de Lucia") }',
    );
    expect(p).toEqual({ cle: 'TrackArtist', valeur: 'Paco de Lucia' });
  });

  it('dénude les guillemets échappés', () => {
    const p = parseTagItemRust('TagItem { item_key: Comment, item_value: Text("dit \\"salut\\"") }');
    expect(p?.valeur).toBe('dit "salut"');
  });

  it('garde la variante quand elle porte une information', () => {
    // `Text` et `Locator` sont des enveloppes : leur nom n'apprend rien. Une
    // valeur binaire, si — la masquer ferait croire à un champ vide.
    expect(parseTagItemRust('TagItem { item_key: Cover, item_value: Binary([1, 2, 3]) }')?.valeur)
      .toBe('Binary([1, 2, 3])');
  });

  it("rend null sur une forme inattendue, plutôt que de découper de travers", () => {
    expect(parseTagItemRust('quelque chose d autre')).toBeNull();
    expect(parseTagItemRust('')).toBeNull();
  });
});

describe('les doublons du fichier ne sont pas affichés deux fois', () => {
  it('AlbumArtist déclaré deux fois avec la même valeur ne donne qu’une ligne', () => {
    // Mesuré sur le .18 : le fichier de Paco de Lucia porte deux fois le même
    // `AlbumArtist`. Les afficher tous les deux n'apprend rien.
    const tags = normalizeFileTags([
      { tag_type: 'VorbisComments', items: [
        'TagItem { item_key: AlbumArtist, item_value: Text("Paco de Lucia") }',
        'TagItem { item_key: AlbumArtist, item_value: Text("Paco de Lucia") }',
        'TagItem { item_key: AlbumArtist, item_value: Text("Un autre") }',
      ] },
    ]);
    expect(tags.AlbumArtist).toEqual(['Paco de Lucia', 'Un autre']);
  });

  it("une ligne illisible est GARDÉE, sous le nom de son conteneur", () => {
    const tags = normalizeFileTags([{ tag_type: 'Id3v2', items: ['charabia sans paire'] }]);
    expect(tags.Id3v2).toEqual(['charabia sans paire']);
  });
});
