import { writable } from 'svelte/store';
import type { Locale } from '../i18n';
import { isSettingsLevel, legacyAdvancedToLevel, type SettingsLevel } from '../settingLevels';
import { isV2Theme, V2_THEME_DEFAULT, type V2Theme } from '../v2Theme';
import {
  DEFAUTS as DEFAUTS_COLONNES, PAR_CLE as COLONNES_PAR_CLE, type CleColonne,
} from '../colonnesPistes';
import { chainesUniques } from '../clesUniques';
import type { Instantanes as InstantanesRenderer } from '../reglagesRendererEnregistres';
import { estDataUrlImage } from '../avatarLocal';

export type ThemeMode = 'dark' | 'light' | 'oled' | 'midnight';
export type VolumeDisplay = 'percent' | 'dB';
import { STYLE_CRETE_DEFAUT, type StyleCreteMetre } from '../peakMetre';
export type StartupView = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings';

/** Layout mode for the Oxygen library view. */
export type OxygenViewMode = 'album' | 'grid' | 'cards' | 'detail';
/** Densité de la grille d'albums.
 *  `detail` = pochette + titre + artiste (historique).
 *  `wall`   = mur de pochettes seules, plus dense : on choisit un album de
 *  mémoire visuelle, et le texte court-circuite ce mécanisme (demande Alex
 *  Campbell, qui parcourt sa bibliothèque « purely based on nostalgia »). */
export type AlbumGridDensity = 'detail' | 'wall';

/** Facets available in the Oxygen browse rail (Phase 2+). Stored so users can
 *  pick which ones show. Kept here (ui_preferences) so config syncs per install. */
// Only facets the Oxygen rail can actually render AND the server can count
// (rail FIELD_LABELS ∩ SERVER_FACET_FIELDS). The old list advertised
// rating/collection/untagged, which the rail silently dropped — a user
// who selected them saw fewer facets than expected (Bertrand: "seulement 3").
// format/sample_rate/bit_depth are the technical dimensions an audiophile
// browses by (direct tracks columns; server column_facet). `folder` is special:
// a hierarchical drill-down (breadcrumb + child folders) backed by
// /library/folder-facet, rendered by OxygenFolderFacet — not a flat value list.
export const OXYGEN_FACETS_ALL = ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'dr', 'country', 'mood', 'source', 'rating', 'collection', 'favorite', 'playlist', 'untagged', 'original_year', 'folder'] as const;
/** Facets removed from OXYGEN_FACETS_ALL — used to migrate old stored prefs.
 *  `untagged` en était sorti par `bf46fad7` (« only offer facets the rail can
 *  render ») en même temps que collection/folder/rating, faute d'un rendu. Les
 *  trois autres sont revenues depuis ; celle-ci revient maintenant, avec le
 *  sien. La liste des retirées redevient donc vide. */
const OXYGEN_FACETS_REMOVED: string[] = [];
/** Révision courante de la liste de facettes livrée. À incrémenter en même
 *  temps qu'on ajoute une entrée à ADDED_BY_REV ci-dessous. */
const OXYGEN_FACETS_REV = 4;
/** Facettes apparues à chaque révision : elles sont ajoutées une fois aux
 *  préférences déjà enregistrées, puis le choix de l'utilisateur fait foi. */
const OXYGEN_FACETS_ADDED_BY_REV: Record<number, string[]> = {
  1: ['composer'],
  // Lot 1 du rapprochement avec Helium : Favoris, Listes de lecture et
  // Sans étiquette. `untagged` n'est PAS un ajout mais un retour — d'où sa
  // sortie de OXYGEN_FACETS_REMOVED ci-dessus, sans quoi la migration
  //  réinitialiserait les préférences de tous ceux qui la portent encore.
  2: ['favorite', 'playlist', 'untagged'],
  // L'année d'ENREGISTREMENT, distincte de celle d'édition déjà offerte par
  // `year`. Sur du jazz ou du classique, l'écart se compte en décennies.
  3: ['original_year'],
  // Dynamic Range (#2144, #3196). Le serveur sert la facette sous
  // `fields=…,dr` depuis la v0.9.130, mais aucun client ne la demandait :
  // les notes de version l'annonçaient et elle n'existait nulle part
  // (JeromeQ, fil 1640). Activée une fois chez ceux qui ont déjà des
  // préférences enregistrées, sans quoi le correctif resterait invisible
  // pour eux — ce sont précisément les testeurs qui l'ont réclamée.
  4: ['dr'],
};

export interface Preferences {
  theme: ThemeMode;
  language: Locale;
  volumeDisplay: VolumeDisplay;
  startupView: StartupView;
  defaultZoneId: number | null;
  hiddenDeviceIds: string[];
  /** Appareils favoris de la sidebar, remontés en tête de la liste APPAREILS.
   *  Mêmes identifiants préfixés (`audio:`/`net:`) que hiddenDeviceIds, et même
   *  persistance (ui_preferences synchronisé serveur) — la liste peut compter
   *  une douzaine d'appareils découverts chez certains testeurs (#1622). */
  favoriteDeviceIds: string[];
  // --- Oxygen advanced library view (parameterizable) ---
  oxygenEnabled: boolean;
  oxygenView: OxygenViewMode;
  oxygenFacets: string[];
  /** Max values shown per Oxygen facet. 0 = no limit (show every value). */
  oxygenFacetLimit: number;
  /** Révision de la liste de facettes livrée. Sert à faire apparaître une
   *  facette nouvellement ajoutée chez les utilisateurs existants — dont les
   *  préférences enregistrées ne peuvent pas l'avoir décochée, puisqu'elle
   *  n'existait pas — sans jamais réécraser un choix ultérieur. */
  oxygenFacetsRev: number;
  /** Album-view sort key + order, kept here (server-synced ui_preferences) so the
   *  library opens on the user's chosen order across sessions and devices — was
   *  a per-browser localStorage value that never followed the profile (#1134). */
  albumSort: string;
  albumSortOrder: 'asc' | 'desc';
  /** Densité de la grille d'albums — voir AlbumGridDensity. */
  albumGridDensity: AlbumGridDensity;
  /**
   * Le crête-mètre affiché — #452, spécifié par Xavijol.
   *
   * AFFICHAGE seulement : rien ici ne touche à l'audio. `off` n'affiche rien,
   * `lamps` deux témoins compacts, `dat` le bargraphe VFD type Sony DAT
   * PCM-7030, `iec` le même format à l'échelle IEC 268-18.
   *
   * La barre de lecture ne montre JAMAIS `dat` ni `iec` — trop larges — mais
   * elle honore l'extinction. Voir `lib/peakMetre.styleSurLaBarre`.
   */
  peakMeterStyle: StyleCreteMetre;
  /** Afficher les bulles d'aide au survol des boutons.
   *
   *  Activé par défaut : trois testeurs de suite n'ont pas trouvé un bouton
   *  faute d'explication. Désactivable, parce qu'une aide utile au premier
   *  jour devient du bruit au centième — celui qui connaît l'interface ne
   *  doit pas subir une infobulle à chaque survol. */
  tooltipsEnabled: boolean;
  /** Niveau d'affichage des réglages (#1617) : l'UI ne montre que les
   *  réglages ≤ ce niveau, règle d'or mise à part (valeur ≠ défaut ⇒ visible).
   *  Défaut : débutant pour TOUS, installations existantes comprises
   *  (arbitrage Bertrand, 14/08) — l'ancien toggle « réglages avancés »
   *  migre vers expert au premier chargement (voir loadPrefs). */
  /** Thème du NOUVEAU client (six palettes, voir lib/v2Theme). Distinct de
   *  `theme` ci-dessus, qui reste celui de l'app historique : les deux
   *  clients cohabitent derrière le drapeau `?v2`, chacun garde le sien. */
  v2Theme: V2Theme;
  /** Ligne technique (format · fréquence · profondeur) sous chaque pochette de
   *  la Bibliothèque. Niveau Expert uniquement — en dessous, elle n'est pas
   *  proposée et ne s'affiche pas.
   *
   *  Défaut OFF (Bertrand, 01/09/2026) : elle était liée au seul niveau
   *  d'interface, donc imposée à tout utilisateur Expert. Or « Expert » dit
   *  ce qu'on sait faire, pas ce qu'on veut voir sous chaque vignette. */
  v2AlbumTechLine: boolean;
  /**
   * Mosaïque de quatre pochettes sur les cartes de collection, ou pochette
   * UNIQUE — l'écran compact de l'ancien client.
   *
   * « L'affichage des collections me paraît moins agréable dans la V1. Les
   * 4 pochettes accolées, ce n'est pas ma préférence. J'aimais beaucoup
   * l'écran collection de l'ancienne version, épuré, compact » (Gros Bidon,
   * forum 1671, 05/09/2026).
   *
   * Un GOÛT, pas un défaut : d'où un interrupteur, et un défaut qui ne bouge
   * pas — personne ne doit voir son écran changer sans l'avoir demandé.
   */
  v2CollectionsMosaique: boolean;
  /**
   * Les COLONNES du tableau de pistes, par mode d'interface.
   *
   * Chantier du 07/09/2026 (maquette Levente) : en mode Essentiel, une liste
   * de pistes devient un tableau dont l'utilisateur choisit les colonnes.
   *
   * ⚠️ Distinct de `displayFields`, et volontairement. Celui-ci décrit les
   * PUCES d'une ligne, il est partagé avec l'ancien client et persiste par
   * profil côté serveur (`metadata_visible_fields:{pid}`). Élargir son
   * contrat pour y loger trois listes casserait la v0. Les deux se
   * rejoindront quand la v0 s'effacera ; d'ici là, deux surfaces, deux
   * réglages, et ce commentaire pour qu'on sache pourquoi.
   */
  v2Colonnes: Record<SettingsLevel, CleColonne[]>;
  /**
   * La configuration du renderer ENREGISTRÉE à la main, par appareil.
   *
   * Rangée ici, et pas dans la table `zones`, parce que c'est précisément la
   * ligne de `zones` qui se perd d'un démarrage à l'autre : une zone recréée par
   * la découverte change d'identifiant, et ses colonnes repartent au défaut.
   * `ui_preferences` est un blob à part, synchronisé serveur, que la découverte
   * n'atteint pas — et qui suit le profil au lieu de rester dans un navigateur
   * (même arbitrage que le tri d'albums, #1134).
   *
   * La clé est celle de l'APPAREIL (`sortie:…`, `nom:…`), voir
   * `lib/reglagesRendererEnregistres.cleAppareil`.
   */
  reglagesRendererEnregistres: InstantanesRenderer;
  settingsLevel: SettingsLevel;
  /**
   * La PHOTO d'avatar choisie sur la machine, en data-URL. Vide = aucune.
   *
   * La bulle du coin haut-droit n'avait qu'une source : la photo du compte
   * mozaiklabs.fr (`GET /cloud/sso/status`). Sur un serveur personnel sans
   * `client_id` cloud, il n'existait AUCUN moyen de se donner une image —
   * demandé par deux testeurs à un jour d'intervalle (fils 1681 et 1676,
   * issue #893). Celle-ci prime sur celle du compte : c'est un choix
   * explicite, il doit gagner sur ce qui est hérité.
   *
   * Rangée ici et pas ailleurs pour une raison simple : aucune route d'avatar
   * n'existe côté serveur (`avatar_path` y stocke une couleur hexadécimale).
   * Elle suit donc le sort de tous les réglages — `localStorage` puis
   * `ui_preferences` en `PATCH /system/config`.
   *
   * ⚠️ C'est ce qui impose de la RÉDUIRE avant de l'écrire : ce blob repart en
   * entier à chaque modification de n'importe quel réglage. Le cadrage et
   * l'encodage sont dans `lib/avatarLocal.ts`, qui plafonne le résultat ;
   * rien d'autre ne doit écrire cette clé sans passer par lui.
   */
  avatarImage: string;
  /**
   * À QUI appartient cette photo — l'identité du compte cloud qui l'a posée
   * (son adresse de courriel, ou son nom d'affichage à défaut). Vide = aucune.
   *
   * 🔴 Sans ce champ, la photo n'appartient à personne : elle reste affichée
   * après une déconnexion, et un second compte ouvert sur la même machine
   * hérite de la photo du premier. Ce n'est pas une subtilité de session —
   * c'est l'identité montrée en permanence dans le coin de l'écran.
   *
   * Les préférences sont rangées PAR INSTALLATION (`ui_preferences`), pas par
   * compte : c'est donc au moment de l'AFFICHAGE qu'on recoupe, en comparant
   * ce champ à l'identité rendue par `GET /cloud/sso/status`. Se déconnecter
   * rend le dégradé, se reconnecter rend la photo, et un autre compte ne la
   * voit pas.
   */
  avatarCompte: string;
}

const STORAGE_KEY = 'tune-preferences';

const defaults: Preferences = {
  theme: 'dark',
  language: 'fr',
  volumeDisplay: 'percent',
  startupView: 'home',
  defaultZoneId: null,
  hiddenDeviceIds: [],
  favoriteDeviceIds: [],
  oxygenEnabled: false,
  oxygenView: 'detail',
  oxygenFacets: ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'country'],
  oxygenFacetLimit: 200,
  oxygenFacetsRev: OXYGEN_FACETS_REV,
  albumSort: 'title',
  albumSortOrder: 'asc',
  albumGridDensity: 'detail',
  tooltipsEnabled: true,
  v2Theme: V2_THEME_DEFAULT,
  v2AlbumTechLine: false,
  v2CollectionsMosaique: true,
  peakMeterStyle: STYLE_CRETE_DEFAUT,
  v2Colonnes: { ...DEFAUTS_COLONNES },
  reglagesRendererEnregistres: {},
  // EXPERT par defaut (Bertrand, 27/08) — inverse la decision du 14/08.
  // Ne s'applique qu'aux installations SANS niveau enregistre : un choix
  // explicite fait toujours foi, et la migration `legacySettingsLevel()`
  // ci-dessous continue de primer sur ce defaut.
  settingsLevel: 'expert',
  avatarImage: '',
  avatarCompte: '',
};

/** Migration one-shot du toggle « Afficher les réglages avancés » (#1617) :
 *  appliquée seulement quand les préférences stockées ne portent AUCUN niveau
 *  (elles prédatent le sélecteur) — un choix explicite fait toujours foi.
 *
 *  Renvoie `null` quand l'ancien toggle N'EXISTE PAS, pour laisser le défaut
 *  s'appliquer. Auparavant elle renvoyait 'beginner' dans ce cas, ce qui
 *  écrasait silencieusement `defaults.settingsLevel` : changer le défaut
 *  n'avait alors aucun effet, ni sur une installation neuve ni sur des
 *  préférences sans niveau valide. */
function legacySettingsLevel(): SettingsLevel | null {
  try {
    const flag = localStorage.getItem('tune_settings_advanced');
    if (flag === null) return null;   // aucun ancien réglage : le défaut fait foi
    return legacyAdvancedToLevel(flag);
  } catch {
    return null;
  }
}

// One-time migration of the album sort, which #1134 moved from the per-browser
// `tune_album_sort`/`tune_album_sort_order` localStorage keys into the synced
// preferences. Applied only when the stored prefs carry NO album sort yet (they
// predate #1134), so a user's prior choice — e.g. sort by Artist — is adopted
// instead of being silently reset to the 'title' default (Jean-Luc Cassé).
function adoptLegacyAlbumSort(p: Preferences) {
  const legacy = localStorage.getItem('tune_album_sort');
  if (legacy) p.albumSort = legacy;
  const legacyOrder = localStorage.getItem('tune_album_sort_order');
  if (legacyOrder === 'asc' || legacyOrder === 'desc') p.albumSortOrder = legacyOrder;
}

function loadPrefs(): Preferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const raw = JSON.parse(stored);
      const p: Preferences = { ...defaults, ...raw };
      // Migrate Oxygen facets: anyone still carrying a removed facet
      // (collection/folder/…) had a partly-invisible rail — reset them to the
      // new supported default (which now includes Artistes). Otherwise just
      // drop any stray unsupported entries.
      const supported = OXYGEN_FACETS_ALL as readonly string[];
      const facets = Array.isArray(p.oxygenFacets) ? p.oxygenFacets : [];
      if (facets.some((f) => OXYGEN_FACETS_REMOVED.includes(f))) {
        p.oxygenFacets = [...defaults.oxygenFacets];
      } else {
        // 🔴 `chainesUniques` referme la porte d'entrée du défaut #1775.
        //
        // Ce filtre écartait les facettes inconnues sans jamais retirer un
        // DOUBLON : une liste enregistrée portant deux fois « genre »
        // ressortait telle quelle, et le rail la donnait à un
        // `{#each shown as f (f)}`, qui refuse deux clés identiques. Tout
        // Oxygen tombait alors — page figée, F5 obligatoire — et le sélecteur
        // de niveau devenait inerte au passage, faute de gestionnaires
        // attachés après l'erreur.
        //
        // La migration de révision (plus bas) produisait bien une liste unique,
        // mais par accident — elle repart de `supported`, déjà unique — et elle
        // ne se joue qu'UNE fois. Un blob enregistré à la révision courante
        // n'était plus jamais assaini.
        //
        // Le magasin est `localStorage`, donc PAR NAVIGATEUR : c'est la seule
        // hypothèse compatible avec « Edge oui, Chrome non » sans invoquer une
        // différence de moteur — Edge et Chrome partagent Blink. Non démontré.
        const cleaned = chainesUniques(facets.filter((f) => supported.includes(f)));
        p.oxygenFacets = cleaned.length ? cleaned : [...defaults.oxygenFacets];
      }
      /**
       * 🔴 Les colonnes se fusionnent MODE PAR MODE.
       *
       * `{ ...defaults, ...raw }` est une fusion PLATE : un `v2Colonnes` venu
       * du stockage remplace l'objet entier. Un navigateur qui n'aurait connu
       * qu'Essentiel effacerait donc les défauts d'Avancé et d'Expert, et le
       * jour où ces modes passeront au tableau ils s'ouvriraient sans aucune
       * colonne. On refusionne ici, mode par mode.
       *
       * Au passage, les clés inconnues sont écartées : un réglage écrit par
       * une version future ne doit pas produire une grille trouée.
       */
      const colonnes = (raw as Record<string, unknown>)?.v2Colonnes;
      p.v2Colonnes = { ...DEFAUTS_COLONNES };
      if (colonnes && typeof colonnes === 'object') {
        for (const mode of Object.keys(DEFAUTS_COLONNES) as SettingsLevel[]) {
          const liste = (colonnes as Record<string, unknown>)[mode];
          if (!Array.isArray(liste)) continue;
          const propres = liste.filter(
            (c): c is CleColonne => typeof c === 'string' && !!COLONNES_PAR_CLE[c as CleColonne],
          );
          // Une liste VIDE est un choix : on ne la remplace pas par le défaut.
          p.v2Colonnes[mode] = propres;
        }
      }
      // Facettes ajoutées depuis la dernière version connue de ce navigateur :
      // les activer une fois, dans l'ordre canonique du rail.
      const rev = typeof (raw as { oxygenFacetsRev?: unknown })?.oxygenFacetsRev === 'number'
        ? (raw as { oxygenFacetsRev: number }).oxygenFacetsRev
        : 0;
      if (rev < OXYGEN_FACETS_REV) {
        const add = new Set(p.oxygenFacets);
        for (let r = rev + 1; r <= OXYGEN_FACETS_REV; r++) {
          for (const f of OXYGEN_FACETS_ADDED_BY_REV[r] ?? []) add.add(f);
        }
        p.oxygenFacets = supported.filter((f) => add.has(f));
        p.oxygenFacetsRev = OXYGEN_FACETS_REV;
      }
      // Check the RAW blob (not merged `p`, which always has the default): if it
      // predates #1134 it has no albumSort → pull the legacy localStorage choice.
      if (!(raw && typeof raw === 'object' && 'albumSort' in raw)) {
        adoptLegacyAlbumSort(p);
      }
      // Niveau d'affichage (#1617) : valeur invalide ou absente → défaut
      // débutant, sauf si l'ancien toggle « avancé » était actif (⇒ expert).
      if (!isSettingsLevel((raw as { settingsLevel?: unknown })?.settingsLevel)) {
        const legacy = legacySettingsLevel();
        if (legacy) p.settingsLevel = legacy;
      }
      // Thème du client v2 : une valeur inconnue (préférence écrite par une
      // version ultérieure, ou blob corrompu) retombe sur le défaut plutôt que
      // de laisser l'interface à moitié peinte.
      if (!isV2Theme((raw as { v2Theme?: unknown })?.v2Theme)) {
        p.v2Theme = V2_THEME_DEFAULT;
      }
      // Photo d'avatar : on n'accepte QUE ce que ce client sait avoir écrit,
      // une data-URL d'image. Ce blob ne vient pas seulement d'ici — il est
      // relu depuis `ui_preferences`, donc depuis le serveur (voir
      // `syncPreferencesFromServer`) : c'est une valeur distante qu'on s'apprête
      // à poser dans l'attribut `src` d'une balise. Tout le reste retombe sur
      // « aucune photo », ce qui redonne le dégradé au lieu d'un rond cassé.
      if (!estDataUrlImage((raw as { avatarImage?: unknown })?.avatarImage)) {
        p.avatarImage = '';
      }
      // Le propriétaire de la photo est comparé à une identité de compte : une
      // valeur qui n'est pas une chaîne ne peut apparier personne, et la garder
      // ferait porter la comparaison sur un objet.
      if (typeof p.avatarCompte !== 'string') p.avatarCompte = '';
      return p;
    }
  } catch { /* ignore */ }
  const p = { ...defaults };
  adoptLegacyAlbumSort(p);
  const legacy = legacySettingsLevel();
  if (legacy) p.settingsLevel = legacy;
  return p;
}

const hadLocalPrefs = !!localStorage.getItem(STORAGE_KEY);

function createPreferences() {
  const { subscribe, set, update } = writable<Preferences>(loadPrefs());
  let initialized = false;
  subscribe((v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
    if (initialized) {
      fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_preferences: JSON.stringify(v) }),
      }).catch(() => {});
    }
  });
  initialized = true;
  return { subscribe, set, update };
}

export const preferences = createPreferences();

// Apply theme immediately on module load (before App mounts) to prevent flash.
// The FOUC script in index.html handles the very first paint, but this ensures
// the theme is also applied as soon as JS modules are evaluated.
applyTheme(loadPrefs().theme);

export async function syncPreferencesFromServer() {
  try {
    const res = await fetch('/api/v1/system/config');
    if (!res.ok) return;
    const config = await res.json();
    if (config.ui_preferences) {
      const server: Partial<Preferences> = typeof config.ui_preferences === 'string'
        ? JSON.parse(config.ui_preferences)
        : config.ui_preferences;
      // 🔴 Le MÊME filtre que `loadPrefs`, et il doit être ici aussi : sur un
      // navigateur sans préférences locales, la branche ci-dessous adopte le
      // blob serveur TEL QUEL, sans repasser par `loadPrefs`. C'est le chemin
      // par lequel une valeur distante atteindrait l'attribut `src` de la
      // bulle — précisément celui qu'on prétend garder.
      if (!estDataUrlImage(server.avatarImage)) delete server.avatarImage;
      if (typeof server.avatarCompte !== 'string') delete server.avatarCompte;
      if (hadLocalPrefs) {
        preferences.update((local) => ({ ...defaults, ...server, ...local }));
      } else {
        preferences.update(() => ({ ...defaults, ...server }));
      }
    }
  } catch { /* ignore */ }
  // Sync server-side default zone into local preferences
  try {
    const res = await fetch('/api/v1/system/settings/default-zone');
    if (res.ok) {
      const data = await res.json();
      if (data.zone_id != null) {
        preferences.update((p) => ({ ...p, defaultZoneId: data.zone_id }));
      }
    }
  } catch { /* ignore */ }
}

export function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Also persist the theme value for external consumers
  try { localStorage.setItem('tune-theme', theme); } catch { /* ignore */ }
}
