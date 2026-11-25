/**
 * rc14, refonte de l'ergonomie de TESS (retours de Rémi, go de Bertrand du
 * 25/11/2026) — LOT 1 « coquille » : OUVRIR TESS, avec un greffon choisi.
 *
 * Deux portes mènent à l'écran TESS depuis la barre de lecture :
 *   - l'icône TESS (à côté du chemin du signal et de PURE) : l'écran, sans
 *     greffon choisi ;
 *   - le chemin du signal : un clic sur un TRAITEMENT ouvre TESS EN ENTIER,
 *     ce greffon sélectionné (panneau de réglages à droite). Avant, seule la
 *     fenêtre du traitement s'ouvrait.
 *
 * ## Le paramètre de navigation : `#tess?plugin=<id>`
 *
 * `<id>` est l'identifiant du greffon dans le catalogue TESS
 * (`GET /tess/catalog` : `crossfeed-pro`, `equalizer-parametric`,
 * `room-correction`…), encodé par `encodeURIComponent`.
 *
 *   - En cours de session, la source de vérité est le store
 *     `greffonTessDemande` du FICHIER CONTRAT entre les deux lots
 *     (`stores/tessOuverture`, spécification § 3.3) : `ouvrirTess(id)` le
 *     pose, puis l'écran TESS (lot 2) le CONSOMME pour sélectionner le
 *     greffon ou l'étage. La coquille affiche le paramètre dans l'adresse
 *     (`ecrireAdresseTess`, réécriture par `replaceState` de l'entrée que la
 *     coquille vient d'empiler : la pile ne grandit pas).
 *   - Au chargement (lien profond, F5), `lireGreffonTessAuChargement` lit le
 *     paramètre dans le fragment et pose le même store. `routeAuChargement`
 *     lit déjà `#tess?…` comme la route `tess` (`?` est un séparateur).
 *
 * Un greffon absent de la chaîne de la zone n'est pas une erreur : l'écran
 * l'ignore (LOT 2 décide de l'ajouter ou non).
 */
import { greffonTessDemande } from './stores/tessOuverture';
import { nomDeRoute } from './routeAuChargement';

/** Le nom du paramètre dans l'adresse : `#tess?plugin=<id>`. */
export const PARAM_GREFFON_TESS = 'plugin';

const ID_VALIDE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Un identifiant de greffon lisible, sinon `null` (rien d'arbitraire ne passe). */
export function idGreffonValide(id: unknown): string | null {
  return typeof id === 'string' && ID_VALIDE.test(id) ? id : null;
}

/** L'adresse de l'écran TESS, avec le greffon choisi s'il y en a un. */
export function adresseTess(id?: string | null): string {
  const ok = idGreffonValide(id);
  return ok ? `#tess?${PARAM_GREFFON_TESS}=${encodeURIComponent(ok)}` : '#tess';
}

/** Le greffon demandé par un fragment `#tess?plugin=<id>`, sinon `null`. */
export function greffonDepuisAdresse(hash: string | null | undefined): string | null {
  const h = hash ?? '';
  if (nomDeRoute(h) !== 'tess') return null;
  const q = h.indexOf('?');
  if (q === -1) return null;
  try {
    return idGreffonValide(new URLSearchParams(h.slice(q + 1)).get(PARAM_GREFFON_TESS));
  } catch {
    return null;
  }
}

/** Au chargement : le paramètre du fragment, s'il y en a un, devient la demande. */
export function lireGreffonTessAuChargement(hash: string | null | undefined): string | null {
  const id = greffonDepuisAdresse(hash);
  if (id) greffonTessDemande.set(id);
  return id;
}

/**
 * La coquille vient d'écrire `#tess` ; on y ajoute le paramètre, sans
 * empiler d'entrée (l'état de l'entrée est gardé tel quel).
 */
export function ecrireAdresseTess(
  id: string | null,
  fenetre: { history?: History } | undefined = typeof window !== 'undefined' ? window : undefined,
): void {
  const ok = idGreffonValide(id);
  if (ok && fenetre?.history) {
    try {
      fenetre.history.replaceState(fenetre.history.state, '', adresseTess(ok));
    } catch {
      /* adresse non modifiable (iframe, test) : le store suffit */
    }
  }
}

/**
 * Une étape du bloc `tess` du chemin du signal → ce que TESS doit
 * sélectionner : le greffon (`plugin_id`), sinon l'étage fixe (`code` :
 * `headroom`, `upsampling`, `volume`…). Les extrémités ne mènent nulle part.
 */
export function selectionDeLEtapeTess(e: { code?: string | null; plugin_id?: string | null } | null | undefined): string | null {
  if (!e) return null;
  if (e.code === 'plugin') return idGreffonValide(e.plugin_id);
  if (e.code === 'source' || e.code === 'output') return null;
  return idGreffonValide(e.code);
}

type EtapeHistorique = { name?: string | null; code?: string | null; plugin?: string | null; kind?: string | null };
type EtapeBlocTess = { code?: string; plugin_id?: string | null; effective?: boolean };

/** Les greffons du bloc `tess` publié avec le chemin du signal. */
function greffonsDuBloc(signalPath: unknown): EtapeBlocTess[] {
  const t = (signalPath as { tess?: { steps?: unknown } } | null | undefined)?.tess;
  const steps = t && Array.isArray(t.steps) ? (t.steps as EtapeBlocTess[]) : [];
  return steps.filter((e) => e && e.code === 'plugin' && typeof e.plugin_id === 'string');
}

/**
 * Une étape HISTORIQUE du chemin du signal (« DSP », « crossfeed »,
 * « room_correction »…) → le greffon TESS qui la porte, sinon `null` (l'étape
 * n'est pas un traitement de la chaîne TESS : source, transport,
 * suréchantillonnage, ReplayGain… gardent leur réglage habituel).
 *
 * L'égaliseur n'a pas d'identifiant dans l'étape historique : on prend celui
 * que publie le bloc `tess` (le premier `equalizer-*` actif), sinon
 * `equalizer-graphic`.
 */
export function greffonTessDeLEtape(etape: EtapeHistorique | null | undefined, signalPath?: unknown): string | null {
  if (!etape) return null;
  const bloc = greffonsDuBloc(signalPath);
  const egaliseur = () =>
    (bloc.find((e) => e.plugin_id!.startsWith('equalizer-') && e.effective === true)
      ?? bloc.find((e) => e.plugin_id!.startsWith('equalizer-')))?.plugin_id ?? 'equalizer-graphic';
  switch (etape.code) {
    case 'crossfeed':
      return idGreffonValide(etape.plugin) ?? 'crossfeed';
    case 'room_correction':
      // La RI (`kind: ir`) est le convolueur ; le profil de pièce, l'autre greffon.
      return etape.kind === 'ir' ? 'convolution' : 'room-correction';
    case 'channel_remap':
    case 'channel_remap_not_applied':
      return 'channel-remap';
    case 'level_compensation':
      return egaliseur();
    default:
      break;
  }
  if (etape.name === 'DSP') return egaliseur();
  if (etape.name === 'Mono') return 'mono-downmix';
  return null;
}
