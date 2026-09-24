import { writable, derived, get } from 'svelte/store';

/**
 * L'avancement d'une analyse de bibliothèque — #1518 — et sa CIBLE — #1517.
 *
 * ## #1518 : le serveur comptait, le client ne regardait pas
 *
 * `SettingsV2` sondait `GET /system/scan/status` toutes les 2,5 s et n'en
 * gardait qu'un booléen, `scanning`. Cette route ne porte **que** ce booléen :
 * en la sondant, aucun chiffre ne peut apparaître, jamais — le badge « Analyse
 * en cours » restait donc muet des heures sur un NAS, indiscernable d'un
 * blocage.
 *
 * Le serveur, lui, émet `library.scan.progress` depuis le tout début du scan
 * (`tune-server/src/routes/system/scan.rs`), avec `phase`, `scanned`, `total`,
 * `inserted`, `updated`, `skipped`, et `current_dir` pendant l'indexation. Tout
 * le client n'avait qu'UN seul abonné : l'assistant de première installation
 * (`OnboardingWizard.svelte`). L'ancien écran `SettingsView` l'affichait ; le
 * nouveau l'avait perdu en route.
 *
 * On s'abonne donc à l'événement, et l'avancement vit ici : un seul état,
 * partagé par les Réglages et par la carte « Analyse » de Tune Health — qui
 * portait `sansJauge: true` avec un commentaire affirmant que le serveur ne
 * donne pas de pourcentage. C'est faux dès que la phase « files » commence.
 *
 * ## Les phases, et pourquoi le total peut valoir zéro
 *
 * Pendant `indexing` le serveur parcourt les dossiers : il sait combien de
 * fichiers il a VUS, pas combien il en reste — il envoie donc `total: 0`. Un
 * pourcentage n'existe pas encore : on montre le compte brut, qui bouge, ce
 * qui suffit à distinguer « ça travaille » de « c'est bloqué ». Le pourcentage
 * n'apparaît qu'avec un `total` réel.
 */
export interface AvancementAnalyse {
  /** `indexing` | `files` | `prune` | `artwork` — tel que le serveur le nomme. */
  phase: string | null;
  /** Fichiers vus (indexing) ou traités (files). */
  scanned: number;
  /** Total connu, ou 0 tant que le parcours des dossiers n'est pas fini. */
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  /** Dossier en cours de parcours, pendant l'indexation. */
  dossier: string | null;
  /** Le dossier ciblé par l'analyse, quand elle n'a pas porté sur tout (#1517). */
  cible: string | null;
}

const VIDE: AvancementAnalyse = {
  phase: null, scanned: 0, total: 0, inserted: 0, updated: 0, skipped: 0,
  dossier: null, cible: null,
};

export const avancementAnalyse = writable<AvancementAnalyse | null>(null);

const entier = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
};
const texte = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

/**
 * Fusionner un événement `library.scan.progress` dans l'état courant.
 *
 * FUSION et non remplacement : le serveur n'envoie pas tous les champs à
 * chaque phase (`prune` ne porte que `pruned`, `artwork` que le nombre de
 * pochettes). Un remplacement ramènerait les compteurs à zéro en fin de scan,
 * c'est-à-dire précisément quand ils valent enfin quelque chose.
 */
export function fusionnerAvancement(
  precedent: AvancementAnalyse | null,
  data: Record<string, unknown> | null | undefined,
): AvancementAnalyse {
  const base = precedent ?? VIDE;
  const d = data ?? {};
  const garder = (cle: string, avant: number) => entier(d[cle]) ?? avant;
  return {
    phase: texte(d.phase) ?? base.phase,
    scanned: garder('scanned', base.scanned),
    total: garder('total', base.total),
    inserted: garder('inserted', base.inserted),
    updated: garder('updated', base.updated),
    skipped: garder('skipped', base.skipped),
    dossier: texte(d.current_dir) ?? base.dossier,
    cible: base.cible,
  };
}

/**
 * Le pourcentage, ou `null` quand il n'en existe pas encore.
 *
 * `null` n'est PAS zéro : une jauge à 0 % affirme « rien n'est fait », alors
 * que pendant l'indexation le serveur travaille sans pouvoir dire combien il
 * reste. Un appelant qui reçoit `null` montre le compte brut, pas une barre.
 */
export function pourcentAnalyse(a: AvancementAnalyse | null): number | null {
  if (!a || a.total <= 0) return null;
  const p = Math.floor((a.scanned / a.total) * 100);
  return Math.max(0, Math.min(100, p));
}

/** Y a-t-il un chiffre à montrer ? Un état tout à zéro n'apprend rien. */
export function aDesChiffres(a: AvancementAnalyse | null): boolean {
  return !!a && (a.scanned > 0 || a.total > 0 || a.inserted > 0 || a.updated > 0);
}

export const pourcentCourant = derived(avancementAnalyse, pourcentAnalyse);

/** Repartir de zéro, en gardant la cible : un nouveau scan, pas une remise à plat. */
export function demarrerAvancement(cible: string | null = null) {
  avancementAnalyse.set({ ...VIDE, cible });
}

export function terminerAvancement() {
  avancementAnalyse.set(null);
}

/**
 * Brancher l'avancement sur le flux d'événements.
 *
 * Rend la fonction de désabonnement, comme `tuneWS.onEvent`.
 */
export function abonnerAvancementAnalyse(
  onEvent: (h: (e: { type?: string; data?: any }) => void) => () => void,
): () => void {
  return onEvent((event) => {
    if (event?.type === 'library.scan.progress') {
      avancementAnalyse.update((a) => fusionnerAvancement(a, event.data));
      return;
    }
    if (event?.type === 'library.scan.completed') terminerAvancement();
  });
}

/**
 * Lancer une analyse — de TOUTE la bibliothèque, ou d'un seul dossier (#1517).
 *
 * ## Ce que #1517 corrige
 *
 * Dans les Réglages v2, chaque dossier de musique n'offrait qu'une croix
 * « Retirer ». La carte d'analyse, elle, n'offrait que « Analyse rapide » et
 * « Analyse complète », toutes deux sur `api.triggerScan(undefined, full)` :
 * la bibliothèque ENTIÈRE, à chaque fois. Pour trois morceaux ajoutés dans un
 * dossier d'un NAS, cela veut dire re-parcourir tout le partage réseau — des
 * minutes à des heures, un aller-retour SMB par fichier.
 *
 * Le serveur accepte pourtant `?path=` depuis longtemps
 * (`ScanQuery::path`, « Targeted scan: … only this sub-directory is walked »),
 * et la purge des pistes disparues y est limitée au sous-arbre visé. Le seul
 * geste ciblé qui restait dans le client vit dans `BrowseView`, classée
 * **Avancé** : invisible au niveau Essentiel, là où sont justement listés les
 * dossiers.
 *
 * `declencher` est injecté pour que le geste se teste sans rendu : on vérifie
 * que le chemin du dossier part VRAIMENT, et qu'il ne part PAS pour une
 * analyse globale.
 */
export async function lancerAnalyse(
  declencher: (path?: string, full?: boolean) => Promise<unknown>,
  options: { chemin?: string | null; complete?: boolean } = {},
): Promise<{ ok: boolean; cible: string | null }> {
  const cible = texte(options.chemin);
  const complete = !!options.complete;
  try {
    await declencher(cible ?? undefined, complete);
  } catch {
    return { ok: false, cible };
  }
  demarrerAvancement(cible);
  return { ok: true, cible };
}

/** Pour les tests : l'état courant sans passer par un abonnement. */
export const lireAvancement = () => get(avancementAnalyse);
