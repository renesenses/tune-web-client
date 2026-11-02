/**
 * Écouter une fiche de l'annuaire des radios — le geste partagé par l'onglet
 * « Annuaire » et la « Carte » de la page Radio (tune-server-rust#6516,
 * web#2400).
 *
 * Une fiche déjà dans « Mes radios » se joue comme sa station ; les autres,
 * par la route de l'annuaire, sans rien ajouter. Sur une zone NAVIGATEUR, le
 * serveur rend l'adresse du flux et c'est la page qui le lit ; sur la zone
 * navigateur d'un autre appareil, on le dit et on propose de la jouer ici.
 *
 * Rend `false` quand la lecture n'a pas pu être lancée (l'appelant affiche son
 * message), `true` sinon. Ne choisit pas la zone : `zoneId` vient de
 * `zoneRequise()`, qui a déjà prévenu l'utilisateur si aucune n'est choisie.
 */
import { get } from 'svelte/store';
import * as api from './api';
import type { FicheAnnuaireRadio } from './api/annuaireRadios';
import { currentZone } from './stores/zones';
import { browserPlay } from './stores/browserAudio';
import { estZoneJouableIci } from './zoneNavigateurProprietaire';
import { signalerZoneNavigateurJoueeAilleurs } from './zoneNavigateurRevendication';
import { messageRefusPaysRadio } from './refusPaysRadio';
import { notifications } from './stores/notifications';

export async function ecouterFicheAnnuaire(
  f: Pick<FicheAnnuaireRadio, 'external_id' | 'my_radio_id'>,
  zoneId: number,
  onRefusPays?: (message: string) => void,
): Promise<boolean> {
  try {
    const res: any = f.my_radio_id != null
      ? await api.playRadio(f.my_radio_id, zoneId)
      : await api.jouerDepuisAnnuaire(f.external_id, zoneId);
    const zone = get(currentZone);
    if (estZoneJouableIci(zone) && res?.stream_url) browserPlay(res.stream_url, false, zoneId);
    else if (res?.stream_url) {
      const url = res.stream_url as string;
      signalerZoneNavigateurJoueeAilleurs(zone, () => browserPlay(url, true, zoneId));
    }
    return true;
  } catch (cause) {
    const refus = messageRefusPaysRadio(cause);
    if (refus) {
      if (!(cause as { dejaAnnonce?: boolean }).dejaAnnonce) notifications.error(refus);
      onRefusPays?.(refus);
    }
    return false;
  }
}
