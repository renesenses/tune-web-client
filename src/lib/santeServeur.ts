/**
 * L'état de santé du serveur, tel que la barre latérale le montre.
 *
 * Porté de l'ancienne interface : sa barre sondait `GET /system/health/monitor`
 * toutes les minutes, et `App.svelte` traitait l'événement
 * `system.health_alert`. Dans cette interface, un serveur en état critique ne
 * se signalait nulle part.
 *
 * La règle d'escalade vit ici pour qu'un test l'APPELLE : une alerte
 * `warning` ne fait jamais redescendre un état `critical` — seule la sonde,
 * qui lit l'état complet, peut le faire.
 */
import type { HealthStatus } from './stores/health';

export function niveauApresAlerte(courant: HealthStatus, alerte: unknown): HealthStatus {
  if (alerte === 'critical') return 'critical';
  if (alerte === 'warning') return courant === 'critical' ? 'critical' : 'warning';
  return courant;
}

/** Ce que la sonde rend, ramené aux trois états connus — le reste vaut `ok`. */
export function niveauDeLaSonde(status: unknown): HealthStatus {
  return status === 'critical' || status === 'warning' ? status : 'ok';
}
