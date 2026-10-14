/**
 * web#2144 — une zone navigateur que ce navigateur ne reconnaît pas comme la
 * sienne ne reste plus muette en silence : on le dit, et on propose de la
 * revendiquer.
 *
 * Bilou, fil 2252 (rc4, Windows) : sa zone navigateur d'avant la rc4 ne
 * jouait plus rien. Depuis `cdf7e978`, ce navigateur ne lit que les zones
 * qu'il a retenues (`zoneNavigateurProprietaire.ts`) et, tant qu'il n'en a
 * retenu aucune, celles qui portent le nom du web (« Cet ordinateur »). Une
 * zone renommée, ou toute zone dès qu'une autre a été retenue, devenait
 * muette : aucune ligne côté client, le serveur l'arrêtait seul au bout de
 * quelques secondes.
 *
 * ## La règle
 *
 * On ne revient PAS à « toute zone navigateur se joue ici » : c'est ce qui
 * vidait le flux de la zone d'un téléphone (10/10, .18). La lecture locale
 * d'une zone non retenue reste une décision de l'utilisateur. Quand il lance
 * (ou voit démarrer, sur la zone qu'il a choisie ici) une lecture sur une telle
 * zone, un message le dit et offre « La jouer sur cet appareil » : ce geste
 * retient la zone pour ce navigateur et lance le flux tout de suite. Les
 * lectures suivantes se jouent ensuite ici sans rien demander.
 *
 * Un message par zone et par minute au plus : un même lancement passe par
 * plusieurs chemins (réponse de l'API, puis `playback.started`), et un
 * changement de piste ne doit pas le répéter.
 */
import { get } from 'svelte/store';
import { notifications } from './stores/notifications';
import { t } from './i18n';
import { estZoneJouableIci, retenirZoneDeCetAppareil } from './zoneNavigateurProprietaire';

interface ZoneNavigateur {
  id?: number | null;
  name?: string | null;
  output_type?: string | null;
}

const INTERVALLE_MS = 60_000;
const dernierMessage = new Map<number, number>();

/** Pour les bancs : oublie les messages déjà montrés. */
export function oublierMessagesZoneAilleurs(): void {
  dernierMessage.clear();
}

/**
 * Une lecture vient d'être lancée sur `zone`. Si c'est une zone navigateur que
 * ce navigateur ne joue pas, le dire et proposer de la revendiquer. Rend
 * `true` quand le message a été montré.
 *
 * `jouerIci` lance le flux de la zone dans ce navigateur ; il est appelé après
 * la revendication, seulement si l'utilisateur la demande.
 */
export function signalerZoneNavigateurJoueeAilleurs<Z extends ZoneNavigateur>(
  zone: Z | null | undefined,
  jouerIci: (zone: Z) => void,
): boolean {
  if (!zone || zone.output_type !== 'browser' || typeof zone.id !== 'number') return false;
  if (estZoneJouableIci(zone)) return false;
  const maintenant = Date.now();
  const avant = dernierMessage.get(zone.id);
  if (avant != null && maintenant - avant < INTERVALLE_MS) return false;
  dernierMessage.set(zone.id, maintenant);

  const traduire = get(t);
  const id = zone.id;
  notifications.withAction(
    traduire('v2.zone.browserOtherDevice' as any).replace('{nom}', zone.name ?? ''),
    traduire('v2.zone.browserPlayHere' as any),
    () => {
      retenirZoneDeCetAppareil(id);
      jouerIci(zone);
    },
    15000,
  );
  return true;
}
