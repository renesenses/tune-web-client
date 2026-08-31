import { describe, it, expect, vi } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));

const { normalizeFileTags, normalizeTrackAllTags } = await import('./metadata');

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
    expect(out.file_tags.Id3v2.length).toBe(2);
    expect(out.file_tags.Id3v2.join(' / ')).toContain('Oye Como Va');
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
