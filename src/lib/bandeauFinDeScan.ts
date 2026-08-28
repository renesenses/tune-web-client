/**
 * Le compte de pistes supprimées annoncé par le bandeau de fin de scan
 * (renesenses/tune-server-rust#2146).
 *
 * Le bandeau annonçait « 0 supprimés » **quoi que la purge ait fait**. Le
 * client lit `d.removed` dans la charge utile de `library.scan.completed` ;
 * le serveur n'a jamais envoyé cette clé — ni sous ce nom, ni sous un autre.
 * `String(d.removed ?? 0)` transformait donc une information *absente* en un
 * chiffre *affirmé*, et ce chiffre était toujours le même.
 *
 * Ce que ça coûtait : un utilisateur dont la purge a retiré 3 000 pistes, un
 * autre dont elle a été refusée par le plafond volumétrique, et un troisième
 * qui n'avait rien à supprimer lisaient **exactement le même bandeau**. Le
 * chiffre affiché ne pouvait ni confirmer ni infirmer ce qu'ils observaient.
 *
 * Le serveur publie désormais `removed` dans les quatre constructions de son
 * rapport de fin de scan. Mais un client récent parle aussi à des serveurs
 * plus anciens, qui ne l'enverront jamais : c'est le cas que ce module traite
 * en propre.
 *
 * La règle : **on n'annonce un chiffre que si le serveur en a donné un.**
 * Quand la clé est absente, le bandeau se tait sur la purge — il n'annonce pas
 * zéro. Un zéro affirmé et un silence ne disent pas la même chose, et c'est
 * précisément la confusion qui a fait perdre du temps sur le fil 1512.
 */

/**
 * Le compte de suppressions publié par le serveur, ou `null` s'il n'en publie
 * pas.
 *
 * Seul un nombre fini convient. `null`, `undefined`, une chaîne, un `NaN` — ce
 * que rend un serveur d'une autre version, ou une charge utile tronquée — sont
 * tous traités comme « le serveur ne dit rien », jamais comme zéro.
 *
 * Un compte négatif n'a pas de sens pour un nombre de pistes retirées : il
 * trahit une charge utile corrompue, et se tait plutôt que de s'afficher.
 */
export function compteSupprimees(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const brut = (data as Record<string, unknown>).removed;
  if (typeof brut !== 'number' || !Number.isFinite(brut) || brut < 0) return null;
  return brut;
}

/**
 * La clé de libellé à employer pour le bandeau de fin de scan.
 *
 * Deux libellés, parce qu'une phrase à trou ne peut pas se taire : le
 * placeholder `{removed}` doit être remplacé par *quelque chose*. Plutôt que
 * d'y écrire « 0 » ou « ? », on emploie une phrase qui ne comporte pas le
 * segment du tout.
 */
export function cleLibelleFinDeScan(supprimees: number | null): string {
  return supprimees === null ? 'settings.scanCompletedNoRemoved' : 'settings.scanCompleted';
}
