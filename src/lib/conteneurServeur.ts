/**
 * « Redémarrer le serveur » dans un conteneur — #2414 (tune-server-rust#7074).
 *
 * ## Ce que fait le bouton, établi dans le code du serveur (rc9)
 *
 * `POST /system/restart` relance le binaire EN PLACE (`execv`, même PID). Dans
 * l'image Docker, le point d'entrée fait `exec` du serveur : il est le PID 1,
 * et le conteneur reste debout. Si l'`execv` échoue, le serveur sort et le
 * conteneur s'arrête — il ne revient que sous une politique de redémarrage
 * (`restart: unless-stopped` dans le `docker-compose.yml` fourni). C'est
 * pourquoi le message dit les deux : Tune se relance seul, et sinon voici la
 * commande.
 *
 * Le serveur annonce son moteur par `GET /system/env` (`container`). Un serveur
 * plus ancien ne l'annonce pas : aucun message de conteneur, comme avant.
 */

export interface InfoConteneur {
  /** Nom du moteur, tel qu'on l'écrit : « Docker », « Podman », « Kubernetes ». */
  moteur: string;
  /** La commande à taper si le serveur ne revient pas. */
  commande: string;
}

export function infoConteneur(
  env: { container?: string | null; container_id?: string | null } | null | undefined,
): InfoConteneur | null {
  const id = env?.container_id || '<name>';
  switch (env?.container) {
    case 'docker':
      return { moteur: 'Docker', commande: `docker restart ${id}` };
    case 'podman':
      return { moteur: 'Podman', commande: `podman restart ${id}` };
    case 'kubernetes':
      return { moteur: 'Kubernetes', commande: 'kubectl rollout restart deployment/<name>' };
    default:
      return null;
  }
}
