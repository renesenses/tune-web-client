import type { MediaServerItem } from './types';

export function corpsMediaServer(it: MediaServerItem): Record<string, unknown> {
    const b: Record<string, unknown> = { source: 'upnp', source_id: it.res_url };
    if (it.title) b.title = it.title;
    if (it.artist) b.artist_name = it.artist;
    if (it.album) b.album_title = it.album;
    if (it.album_art_uri) b.cover_path = it.album_art_uri;
    if (it.duration_ms) b.duration_ms = it.duration_ms;
    const mime = it.protocol_info?.split(':')[2]?.split(';')[0]?.trim().toLowerCase();
    const format = mime?.startsWith('audio/') ? mime.slice(6).replace(/^x-/, '') : undefined;
    const formats: Record<string, string> = {
      wav: 'wav', wave: 'wav', 'vnd.wave': 'wav', flac: 'flac',
      aiff: 'aiff', aif: 'aiff', mp4: 'mp4', m4a: 'm4a', aac: 'aac', alac: 'alac',
      mpeg: 'mp3', mp3: 'mp3', ogg: 'ogg', opus: 'opus', vorbis: 'vorbis',
      dsf: 'dsf', dff: 'dff', dsd: 'dsd',
    };
    if (format && formats[format]) b.media_format = formats[format];
    if (it.sample_rate != null && it.sample_rate > 0) b.sample_rate = it.sample_rate;
    if (it.bit_depth != null && it.bit_depth > 0) b.bit_depth = it.bit_depth;
    return b;
  }

