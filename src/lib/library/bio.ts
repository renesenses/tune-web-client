export type BioLevel = 'simple' | 'complete' | 'full';

export interface BioTruncateOpts {
  /** Char index from which to look for a sentence end (`.`) in `simple` mode. */
  simpleSentenceStart: number;
  /** Hard cap on the `simple` excerpt length. */
  simpleMax: number;
  /** Length cap for the `complete` excerpt. */
  completeCut: number;
  /** When true, `complete` drops a trailing partial line before the ellipsis. */
  trimTrailingLine?: boolean;
}

/**
 * The bio text to show for a given detail level. Extracted from LibraryView so
 * the album and artist bio panels share one implementation instead of two
 * hand-copied `{@const}` chains that had already drifted apart (different
 * sentence-start, caps, and trailing-line handling).
 *
 * - `simple`: up to the first sentence end at/after `simpleSentenceStart`,
 *   capped at `simpleMax`.
 * - `complete`: up to `completeCut` (optionally dropping a dangling partial
 *   line), with an ellipsis when truncated.
 * - `full`: the bio unchanged.
 */
export function bioDisplayText(bio: string, level: BioLevel, opts: BioTruncateOpts): string {
  if (level === 'full') return bio;

  if (level === 'simple') {
    const simpleCut =
      bio.indexOf('.') > 0 ? bio.indexOf('.', opts.simpleSentenceStart) + 1 || 200 : 200;
    return bio.slice(0, Math.min(simpleCut, opts.simpleMax)).trim();
  }

  // level === 'complete'
  if (bio.length <= opts.completeCut) return bio;
  const cut = bio.slice(0, opts.completeCut);
  const trimmed = opts.trimTrailingLine ? cut.replace(/\n[^\n]*$/, '') : cut;
  return trimmed.trim() + '...';
}
