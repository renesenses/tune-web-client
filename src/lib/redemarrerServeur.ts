/**
 * « Redémarrer le serveur » depuis le message qui le demande — web#2534
 * (fil 2533, alec_eiffel : « serait plus simple d'avoir à côté un bouton
 * "redémarrer le serveur" pour ne pas avoir à aller dans les menus »).
 *
 * Le geste existait déjà sur la carte d'un greffon natif installé
 * (`PluginsV2`) : confirmation, `POST /system/restart`, puis rechargement
 * quand le serveur répond. Il vit ici pour servir aussi aux bandeaux
 * « Redémarrez le serveur… » (Extensions, Égaliseur) sans être recopié.
 *
 * Rend `true` si le redémarrage est lancé, `false` si l'utilisateur a refusé
 * ou si le serveur a répondu par une erreur applicative (alors dite).
 */
import { get } from 'svelte/store';
import * as api from './api';
import { dialogs } from './stores/dialogs';
import { notifications } from './stores/notifications';
import { t } from './i18n';
import { errText } from './utils';
import { attendreRetourEtRecharger } from './retourDuServeur';

export async function redemarrerServeurConfirme(surRenoncement?: () => void): Promise<boolean> {
  const tr = get(t);
  if (!(await dialogs.confirm(tr('settings.restartConfirm' as any), { danger: true }))) return false;
  try {
    await api.restartServer();
  } catch (e) {
    // « Failed to fetch » = le redémarrage a commencé ; seule une erreur
    // applicative arrête ici (même règle que Réglages).
    const msg = errText(e);
    if (msg !== null) { notifications.error(msg); return false; }
  }
  attendreRetourEtRecharger({
    sonder: () => api.getHealth(),
    recharger: () => window.location.reload(),
    renoncer: () => { surRenoncement?.(); notifications.error(get(t)('settings.updateReloadGaveUp' as any)); },
  });
  return true;
}
