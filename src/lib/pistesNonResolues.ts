/**
 * Les pistes de service que le serveur n'a pas su résoudre à l'ajout — #1086.
 *
 * Le fait : on ajoute à la file une piste d'un service qui ne répond plus (ou
 * dont le compte s'est déconnecté). Le serveur l'enfile QUAND MÊME, sous
 * « Unknown », et rend un 200. L'utilisateur voyait donc une piste « Unknown »
 * apparaître dans sa file, sans le moindre mot sur ce qui s'était passé.
 *
 * Depuis tune-server-rust#4261 (livré en v0.9.155), la réponse de `queue_add`
 * porte un champ ADDITIF :
 *
 * ```json
 * "unresolved": [{ "source": "qobuz", "source_id": "123", "error": "…" }]
 * ```
 *
 * absent ou vide quand tout est résolu.
 *
 * 🔴 Ce n'est PAS un échec : l'ajout a bien eu lieu. D'où un avertissement, et
 * non une erreur — et surtout aucun `throw`, qui ferait reculer des appelants
 * (trente et quelques) dont aucun n'a de raison de traiter l'ajout comme raté.
 *
 * Ce module ne fait que du texte : il est pur, donc mesurable sans monter
 * d'écran, et `api.addToQueue` s'en sert pour poser un seul avertissement.
 */

export interface PisteNonResolue {
  source?: string | null;
  source_id?: string | null;
  error?: string | null;
}

export interface ResumeNonResolues {
  /** Combien de pistes n'ont pas été résolues. */
  nombre: number;
  /** Les services concernés, dédoublonnés, dans l'ordre d'apparition. */
  services: string[];
  /** Les motifs distincts rendus par le serveur, dans l'ordre d'apparition. */
  motifs: string[];
}

/** `null` quand il n'y a rien à dire — champ absent, vide, ou pas un tableau. */
export function resumerNonResolues(liste: unknown): ResumeNonResolues | null {
  if (!Array.isArray(liste) || !liste.length) return null;
  const services: string[] = [];
  const motifs: string[] = [];
  let nombre = 0;
  for (const brut of liste) {
    if (!brut || typeof brut !== 'object') continue;
    nombre++;
    const p = brut as PisteNonResolue;
    const s = (p.source ?? '').trim();
    if (s && !services.includes(s)) services.push(s);
    const m = (p.error ?? '').trim();
    if (m && !motifs.includes(m)) motifs.push(m);
  }
  return nombre ? { nombre, services, motifs } : null;
}

/** Le service à nommer dans la phrase. Plusieurs : on les joint ; aucun : on
 *  laisse la phrase générique plutôt que d'écrire « undefined ». */
export function nommerLesServices(services: string[], inconnu: string): string {
  if (!services.length) return inconnu;
  return services.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
}

/**
 * La phrase complète, motif compris.
 *
 * `traduire` reçoit la clé et rend le gabarit — on ne dépend donc pas du
 * magasin `t` ici, et la fonction reste mesurable.
 */
export function texteNonResolues(
  liste: unknown,
  traduire: (cle: string) => string,
): string | null {
  const r = resumerNonResolues(liste);
  if (!r) return null;
  const phrase = traduire('queue.unresolvedWarning')
    .replace('{count}', String(r.nombre))
    .replace('{service}', nommerLesServices(r.services, traduire('queue.unresolvedUnknownService')));
  // Le motif du serveur en détail, quand il y en a un — c'est lui qui dit si
  // c'est une déconnexion, un quota ou un identifiant mort.
  return r.motifs.length ? `${phrase} — ${r.motifs.join(' · ')}` : phrase;
}
