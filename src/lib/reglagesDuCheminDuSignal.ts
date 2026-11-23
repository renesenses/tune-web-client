/**
 * Chemin du signal → réglages du traitement (rc12, demande de Bertrand :
 * « À partir du chemin du signal, accéder aux traitements tels que Crossfeed
 * Pro, égaliseur ! »).
 *
 * Chaque étape que publie `GET /zones/{id}/signal-path` est reconnue par son
 * `code` stable quand le serveur en pose un, sinon par son `name` (`DSP`,
 * `ReplayGain`, `Mono`, `Upsampler` : littéraux non traduits côté serveur).
 * Une étape sans écran de réglage (source, décodeur, transport, rendu…) ou
 * d'un genre inconnu ne mène nulle part : elle reste du texte.
 *
 * Toutes les cibles sont des écrans DE LA ZONE COURANTE : le chemin du signal
 * affiché est celui de `currentZone`, et les écrans visés (égaliseur,
 * crossfeed, greffons, correction de pièce, suréchantillonnage, réaffectation)
 * lisent la même zone. Les réglages par zone reçoivent l'identifiant en clair.
 *
 * Retour : l'aller pose `retourAuChemin` ; quand la coquille revient sur la vue
 * de départ (Précédent du navigateur, qui dépile l'entrée posée par
 * `activeView`), le panneau d'origine est rouvert. Toute autre navigation
 * oublie le retour : rouvrir un panneau après un détour serait une surprise.
 */
import { get, writable } from 'svelte/store';
import type { SignalPathStep } from './types';
import { activeView, mobileNowPlayingOpen, type View } from './stores/navigation';
import { v2SettingsTarget, type V2SettingsTarget } from './stores/v2SettingsNav';
import { ECRANS_GREFFONS_NATIFS } from './greffonsAudioNatifs';

/** Où mène le réglage d'une étape. */
export type CibleReglageEtape =
  | { vue: Exclude<View, 'settings'> }
  | { vue: 'settings'; reglages: V2SettingsTarget };

/** Les champs additifs de l'étape que ce module lit (absents du type commun). */
type EtapeLue = Pick<SignalPathStep, 'name' | 'code'> & {
  /** Identifiant du greffon qui porte l'étape (crossfeed d'un greffon natif tiers). */
  plugin?: string | null;
  /** Correction de pièce : `ir` (convolueur) ou `eq` (profil de pièce). */
  kind?: string | null;
  /** Correction de pièce : le réglage est armé mais ne s'applique pas. */
  applied?: boolean | null;
};

/** Les étapes connues par leur `code`. */
function parCode(e: EtapeLue, zoneId: number | null): CibleReglageEtape | null {
  switch (e.code) {
    case 'crossfeed': {
      // Un greffon natif tiers traite à la place du crossfeed intégré : son
      // écran, par son identifiant ; un greffon sans écran connu → Extensions.
      const id = typeof e.plugin === 'string' && e.plugin ? e.plugin : null;
      if (id) {
        const ecran = ECRANS_GREFFONS_NATIFS[id];
        return { vue: ecran && ecran !== 'settings' ? ecran : 'plugins' };
      }
      return { vue: 'crossfeed' };
    }
    case 'room_correction':
      // La RI se charge dans la fiche de la zone (bloc FIR), le profil de
      // pièce dans l'écran Correction de pièce.
      if (e.kind === 'ir') return reglagesDeZone(zoneId, 'fir');
      return { vue: 'roomcorrection' };
    case 'upsampling':
      return { vue: 'surechantillonnage' };
    case 'rate_conversion':
    case 'fixed_rate_limit':
      return reglagesDeZone(zoneId);
    case 'level_compensation':
      // La compensation de niveau se règle sous l'égaliseur (et le crossfeed).
      return { vue: 'equalizer' };
    case 'channel_remap':
    case 'channel_remap_not_applied':
      return { vue: 'reaffectation' };
    default:
      return null;
  }
}

function reglagesDeZone(zoneId: number | null, bloc?: 'fir'): CibleReglageEtape {
  const reglages: V2SettingsTarget = { tab: 'devices', section: 'perZone' };
  if (zoneId != null) {
    reglages.zone = zoneId;
    if (bloc) reglages.bloc = bloc;
  }
  return { vue: 'settings', reglages };
}

/** L'écran de réglage d'une étape, ou `null` si elle n'en a pas. */
export function cibleDeLEtape(
  etape: EtapeLue | null | undefined,
  zoneId: number | null | undefined,
): CibleReglageEtape | null {
  if (!etape) return null;
  const zid = zoneId ?? null;
  if (typeof etape.code === 'string' && etape.code) {
    const c = parCode(etape, zid);
    if (c) return c;
  }
  switch (etape.name) {
    case 'DSP':
      return { vue: 'equalizer' };
    case 'Upsampler':
      return { vue: 'surechantillonnage' };
    case 'ReplayGain':
      return { vue: 'settings', reglages: { tab: 'audio', section: 'localAudio', reglage: 'replaygain' } };
    case 'Mono':
      return reglagesDeZone(zid);
    default:
      return null;
  }
}

/** Vrai quand l'étape décrit un réglage armé qui ne s'applique pas. */
export function etapeInactive(etape: EtapeLue | null | undefined): boolean {
  return etape?.applied === false;
}

// ── Retour au chemin du signal ────────────────────────────────────────────

/** Le panneau d'où part le clic : la barre de lecture ou « Lecture en cours ». */
export type OrigineChemin = 'barre' | 'lecture';

export interface RetourAuChemin {
  depuis: View;
  cible: View;
  origine: OrigineChemin;
  /** « Lecture en cours » était ouverte en calque (voie mobile). */
  calque: boolean;
}

/** Le retour en attente, posé à l'aller. */
export const retourAuChemin = writable<RetourAuChemin | null>(null);
/** Le panneau à rouvrir, consommé une fois par le composant de cette origine. */
export const cheminARouvrir = writable<OrigineChemin | null>(null);

/** Ce que l'arrivée sur `vue` fait du retour en attente. */
export function decisionRetour(r: RetourAuChemin | null, vue: View): 'attendre' | 'rouvrir' | 'oublier' | 'rien' {
  if (!r) return 'rien';
  if (vue === r.cible) return 'attendre';
  if (vue === r.depuis) return 'rouvrir';
  return 'oublier';
}

activeView.subscribe((vue) => {
  const r = get(retourAuChemin);
  const d = decisionRetour(r, vue);
  if (d === 'rien' || d === 'attendre') return;
  retourAuChemin.set(null);
  if (d === 'rouvrir' && r) {
    if (r.calque) mobileNowPlayingOpen.set(true);
    cheminARouvrir.set(r.origine);
  }
});

/** Ouvre l'écran de réglage d'une étape et arme le retour au panneau d'origine. */
export function ouvrirReglageDeLEtape(cible: CibleReglageEtape, origine: OrigineChemin): void {
  const depuis = get(activeView);
  const calque = get(mobileNowPlayingOpen);
  if (calque) mobileNowPlayingOpen.set(false);
  retourAuChemin.set(cible.vue === depuis ? null : { depuis, cible: cible.vue, origine, calque });
  if (cible.vue === 'settings') v2SettingsTarget.set(cible.reglages);
  activeView.set(cible.vue);
}
