/** Listen timestamps for radio favourites, kept in the browser so a stock
 *  Tune Server (no Rust rebuild) can still show the hour the track was heard
 *  rather than the hour the heart was clicked. */

const STORAGE_KEY = 'tune-radio-fav-listened-at';

export function radioFavListenKey(title: string | null | undefined, artist: string | null | undefined): string {
  return `${title ?? ''}\n${artist ?? ''}`;
}

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function rememberRadioFavListenAt(
  title: string | null | undefined,
  artist: string | null | undefined,
  iso: string | null | undefined,
) {
  const trimmed = (iso ?? '').trim();
  if (!trimmed || !title) return;
  const map = loadMap();
  map[radioFavListenKey(title, artist)] = trimmed;
  saveMap(map);
}

export function forgetRadioFavListenAt(title: string | null | undefined, artist: string | null | undefined) {
  const map = loadMap();
  delete map[radioFavListenKey(title, artist)];
  saveMap(map);
}

export function clearRadioFavListenAt() {
  localStorage.removeItem(STORAGE_KEY);
}

export function radioFavDisplayAt(
  title: string,
  artist: string | null | undefined,
  fallback: string | number | null | undefined,
): string | number | null | undefined {
  return loadMap()[radioFavListenKey(title, artist)] || fallback;
}

/** Zone now-playing `metadata_changed_at` is epoch-ms (song start). */
export function isoFromMetadataChangedAt(ms: number | null | undefined): string {
  if (ms != null && Number.isFinite(ms) && ms > 0) {
    const epoch = ms > 1e12 ? ms : ms * 1000;
    const d = new Date(epoch);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export function formatRadioFavDate(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'number' ? raw : (/^\d+$/.test(String(raw)) ? Number(raw) : NaN);
  const d = Number.isFinite(n)
    ? new Date(n > 1e12 ? n : n * 1000)
    : new Date(String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
