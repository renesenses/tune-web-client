import { describe, it, expect } from 'vitest';
import { bioDisplayText, type BioTruncateOpts } from './bio';

const ARTIST: BioTruncateOpts = {
  simpleSentenceStart: 100,
  simpleMax: 400,
  completeCut: 1500,
  trimTrailingLine: true,
};
const ALBUM: BioTruncateOpts = {
  simpleSentenceStart: 80,
  simpleMax: 300,
  completeCut: 800,
  trimTrailingLine: false,
};

describe('bioDisplayText', () => {
  it('full returns the bio unchanged', () => {
    const bio = 'a'.repeat(3000);
    expect(bioDisplayText(bio, 'full', ARTIST)).toBe(bio);
  });

  it('complete truncates with an ellipsis past the cap', () => {
    const bio = 'x'.repeat(2000);
    const out = bioDisplayText(bio, 'complete', ARTIST);
    expect(out.endsWith('...')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(ARTIST.completeCut + 3);
  });

  it('complete returns the bio unchanged when under the cap', () => {
    const bio = 'short bio';
    expect(bioDisplayText(bio, 'complete', ARTIST)).toBe(bio);
  });

  it('complete drops a trailing partial line only when trimTrailingLine is set', () => {
    // A newline lands just before the cut so the tail is a partial line.
    const bio = 'A'.repeat(795) + '\npartial-tail-well-past-cut';
    const artist = bioDisplayText(bio, 'complete', { ...ARTIST, completeCut: 800 });
    expect(artist).toBe('A'.repeat(795) + '...'); // trailing "\npartial" removed
    const album = bioDisplayText(bio, 'complete', { ...ALBUM, completeCut: 800 });
    // Album keeps the partial line: slice(0,800) = 795 A's + "\npart", then "...".
    expect(album).toBe('A'.repeat(795) + '\npart' + '...');
  });

  it('simple cuts at the first sentence end after the search start', () => {
    const bio = 'x'.repeat(90) + ' end of first sentence. Second sentence here.';
    const out = bioDisplayText(bio, 'simple', ALBUM);
    expect(out.endsWith('.')).toBe(true);
    expect(out).not.toContain('Second sentence');
  });

  it('simple respects the hard cap', () => {
    const bio = 'no period here just a very long run of words '.repeat(20);
    const out = bioDisplayText(bio, 'simple', ALBUM);
    // No '.' at all → falls back to 200, then capped at simpleMax (300 here).
    expect(out.length).toBeLessThanOrEqual(ALBUM.simpleMax);
  });
});
