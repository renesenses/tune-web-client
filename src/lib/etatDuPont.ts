/**
 * Ce que les Réglages disent quand le pont est activé mais « Déconnecté »
 * (tune-server-rust#7714).
 *
 * Avant, une seule phrase pour tous les cas : « Redémarrez le serveur pour
 * qu'il se connecte au relais. » Un testeur l'a lue avec un serveur à jour
 * qui ne revenait pas, a redémarré pour rien, et n'a jamais su pourquoi.
 * Un serveur récent (`client_lance` présent dans `/cloud/bridge/status`)
 * relance seul son client de relais et dit pourquoi la dernière tentative a
 * échoué (`derniere_erreur`) : on le répète. Le redémarrage n'est plus
 * proposé qu'à un serveur antérieur, qui n'a pas d'autre remède.
 */

export interface EtatDuPont {
  enabled?: boolean;
  connected?: boolean;
  client_lance?: boolean;
  premium?: boolean;
  derniere_erreur?: string | null;
}

export interface MessageDuPont {
  cle: string;
  raison?: string;
}

/** `null` quand il n'y a rien à dire (pont éteint, ou connecté). */
export function messageDuPont(e: EtatDuPont | null | undefined): MessageDuPont | null {
  if (!e?.enabled || e.connected) return null;
  if (e.client_lance === undefined) return { cle: 'settings.restartToReachRelay' };
  if (e.premium === false) return { cle: 'settings.relayNeedsPremium' };
  const raison = (e.derniere_erreur ?? '').trim();
  if (!e.client_lance || !raison) return { cle: 'settings.relayConnecting' };
  if (raison.includes('cle du serveur requise')) return { cle: 'settings.relayKeyRefused' };
  if (raison.startsWith('relay rejected')) {
    return { cle: 'settings.relayRejected', raison: raison.replace(/^relay rejected:\s*/, '') };
  }
  return { cle: 'settings.relayUnreachable', raison };
}

/** Relire l'état tant que le pont est activé et pas connecté. */
export function relirePont(e: EtatDuPont | null | undefined): boolean {
  return !!e?.enabled && !e.connected;
}
