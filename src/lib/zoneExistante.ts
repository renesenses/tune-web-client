/**
 * tune-server-rust#8987 (fil 2708) — un appareil déjà lié à une zone.
 *
 * Le serveur refuse désormais en `409` les deux gestes qui butaient en
 * silence (ou en 500) sur une zone existante :
 *
 * - « Nouvelle zone » sur un appareil qui a déjà une zone visible :
 *   `zone_existe_deja`, avec `zone_id` / `zone_name` ;
 * - changer l'appareil d'une zone vers un appareil tenu par une autre zone
 *   active : `sortie_tenue_par_une_zone`, avec `holder_zone_id` /
 *   `holder_zone_name`.
 *
 * Les deux portent la phrase traduite par le serveur (`message`). L'écran la
 * montre et propose d'ouvrir ou de renommer la zone nommée.
 */

export interface ZoneExistante {
  id: number;
  nom: string;
  /** `existe` : l'appareil a déjà cette zone (« Nouvelle zone ») ; `tenue` :
   *  cette AUTRE zone tient l'appareil demandé (changement d'appareil). */
  motif: 'existe' | 'tenue';
  /** La phrase du serveur, ou `null` : l'écran compose alors la sienne. */
  message: string | null;
}

export const CODE_ZONE_EXISTE_DEJA = 'zone_existe_deja';
export const CODE_SORTIE_TENUE = 'sortie_tenue_par_une_zone';

/** La zone existante qu'un refus `409` nomme, ou `null` pour tout autre échec. */
export function zoneExistanteDuRefus(err: unknown): ZoneExistante | null {
  const e = err as { status?: number; code?: string; message?: unknown; corps?: unknown } | null;
  if (!e || e.status !== 409) return null;
  const corps = (e.corps && typeof e.corps === 'object' ? e.corps : {}) as Record<string, unknown>;
  const code = e.code ?? (typeof corps.code === 'string' ? corps.code : undefined);
  let id: unknown;
  let nom: unknown;
  if (code === CODE_ZONE_EXISTE_DEJA) {
    id = corps.zone_id;
    nom = corps.zone_name;
  } else if (code === CODE_SORTIE_TENUE) {
    id = corps.holder_zone_id;
    nom = corps.holder_zone_name;
  } else {
    return null;
  }
  if (typeof id !== 'number' || !Number.isFinite(id)) return null;
  // Le message n'est repris que s'il vient traduit du serveur (`message_key`).
  const message =
    typeof corps.message_key === 'string' && typeof e.message === 'string' && e.message.trim()
      ? e.message
      : null;
  return {
    id,
    nom: typeof nom === 'string' ? nom : '',
    motif: code === CODE_ZONE_EXISTE_DEJA ? 'existe' : 'tenue',
    message,
  };
}

/**
 * tune-server-rust#8987 — la phrase d'avertissement qu'une restauration
 * (`POST /zones/{id}/restaurer`, ou `POST /zones` qui ressuscite une zone
 * supprimée) pose sur sa réponse : zone née sous l'autre hôte audio, ou
 * sortie reprise par une autre zone. `null` sinon.
 */
export function avertissementDeRestauration(reponse: unknown): string | null {
  const a = (reponse as { avertissement_restauration?: { message?: unknown } } | null | undefined)
    ?.avertissement_restauration;
  const m = a?.message;
  return typeof m === 'string' && m.trim() ? m : null;
}
