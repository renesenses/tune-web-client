/**
 * Reglages de l'automate : ce qu'il a le droit de faire, et jusqu'ou.
 */

/**
 * Controles jamais actionnes : leur effet sort du bac a sable (materiel, disque,
 * comptes tiers, processus serveur). Le reste est autorise — la base de donnees
 * est une copie jetable, un « supprimer une playlist » est un test legitime.
 */
const HARD_SKIP_RULES = [
  // Cycle de vie du serveur et de la machine
  'shutdown|arreter le serveur|redemarr|restart|reboot|eteindre|power',
  // Systeme de fichiers / scan de bibliotheque : long et hors application
  'scanner|rescan|analyser le dossier|reindex|choisir un dossier|parcourir le disque',
  // Comptes tiers : ouvrent une fenetre OAuth externe
  'connexion tidal|qobuz|spotify|deezer|se connecter a|oauth|autoriser l.acces',
  // Session : deconnecter l.automate mettrait fin a l.exploration
  'deconnexion|se deconnecter|logout|sign out|changer de profil',
  // Greffons et mises a jour : installent du code sur la machine
  'installer|uninstall|desinstall|mettre a jour|update now|telecharger la mise',
  // Achat / abonnement
  'acheter|s.abonner|subscribe|upgrade to premium|passer a premium',
  // Import/export de fichiers : ouvre un selecteur natif bloquant
  'importer|televerser|upload|choisir un fichier|exporter',
  // Assistant d.onboarding : reinitialise l.etat de l.application
  'assistant|wizard|onboarding|refaire la configuration',
];

/**
 * Materiel reel du reseau : appairer une enceinte AirPlay ou un televiseur les
 * fait reellement changer d'entree chez leur proprietaire. Le bac a sable
 * s'arrete au poste de travail. `--allow-devices` leve cette reserve pour un
 * passage dedie sur un reseau de test.
 */
export const DEVICE_SKIP = [
  'associer|appairer|pair|jumeler',
  'airplay|chromecast|cast|sonos|upnp|dlna',
  'connecter la zone|activer la sortie|diffuser vers',
];

/** Motifs d'exclusion effectifs pour ce passage. */
export function hardSkipPattern({ allowDevices = false } = {}) {
  return [...HARD_SKIP_RULES, ...(allowDevices ? [] : DEVICE_SKIP)].join('|');
}

/**
 * Controles actionnes mais signales dans le rapport : ils modifient la base de
 * test de facon durable. Utile pour comprendre un enchainement de constats.
 */
export const RISKY = [
  'supprimer|delete|remove|effacer|vider|purge|reinitialis|reset',
].join('|');

/** Prefixes de cles de traduction, pour reperer une cle affichee brute. */
export const I18N_NAMESPACES = [
  'common', 'nav', 'library', 'player', 'queue', 'search', 'settings', 'playlists',
  'collections', 'radios', 'podcasts', 'metadata', 'streaming', 'zones', 'home',
  'history', 'favorites', 'equalizer', 'plugins', 'alarms', 'diagnostics', 'onboarding',
  'errors', 'dashboard', 'shortcuts', 'converter', 'profiles', 'genres', 'ai',
];

export const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:8291',
  outDir: 'issues',
  maxActions: 400,
  maxPerState: 24,
  /** Plancher d'actions garanti a chaque vue, meme en fin de budget. */
  minPerView: 12,
  /** Plafond d'actions sur un meme type de controle, pour tout le passage. */
  maxPerShape: 8,
  maxDepth: 3,
  settleMs: 550,
  actionTimeoutMs: 3000,
  viewport: { width: 1440, height: 900 },
  headless: true,
  /**
   * Vues explorees en premier — libelles francais ET anglais : l'automate ne
   * decouvre la langue de l'interface qu'une fois le menu affiche.
   */
  priorityViews: [
    'bibliotheque|library',
    'accueil|home',
    'lecture en cours|now playing',
    'file|queue',
    'recherche|search',
    'playlist',
    'favoris|favorite',
    'collections',
    'historique|history',
    'reglages|parametres|settings',
  ],
};

/** Valeur saisie dans un champ, selon ce qu'il semble attendre. */
export function inputValue(el) {
  const hint = `${el.label} ${el.type || ''}`.toLowerCase();
  if (el.type === 'password') return null;          // ne pas tenter d'authentification
  if (el.type === 'file') return null;              // selecteur natif bloquant
  if (el.type === 'checkbox' || el.type === 'radio') return 'toggle';
  if (el.type === 'range') return 'range';
  if (el.type === 'number') return '3';
  if (el.type === 'date') return '2026-01-01';
  if (el.type === 'time') return '08:30';
  if (el.type === 'color') return '#3b82f6';
  if (/email|courriel/.test(hint)) return 'crawler@example.invalid';
  if (/url|adresse|host|serveur|ip/.test(hint)) return '127.0.0.1';
  if (/port/.test(hint)) return '8080';
  if (/recherche|search|filtrer|filter/.test(hint)) return 'the';
  return 'crawler-test';
}
