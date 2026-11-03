/**
 * URL de départ du SSO Mozaiklabs, avec la langue et le thème de l'interface.
 *
 * La page de connexion de mozaiklabs.fr lit `ui_locales` et `theme` (PR
 * renesenses/site-mozaiklabs#376) pour s'afficher dans la langue et aux
 * couleurs de Tune. Le navigateur arrive sur le serveur Tune
 * (`/cloud/sso/authorize`), qui valide les deux valeurs puis les recopie dans
 * l'URL d'autorisation : ici on ne fait que les transmettre.
 *
 * Une valeur inconnue n'est pas envoyée (le serveur l'ignorerait de toute
 * façon) : la page de connexion garde alors sa langue et sa palette d'origine.
 */
import { get } from 'svelte/store';
import { locale, localeNames } from './i18n';
import { isV2Theme } from './v2Theme';

/** Thème posé sur <html> (`data-v2-theme`), ou null s'il est absent / inconnu. */
function themeCourant(): string | null {
  try {
    const t = document.documentElement.getAttribute('data-v2-theme');
    return isV2Theme(t) ? t : null;
  } catch {
    return null; // SSR / environnement sans DOM
  }
}

export function urlSsoAuthorize(base: string): string {
  const params = new URLSearchParams();
  const langue = get(locale);
  if (typeof langue === 'string' && langue in localeNames) {
    params.set('ui_locales', langue);
  }
  const theme = themeCourant();
  if (theme) params.set('theme', theme);
  const requete = params.toString();
  return `${base}/cloud/sso/authorize${requete ? `?${requete}` : ''}`;
}
