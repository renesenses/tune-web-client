import type { RendererCapabilities } from './types';

/**
 * Qui a le droit de demander le « WAV 24 bits » (`dlna_wav24`) sur une zone.
 *
 * ## Ce que le serveur expose réellement
 *
 * `POST /zones/{id}/renderer-capabilities` rend la sonde `GetProtocolInfo`
 * telle quelle (`tune-server/src/routes/zones/peripheriques.rs`). Le mappage
 * Sink → capacités est une fonction pure du serveur
 * (`renderer_caps_from_sink`, `tune-core/src/outputs/dlna.rs`) :
 *
 * - `wav`     ← le Sink liste `audio/wav` (ou `audio/x-wav`, ou le joker `*`)
 * - `lpcm16`  ← le Sink liste `audio/L16`
 * - `lpcm24`  ← le Sink liste `audio/L24`
 * - `probed`  ← **faux** quand le Sink n'a pas pu être lu du tout
 *
 * Et le serveur dit lui-même ce que vaut un `probed: false` : « inconclusive —
 * the renderer may still decode more than it advertises; the negotiation
 * fallbacks stay in charge ». Ce n'est pas un refus, c'est une absence de
 * réponse.
 *
 * ## Pourquoi le réglage était inatteignable
 *
 * L'écran traitait cette absence de réponse comme un refus : `caps` reste
 * `null` tant que la sonde n'a pas répondu, donc le bouton « 24 bits » était
 * grisé — sur TOUS les appareils à l'ouverture de l'écran, et à jamais sur
 * ceux dont la sonde échoue. Le darTZeel LHC-208 d'Yves Corbat est lent à
 * acquitter ses commandes SOAP : sa sonde n'aboutit pas toujours, et le
 * réglage restait alors hors d'atteinte, sans contournement (#303).
 *
 * Aucun autre réglage de cet écran n'exige de preuve : « FLAC natif »,
 * « ALAC natif », « AAC natif » et le plafond 16 bits sont tous proposés sans
 * sonde, alors qu'un renderer incapable de décoder le FLAC casserait de la
 * même façon. Le 24 bits était seul à demander une preuve, et l'absence de
 * preuve y valait condamnation.
 *
 * ## Ce qui est réellement suffisant, et le garde-fou
 *
 * Le chemin `dlna_wav24` sert un VRAI fichier WAV, sans le profil
 * `DLNA.ORG_PN=LPCM` (`dlna_flags_for_mime_bd`, `tune-core/src/outputs/didl.rs`) :
 * n'importe quel renderer qui sait analyser un en-tête WAV le lit. Annoncer
 * `audio/L24` ou `audio/wav` suffit donc, et c'est acquis depuis la PR #302.
 *
 * Le garde-fou reste, mais il ne se déclenche plus que sur une PREUVE :
 * une sonde qui a répondu et qui n'annonce ni `audio/L24`, ni `audio/wav`
 * décrit un appareil qui ne saura pas le faire — servir un WAV 24 bits à un
 * renderer qui ne connaît que `audio/L16` rejoue le silence de #1137. Là, et
 * seulement là, le bouton reste fermé.
 */
export type EtatWav24 =
  /** La sonde a répondu et l'appareil annonce ce qu'il faut. */
  | 'ouvert'
  /** Aucune sonde exploitable : proposé, mais rien ne le confirme. */
  | 'sans_preuve'
  /** La sonde a répondu : cet appareil ne sait pas le faire. */
  | 'refuse';

/**
 * @param caps      la dernière sonde, ou `null` si aucune n'a abouti
 * @param dejaActif la zone porte déjà `dlna_wav24` (jamais rétrograder en silence)
 */
export function etatWav24(
  caps: RendererCapabilities | null | undefined,
  dejaActif: boolean,
): EtatWav24 {
  // Un réglage déjà enregistré reste sélectionnable : une sonde manquée ne
  // doit pas retirer à l'utilisateur ce qu'il écoute aujourd'hui.
  if (dejaActif) return 'ouvert';
  // `null` = pas encore sondé ; `probed: false` = sonde sans réponse. Les deux
  // sont des absences de preuve, jamais des refus.
  if (!caps || caps.probed === false) return 'sans_preuve';
  if (caps.lpcm24 === true || caps.wav === true) return 'ouvert';
  return 'refuse';
}

/**
 * Le bouton « 24 bits » est-il cliquable ?
 *
 * Les deux états qui ne sont pas `ouvert` portent chacun leur explication dans
 * le flux de la page (`renderer.wav24Unproven`, `renderer.wav24Refused`) :
 * l'infobulle d'un bouton désactivé n'est pas affichée par tous les
 * navigateurs, et c'est ainsi qu'Yves a conclu que le 24 bits ne marchait sur
 * aucun de ses appareils.
 */
export function wav24Disponible(
  caps: RendererCapabilities | null | undefined,
  dejaActif: boolean,
): boolean {
  return etatWav24(caps, dejaActif) !== 'refuse';
}
