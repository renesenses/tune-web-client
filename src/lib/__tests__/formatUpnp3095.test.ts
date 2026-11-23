// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { corpsLecture } from '../tuneRemote';
import { corpsMediaServer } from '../lectureMediaServer';
import type { Track, MediaServerItem } from '../types';

const depot = { base: 'http://127.0.0.1:9999/api/v1', nom: 'Tune distant', hote: '127.0.0.1:9999' };
describe('format des pistes distantes #3095 / serveur #8788', () => {
  it('garde la résolution DSF d’une URL Tune sans extension', () => {
    const piste = { id: 42, title: 'DSD', format: 'dsf', sample_rate: 11289600, bit_depth: 1 } as Track;
    expect(corpsLecture(depot, piste)).toMatchObject({ source: 'upnp', media_format: 'dsf', sample_rate: 11289600, bit_depth: 1 });
  });
  it.each(['audio/wav', 'audio/x-wav', 'audio/vnd.wave'])('transmet le conteneur WAV annoncé par %s', (mime) => {
    const item = { id: '1', title: 'WAV', res_url: 'http://127.0.0.1/ressource', protocol_info: `http-get:*:${mime}:*`, sample_rate: 96000, bit_depth: 24 } as MediaServerItem;
    expect(corpsMediaServer(item)).toMatchObject({ source_id: item.res_url, media_format: 'wav', sample_rate: 96000, bit_depth: 24 });
  });
  it('ne confond pas le conteneur MP4 et le codec ALAC', () => {
    const item = { id: '1', title: 'M4A', protocol_info: 'http-get:*:audio/mp4:*' } as MediaServerItem;
    expect(corpsMediaServer(item).media_format).toBe('mp4');
  });
  it('ne fabrique pas de résolution ni de format pour un ancien serveur', () => {
    const corps = corpsMediaServer({ id: '1', title: 'Ancien', res_url: 'http://127.0.0.1/inconnu' });
    expect(corps).not.toHaveProperty('media_format');
    expect(corps).not.toHaveProperty('sample_rate');
    expect(corps).not.toHaveProperty('bit_depth');
  });
});
