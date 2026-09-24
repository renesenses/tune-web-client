/**
 * Bannir un titre — `renesenses/tune-server-rust#4806`, tranche web.
 *
 * Décisions de Bertrand, 23/09/2026 :
 *
 *  - un titre banni reste VISIBLE dans son album, grisé et barré, jamais caché ;
 *  - il n'est plus jamais joué par une sélection AUTOMATIQUE (aléatoire, smart
 *    playlists, enchaînement, radio d'artiste) — c'est le serveur qui le
 *    garantit ; l'écran, lui, ne filtre rien ;
 *  - un clic DÉLIBÉRÉ le joue quand même, après confirmation ;
 *  - bibliothèque LOCALE seulement pour cette tranche : une piste de service
 *    (Qobuz, Tidal…) n'a pas d'entrée « Bannir ».
 *
 * ## Le contrat serveur assumé (PR serveur #4818, diff lu le 23/09/2026)
 *
 *     POST   /library/tracks/{id}/ban   → { track_id, banned: true, … }
 *     DELETE /library/tracks/{id}/ban   → { track_id, banned: false }
 *     GET    /library/tracks/banned     → { total, items: BannedTrack[] }
 *
 * et le drapeau `banned: boolean` sur CHAQUE ligne des listes de pistes
 * (album, playlist, recherche, file, `/library/tracks`), toujours présent,
 * `false` par défaut — `attacher_banni`, `routes/library/albums.rs`.
 *
 * ## Pourquoi un magasin de SURCHARGES
 *
 * La ligne reçoit sa piste de la LISTE, qui l'a lue au serveur avec son
 * drapeau. Après un « Bannir » depuis le menu, cette liste n'est pas rechargée
 * — et elle ne doit pas l'être : recharger un album de 40 pistes pour griser
 * une ligne ferait sauter le défilement. On mémorise donc ce que l'utilisateur
 * vient de décider, piste par piste, et `estBannie` le lit AVANT le drapeau du
 * serveur. Au prochain chargement, le serveur dit la même chose et la
 * surcharge devient sans effet.
 *
 * 🔴 Une surcharge ne vaut que pour une piste de BIBLIOTHÈQUE (identifiant
 * numérique) : une piste de service n'est jamais bannie, quel que soit son
 * `source_id` — même règle que `get_queue` côté serveur.
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import { estPisteLocale } from './pisteFile';
import { t } from './i18n';
import { dialogs } from './stores/dialogs';
import { notifications } from './stores/notifications';
import type { Track } from './types';

/** Ce que l'utilisateur a décidé depuis le dernier chargement : id → banni. */
export const surchargesBannissement = writable<ReadonlyMap<number, boolean>>(new Map());

/** Une piste de bibliothèque, désignée par son identifiant — sinon `null`. */
function idDeBibliotheque(piste: Pick<Track, 'id' | 'source'>): number | null {
  return estPisteLocale(piste) && typeof piste.id === 'number' ? piste.id : null;
}

/**
 * La piste est-elle bannie, aux yeux de l'écran ?
 *
 * La surcharge locale d'abord (ce que l'on vient de cliquer), puis le drapeau
 * `banned` que le serveur pose sur chaque ligne. Absent = `false` : une liste
 * servie par un serveur d'avant #4806 ne grise rien.
 */
export function estBannie(
  piste: Pick<Track, 'id' | 'source' | 'banned'>,
  surcharges: ReadonlyMap<number, boolean> = get(surchargesBannissement),
): boolean {
  const id = idDeBibliotheque(piste);
  if (id == null) return false;
  const locale = surcharges.get(id);
  if (locale != null) return locale;
  return piste.banned === true;
}

/** L'entrée « Bannir » a-t-elle un sens pour cette piste ? Bibliothèque seule. */
export function bannissable(piste: Pick<Track, 'id' | 'source'>): boolean {
  return idDeBibliotheque(piste) != null;
}

function retenir(id: number, banni: boolean) {
  // Réassigner, jamais muter : un magasin qui rend la même référence ne
  // réveille aucun abonné.
  surchargesBannissement.update((m) => new Map(m).set(id, banni));
}

function titreDe(piste: Pick<Track, 'title'>): string {
  return piste.title ?? '';
}

/**
 * Bannir. Idempotent côté serveur ; ici on retient la décision et on le dit.
 * Rend `true` si le serveur a accepté.
 */
export async function bannir(piste: Track): Promise<boolean> {
  const id = idDeBibliotheque(piste);
  if (id == null) return false;
  try {
    await api.banTrack(id);
    retenir(id, true);
    notifications.success(get(t)('ban.banned' as any).replace('{title}', titreDe(piste)));
    return true;
  } catch {
    notifications.error(get(t)('ban.error' as any));
    return false;
  }
}

/** Débannir — depuis le menu d'une piste comme depuis l'écran « Titres bannis ». */
export async function debannir(piste: Pick<Track, 'id' | 'source' | 'title'>): Promise<boolean> {
  const id = idDeBibliotheque(piste);
  if (id == null) return false;
  try {
    await api.unbanTrack(id);
    retenir(id, false);
    notifications.success(get(t)('ban.unbanned' as any).replace('{title}', titreDe(piste)));
    return true;
  } catch {
    notifications.error(get(t)('ban.error' as any));
    return false;
  }
}

/**
 * Un clic DÉLIBÉRÉ sur un titre banni le joue — après confirmation.
 *
 * Rend `true` quand la lecture peut partir : la piste n'est pas bannie, ou
 * l'utilisateur a confirmé. `dialogs.confirm`, jamais `window.confirm` : les
 * boîtes natives ne s'ouvrent pas dans les webviews (#166).
 */
export async function confirmerLectureBannie(
  piste: Pick<Track, 'id' | 'source' | 'banned' | 'title'>,
): Promise<boolean> {
  if (!estBannie(piste)) return true;
  return dialogs.confirm(get(t)('ban.playConfirm' as any).replace('{title}', titreDe(piste)));
}
