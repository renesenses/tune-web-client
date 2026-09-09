/**
 * Dire POURQUOI un réglage d'égaliseur n'est pas passé — #513.
 *
 * # Ce que ce fichier répare
 *
 * `EqualizerView.svelte` avalait cinq échecs en silence : des `catch` vides,
 * ou dont tout le corps était un commentaire « ignore ». L'utilisateur bouge
 * un curseur, rien ne se passe, et rien ne lui dit pourquoi. Un **refus
 * d'offre** était alors indiscernable
 * d'une **panne réseau**, elle-même indiscernable d'une **erreur serveur**.
 *
 * Le prix est connu : quatre signalements de testeurs sur l'égaliseur, dont
 * celui de BARATOUX (fil 1383) qui n'a jamais pu être tranché — faute de
 * savoir si son réglage était refusé ou simplement inerte.
 *
 * # Pourquoi une table de motifs, et pas un message unique
 *
 * C'est la leçon de `refusModuleSortie.ts` (#2392), écrit pour le même défaut
 * sur les modules de sortie : deux refus qui ne se réparent PAS de la même
 * façon ne doivent pas partager un message. Envoyer « erreur » à quelqu'un
 * dont le serveur est éteint, et le même « erreur » à quelqu'un à qui il
 * manque une licence, c'est n'avoir rien dit à ni l'un ni l'autre.
 *
 * Et comme là-bas, il y a un motif fourre-tout, `MOTIF_INCONNU`. Ce n'est pas
 * une politesse : c'est la seule façon de ne jamais retomber dans le silence
 * si le serveur nomme demain un refus que cette interface ne connaît pas
 * encore. On prévient, on ne masque pas.
 *
 * # Ce qu'on lit, et pourquoi seulement ça
 *
 * Rien n'est deviné du serveur. Trois sources seulement, toutes présentes à
 * l'exécution :
 *
 *  - le **refus d'offre**, reconnu par `estRefusPremium` — la fonction
 *    partagée, qui lit les DEUX formes que `api.ts` produit : l'`Error` nue de
 *    message `premium_required` que `fetchJSON` lève sur un 402, et l'`ApiError`
 *    portant `status: 402` / `code: 'premium_required'` ;
 *  - le **statut HTTP** et le **code** que `apiError()` recopie depuis le
 *    corps (`err.status`, `err.code`) ;
 *  - le **message** du serveur, tel qu'il l'écrit.
 *
 * Une panne réseau n'a rien de tout ça : `fetchJSON` relève l'erreur de
 * `fetch` telle quelle, sans `status`. C'est cette ABSENCE qui la nomme, et
 * c'est pour ça qu'elle est testée en dernier — un `status` connu, même
 * inattendu, vient toujours d'un serveur qui a répondu.
 */
import { estRefusPremium } from './premiumRefus';

/** L'égaliseur est hors de l'offre en cours. Se répare en s'abonnant. */
export const REFUS_PREMIUM = 'refus_premium';
/** Aucune réponse : serveur éteint, réseau coupé, adresse changée. */
export const SERVEUR_INJOIGNABLE = 'serveur_injoignable';
/** Le jeton n'est plus valable — `fetchJSON` lève « Session expired » sur 401. */
export const SESSION_EXPIREE = 'session_expiree';
/** Le serveur a répondu, et il est en faute (5xx). */
export const PANNE_SERVEUR = 'panne_serveur';
/** Le serveur a répondu, et il refuse (4xx) — zone incompatible, corps invalide… */
export const REFUS_SERVEUR = 'refus_serveur';
/** Tout le reste. Voir l'en-tête : ce motif est la sortie du témoin. */
export const MOTIF_INCONNU = 'autre';

export type MotifEchec =
  | typeof REFUS_PREMIUM
  | typeof SERVEUR_INJOIGNABLE
  | typeof SESSION_EXPIREE
  | typeof PANNE_SERVEUR
  | typeof REFUS_SERVEUR
  | typeof MOTIF_INCONNU;

/** Un échec prêt à dire : son motif, sa phrase, et ce que le serveur a écrit. */
export interface EchecEq {
  motif: MotifEchec;
  /** La clé i18n de la phrase à montrer. Toujours renseignée. */
  cleI18n: string;
  /**
   * Le message du serveur, tel qu'il l'écrit — à accoler à la phrase quand il
   * existe. `null` quand il n'en donne pas, ou quand le montrer n'apprendrait
   * rien (une trace de `fetch`, un `premium_required` nu).
   */
  messageServeur: string | null;
  /** Le code du serveur (`error` dans le corps), ou `null`. */
  codeServeur: string | null;
  /** Le statut HTTP, ou `null` quand rien n'a répondu. */
  status: number | null;
}

const CLE_PAR_MOTIF: Record<MotifEchec, string> = {
  [REFUS_PREMIUM]: 'eq.premiumRequired',
  [SERVEUR_INJOIGNABLE]: 'eq.errorNetwork',
  [SESSION_EXPIREE]: 'eq.errorSession',
  [PANNE_SERVEUR]: 'eq.errorServerFault',
  // « Réglage non appliqué — le serveur l'a refusé » : la phrase existait déjà,
  // et c'est exactement ce cas-là.
  [REFUS_SERVEUR]: 'eq.applyFailed',
  [MOTIF_INCONNU]: 'eq.applyFailed',
};

/** Une chaîne non vide, débarrassée de ses blancs, ou `null`. */
function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const net = valeur.trim();
  return net.length > 0 ? net : null;
}

/**
 * Les messages qui n'apprennent rien à l'utilisateur : soit ils redisent la
 * phrase traduite qu'on affiche déjà, soit ce sont des traces techniques.
 */
const MESSAGES_MUETS = new Set(['premium_required', 'Session expired', 'Failed to fetch']);

/**
 * Le motif d'un échec, tel qu'on peut l'affirmer.
 *
 * L'ordre des tests porte le sens : l'offre d'abord (c'est le cas qui a motivé
 * le ticket, et le seul que l'utilisateur peut réparer lui-même), la session
 * ensuite, puis ce que le statut HTTP dit, et enfin l'absence de statut — qui
 * ne peut plus vouloir dire qu'une chose : personne n'a répondu.
 */
export function motifDEchec(e: unknown): EchecEq {
  // Tout ce que la couche API lève est une `Error` : `fetchJSON` relève
  // l'erreur de `fetch`, ou construit un `ApiError`. Lire `status` sur autre
  // chose — un objet nu attrapé au vol, une chaîne — reviendrait à croire un
  // champ que personne n'a écrit, et c'est la règle que `estRefusPremium`
  // applique déjà. On rend alors le motif fourre-tout : on prévient sans
  // affirmer.
  if (!(e instanceof Error)) {
    return {
      motif: MOTIF_INCONNU,
      cleI18n: CLE_PAR_MOTIF[MOTIF_INCONNU],
      messageServeur: null,
      codeServeur: null,
      status: null,
    };
  }
  const err = e as Error & { code?: unknown; status?: unknown };
  const status =
    typeof err.status === 'number' && Number.isFinite(err.status) ? err.status : null;
  const codeServeur = texte(err.code);
  const brut = texte(err.message);
  const messageServeur = brut && !MESSAGES_MUETS.has(brut) ? brut : null;

  let motif: MotifEchec;
  if (estRefusPremium(e)) motif = REFUS_PREMIUM;
  else if (status === 401 || brut === 'Session expired') motif = SESSION_EXPIREE;
  else if (status !== null && status >= 500) motif = PANNE_SERVEUR;
  else if (status !== null && status >= 400) motif = REFUS_SERVEUR;
  else if (status === null && codeServeur === null) motif = SERVEUR_INJOIGNABLE;
  else motif = MOTIF_INCONNU;

  return { motif, cleI18n: CLE_PAR_MOTIF[motif], messageServeur, codeServeur, status };
}

/**
 * La phrase complète à montrer : le motif traduit, puis ce que le serveur a
 * écrit quand il a écrit quelque chose.
 *
 * `traduire` est passé plutôt qu'importé : ce module reste pur, et le test
 * n'a pas à monter le magasin i18n pour vérifier une composition de chaînes.
 *
 * Le message du serveur est en anglais (`premium_guard.rs` compose le sien
 * avec `feature.display_name()`), donc il vient APRÈS la phrase traduite,
 * jamais à sa place : c'est la règle posée en #2419, et le défaut qu'elle
 * répare — un message anglais montré tel quel dans une interface en dix autres
 * langues.
 */
export function phraseEchec(traduire: (cle: string) => string, echec: EchecEq): string {
  const base = traduire(echec.cleI18n);
  const detail = echec.messageServeur ?? echec.codeServeur;
  return detail ? `${base} : ${detail}` : base;
}
