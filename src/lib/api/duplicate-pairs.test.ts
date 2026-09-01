import { describe, it, expect } from 'vitest';
import {
  copiePiste,
  flattenLibraryDuplicates,
  paireDepuisSmart,
  pairesAudioDabord,
} from './duplicate-pairs';

describe('copiePiste', () => {
  it('maps file_path to path so the panel can show the folder', () => {
    const c = copiePiste({
      id: 36,
      title: 'Velera',
      artist: 'Roy Hargrove Big Band',
      file_path: '\\\\nas\\Musique\\CD\\A\\01 - Velera.flac',
    });
    expect(c.track_id).toBe(36);
    expect(c.path).toContain('Velera.flac');
    expect(c.file_path).toBe(c.path);
  });

  it('fills a missing title from the other copy (smart omits title on track_b)', () => {
    const c = copiePiste(
      { id: 22438, file_path: '\\\\nas\\Musique\\CD\\B\\01 - Velera.flac' },
      'Velera',
    );
    expect(c.title).toBe('Velera');
  });
});

describe('paireDepuisSmart', () => {
  it('builds A/B from the 0.9.121 /smart payload', () => {
    const p = paireDepuisSmart({
      track_a: {
        id: 36,
        title: 'Velera',
        artist: 'Roy Hargrove Big Band',
        file_path: '\\\\nas\\A\\01 - Velera.flac',
        format: 'flac',
      },
      track_b: {
        id: 22438,
        artist: 'Roy Hargrove Big Band',
        file_path: '\\\\nas\\B\\01 - Velera.flac',
        format: 'flac',
      },
    });
    expect(p.a.track_id).toBe(36);
    expect(p.b.track_id).toBe(22438);
    expect(p.b.title).toBe('Velera');
    expect(p.a.path).toContain('\\A\\');
    expect(p.b.path).toContain('\\B\\');
  });
});

describe('flattenLibraryDuplicates', () => {
  it('flattens by_hash rows from GET /library/duplicates', () => {
    const pairs = flattenLibraryDuplicates({
      total: 1,
      duplicates: {
        by_hash: [
          {
            id: 46,
            title: 'Trust',
            artist_name: 'Roy Hargrove Big Band',
            file_path: '\\\\nas\\A\\11 - Trust.flac',
            dup_id: 22454,
            dup_path: '\\\\nas\\B\\11 - Trust.flac',
            dup_artist_name: 'Roy Hargrove Big Band',
            match_type: 'audio_hash',
          },
        ],
        by_metadata: [],
        by_fingerprint: [],
      },
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].match_type).toBe('audio_hash');
    expect(pairs[0].a.path).toContain('\\A\\');
    expect(pairs[0].b.path).toContain('\\B\\');
    expect(pairs[0].b.title).toBe('Trust');
  });

  it('accepts a /smart array under duplicates', () => {
    const pairs = flattenLibraryDuplicates({
      count: 1,
      duplicates: [
        {
          track_a: { id: 1, title: 'X', file_path: '/a.flac' },
          track_b: { id: 2, file_path: '/b.flac' },
        },
      ],
    });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].b.title).toBe('X');
  });
});

describe('pairesAudioDabord', () => {
  it('prefers hash matches (the scan count) over smart title matches', () => {
    const hash = flattenLibraryDuplicates({
      duplicates: {
        by_hash: [
          {
            id: 1,
            title: 'Exact',
            file_path: '/a.flac',
            dup_id: 2,
            dup_path: '/b.flac',
            match_type: 'audio_hash',
          },
        ],
        by_metadata: [],
        by_fingerprint: [],
      },
    });
    const smart = [
      paireDepuisSmart({
        track_a: { id: 9, title: 'Same name', file_path: '/c.flac' },
        track_b: { id: 10, file_path: '/d.flac' },
      }),
    ];
    const chosen = pairesAudioDabord(hash, smart);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].a.title).toBe('Exact');
  });

  it('falls back to smart when the hash list was filtered empty', () => {
    const smart = [
      paireDepuisSmart({
        track_a: { id: 9, title: 'Same name', file_path: '/c.flac' },
        track_b: { id: 10, file_path: '/d.flac' },
      }),
    ];
    expect(pairesAudioDabord([], smart)).toEqual(smart);
  });
});
