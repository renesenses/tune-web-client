// Le catalogue de la carte des podcasts (web#2450, tune-server-rust#7194).
//
// Le serveur réunit les palmarès Apple de plusieurs boutiques et la sélection
// éditoriale de Tune, sans doublon, avec le rang de chaque émission par pays
// et un indicateur explicite « lisible » (Tune connaît son flux). Le client ne
// parle jamais à Apple : il lit cette route.
//
// Route serveur : `GET /api/v1/podcasts/catalogue` (`routes/podcasts.rs`).
// Importé via la barrel `lib/api`.
import { BASE, fetchJSON } from './_client';

/** Une émission de la carte, telle que la rend `GET /podcasts/catalogue`. */
export interface EmissionCatalogue {
  /** `apple-…` (palmarès) ou `rf-…` (sélection). */
  source_id: string;
  name: string;
  artist: string;
  cover_url: string;
  /** Vide quand aucun flux public n'est connu. */
  feed_url: string;
  /** Tune peut ouvrir et lire cette émission. */
  readable: boolean;
  /** La catégorie principale, nommée par Apple (« News »…). */
  category?: string | null;
  /** L'identifiant de genre Apple de cette catégorie (1311…). */
  category_id?: number | null;
  /** Pays du meilleur rang, en minuscules. */
  country: string;
  /** Rang par pays (1 = premier). */
  charts: Record<string, number>;
  curated: boolean;
}

export interface CataloguePodcasts {
  countries: string[];
  /** Pays encore en cours de lecture côté serveur : un nouvel appel les aura. */
  pending_countries: string[];
  failed_countries: string[];
  complete: boolean;
  count: number;
  items: EmissionCatalogue[];
}

/** `GET /podcasts/catalogue` — les dix-huit boutiques par défaut. */
export function getCataloguePodcasts(pays?: readonly string[]) {
  const qs = pays?.length ? `?countries=${encodeURIComponent(pays.join(','))}` : '';
  return fetchJSON<CataloguePodcasts>(`${BASE}/podcasts/catalogue${qs}`);
}
