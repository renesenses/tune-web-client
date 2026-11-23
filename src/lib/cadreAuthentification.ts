/**
 * Le bouton du message rouge « activez l'authentification » : il mène au
 * cadre Authentification des Réglages (Système), au lieu de laisser chercher
 * le chemin décrit en toutes lettres (« Réglages > Système > Authentification »).
 *
 * Les magasins de navigation sont chargés à la demande : `api.ts` porte ce
 * bouton, et une importation directe refermerait un cycle de modules.
 */
import type { V2SettingsTarget } from './stores/v2SettingsNav';

/** La cible du bouton : l'onglet Système, le cadre et son réglage. */
export const CIBLE_CADRE_AUTHENTIFICATION: V2SettingsTarget = {
  tab: 'system',
  section: 'authActivation',
  reglage: 'activation-authentification',
};

/** Ouvre les Réglages sur le cadre Authentification. */
export async function ouvrirCadreAuthentification(): Promise<void> {
  const [{ v2SettingsTarget }, { activeView }] = await Promise.all([
    import('./stores/v2SettingsNav'),
    import('./stores/navigation'),
  ]);
  v2SettingsTarget.set({ ...CIBLE_CADRE_AUTHENTIFICATION });
  activeView.set('settings');
}

/** Le bouton d'une notification : libellé traduit, geste. */
export function actionCadreAuthentification(tr: (cle: string) => string): { label: string; run: () => void } {
  return {
    label: tr('machineAction.openAuthSettings'),
    run: () => { void ouvrirCadreAuthentification(); },
  };
}
