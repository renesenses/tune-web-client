/**
 * Tune Circle — la vue d'UNE playlist de cercle, rangée (web#2219, go de
 * Bertrand du 19/10/2026 pour la rc7).
 *
 * Ce que la capture de Bertrand montrait : huit lignes qui répètent chacune
 * « Jouable via Qobuz », « ajouté par Reivax66 », ↑ ↓ et « Retirer » ; aucune
 * pochette ; aucun moyen de lancer un titre précis. Ce module calcule, sans
 * rien afficher, ce que l'écran dit UNE fois en tête plutôt qu'à chaque
 * ligne, et ce qu'il faut envoyer pour jouer ou enfiler un morceau.
 *
 * Tout part de deux sources : la playlist relue au cloud (références
 * seulement) et la résolution faite CHEZ MOI par le greffon. Rien ne vient
 * du serveur d'un contact, et rien n'est gardé.
 */
import type { AddToQueueRequest } from './api';
import { corpsDeFile } from './pisteFile';
import type { Track } from './types';
import type { EtatResolution, IdOpaque, MorceauCercle } from './circlePlaylists';

export type Resolutions = ReadonlyMap<string, EtatResolution>;

const cle = (id: IdOpaque) => String(id);
export const resolutionDe = (m: Pick<MorceauCercle, 'item_id'>, r: Resolutions): EtatResolution | null =>
  r.get(cle(m.item_id)) ?? null;

// ─── La pastille « Jouable via X » : seulement quand elle diffère ────────────

/** La forme d'une pastille, comparable : `bibliotheque`, `service:qobuz`, `introuvable`. */
export function sorteDePastille(e: EtatResolution): string {
  return e.etat === 'service' ? `service:${e.service}` : e.etat;
}

/**
 * La MAJORITÉ des morceaux jouables chez moi : la sorte la plus fréquente
 * parmi les morceaux trouvés (bibliothèque ou un service), si elle est SEULE
 * en tête et compte au moins deux morceaux. `null` sinon — égalité, ou
 * rien de trouvé : chaque ligne garde alors sa pastille.
 *
 * L'introuvable n'est jamais la majorité : c'est une alerte, elle se dit
 * toujours, à sa ligne et dans le résumé des introuvables.
 */
export interface Majorite { sorte: string; etat: EtatResolution; n: number }

export function majorite(items: readonly MorceauCercle[], r: Resolutions): Majorite | null {
  const comptes = new Map<string, { etat: EtatResolution; n: number }>();
  for (const m of items) {
    const e = resolutionDe(m, r);
    if (!e || e.etat === 'introuvable') continue;
    const s = sorteDePastille(e);
    const c = comptes.get(s);
    if (c) c.n += 1; else comptes.set(s, { etat: e, n: 1 });
  }
  let tete: Majorite | null = null;
  let egalite = false;
  for (const [sorte, c] of comptes) {
    if (!tete || c.n > tete.n) { tete = { sorte, etat: c.etat, n: c.n }; egalite = false; }
    else if (c.n === tete.n) egalite = true;
  }
  return tete && !egalite && tete.n >= 2 ? tete : null;
}

/** La ligne montre-t-elle sa pastille ? Oui, sauf si elle est de la majorité. */
export function pastilleVisible(e: EtatResolution | null, maj: Majorite | null): boolean {
  if (!e) return false;
  return !maj || sorteDePastille(e) !== maj.sorte;
}

// ─── « ajouté par » : une fois en tête s'il n'y a qu'un contributeur ────────

/**
 * Qui a ajouté un morceau, comparable : `moi`, `nom:Élise`, ou `membre`
 * (le cloud a tu le nom — décision 1 du 28/09 : l'écran ne complète pas).
 */
export function sorteDAuteur(m: MorceauCercle): string {
  if (m.mine) return 'moi';
  return m.added_by ? `nom:${m.added_by.nom}` : 'membre';
}

/**
 * Le contributeur UNIQUE de la playlist, ou `null` s'il y en a plusieurs
 * (ou aucun morceau) : l'écran le dit alors une fois en tête, au lieu de le
 * répéter à chaque ligne.
 *
 * Des morceaux tous anonymisés forment une seule sorte, « membre » : rien
 * ne dit s'ils viennent de la même personne, et l'écran n'en déduit rien —
 * la phrase de tête parle alors « des membres du cercle ».
 */
export function contributeurUnique(items: readonly MorceauCercle[]): MorceauCercle | null {
  if (!items.length) return null;
  return new Set(items.map(sorteDAuteur)).size === 1 ? items[0] : null;
}

// ─── Durée totale ────────────────────────────────────────────────────────────

/** La durée totale connue, en millisecondes (les durées absentes ne comptent pas). */
export function dureeTotaleMs(items: readonly Pick<MorceauCercle, 'duration_ms'>[]): number {
  return items.reduce((s, m) => s + (typeof m.duration_ms === 'number' && m.duration_ms > 0 ? m.duration_ms : 0), 0);
}

// ─── Pochettes ───────────────────────────────────────────────────────────────

/**
 * La pochette d'un morceau, CHEZ MOI : celle de la piste de ma bibliothèque
 * qui le rejoue (par son album, `/library/artwork`), ou celle de mon service
 * (par le relais de pochettes de NOTRE serveur). Un morceau introuvable
 * chez moi n'a pas de pochette : la référence n'en porte aucune (contrat du
 * cloud figé, site-mozaiklabs#236), et le serveur du membre qui l'a ajouté
 * n'est jamais interrogé.
 */
export interface PochetteMorceau { coverPath: string | null; albumId: number | null }

export function pochetteDuMorceau(e: EtatResolution | null): PochetteMorceau | null {
  if (e?.etat === 'bibliotheque' && e.piste?.album_id != null) return { coverPath: null, albumId: e.piste.album_id };
  if (e?.etat === 'service' && e.titre?.cover_url) return { coverPath: e.titre.cover_url, albumId: null };
  return null;
}

const clePochette = (p: PochetteMorceau) => (p.albumId != null ? `a:${p.albumId}` : `c:${p.coverPath}`);

/** Jusqu'à `max` pochettes DISTINCTES, dans l'ordre de la playlist : la mosaïque de l'en-tête. */
export function mosaique(items: readonly MorceauCercle[], r: Resolutions, max = 4): PochetteMorceau[] {
  const vues = new Set<string>();
  const sortie: PochetteMorceau[] = [];
  for (const m of items) {
    const p = pochetteDuMorceau(resolutionDe(m, r));
    if (!p || vues.has(clePochette(p))) continue;
    vues.add(clePochette(p));
    sortie.push(p);
    if (sortie.length >= max) break;
  }
  return sortie;
}

// ─── Jouer, enfiler ──────────────────────────────────────────────────────────

/** Le morceau se joue-t-il chez moi ? Une résolution pas encore revenue : on ne sait pas. */
export function jouable(e: EtatResolution | null): boolean {
  return e != null && e.etat !== 'introuvable';
}

/**
 * Le morceau, à la forme `Track` des routes de file existantes, ou `null`
 * s'il n'est pas enfilable (introuvable, résolution d'un greffon plus ancien
 * qui ne rend ni `track_id` ni `source_id`).
 *
 * Bibliothèque : par son seul `track_id`. Service : par la paire `source` +
 * `source_id` de MON service, avec ce que mon service en dit (titre,
 * pochette…), et à défaut ce que la référence en dit.
 */
export function pisteEnfilable(m: MorceauCercle, e: EtatResolution | null): Track | null {
  if (e?.etat === 'bibliotheque' && e.piste) {
    return { id: e.piste.track_id, title: m.title, artist_name: m.artist_name ?? null, album_title: m.album_title ?? null } as Track;
  }
  if (e?.etat === 'service' && e.titre) {
    return {
      id: null,
      source: e.service as any,
      source_id: e.titre.source_id,
      title: e.titre.title ?? m.title,
      artist_name: e.titre.artist_name ?? m.artist_name ?? null,
      album_title: e.titre.album_title ?? m.album_title ?? null,
      cover_path: e.titre.cover_url ?? null,
      duration_ms: e.titre.duration_ms ?? m.duration_ms ?? undefined,
    } as Track;
  }
  return null;
}

/** Le corps de `POST /zones/{id}/queue/add` pour UN morceau ; `position` = « Lire ensuite ». */
export function corpsDeFileMorceau(m: MorceauCercle, e: EtatResolution | null, position?: number): AddToQueueRequest | null {
  const p = pisteEnfilable(m, e);
  return p ? corpsDeFile(p, position) : null;
}

/**
 * Ce que le repère « en cours » compare (`etatDeLaLigne`) : la piste de ma
 * bibliothèque, ou la paire de mon service. `null` : rien à comparer.
 */
export function designationEnLecture(e: EtatResolution | null): { id?: number; source?: any; source_id?: string } | null {
  if (e?.etat === 'bibliotheque' && e.piste) return { id: e.piste.track_id };
  if (e?.etat === 'service' && e.titre) return { id: null as any, source: e.service, source_id: e.titre.source_id };
  return null;
}

/** Les morceaux jouables chez moi, dans l'ordre : la base de « Aléatoire ». */
export function idsJouables(items: readonly MorceauCercle[], r: Resolutions): IdOpaque[] {
  return items.filter((m) => jouable(resolutionDe(m, r))).map((m) => m.item_id);
}

// ─── Les membres ─────────────────────────────────────────────────────────────

/**
 * Les personnes qu'on peut nommer sur cette playlist, sans doublon : les
 * membres que l'écran parent connaît (le propriétaire, et pour MES cercles
 * leurs membres) puis les contributeurs nommés par le cloud. Jamais « moi »,
 * jamais un membre anonymisé.
 */
export function personnes(connus: readonly string[], items: readonly MorceauCercle[]): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  const ajouter = (n: string | null | undefined) => {
    const nom = (n ?? '').trim();
    if (!nom || vus.has(nom.toLocaleLowerCase())) return;
    vus.add(nom.toLocaleLowerCase());
    sortie.push(nom);
  };
  for (const n of connus) ajouter(n);
  for (const m of items) if (!m.mine && m.added_by) ajouter(m.added_by.nom);
  return sortie;
}

/** L'initiale d'un nom, pour l'avatar (graphèmes : « Élise » → « É »). */
export function initiale(nom: string): string {
  const c = [...nom.trim()][0] ?? '?';
  return c.toLocaleUpperCase();
}
