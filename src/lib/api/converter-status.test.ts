import { describe, it, expect } from 'vitest';
import { normalizeConversionStatus } from './converter-status';

/** Payload réellement renvoyé par GET /converter/status/{id} sur 0.9.121 (.79). */
const SERVER_COMPLETED = {
  completed: 1,
  current_file: '',
  errors: [] as { file: string; message: string }[],
  job_id: 'd4c05293-734a-4280-891e-561ba56d9016',
  status: 'completed',
  total: 1,
};

describe('normalizeConversionStatus', () => {
  it('maps the Rust completed payload so the UI can leave 0% converting', () => {
    const s = normalizeConversionStatus(SERVER_COMPLETED);
    expect(s.state).toBe('done');
    expect(s.converted).toBe(1);
    expect(s.total).toBe(1);
    expect(s.progress).toBe(100);
    expect(s.error).toBeUndefined();
  });

  it('maps running + completed count to converting with a real progress', () => {
    const s = normalizeConversionStatus({
      status: 'running',
      completed: 2,
      total: 8,
      current_file: '03 - Track.flac',
      errors: [],
    });
    expect(s.state).toBe('converting');
    expect(s.converted).toBe(2);
    expect(s.progress).toBe(30);
    expect(s.current_file).toBe('03 - Track.flac');
  });

  it('shows in-file progress while the first track is still encoding (completed=0)', () => {
    const s = normalizeConversionStatus({
      status: 'running',
      completed: 0,
      total: 1,
      current_file: '01 - Intro.flac',
      errors: [],
    });
    expect(s.state).toBe('converting');
    expect(s.progress).toBe(40);
    expect(s.current_file).toBe('01 - Intro.flac');
  });

  it('maps failed + errors[] to error with the first message', () => {
    const s = normalizeConversionStatus({
      status: 'failed',
      completed: 3,
      total: 3,
      current_file: '',
      errors: [{ file: 'a.flac', message: 'lame not found' }],
    });
    expect(s.state).toBe('error');
    expect(s.error).toBe('lame not found');
    expect(s.converted).toBe(3);
  });

  it('keeps the web-shaped payload working (no regression if the server catches up)', () => {
    const s = normalizeConversionStatus({
      state: 'done',
      progress: 100,
      converted: 4,
      total: 4,
      current_file: '',
      download_size: '12 Mo',
    });
    expect(s.state).toBe('done');
    expect(s.converted).toBe(4);
    expect(s.progress).toBe(100);
    expect(s.download_size).toBe('12 Mo');
  });
});
