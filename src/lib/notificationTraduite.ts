/**
 * 🔴 UNE ANNONCE DE DÉMARRAGE SUIT LA LANGUE CHOISIE.
 *
 * Constaté sur un vrai serveur, interface en anglais : « Profil : Bertrand.
 * Ce navigateur ne se souvenait plus de son profil… » s'affichait en
 * FRANÇAIS. Le cache vidé (c'est précisément le cas où cette annonce part),
 * `localStorage` ne porte plus la langue : le client démarre dans celle du
 * navigateur. La langue CHOISIE n'arrive qu'avec `syncPreferencesFromServer`,
 * qui part en même temps que l'annonce (`v2Bootstrap`), puis `ShellV2` la
 * pose (`locale.set`) — après. Un `get(t)(…)` figé au moment de l'annonce
 * gardait donc la langue du navigateur pour toute sa durée d'affichage.
 *
 * Plutôt que d'attendre une langue « prête » (il n'y a pas de tel signal : la
 * préférence peut aussi ne jamais venir, serveur muet), la notification est
 * RETRADUITE à chaque changement de langue tant qu'elle est affichée. Elle
 * part tout de suite, et finit dans la bonne langue quoi qu'il arrive.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';

export type Traduire = (cle: string) => string;

/**
 * Pousse une notification par `pousser` (ex. `(m) => notifications.info(m, 12000)`),
 * avec le texte `rendre(t)`, puis la retraduit tant qu'elle est affichée.
 * Rend l'identifiant de la notification.
 */
export function notifierTraduit(pousser: (message: string) => number, rendre: (tr: Traduire) => string): number {
  const id = pousser(rendre(get(t)));
  let fini = false;
  let arreterT: (() => void) | undefined;
  let arreterN: (() => void) | undefined;
  const arreter = () => {
    fini = true;
    arreterT?.();
    arreterN?.();
  };
  arreterN = notifications.subscribe((liste) => {
    if (!fini && !liste.some((n) => n.id === id)) arreter();
  });
  if (fini) { arreterN(); return id; }
  arreterT = t.subscribe((tr) => {
    if (!fini) notifications.remplacerMessage(id, rendre(tr));
  });
  if (fini) arreterT();
  return id;
}
