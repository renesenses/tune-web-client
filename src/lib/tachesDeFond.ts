/**
 * Tâches de fond du serveur — lecture de l'événement `system.background_tasks`.
 *
 * #2227 — Jean Valjean : « il s'affiche bien en haut de la page avec sa
 * progression mais à la fin, la fenêtre se ferme ».
 *
 * Le serveur publie son avancement, et il le publie bien :
 * `tune-server/src/routes/library/artwork.rs:407-427` recopie toutes les 3 s le
 * réglage `artist_artwork_enrich_result` (écrit par les phases de
 * `tune-core/src/metadata/matcher.rs` et `tune-core/src/library/artwork.rs`)
 * dans le registre `BackgroundTasks`, qui émet `system.background_tasks` à
 * chaque changement — y compris à la toute fin, quand le `TaskGuard` tombe et
 * retire la tâche.
 *
 * Côté client, le bandeau qui lisait cet événement ET le bilan de fin ont été
 * emportés par la fusion `f14553f6` (« Merge branch 'prep/v0.9.0-ui' into
 * web-main-090 », 23/07/2026) — la même qui avait perdu les correctifs de
 * défilement restaurés ensuite par `c2b8b392`. Celui-ci ne l'a jamais été.
 *
 * La logique vit ici, hors du composant, pour être jouable par un test.
 */

/** Avancement fin publié par le serveur, quand la tâche en rend compte. */
export type ProgressionTache = {
  processed: number;
  total: number;
  /** Sous-phase : `MusicBrainz`, `Images`… */
  detail: string;
};

/** Une tâche de fond telle que le serveur la sérialise. */
export type TacheDeFond = {
  id: string;
  label: string;
  kind: string;
  progress?: ProgressionTache;
};

/** Identifiant de la tâche d'enrichissement des images d'artistes, tel que le
 *  serveur l'enregistre (`background_tasks.begin("artist_artwork", …)`). */
export const TACHE_IMAGES_ARTISTES = 'artist_artwork';

/**
 * Texte du bandeau « une tâche de fond tourne », ou `null` quand plus rien ne
 * tourne — c'est ce `null` qui referme le bandeau.
 *
 * @param secours libellé à afficher si le serveur ne nomme pas la tâche.
 */
export function libelleBanniereEnrichissement(
  taches: TacheDeFond[],
  secours: string,
): string | null {
  const premiere = taches[0];
  if (!premiere) return null;

  const nom = premiere.label || secours;

  // Pas de fraction tant que le total est inconnu : la phase « communauté » de
  // tune-core tourne avant le premier `write_progress`, le registre rend alors
  // 0/0, et afficher « 0/0 » se lit comme un arrêt.
  const p = premiere.progress;
  const avancement = p && p.total > 0 ? ` — ${p.detail} ${p.processed}/${p.total}` : '';

  const surnumeraires = taches.length > 1 ? ` (+${taches.length - 1})` : '';

  return `${nom}${avancement}${surnumeraires}`;
}

/**
 * L'enrichissement des images d'artistes vient-il de se terminer ?
 *
 * Vrai uniquement au front descendant : la tâche était là, elle n'y est plus.
 * C'est l'instant exact que décrit Jean Valjean (« à la fin, la fenêtre se
 * ferme ») — elle doit se fermer sur un bilan, pas sur du vide.
 */
export function enrichissementImagesTermine(
  avant: TacheDeFond[],
  apres: TacheDeFond[],
): boolean {
  const presente = (l: TacheDeFond[]) => l.some((t) => t?.id === TACHE_IMAGES_ARTISTES);
  return presente(avant) && !presente(apres);
}
