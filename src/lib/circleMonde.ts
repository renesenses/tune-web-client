/**
 * Tune Circle (rc8) — ce que la nouvelle scène lit et écrit, en plus de T1-T5.
 *
 * Contrat rc8 (coordination, 23/10/2026), relayé par le greffon `circle` sous
 * `/api/v1/ext/circle` :
 *
 *   GET    /contacts/{id}/library/summary → 200 { albums, genres: [{ genre, albums }] }
 *                                          (comptes arrondis, ≤ 8 genres) ; 204 si le
 *                                          cloud n'a pas les chiffres ; 403 si ce
 *                                          contact ne partage pas ; 404 hors contact
 *   GET    /me/location                   → 200 { label, country_code, lat, lon } ou 204
 *   PUT    /me/location { label, country_code?, lat, lon } → 200 (arrondi 0,5°)
 *   DELETE /me/location                   → 204
 *   GET    /contacts/locations            → 200 [{ contact_id, label, country_code, lat, lon }]
 *
 * Codes du cloud relayés tels quels ; cloud injoignable → 503.
 *
 * Dégradé (contrat) : un serveur plus ancien n'a pas ces routes — 404 sur
 * `/me/location`. L'écran fonctionne alors avec ce qui existe (contacts,
 * mes genres locaux) et masque le globe et les tailles des contacts.
 *
 * Vie privée :
 * - le lieu est DÉSACTIVÉ par défaut : rien n'est envoyé sans le geste
 *   « Montrer ma ville » ; jamais de géolocalisation du navigateur ni d'IP ;
 * - la position est arrondie au demi-degré AVANT l'envoi : le clic exact ne
 *   quitte pas le navigateur ;
 * - le résumé d'un contact n'est demandé QUE pour un contact qui partage déjà
 *   sa bibliothèque avec moi (T2) — l'appelant le garantit, voir la scène.
 *
 * Tous les appels passent `sansBandeau` : l'écran dit lui-même ce qui manque.
 */
import { BASE, fetchJSON, type ApiError } from './api';
import { arrondiDemiDegre, arrondiSignificatif, GENRES_MAX } from './champCercle/tailles';
import type { GenreCompte, Lieu } from './champCercle/scene';

const seg = (v: number) => encodeURIComponent(String(v));
const lire = <T>(url: string) => fetchJSON<T>(url, undefined, undefined, true);

/** `ok` : routes présentes ; `absent` : serveur plus ancien (404) ; `indisponible` : 503 ou panne. */
export type EtatRelais = 'ok' | 'absent' | 'indisponible';

/** Longueur maximale du libellé du lieu (contrat : 60 caractères). */
export const LIBELLE_LIEU_MAX = 60;

const statut = (e: unknown) => (e as ApiError | null)?.status;

/** Un lieu reconstruit champ par champ, ou `null` s'il n'est pas lisible. */
export function lieuValide(b: any): Lieu | null {
  if (!b || typeof b !== 'object') return null;
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const label = typeof b.label === 'string' ? [...b.label.trim()].slice(0, LIBELLE_LIEU_MAX).join('') : '';
  const cc = typeof b.country_code === 'string' && /^[A-Za-z]{2}$/.test(b.country_code) ? b.country_code.toUpperCase() : null;
  return { label, country_code: cc, lat: arrondiDemiDegre(lat), lon: arrondiDemiDegre(lon) };
}

/** Mon lieu, et du même coup : les routes rc8 existent-elles sur ce serveur ? */
export async function lireMonLieu(): Promise<{ relais: EtatRelais; lieu: Lieu | null }> {
  try {
    const b = await lire<unknown>(`${BASE}/ext/circle/me/location`);
    return { relais: 'ok', lieu: lieuValide(b) };
  } catch (e) {
    return { relais: statut(e) === 404 ? 'absent' : 'indisponible', lieu: null };
  }
}

/** Les lieux de mes contacts acceptés qui ont posé le leur. Panne : aucun. */
export async function lireLieuxContacts(): Promise<Map<number, Lieu>> {
  const m = new Map<number, Lieu>();
  try {
    const b = await lire<unknown>(`${BASE}/ext/circle/contacts/locations`);
    const liste: any[] = Array.isArray(b) ? b : ((b as { data?: unknown[] } | null)?.data as any[] ?? []);
    for (const x of liste) {
      const id = Number(x?.contact_id);
      const l = lieuValide(x);
      if (Number.isInteger(id) && l) m.set(id, l);
    }
  } catch { /* rien : le globe montre ce qu'il sait */ }
  return m;
}

/** Ce que je saisis : le libellé est libre, la position vient d'un clic ou de deux champs. */
export interface SaisieLieu { label: string; country_code?: string | null; lat: number; lon: number }

/** Le corps tel qu'il partira, ou `null` si la saisie n'est pas valable. */
export function corpsLieu(s: SaisieLieu): { label: string; country_code?: string; lat: number; lon: number } | null {
  const label = (s.label ?? '').trim();
  if (label.length < 1 || [...label].length > LIBELLE_LIEU_MAX) return null;
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180) return null;
  const corps: { label: string; country_code?: string; lat: number; lon: number } = {
    label, lat: arrondiDemiDegre(s.lat), lon: arrondiDemiDegre(s.lon),
  };
  const cc = (s.country_code ?? '').trim();
  if (cc) {
    if (!/^[A-Za-z]{2}$/.test(cc)) return null;
    corps.country_code = cc.toUpperCase();
  }
  return corps;
}

/**
 * Une coordonnée tapée à la main : « 47,32 » (virgule décimale française)
 * vaut « 47.32 ». Vide ou illisible → `null`. Les champs sont en `type="text"` :
 * un `type="number"` rend une valeur VIDE pour « 47,32 » dans un navigateur
 * qui n'accepte que le point, et la saisie était refusée sans rien dire.
 */
export function lireCoordonnee(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const t = (s ?? '').trim().replace(/\s+/g, '').replace(',', '.').replace(/°$/, '');
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** « Montrer ma ville à mes proches » : PUT, position déjà arrondie. */
export async function poserMonLieu(s: SaisieLieu): Promise<Lieu> {
  const corps = corpsLieu(s);
  if (!corps) {
    const err = new Error('location_invalid') as ApiError;
    err.status = 422;
    err.code = 'location_invalid';
    throw err;
  }
  const b = await fetchJSON<unknown>(`${BASE}/ext/circle/me/location`, { method: 'PUT', body: JSON.stringify(corps) }, undefined, true);
  return lieuValide(b) ?? { ...corps, country_code: corps.country_code ?? null };
}

/** Retrait en un clic : le cloud efface la ligne. */
export async function retirerMonLieu(): Promise<void> {
  await fetchJSON<unknown>(`${BASE}/ext/circle/me/location`, { method: 'DELETE' }, undefined, true);
}

export interface ResumeBibliotheque { albums: number | null; genres: GenreCompte[] }

/** Lit un résumé `{ albums, genres }` : arrondi à 2 chiffres, ≤ 8 genres, champ par champ. */
export function resumeValide(b: any): ResumeBibliotheque | null {
  if (!b || typeof b !== 'object') return null;
  const albums = typeof b.albums === 'number' && Number.isFinite(b.albums) && b.albums >= 0 ? arrondiSignificatif(b.albums) : null;
  const genres: GenreCompte[] = [];
  if (Array.isArray(b.genres)) {
    for (const g of b.genres) {
      const nom = typeof g?.genre === 'string' ? g.genre.trim() : '';
      const n = typeof g?.albums === 'number' && Number.isFinite(g.albums) && g.albums >= 0 ? arrondiSignificatif(g.albums) : null;
      if (nom && n != null) genres.push({ genre: nom, albums: n });
      if (genres.length >= GENRES_MAX) break;
    }
  }
  return { albums, genres };
}

/**
 * Le résumé de la bibliothèque d'un contact QUI PARTAGE avec moi. `null` dans
 * tous les autres cas (204, 403, 404, panne) : taille par défaut, aucun genre.
 */
export async function lireResumeContact(uid: number): Promise<ResumeBibliotheque | null> {
  try {
    return resumeValide(await lire<unknown>(`${BASE}/ext/circle/contacts/${seg(uid)}/library/summary`));
  } catch {
    return null;
  }
}

/** MES chiffres, lus sur MON serveur : rien ne vient du cloud. */
export async function lireMesChiffres(): Promise<ResumeBibliotheque> {
  const [s, g] = await Promise.allSettled([
    lire<{ albums?: unknown }>(`${BASE}/library/stats`),
    lire<{ name?: unknown; count?: unknown }[]>(`${BASE}/library/genres`),
  ]);
  const albums = s.status === 'fulfilled' && typeof s.value?.albums === 'number' && Number.isFinite(s.value.albums) ? s.value.albums : null;
  const genres: GenreCompte[] = g.status === 'fulfilled' && Array.isArray(g.value)
    ? g.value
      .filter((x) => typeof x?.name === 'string' && x.name.trim() !== '' && typeof x.count === 'number' && x.count > 0)
      .map((x) => ({ genre: String(x.name).trim(), albums: x.count as number }))
      .sort((a, b) => b.albums - a.albums)
      .slice(0, GENRES_MAX)
    : [];
  return { albums, genres };
}

/** Mon nom public (SSO), ou `null` : l'écran dit alors « Vous ». */
export async function lireMonNom(): Promise<string | null> {
  try {
    const s = await lire<any>(`${BASE}/cloud/sso/status`);
    const n = s?.connected && s?.user ? String(s.user.display_name || '').trim() : '';
    return n || null;
  } catch {
    return null;
  }
}
