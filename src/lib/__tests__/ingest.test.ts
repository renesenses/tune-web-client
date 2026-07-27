/**
 * Tests for the ingest drag-and-drop plumbing.
 *
 * `collectDroppedFiles` and `dropLooksLikeMusic` are the only parts of the
 * import flow that cannot be exercised through the REST API, and they carry
 * the subtle bits:
 *   1. a dropped *folder* never appears in `dataTransfer.files` — it has to be
 *      walked through the `webkitGetAsEntry` API, or the drop silently yields
 *      nothing
 *   2. `readEntries` returns one batch at a time (100 entries on Chrome), so a
 *      long album is truncated unless it is called until the empty batch
 *   3. internal drags (genre tree, queue reordering) must not be mistaken for
 *      a file drop
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('../auth', () => ({
  getToken: () => null,
  clearToken: vi.fn(),
}));

import { collectDroppedFiles, dropLooksLikeMusic } from '../api/ingest';

// -- Minimal fakes of the FileSystem entry API --

function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (cb: (f: File) => void) => cb(new File(['x'], name)),
  };
}

/** Directory whose children are handed out in batches, like Chrome does. */
function dirEntry(name: string, children: any[], batchSize = 100) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (cb: (entries: any[]) => void) => {
          const batch = children.slice(i, i + batchSize);
          i += batch.length;
          cb(batch);
        },
      };
    },
  };
}

function dataTransfer(entries: any[], files: File[] = []): DataTransfer {
  return {
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
    })),
    files,
    types: ['Files'],
  } as unknown as DataTransfer;
}

describe('collectDroppedFiles', () => {
  it('flattens loose files', async () => {
    const dt = dataTransfer([fileEntry('01 - Intro.flac'), fileEntry('02 - Sing.flac')]);
    const out = await collectDroppedFiles(dt);
    expect(out.map((f) => f.relativePath)).toEqual(['01 - Intro.flac', '02 - Sing.flac']);
  });

  it('walks into a dropped folder and keeps the relative path', async () => {
    const dt = dataTransfer([
      dirEntry('Muse - Absolution', [fileEntry('01 - Intro.flac'), fileEntry('cover.jpg')]),
    ]);
    const out = await collectDroppedFiles(dt);
    expect(out.map((f) => f.relativePath)).toEqual([
      'Muse - Absolution/01 - Intro.flac',
      'Muse - Absolution/cover.jpg',
    ]);
  });

  it('walks nested disc folders', async () => {
    const dt = dataTransfer([
      dirEntry('Album', [
        dirEntry('Disc 1', [fileEntry('01.flac')]),
        dirEntry('Disc 2', [fileEntry('01.flac')]),
        fileEntry('cover.jpg'),
      ]),
    ]);
    const out = await collectDroppedFiles(dt);
    expect(out.map((f) => f.relativePath).sort()).toEqual([
      'Album/Disc 1/01.flac',
      'Album/Disc 2/01.flac',
      'Album/cover.jpg',
    ]);
  });

  it('reads every batch, not just the first', async () => {
    // 250 tracks with a 100-per-batch reader: a single readEntries call would
    // silently drop 150 of them.
    const children = Array.from({ length: 250 }, (_, i) => fileEntry(`${i + 1}.flac`));
    const dt = dataTransfer([dirEntry('Big Box Set', children, 100)]);
    const out = await collectDroppedFiles(dt);
    expect(out).toHaveLength(250);
  });

  it('falls back to flat files when the entry API is missing', async () => {
    const dt = {
      items: [{ kind: 'file' }],
      files: [new File(['x'], 'track.flac')],
      types: ['Files'],
    } as unknown as DataTransfer;
    const out = await collectDroppedFiles(dt);
    expect(out.map((f) => f.relativePath)).toEqual(['track.flac']);
  });

  it('survives a file that refuses to be read', async () => {
    const broken = {
      isFile: true,
      isDirectory: false,
      name: 'locked.flac',
      file: (_ok: unknown, err: () => void) => err(),
    };
    const dt = dataTransfer([broken, fileEntry('fine.flac')]);
    const out = await collectDroppedFiles(dt);
    expect(out.map((f) => f.relativePath)).toEqual(['fine.flac']);
  });

  it('returns nothing for an empty drop', async () => {
    const out = await collectDroppedFiles(dataTransfer([]));
    expect(out).toEqual([]);
  });
});

describe('dropLooksLikeMusic', () => {
  it('accepts audio files', () => {
    expect(dropLooksLikeMusic(dataTransfer([fileEntry('a.flac')]))).toBe(true);
    expect(dropLooksLikeMusic(dataTransfer([fileEntry('a.MP3')]))).toBe(true);
    expect(dropLooksLikeMusic(dataTransfer([fileEntry('a.dsf')]))).toBe(true);
  });

  it('accepts a folder, whose contents cannot be known yet', () => {
    expect(dropLooksLikeMusic(dataTransfer([dirEntry('Some Album', [])]))).toBe(true);
  });

  it('rejects unrelated files', () => {
    expect(dropLooksLikeMusic(dataTransfer([fileEntry('cover.jpg')]))).toBe(false);
    expect(dropLooksLikeMusic(dataTransfer([fileEntry('notes.txt')]))).toBe(false);
  });

  it('accepts a file drop when the entry API yields nothing', () => {
    // Chrome hands back `null` from webkitGetAsEntry for a synthetic
    // DataTransfer, and the API is non-standard to begin with. Relying on it
    // alone silently swallowed a perfectly good drop.
    const dt = {
      items: [{ kind: 'file', webkitGetAsEntry: () => null, getAsFile: () => new File([''], 'a.flac') }],
      files: [new File([''], 'a.flac')],
      types: ['Files'],
    } as unknown as DataTransfer;
    expect(dropLooksLikeMusic(dt)).toBe(true);
  });

  it('accepts a drop exposed only through dataTransfer.files', () => {
    const dt = {
      items: [],
      files: [new File([''], 'track.flac')],
      types: ['Files'],
    } as unknown as DataTransfer;
    expect(dropLooksLikeMusic(dt)).toBe(true);
  });

  it('rejects an internal drag carrying no file', () => {
    const internal = {
      items: [{ kind: 'string' }],
      files: [],
      types: ['text/plain'],
    } as unknown as DataTransfer;
    expect(dropLooksLikeMusic(internal)).toBe(false);
  });

  it('accepts a mixed drop as soon as one audio file is present', () => {
    const dt = dataTransfer([fileEntry('readme.txt'), fileEntry('track.flac')]);
    expect(dropLooksLikeMusic(dt)).toBe(true);
  });
});
