/**
 * Lecture du verdict de `POST /cloud/license/validate`.
 *
 * 🔴 Cette route répond **HTTP 200 dans tous ses cas d'échec** : réseau
 * injoignable, statut HTTP distant, corps illisible, endpoint absent, refus
 * non autoritaire. Rien ne lève. Le verdict vit UNIQUEMENT dans le champ
 * `status` du corps. Un client qui se contente de « l'appel n'a pas jeté »
 * annonce donc un succès à chaque fois — c'est exactement ce qu'a vécu Bruno
 * Lescarret : trois « Licence validée » sur deux jours, et une ligne de
 * licence que le serveur n'a jamais touchée (#570).
 *
 * Contrat établi en lisant la route elle-même
 * (`tune-server/src/routes/cloud.rs`, `license_validate`, dépôt serveur, main) :
 *
 * | `status`     | ce que le serveur a fait                                      |
 * |--------------|---------------------------------------------------------------|
 * | `validated`  | `update_from_server` appelé : le palier distant est POSÉ       |
 * | `invalid`    | expiration passée confirmée : le palier est ramené à `free`    |
 * | `cached`     | RIEN n'a été posé (endpoint 404, ou refus non autoritaire)     |
 * | `error`      | RIEN n'a été posé (réseau, statut HTTP distant, corps illisible)|
 * | `no_license` | aucune clé enregistrée sur ce serveur                          |
 *
 * Le champ `message` est composé **en anglais** côté serveur : il ne doit
 * jamais être affiché tel quel dans une interface traduite. On n'en extrait
 * que le statut HTTP distant, que la route y écrit sous une forme fixe
 * (`format!("Server returned {status}")`), pour distinguer un plafond de
 * requêtes atteint d'un serveur en erreur — les deux donnaient jusqu'ici
 * le même écran.
 */

/** Le corps que la route renvoie — tous les champs sont facultatifs. */
export interface ReponseValidationLicence {
  status?: string | null;
  tier?: string | null;
  /** Anglais, composé côté serveur. Jamais affiché : seul son code en sort. */
  message?: string | null;
  cached?: boolean | null;
  expires_at?: string | null;
  last_validated?: string | null;
}

/** L'état de licence relu APRÈS la validation, celui qui pilote le badge. */
export interface EtatLicenceApres {
  tier: string;
  /** Vrai quand la licence est tenue par un autre serveur de l'utilisateur. */
  conflitDeSession: boolean;
}

export interface VerdictValidationLicence {
  /** Vrai seulement si la licence est RÉELLEMENT posée en premium ici. */
  succes: boolean;
  /** Clé i18n du message à afficher. */
  cle: string;
  /** Statut HTTP renvoyé par mozaiklabs.fr, quand la route le porte. */
  statutDistant: number | null;
  /** Vrai quand il faut armer le repos d'une minute (plafond atteint). */
  repos: boolean;
}

/**
 * Les deux paliers que l'application traite comme premium — même règle que le
 * badge (`isPremium` dans `stores/license.ts`). Le message et le badge doivent
 * dire la même chose : c'est tout l'objet du ticket.
 */
const PALIERS_PREMIUM = new Set(['premium', 'pro']);

/**
 * Le statut HTTP distant, extrait du seul endroit où la route l'écrit.
 *
 * `format!("Server returned {status}")` où `{status}` est un `StatusCode` :
 * « Server returned 429 Too Many Requests ». Les autres messages (`Validation
 * request failed: …`, `Failed to parse response: …`) ne portent pas de statut
 * — il n'y en a pas eu, la requête n'a jamais abouti.
 */
export function statutDistantDepuisMessage(message?: string | null): number | null {
  if (!message) return null;
  const m = /^Server returned (\d{3})\b/.exec(message);
  if (!m) return null;
  const code = Number(m[1]);
  return Number.isFinite(code) ? code : null;
}

function echec(cle: string, statutDistant: number | null = null, repos = false): VerdictValidationLicence {
  return { succes: false, cle, statutDistant, repos };
}

/**
 * Ce qu'il faut dire à l'écran, d'après ce que le serveur a réellement fait.
 *
 * Le succès demande DEUX choses, jamais une seule : le serveur dit avoir posé
 * le palier (`status: "validated"`), ET l'état relu derrière montre bien le
 * premium. Une validation confirmée qui laisse le badge sur `FREE` n'est pas
 * un succès : c'est précisément l'écran mensonger du ticket.
 */
export function verdictValidationLicence(
  reponse: ReponseValidationLicence | null | undefined,
  apres: EtatLicenceApres,
): VerdictValidationLicence {
  switch (reponse?.status ?? null) {
    case 'validated':
      if (PALIERS_PREMIUM.has(apres.tier)) {
        return { succes: true, cle: 'settings.licenseValidated', statutDistant: null, repos: false };
      }
      // La licence est bonne mais elle est ouverte ailleurs : le dire, sinon
      // l'utilisateur cherche la panne du mauvais côté.
      if (apres.conflitDeSession) return echec('settings.licenseSessionConflictTitle');
      return echec('settings.licenseValidatedNotPremium');
    case 'invalid':
      return echec('settings.licenseInvalidOrExpired');
    case 'no_license':
      return echec('settings.licenseNoKey');
    case 'cached':
      return echec('settings.licenseNotConfirmed');
    case 'error': {
      const code = statutDistantDepuisMessage(reponse?.message);
      // 429 : le plafond de requêtes du site est atteint. C'est un refus du
      // serveur DISTANT, traduit en 200 par la route locale — le `catch` sur
      // `e.status === 429` ne pouvait donc jamais le voir.
      if (code === 429) return echec('settings.licenseRateLimited', 429, true);
      if (code !== null) return echec('settings.licenseValidateServerError', code);
      return echec('settings.licenseValidateUnreachable');
    }
    default:
      // Un `status` inconnu d'un serveur plus récent : on ne l'invente pas en
      // succès. Le repli reste un échec lisible.
      return echec('settings.licenseValidationError');
  }
}
