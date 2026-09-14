/**
 * Faut-il proposer l'assistant de première installation ?
 *
 * ## Pourquoi cette règle vit ici, et pas dans un écran
 *
 * Elle a vécu dans `App.svelte` tant que l'interface actuelle était la seule
 * porte d'entrée. La future v1 en a besoin du même coup : une installation
 * neuve qui monte `ShellV2` doit voir l'assistant, pas une interface vide
 * qu'elle ne saura pas remplir.
 *
 * La recopier dans les deux coquilles, c'est se garantir qu'elles divergeront.
 * Elle est donc ici, et les deux l'appellent.
 *
 * ## Pourquoi elle est ASYNCHRONE, et pourquoi ce n'est pas un problème
 *
 * Trois des quatre niveaux interrogent le serveur. On ne peut donc pas décider
 * avant de monter quoi que ce soit — mais on n'en a pas besoin : l'assistant
 * se pose en SURCOUCHE une fois la réponse revenue, exactement comme l'écran
 * de reconnexion. La coquille monte d'abord, l'assistant s'invite ensuite.
 *
 * 🔴 Ne jamais remplacer ces appels par le seul test synchrone
 * `localStorage.getItem('tune_onboarding_completed')` pour décider AVANT le
 * montage. Ce drapeau est propre à l'APPAREIL : il est absent d'un téléphone
 * qui ouvre Tune pour la première fois, alors que le serveur est configuré
 * depuis des mois. On enverrait l'assistant à des gens qui n'ont rien à y
 * faire — un défaut rare échangé contre un défaut fréquent.
 */

const CLE_LOCALE = 'tune_onboarding_completed';

/** Ce que la règle a besoin de savoir, pour être éprouvable sans serveur. */
export interface SourcesOnboarding {
  /** Le drapeau rangé sur cet appareil, ou `null`. */
  drapeauLocal(): string | null;
  /** Le drapeau du serveur, dans la configuration générale. */
  config(): Promise<{ onboarding_complete?: unknown; onboarding_completed?: unknown } | null>;
  /** L'état dédié, quand le serveur l'expose. */
  statut(): Promise<{ complete?: boolean } | null>;
  /** Dernier recours : une bibliothèque vide trahit une installation neuve. */
  pistes(): Promise<number>;
  /** Mémoriser que c'est fait, pour ne plus rien demander à cet appareil. */
  memoriser(): void;
}

/** Le serveur répond « c'est fait » de quatre façons ; on les accepte toutes. */
function ditQueCestFait(valeur: unknown): boolean {
  return valeur === true || valeur === 'true';
}

/**
 * `true` s'il faut proposer l'assistant.
 *
 * Les quatre niveaux, dans l'ordre, du moins cher au plus cher :
 *
 * 1. l'appareil se souvient que c'est fait → non ;
 * 2. la configuration du serveur le dit → non, et on le mémorise ;
 * 3. l'état dédié dit que ce n'est pas complet → oui ;
 * 4. la bibliothèque est vide → oui.
 *
 * Une panne à n'importe quel étage rend `false` : devant l'incertitude on ne
 * met pas un assistant de première installation sous le nez de quelqu'un qui
 * écoute de la musique depuis un an.
 */
export async function onboardingRequis(s: SourcesOnboarding): Promise<boolean> {
  if (s.drapeauLocal()) return false;
  try {
    const config = await s.config().catch(() => null);
    if (config && (ditQueCestFait(config.onboarding_complete) || ditQueCestFait(config.onboarding_completed))) {
      s.memoriser();
      return false;
    }
    const statut = await s.statut().catch(() => null);
    if (statut && statut.complete === false) return true;
    return (await s.pistes()) === 0;
  } catch {
    return false;
  }
}

/** Les sources réelles : le navigateur et l'API. */
export function sourcesReelles(api: {
  getConfig(): Promise<Record<string, unknown>>;
  getOnboardingStatus(): Promise<{ complete?: boolean }>;
  getLibraryStats(): Promise<{ tracks: number }>;
}): SourcesOnboarding {
  return {
    drapeauLocal: () => {
      try { return localStorage.getItem(CLE_LOCALE); } catch { return null; }
    },
    config: () => api.getConfig(),
    statut: () => api.getOnboardingStatus(),
    pistes: async () => (await api.getLibraryStats()).tracks,
    memoriser: () => {
      try { localStorage.setItem(CLE_LOCALE, 'true'); } catch { /* stockage refusé */ }
    },
  };
}
