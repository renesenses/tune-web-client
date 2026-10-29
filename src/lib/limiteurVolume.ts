/**
 * Limiteur d'envoi du volume : une commande tout de suite, puis au plus une
 * toutes les `delaiMs`, la DERNIÈRE valeur l'emportant.
 *
 * Le curseur principal (`VolumeControl`) portait cette règle en copie locale ;
 * celui de la fenêtre mobile (`TransportBar.handleMobileVolume`) n'en avait
 * aucune et envoyait un `PUT /zones/{id}/volume` à chaque événement `input`
 * (fil forum 2129). Une seule règle, partagée, pour que les deux curseurs ne
 * divergent plus.
 */
export const DELAI_VOLUME_MS = 80;

export type LimiteurVolume = ((envoi: () => void) => void) & { annuler(): void };

export function creerLimiteurVolume(delaiMs = DELAI_VOLUME_MS): LimiteurVolume {
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let enAttente: (() => void) | null = null;
  const envoyer = (envoi: () => void) => {
    enAttente = envoi;
    if (minuteur) return;
    const maintenant = enAttente;
    enAttente = null;
    maintenant();
    minuteur = setTimeout(() => {
      minuteur = null;
      const dernier = enAttente;
      enAttente = null;
      dernier?.();
    }, delaiMs);
  };
  return Object.assign(envoyer, {
    annuler() {
      if (minuteur !== null) clearTimeout(minuteur);
      minuteur = null;
      enAttente = null;
    },
  });
}
