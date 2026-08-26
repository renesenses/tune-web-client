/**
 * La garde du bouton « Piste suivante », en un seul endroit.
 *
 * La barre de transport et le mini-lecteur portaient chacun leur copie de la
 * règle, et elles avaient déjà divergé : le mini-lecteur avait perdu le terme
 * YouTube. Une seule fonction, deux surfaces — le commentaire du mini-lecteur
 * promettait « une seule règle », voici l'endroit où elle vit.
 *
 * La référence n'est pas une intuition d'interface : c'est
 * `PositionPoller::next_position_manual` (`tune-core/src/poller.rs`), l'unique
 * décision « y a-t-il une suite ? » du serveur, partagée par l'enchaînement
 * automatique, le point d'entrée `next` et le préchargement. Le bouton doit
 * être éteint exactement quand elle rendrait `None` — sinon il promet une
 * action qui n'existe pas, et le serveur répond en ARRÊTANT la lecture
 * (`playback.rs` : `stop(...)` puis `reason: "end_of_queue"`).
 * C'est ce qui rend le signalement de FabienM (fil 1535, 0.9.102) plus lourd
 * que sa formulation : un bouton offert coupe le son.
 */
export type EtatSuivant = {
  /** État de lecture de la zone : 'playing' | 'paused' | 'stopped' | … */
  playState: string;
  /** Une piste est chargée dans la zone. */
  aUnePiste: boolean;
  /** Une vidéo YouTube joue dans l'iframe. */
  ytActive: boolean;
  /** Nombre de titres APRÈS le titre courant, en ordre brut de file. */
  upNextCount: number;
  /** Mode de répétition : 'off' | 'all' | 'one'. */
  repeat: string;
  /** Lecture aléatoire active sur la zone. */
  shuffle: boolean;
};

export function suivantDesactive(e: EtatSuivant): boolean {
  // Une vidéo YouTube pilote son propre enchaînement : la file de zone ne la
  // décrit pas, on ne se permet donc rien à sa place.
  if (e.ytActive) return false;

  // Rien de chargé, rien à quitter.
  if (e.playState === 'stopped' && !e.aUnePiste) return true;

  // En répétition, il y a toujours une suite. `all` reboucle au début ; `one`
  // aussi, car un saut MANUEL ignore volontairement repeat-one et le traite
  // comme repeat-all (#1110) — `next_position_manual_repeat_one_wraps_at_end`
  // le fixe côté serveur. Couper le bouton sur `one` contredirait le serveur,
  // qui, lui, enchaîne : c'est le piège annoncé du ticket.
  if (e.repeat !== 'off') return false;

  // Sous aléatoire, le serveur ne suit PAS l'ordre brut de la file : la suite
  // dépend de `shuffle_index + 1 < shuffle_order.len()`, une permutation dont
  // le client ne sait rien — `zones.rs` n'expose que `shuffle` et `repeat`.
  // `upNextCount`, qui compte en ordre brut, ne veut alors rien dire : la piste
  // rangée en dernier dans la file tombe au milieu du tirage, et le bouton
  // s'éteignait alors qu'il restait des titres à jouer. Faute de connaître la
  // permutation, on ne coupe pas un bouton qui marche : la fin de cycle reste
  // traitée par le serveur, comme avant.
  if (e.shuffle) return false;

  // Ordre brut, répétition éteinte : la file dit tout.
  return e.upNextCount === 0;
}
