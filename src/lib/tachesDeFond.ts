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
/** Identifiant de la passe du type de sortie des albums (album / EP / single),
 *  telle que le serveur l'enregistre (`background_tasks.begin("types_de_sortie", …)`,
 *  `routes/system/enrich.rs`, #4767). Elle ne publie pas d'avancement chiffré. */
export const TACHE_TYPES_DE_SORTIE = 'types_de_sortie';
/** Identifiant de la passe des crédits MusicBrainz par disque, telle que le
 *  serveur l'enregistre (`TACHE_CREDITS_RELEASES`, `metadata/credits_release.rs`,
 *  tune-server-rust#4862). Son avancement chiffré se lit aussi par
 *  `GET /system/enrich-credits`. */
export const TACHE_CREDITS = 'credits_releases';

/**
 * Un traitement de fond SUSPENDABLE, tel que le serveur le publie depuis
 * 0.9.159 (#4574).
 *
 * ⚠️ Ne pas confondre avec [`TacheDeFond`] : celle-ci est une tâche INSCRITE au
 * registre le temps qu'elle vit (elle disparaît quand elle finit), celui-ci est
 * un traitement NOMMÉ qui existe en permanence et porte un état. Les deux
 * arrivent dans la même réponse et ne se recouvrent pas : la cascade
 * ReplayGain, par exemple, n'est jamais dans `tasks`.
 */
export type TraitementSuspendable = {
  /** `replaygain`, `fingerprints`, `dynamic_range`, `acoustic`, `enrichment`,
   *  `artist_images`. */
  id: string;
  /** `en_cours` | `en_pause` | `au_repos`. */
  state: string;
  paused: boolean;
};

/** La réponse de `GET /system/background-tasks`.
 *
 *  Tout sauf `tasks` est FACULTATIF : un serveur antérieur à 0.9.159 n'envoie
 *  que `tasks`, et l'écran doit alors se taire sur la pause plutôt que d'offrir
 *  un bouton qui rendrait 404. */
export type InstantaneTachesDeFond = {
  tasks: TacheDeFond[];
  pausable?: TraitementSuspendable[];
  all_paused?: boolean;
  scan_pausable?: boolean;
};

/**
 * Quels traitements sont suspendus, par identifiant.
 *
 * Écrit ici et non dans le composant pour être jouable sans monter d'écran, et
 * surtout parce que l'ABSENCE de `pausable` doit se lire une seule fois : un
 * serveur qui ne connaît pas la pause rend un dictionnaire vide, et aucune
 * carte ne portera de bouton.
 */
export function pausesParTraitement(
  instantane: InstantaneTachesDeFond | null | undefined,
): Record<string, boolean> {
  const sortie: Record<string, boolean> = {};
  for (const t of instantane?.pausable ?? []) {
    if (t && typeof t.id === 'string') sortie[t.id] = !!t.paused;
  }
  return sortie;
}

/**
 * Le serveur sait-il suspendre ses traitements ?
 *
 * C'est la condition d'affichage des boutons. `pausable` absent OU vide ⇒ non :
 * un tableau vide est ce que rendrait un serveur qui aurait la clé sans aucun
 * traitement, et un bouton sans destinataire ne vaut pas mieux qu'un 404.
 */
export function serveurSaitSuspendre(
  instantane: InstantaneTachesDeFond | null | undefined,
): boolean {
  return (instantane?.pausable?.length ?? 0) > 0;
}

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
