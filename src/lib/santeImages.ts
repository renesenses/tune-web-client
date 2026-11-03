/**
 * Écran « État du serveur » (Bertrand, 01/11/2026) — les cartes des LOGOS DE
 * LABELS et des POCHETTES D'ALBUMS : combien ont une image sur le total,
 * combien manquent, la passe en cours et son avancement, la dernière passe et
 * son bilan.
 *
 * Contrat serveur (tune-server-rust, lot rc10) :
 *  - `GET /library/artwork/enrich/status` : `albums_total`,
 *    `albums_with_cover`, `albums_without_cover`, `running`, `progress`
 *    (`processed`, `total`, seulement pendant la passe), `result` (bilan :
 *    `total`, `enriched`, `status`, `finished_at`) ;
 *  - `GET /library/labels/logos/status` : `labels_total`, `with_logo`,
 *    `without_logo`, `running`, `progress`, `last_run` (`to_process`,
 *    `processed`, `found`, `finished_at`).
 *
 * La lecture vit ici, hors du composant, pour s'éprouver sans le monter. La
 * règle de l'écran s'y applique : un serveur qui ne publie pas un compte ne
 * reçoit pas de chiffre inventé.
 */

export interface Avancement {
  processed?: number;
  total?: number;
}

export interface StatutPochettesAlbums {
  albums_without_cover?: number;
  albums_total?: number;
  albums_with_cover?: number;
  running?: boolean;
  progress?: Avancement | null;
  result?: {
    status?: string;
    total?: number;
    enriched?: number;
    searched?: number;
    failed?: number;
    started_at?: number;
    finished_at?: number;
  } | null;
}

export interface StatutLogosLabels {
  labels_total?: number;
  with_logo?: number;
  without_logo?: number;
  running?: boolean;
  progress?: Avancement | null;
  last_run?: {
    started_at?: number;
    finished_at?: number;
    to_process?: number;
    processed?: number;
    found?: number;
    labels_total?: number;
    with_logo?: number;
  } | null;
}

export type EtatCarteImages = 'inconnu' | 'idle' | 'running' | 'done';

export interface CarteImages {
  etat: EtatCarteImages;
  ligne: string;
  fait?: number;
  total?: number;
  detail?: string;
  sansJauge?: boolean;
}

export interface OutilsCarte {
  t: (cle: string) => string;
  nombre: (n: number) => string;
  /** Une date lisible depuis des secondes Unix. */
  date: (secondes: number) => string;
}

const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** La ligne « passe en cours », avec son avancement s'il est connu. */
function ligneEnCours(p: Avancement | null | undefined, o: OutilsCarte): string {
  if (p && estNombre(p.total) && p.total > 0 && estNombre(p.processed)) {
    return o.t('v2.health.imagesPassRunning')
      .replace('{n}', o.nombre(Math.min(p.processed, p.total)))
      .replace('{t}', o.nombre(p.total));
  }
  return o.t('v2.health.imagesPassStarting');
}

/** Le remplissage de la jauge : la passe pendant qu'elle tourne, la
 *  couverture (avec image / total) au repos. */
function jauge(
  enCours: boolean,
  p: Avancement | null | undefined,
  avec: number | undefined,
  total: number | undefined,
): { fait?: number; total?: number } {
  if (enCours) {
    return p && estNombre(p.total) && p.total > 0 && estNombre(p.processed)
      ? { fait: Math.min(p.processed, p.total), total: p.total }
      : {};
  }
  return estNombre(avec) && estNombre(total) && total > 0 ? { fait: avec, total } : {};
}

/** La carte des pochettes d'albums. `null` : route illisible (carte « inconnu »). */
export function cartePochettesAlbums(s: StatutPochettesAlbums | null, o: OutilsCarte): CarteImages {
  if (!s) return { etat: 'inconnu', ligne: o.t('v2.health.unavailable'), sansJauge: true };
  const total = s.albums_total;
  const sans = s.albums_without_cover;
  const avec = estNombre(s.albums_with_cover)
    ? s.albums_with_cover
    : estNombre(total) && estNombre(sans) ? Math.max(0, total - sans) : undefined;
  // Un serveur d'avant le 01/11/2026 n'a ni `running` ni les comptes : on
  // ne dit que ce qu'il sait (le nombre sans pochette).
  const enCours = s.running === true;
  const r = s.result ?? null;
  const ligne = estNombre(total) && estNombre(avec)
    ? o.t('v2.health.albumCoversLine')
      .replace('{a}', o.nombre(avec))
      .replace('{t}', o.nombre(total))
      .replace('{m}', o.nombre(Math.max(0, total - avec)))
    : estNombre(sans)
      ? o.t('v2.health.albumCoversMissingOnly').replace('{m}', o.nombre(sans))
      : o.t('v2.health.unavailable');
  let detail: string;
  if (enCours) {
    detail = ligneEnCours(s.progress, o);
  } else if (r && estNombre(r.total) && r.status !== 'running') {
    const trouve = r.enriched ?? 0;
    detail = (estNombre(r.finished_at)
      ? o.t('v2.health.albumCoversLast').replace('{d}', o.date(r.finished_at))
      : o.t('v2.health.albumCoversLastNoDate'))
      .replace('{f}', o.nombre(trouve))
      .replace('{t}', o.nombre(r.total));
  } else {
    detail = o.t('v2.health.coversNone');
  }
  const j = jauge(enCours, s.progress, avec, total);
  return {
    etat: enCours ? 'running' : r && r.status !== 'running' ? 'done' : 'idle',
    ligne,
    ...j,
    detail,
    sansJauge: j.total === undefined,
  };
}

/** La carte des logos de labels. `null` : route absente ou illisible. */
export function carteLogosLabels(s: StatutLogosLabels | null, o: OutilsCarte): CarteImages {
  if (!s || !estNombre(s.labels_total) || !estNombre(s.with_logo)) {
    return { etat: 'inconnu', ligne: o.t('v2.health.unavailable'), sansJauge: true };
  }
  const total = s.labels_total;
  const avec = s.with_logo;
  const sans = estNombre(s.without_logo) ? s.without_logo : Math.max(0, total - avec);
  const enCours = s.running === true;
  const r = s.last_run ?? null;
  let detail: string;
  if (enCours) {
    detail = ligneEnCours(s.progress, o);
  } else if (r && estNombre(r.to_process)) {
    detail = (estNombre(r.finished_at)
      ? o.t('v2.health.labelLogosLast').replace('{d}', o.date(r.finished_at))
      : o.t('v2.health.labelLogosLastNoDate'))
      .replace('{f}', o.nombre(r.found ?? 0))
      .replace('{t}', o.nombre(r.to_process));
  } else {
    detail = o.t('v2.health.coversNone');
  }
  const j = jauge(enCours, s.progress, avec, total);
  return {
    etat: enCours ? 'running' : r ? 'done' : 'idle',
    ligne: o.t('v2.health.labelLogosLine')
      .replace('{a}', o.nombre(avec))
      .replace('{t}', o.nombre(total))
      .replace('{m}', o.nombre(sans)),
    ...j,
    detail,
    sansJauge: j.total === undefined,
  };
}

/** Les cartes dont le bouton « Lancer la passe » reste affiché pendant la
 *  passe, DÉSACTIVÉ : on voit qu'on ne peut pas relancer, et pourquoi. */
export const CARTES_IMAGES = ['albumCovers', 'labelLogos'] as const;
export type CarteImagesId = (typeof CARTES_IMAGES)[number];

export function estCarteImages(id: string): id is CarteImagesId {
  return (CARTES_IMAGES as readonly string[]).includes(id);
}

/** Le bouton est-il cliquable ? Jamais pendant une passe ni sur une carte
 *  dont l'état est inconnu (route absente : un bouton qui ne ferait rien). */
export function boutonPasseActif(c: { etat: string }, lancementEnVol: boolean): boolean {
  return !lancementEnVol && (c.etat === 'idle' || c.etat === 'done');
}
