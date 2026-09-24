/**
 * La vue des Zones : grille ou liste, et ce qu'une carte a le droit de dire.
 *
 * Chantier demandé par Bertrand le 08/09/2026 : « vue grille avec des grosses
 * cards présentant aussi l'appareil de la zone et le badge Tune tested. grille
 * du genre 4 colonnes ».
 *
 * 🔴 MESURE AVANT DE DESSINER (`GET /zones` sur le .18, 08/09/2026, 14 zones) :
 * cinq zones seulement portent une identité d'appareil, et une seule est
 * CHOISIE — l'Eversolo (« Eversolo / DMP-A8 »). Les quatre autres sont
 * DÉTECTÉES : « Sonos, Inc. / Sonos Play:1 », « SoftAtHome / SoftAtHome Media
 * Renderer », « MozAIk Labs / Tune », « EVERSOLO / AV Renderer Device ». Les
 * neuf restantes — les AirPlay, le navigateur, la sortie locale, Lindemann,
 * Chambre — n'ont NI marque NI modèle.
 *
 * Autrement dit : sur les cartes de Bertrand, deux sur trois n'auront aucun
 * appareil à montrer. La carte doit donc être belle SANS, pas seulement avec ;
 * elle retombe sur le type de sortie, qui, lui, est toujours là. Dessiner la
 * grille en supposant l'identité présente aurait donné neuf cartes trouées.
 */

/** Ce que l'écran Zones affiche. Choix rangé dans le navigateur. */
export type VueZones = 'grille' | 'liste';

export const CLE_VUE_ZONES = 'tune.v2.vueZones';

/** La vue par défaut est la GRILLE : c'est celle qui a été demandée. */
export function lireVueZones(store?: Pick<Storage, 'getItem'>): VueZones {
  try {
    const s = store ?? localStorage;
    return s.getItem(CLE_VUE_ZONES) === 'liste' ? 'liste' : 'grille';
  } catch {
    // Stockage refusé (navigation privée) : on retombe sur le défaut.
    return 'grille';
  }
}

export function ecrireVueZones(vue: VueZones, store?: Pick<Storage, 'setItem'>): void {
  try {
    (store ?? localStorage).setItem(CLE_VUE_ZONES, vue);
  } catch {
    /* tant pis, le choix ne survivra pas au rechargement */
  }
}

export interface ZoneIdentifiable {
  brand?: string | null;
  model?: string | null;
  detected_manufacturer?: string | null;
  detected_model?: string | null;
}

/**
 * L'appareil de la zone, en une ligne — ou `null` s'il n'y en a pas.
 *
 * 🔴 L'identité CHOISIE d'abord, la DÉTECTÉE ensuite, et JAMAIS un mélange des
 * deux : c'est la même règle que `appareilTuneTeste`, pour la même raison.
 * Croiser la marque choisie « Eversolo » avec le modèle détecté « AV Renderer
 * Device » fabriquerait « Eversolo AV Renderer Device », qui ne désigne aucun
 * appareil au monde.
 *
 * Une marque sans modèle (ou l'inverse) est rendue seule — c'est incomplet,
 * pas faux.
 */
export function appareilDeLaZone(zone: ZoneIdentifiable): string | null {
  const plier = (v: string | null | undefined) => (v ?? '').trim();
  for (const [marque, modele] of [
    [zone.brand, zone.model],
    [zone.detected_manufacturer, zone.detected_model],
  ] as const) {
    const m = plier(marque);
    const d = plier(modele);
    if (!m && !d) continue;
    // « Sonos, Inc. Sonos Play:1 » : le modèle répète déjà la marque chez
    // plusieurs constructeurs. On ne l'écrit pas deux fois.
    if (m && d && d.toLowerCase().startsWith(m.replace(/,?\s*(inc|ltd|llc|gmbh|corp|co)\.?$/i, '').trim().toLowerCase())) {
      return d;
    }
    return [m, d].filter(Boolean).join(' ');
  }
  return null;
}

/**
 * L'état de LECTURE d'une zone — trois valeurs, et rien de plus.
 *
 * 🔴 Pourquoi ça ne peut pas être une couleur seule.
 *
 * L'écran Zones n'affichait l'état nulle part : la pastille `.dot` de la carte
 * dit la zone ACTIVE (celle que les gestes visent), pas celle qui joue, et
 * elle est peinte à l'accent du thème. Sur un thème `black-green`, tout est
 * vert — pastille, cadre de la zone active, curseurs, boutons — et « qui
 * joue ? » ne se lit plus d'un coup d'œil.
 *
 * L'état est donc porté d'abord par une FORME (barres animées, glyphe pause,
 * tiret) et par un LIBELLÉ, la couleur ne venant qu'en renfort, prise aux
 * jetons SÉMANTIQUES `--tune-success` / `--tune-warning`. `tune-v2.css` dit
 * déjà pourquoi ceux-là ne sont pas repeints aux couleurs du thème : « ils
 * portent un SENS, pas une identité visuelle ; les repeindre effacerait
 * l'information ». On applique la règle de la maison, on n'en invente pas une.
 */
export type EtatLecture = 'playing' | 'paused' | 'idle';

export interface ZoneJouable {
  state?: unknown;
  current_track?: unknown;
}

/**
 * `state` fait foi. En son absence — serveur ancien, zone jamais interrogée —
 * la présence d'une piste courante ne suffit PAS à conclure « ça joue » :
 * `current_track` survit à une pause et même à un arrêt, c'est la DERNIÈRE
 * piste, pas la piste EN COURS. Sans `state`, on ne prétend rien : `idle`.
 */
export function etatLectureDeZone(z: ZoneJouable): EtatLecture {
  const s = typeof z.state === 'string' ? z.state.toLowerCase() : '';
  if (s === 'playing') return 'playing';
  if (s === 'paused') return 'paused';
  return 'idle';
}

/** La clé i18n du libellé d'état. Jamais un texte : voir `check-i18n`. */
export function cleEtatLecture(e: EtatLecture): string {
  return e === 'playing' ? 'zone.playing' : e === 'paused' ? 'zone.paused' : 'zone.stopped';
}

/**
 * Pourquoi le sélecteur de canaux est verrouillé — la CLÉ, pas la phrase.
 *
 * 🔴 L'écran affichait `channel_layout_status.detail`, une phrase envoyée en
 * clair par le serveur. Son commentaire l'assumait : « un écran sans table de
 * traduction peut l'afficher tel quel ». C'est vrai d'un écran nu ; celui-ci
 * en a une — et le résultat, vu sur une installation en anglais le 20/09/2026,
 * était « cette zone ne sort pas par une carte son locale : le renderer
 * négocie son propre format » au milieu de Settings › Devices.
 *
 * Le serveur fait pourtant ce qu'il faut : `CanauxContrainte::code()` rend un
 * code STABLE — `sortie_non_locale`, `au_dela_de_l_appareil` — et son propre
 * commentaire dit « destinés à la machine ; LE CLIENT LES TRADUIT ». Ce code
 * arrive dans `reason`, à côté de `detail`, et n'était pas lu.
 *
 * Même forme que `cleIndisponibiliteCrossfeed` : un code inconnu — motif
 * ajouté par un serveur plus récent — retombe sur la phrase générique plutôt
 * que d'afficher son code brut.
 */
/**
 * Le sélecteur de canaux est-il VERROUILLÉ ? — fils 1914/1913.
 *
 * Reivax66, v0.9.163 : « la case canaux suivre l'appareil reste grisée pour
 * l'ampli DENON AVR X1600-H qui est pourtant un ampli 7.1 ».
 *
 * L'écran verrouillait dès que `unavailable` était vrai, quel qu'en soit le
 * motif. Or le serveur publie DEUX motifs de nature opposée
 * (`tune-core/src/audio/canaux_declares.rs`) :
 *
 *  - `sortie_non_locale` — la déclaration n'a AUCUN chemin jusqu'à la sortie
 *    (AirPlay, OAAT, zone sans appareil — et, sur un serveur antérieur au lot
 *    `batch/canaux-reseau-20260924`, tout renderer réseau). Choisir ne
 *    changerait rien au son — le réglage mentirait (#3254). Là, on SAIT : on
 *    verrouille, et le texte dit que le verrou tient à la sortie, pas à
 *    l'appareil. Un renderer DLNA que Tune décode n'arrive plus ici : le
 *    serveur l'ouvre et publie `portee: 'plafond_reseau'`.
 *  - `au_dela_de_l_appareil` — le pilote annonce moins de canaux que le
 *    choix. Le serveur l'écrit en toutes lettres : « On ne bloque pas la
 *    saisie — un pilote ment parfois, et l'utilisateur en sait plus que
 *    lui ». Le verrou de l'écran contredisait cette règle ET enfermait
 *    l'utilisateur : impossible de revenir à « Suivre l'appareil ».
 *
 * Un motif INCONNU (serveur plus récent) verrouille : on ne sait pas s'il
 * s'agit d'un avertissement, et un réglage sans effet est pire qu'un
 * réglage indisponible.
 */
export function canauxVerrouilles(
  statut: { unavailable?: boolean | null; reason?: string | null } | null | undefined,
): boolean {
  if (!statut?.unavailable) return false;
  return statut.reason !== 'au_dela_de_l_appareil';
}
export function cleContrainteCanaux(motif: string | null | undefined): string {
  switch (motif) {
    case 'sortie_non_locale':
      return 'zoneConfig.channelsUnavailableNonLocal';
    case 'au_dela_de_l_appareil':
      return 'zoneConfig.channelsUnavailableBeyondDevice';
    default:
      return 'zoneConfig.channelsUnavailable';
  }
}
