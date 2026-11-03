/** Public metadata only: never consult stream/file URLs, tokens or server sharing routes. */
const texte = (v: unknown) => typeof v === 'string' && !/^\s*(?:https?:|file:|\/)/i.test(v) ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300) : '';
function pagePublique(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port
      || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) || /\.(local|localhost|internal|test)$/i.test(u.hostname)
      || /(?:stream|listen|playlist|\.m3u8?|\.pls|\.mp3|\.aac|\.flac)(?:[/.]|$)/i.test(u.pathname)) return null;
    u.search = ''; u.hash = ''; return u;
  } catch { return null; }
}
export function partagePublic(p: any): { texte: string; url?: string } {
  const source = String(p?.source ?? '').replace(/^__|__$/g, '');
  const id = String(p?.[`${source}_id`] ?? p?.source_id ?? '');
  let url: string | undefined;
  if (source === 'qobuz' && /^\d{1,20}$/.test(id)) url = `https://open.qobuz.com/track/${id}`;
  if (source === 'tidal' && /^\d{1,20}$/.test(id)) url = `https://tidal.com/browse/track/${id}`;
  if (source === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(id)) url = `https://www.youtube.com/watch?v=${id}`;
  if (source === 'spotify' && /^[A-Za-z0-9]{22}$/.test(id)) url = `https://open.spotify.com/track/${id}`;
  if (source === 'bandcamp') {
    const page = pagePublique(id);
    if (page?.protocol === 'https:' && /^[a-z0-9-]+\.bandcamp\.com$/.test(page.hostname) && /^\/track\/[a-z0-9-]+\/?$/.test(page.pathname)) url = page.href;
  }
  const title = texte(p?.title), artist = texte(p?.artist_name), album = texte(p?.album_title);
  if (source === 'radio') {
    url = pagePublique(p?.website_url ?? p?.station?.website_url)?.href;
    return { texte: url ?? [texte(p?.station_name) || album, title].filter(Boolean).join(' – '), ...(url ? { url } : {}) };
  }
  const line = [artist, title].filter(Boolean).join(' – ') + (album ? ` (${album})` : '');
  return { texte: url ?? line.trim(), ...(url ? { url } : {}) };
}
