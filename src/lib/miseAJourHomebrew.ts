/**
 * Ce que l'écran fait du refus — et de la mise à jour — Homebrew.
 *
 * ## Pourquoi ce module existe
 *
 * Le serveur ne rend PAS une phrase à afficher : il rend un motif de machine
 * (`reason`), la commande exacte (`command`), les deux versions en présence, et
 * s'il peut conduire la mise à jour lui-même. C'est délibéré et c'est le bon
 * partage : le serveur ne connaît que dix langues (`tune_server::i18n::
 * SUPPORTED`), l'écran en connaît onze — le hongrois n'existe que de ce
 * côté-ci —, et la charge de refus est de surcroît recopiée telle quelle dans
 * le réglage `last_update_result`, où une phrase traduite se figerait dans la
 * langue du jour de l'écriture et resterait fausse après un changement de
 * langue. La phrase se rend donc ici, dans la langue de l'écran, à partir de
 * `reason` et de `command`.
 *
 * ## Pourquoi il est PARTAGÉ
 *
 * `updateRefusalMessage` (v1) et `updMotifRefus` (v2) sont déjà deux copies mot
 * pour mot de la même fonction. En écrire une troisième garantissait qu'une des
 * trois diverge. Les deux interfaces appellent celle-ci.
 *
 * Vécu : Yves Corbat, macOS, installation Homebrew — « la mise à jour via
 * l'interface ne marche pas ». Le serveur refusait correctement depuis la
 * v0.9.114 (#2448), mais en 200, et les deux interfaces ne testaient que
 * `res.ok` : le bouton affichait « Installation… » pendant trois minutes puis
 * revenait sans un mot. Le même testeur avait déjà tourné avec un serveur
 * 0.9.110 piloté par une interface 0.9.71, trente-neuf versions d'écart, sans
 * le moindre avertissement — c'est ce que `divergence` rend enfin visible.
 */

/** Repli si le serveur ne nomme pas la commande (vieux serveur). */
export const COMMANDE_HOMEBREW = 'brew update && brew upgrade tune-server';

export type RefusHomebrew = {
  /** La commande à taper, telle que le serveur l'a donnée. */
  commande: string;
  /** Le binaire qui tourne et le keg posé par Homebrew divergent. */
  divergence: boolean;
  /** Version posée par Homebrew (le Cellar). */
  versionCellar: string;
  /** Version du binaire réellement en cours d'exécution. */
  versionBinaire: string;
  /**
   * Tune peut-il conduire `brew upgrade` lui-même sur cette machine ?
   *
   * Déduit du MOTIF, jamais d'un drapeau : le serveur n'émet un refus QUE
   * lorsque la mise à jour en place est barrée — quand elle est possible, la
   * route lance le travail et rend 202. Un booléen dédié aurait donc valu
   * `false` dans tous les refus réellement émis, et un champ constant qu'on lit
   * a l'air de dire quelque chose.
   */
  peutSeMettreAJourSeul: boolean;
  /** Motif de machine quand il ne le peut pas (`homebrew_brew_missing`…). */
  motifBlocage: string;
  /** Ce qui manque, en clair, avec le chemin mesuré. */
  detailBlocage: string;
  /** Message d'échec, quand une mise à jour lancée s'est arrêtée en route. */
  echec?: string;
};

function texte(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Le corps rendu par `POST /system/update/install` décrit-il un refus
 * Homebrew ? On s'appuie sur `reason`, pas sur le texte du message : le texte
 * est anglais, il change, et le tester reviendrait à figer une phrase.
 */
export function refusHomebrew(res: unknown): RefusHomebrew | null {
  if (!res || typeof res !== 'object') return null;
  const r = res as Record<string, unknown>;
  if (r.reason !== 'homebrew_managed_installation') return null;
  return {
    commande: texte(r.command) || COMMANDE_HOMEBREW,
    divergence: r.installation_version_mismatch === true,
    versionCellar: texte(r.installation_version),
    versionBinaire: texte(r.current_version),
    peutSeMettreAJourSeul: !texte(r.upgrade_in_place_blocked_reason),
    motifBlocage: texte(r.upgrade_in_place_blocked_reason),
    detailBlocage: texte(r.upgrade_in_place_detail),
  };
}

/**
 * L'AUTRE charge Homebrew : celle que le serveur écrit au démarrage dans
 * `last_update_result` quand il constate que le binaire en cours d'exécution et
 * le keg posé par Homebrew ne viennent pas de la même version
 * (`reason: "homebrew_version_mismatch"`).
 *
 * C'est le symptôme le plus coûteux du lot, et le plus silencieux : Yves a
 * tourné avec un serveur 0.9.110 piloté par une interface 0.9.71. La divergence
 * est donc vraie par construction dans ce cas — c'est la définition même de ce
 * motif — et rien ne dit ici si Tune peut se mettre à jour seul, ce qui ne se
 * mesure qu'au moment de la tentative.
 */
export function divergenceHomebrew(res: unknown): RefusHomebrew | null {
  if (!res || typeof res !== 'object') return null;
  const r = res as Record<string, unknown>;
  if (r.reason !== 'homebrew_version_mismatch') return null;
  return {
    commande: texte(r.command) || COMMANDE_HOMEBREW,
    divergence: true,
    versionCellar: texte(r.installation_version),
    versionBinaire: texte(r.current_version),
    peutSeMettreAJourSeul: true,
    motifBlocage: '',
    detailBlocage: '',
  };
}

/**
 * Le serveur a-t-il ACCEPTÉ de conduire `brew update && brew upgrade` ?
 * Il rend alors 202 et le travail se poursuit hors du processus.
 */
export function majHomebrewLancee(res: unknown): boolean {
  return (
    !!res &&
    typeof res === 'object' &&
    (res as Record<string, unknown>).status === 'homebrew_upgrade_started'
  );
}

/** Clés d'étape, dans l'ordre où le script les écrit. */
const ETAPES: Record<string, string> = {
  brew_update: 'settings.homebrewUpdating',
  brew_upgrade: 'settings.homebrewUpgrading',
  restarting: 'settings.homebrewRestarting',
};

/**
 * Ce que `GET /system/update/status` dit d'une mise à jour Homebrew en cours.
 * Le champ vient d'un fichier posé sur le DISQUE par le script détaché : il
 * traverse le redémarrage, donc le serveur NEUF le rend encore.
 */
export type EtatHomebrew =
  | { genre: 'en_cours'; cle: string }
  | { genre: 'echec'; etape: string }
  | { genre: 'fini' }
  | null;

export function etatHomebrew(status: unknown): EtatHomebrew {
  if (!status || typeof status !== 'object') return null;
  const brut = (status as Record<string, unknown>).homebrew_upgrade;
  if (!brut || typeof brut !== 'object') return null;
  const phase = texte((brut as Record<string, unknown>).phase);
  if (!phase) return null;
  if (phase === 'done') return { genre: 'fini' };
  if (phase.startsWith('failed_')) {
    return { genre: 'echec', etape: phase.slice('failed_'.length) };
  }
  const cle = ETAPES[phase];
  return cle ? { genre: 'en_cours', cle } : null;
}

/**
 * Une mise à jour Homebrew est BIEN plus longue qu'un échange de binaire :
 * `brew update` retire les dépôts de taps, `brew upgrade` télécharge puis
 * relie le keg. Les 180 s du chemin autonome expireraient au milieu et
 * l'utilisateur retrouverait un bouton muet — exactement le défaut qu'on
 * corrige. Quinze minutes couvrent un `brew update` froid sur une liaison
 * lente sans jamais attendre indéfiniment.
 */
export const DELAI_MAJ_HOMEBREW_MS = 15 * 60 * 1000;
