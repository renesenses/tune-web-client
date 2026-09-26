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
 *  - un titre de SERVICE (Qobuz, Tidal, Bandcamp…) se bannit aussi — FabienM,
 *    fil 1946, réponse 6820 : « Il faut pouvoir bannir un titre service, pas
 *    uniquement local » ; go de Bertrand le 26/09/2026.
 *
 * ## Le contrat serveur assumé (PR serveur #4818, diff lu le 23/09/2026)
 *
 *     POST   /library/tracks/{id}/ban        → { track_id, banned: true, … }
 *     DELETE /library/tracks/{id}/ban        → { track_id, banned: false }
 *     POST   /library/tracks/streaming/ban   → { source, source_id, banned: true, … }
 *     POST   /library/tracks/streaming/unban → { source, source_id, banned: false }
 *     GET    /library/tracks/banned          → { total, items: BannedTrack[] }
 *
 * et le drapeau `banned: boolean` sur CHAQUE ligne des listes de pistes de la
 * bibliothèque et de la FILE (titres de service compris), toujours présent,
 * `false` par défaut — `attacher_banni`, `routes/library/albums.rs`.
 *
 * ## Un titre de service dans son album de service
 *
 * Les routes du catalogue d'un service (`/streaming/{service}/albums/…`) ne
 * connaissent pas le profil : elles ne posent pas `banned`. Le serveur rend
 * en revanche TOUS les titres de service bannis du profil dans
 * `GET /library/tracks/banned` — une liste courte. On la lit UNE fois, au
 * premier titre de service regardé, et on en sème les surcharges : l'album
 * Qobuz grise ses titres bannis comme un album de la bibliothèque.
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
 * 🔴 Deux espaces d'identifiants, deux familles de clés : `l:<id>` pour une
 * piste de BIBLIOTHÈQUE, `s:<service>:<source_id>` pour un titre de SERVICE.
 * Le titre Qobuz « 7 » et la piste locale 7 ne se confondent jamais — même
 * règle que `get_queue` côté serveur.
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import { estPisteLocale } from './pisteFile';
import { estSourceDeBibliotheque } from './provenanceBibliotheque';
import { albumDeServiceDe } from './routageAlbum';
import { t } from './i18n';
import { dialogs } from './stores/dialogs';
import { notifications } from './stores/notifications';
import type { Track } from './types';

/** Ce que l'utilisateur a décidé depuis le dernier chargement : clé → banni. */
export const surchargesBannissement = writable<ReadonlyMap<string, boolean>>(new Map());

type PisteDesignee = Pick<Track, 'id' | 'source' | 'source_id'>;

/** Une piste de bibliothèque, désignée par son identifiant — sinon `null`. */
function idDeBibliotheque(piste: Pick<Track, 'id' | 'source'>): number | null {
  return estPisteLocale(piste) && typeof piste.id === 'number' ? piste.id : null;
}

/**
 * La provenance telle que le serveur la compare (`source_normalisee`,
 * `hidden_repo.rs`) : `Qobuz`, ` qobuz` et `qobuz` sont le même service.
 */
function serviceNormalise(source: unknown): string {
  return String(source ?? '').trim().toLowerCase();
}

/**
 * Un titre de SERVICE, désigné par sa paire — sinon `null`. Ni une piste de
 * la bibliothèque (UPnP compris), ni une radio : une webradio n'a pas de
 * titre à bannir.
 */
export function designationDeService(
  piste: Partial<PisteDesignee> | null | undefined,
): { source: string; source_id: string } | null {
  if (!piste || estPisteLocale(piste as PisteDesignee)) return null;
  const source = serviceNormalise(piste.source);
  if (estSourceDeBibliotheque(source) || source === 'radio') return null;
  const sourceId = String(piste.source_id ?? '').trim();
  if (sourceId === '') return null;
  return { source, source_id: sourceId };
}

/** La clé d'une piste dans les surcharges, ou `null` si elle n'est pas bannissable. */
export function cleDeBannissement(piste: Partial<PisteDesignee> | null | undefined): string | null {
  if (!piste) return null;
  const id = idDeBibliotheque(piste as PisteDesignee);
  if (id != null) return `l:${id}`;
  const d = designationDeService(piste);
  return d ? `s:${d.source}:${d.source_id}` : null;
}

/**
 * La piste est-elle bannie, aux yeux de l'écran ?
 *
 * La surcharge d'abord (ce que l'on vient de cliquer, ou pour un titre de
 * service ce que la liste du serveur a semé), puis le drapeau `banned` que le
 * serveur pose sur chaque ligne. Absent = `false` : une liste servie par un
 * serveur d'avant #4806 ne grise rien.
 */
export function estBannie(
  piste: Pick<Track, 'id' | 'source' | 'banned'> & { source_id?: Track['source_id'] },
  surcharges: ReadonlyMap<string, boolean> = get(surchargesBannissement),
): boolean {
  const cle = cleDeBannissement(piste);
  if (cle == null) return false;
  if (cle.startsWith('s:')) void chargerBannisDeService();
  const locale = surcharges.get(cle);
  if (locale != null) return locale;
  return piste.banned === true;
}

/** L'entrée « Bannir » a-t-elle un sens pour cette piste ? Bibliothèque ou service. */
export function bannissable(piste: Pick<Track, 'id' | 'source'> & { source_id?: Track['source_id'] }): boolean {
  return cleDeBannissement(piste) != null;
}

/** Un titre de SERVICE bannissable (et non une piste de la bibliothèque). */
export function bannissableDeService(
  piste: Pick<Track, 'id' | 'source'> & { source_id?: Track['source_id'] },
): boolean {
  return designationDeService(piste) != null;
}

function retenir(cle: string, banni: boolean) {
  // Réassigner, jamais muter : un magasin qui rend la même référence ne
  // réveille aucun abonné.
  surchargesBannissement.update((m) => new Map(m).set(cle, banni));
}

let chargementDesBannisDeService: Promise<void> | null = null;

/**
 * Sème les surcharges avec les titres de SERVICE bannis du profil, lus UNE
 * fois (`GET /library/tracks/banned`). Une décision prise depuis (une clé déjà
 * présente) l'emporte sur la liste. Un échec n'est pas fatal : rien n'est
 * grisé, et le prochain regard réessaie.
 */
export function chargerBannisDeService(): Promise<void> {
  if (chargementDesBannisDeService) return chargementDesBannisDeService;
  chargementDesBannisDeService = (async () => {
    try {
      const res = await api.listBannedTracks();
      const cles: string[] = [];
      for (const b of res?.items ?? []) {
        const d = designationDeService({ id: null, source: b.source as any, source_id: b.source_id });
        if (b.track_id == null && d) cles.push(`s:${d.source}:${d.source_id}`);
      }
      if (cles.length) {
        surchargesBannissement.update((m) => {
          const n = new Map(m);
          for (const c of cles) if (!n.has(c)) n.set(c, true);
          return n;
        });
      }
    } catch {
      chargementDesBannisDeService = null;
    }
  })();
  return chargementDesBannisDeService;
}

/** Pour les tests : oublier la lecture faite. */
export function oublierBannisDeService() {
  chargementDesBannisDeService = null;
}

function titreDe(piste: Pick<Track, 'title'>): string {
  return piste.title ?? '';
}

/**
 * Bannir. Idempotent côté serveur ; ici on retient la décision et on le dit.
 * Rend `true` si le serveur a accepté.
 */
export async function bannir(piste: Track): Promise<boolean> {
  const cle = cleDeBannissement(piste);
  if (cle == null) return false;
  try {
    const id = idDeBibliotheque(piste);
    if (id != null) {
      await api.banTrack(id);
    } else {
      const d = designationDeService(piste)!;
      await api.banStreamingTrack({
        ...d,
        title: piste.title ?? null,
        artist: piste.artist_name ?? null,
        album: piste.album_title ?? null,
        album_source_id: albumDeServiceDe(piste as any)?.albumId ?? null,
        cover_url: piste.cover_path ?? null,
      });
    }
    retenir(cle, true);
    notifications.success(get(t)('ban.banned' as any).replace('{title}', titreDe(piste)));
    return true;
  } catch {
    notifications.error(get(t)('ban.error' as any));
    return false;
  }
}

/** Débannir — depuis le menu d'une piste comme depuis l'écran « Titres bannis ». */
export async function debannir(
  piste: Pick<Track, 'id' | 'source' | 'title'> & { source_id?: Track['source_id'] },
): Promise<boolean> {
  const cle = cleDeBannissement(piste);
  if (cle == null) return false;
  try {
    const id = idDeBibliotheque(piste);
    if (id != null) {
      await api.unbanTrack(id);
    } else {
      const d = designationDeService(piste)!;
      await api.unbanStreamingTrack(d.source, d.source_id);
    }
    retenir(cle, false);
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
  piste: Pick<Track, 'id' | 'source' | 'banned' | 'title'> & { source_id?: Track['source_id'] },
): Promise<boolean> {
  if (!estBannie(piste)) return true;
  return dialogs.confirm(get(t)('ban.playConfirm' as any).replace('{title}', titreDe(piste)));
}
