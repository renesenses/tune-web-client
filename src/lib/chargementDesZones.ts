/**
 * L'état du CHARGEMENT des zones, distinct de leur nombre — #1096.
 *
 * Le fait, Mac Studio de Bertrand, 17/09/2026, juste après le DMG v0.9.152 :
 * l'écran Zones annonçait « Aucune zone. Créez-en une… » pendant que
 * `curl http://localhost:8888/api/v1/zones` en rendait QUATORZE sur le même
 * serveur. Quelques minutes plus tard, sans rien changer, les zones étaient
 * là.
 *
 * La cause n'est pas dans la liste, elle est dans ce que le client en conclut.
 * `zones` est un `writable<Zone[]>([])` : il vaut `[]` avant tout appel, `[]`
 * quand l'appel échoue, et `[]` quand le serveur n'a réellement aucune zone.
 * `bootstrapV2` enveloppe d'ailleurs les chargements dans un
 * `Promise.allSettled` — un `/zones` qui jette pendant le redémarrage qui suit
 * toute mise à jour est donc avalé en silence, et le magasin reste à sa valeur
 * initiale. Trois situations très différentes, un seul `$zones.length === 0` :
 * l'écran choisissait la plus alarmante des trois et invitait à recréer ce qui
 * existait déjà.
 *
 * Deux choses ici, et rien d'autre :
 *
 * 1. un état explicite — `jamais` / `chargement` / `chargees` / `echec` — pour
 *    que « la liste est vide » cesse d'être la même phrase que « je n'ai pas
 *    pu la charger » ;
 * 2. quelques ESSAIS : la fenêtre de redémarrage se compte en secondes, un
 *    seul appel tombé dedans condamnait l'écran jusqu'au rechargement manuel.
 *
 * `listeVraimentVide()` est la garde à utiliser partout où l'on veut dire
 * « aucune zone » à l'utilisateur, ou lui proposer d'en créer une : elle
 * n'est vraie qu'après un chargement RÉUSSI. C'est aussi ce qui répond au
 * second point de l'issue — ne jamais rien créer sur la foi d'une liste vide
 * obtenue dans cette fenêtre.
 */
import { writable, get } from 'svelte/store';
import type { Zone } from './types';
import * as api from './api';

export type EtatDesZones = 'jamais' | 'chargement' | 'chargees' | 'echec';

export const etatDesZones = writable<EtatDesZones>('jamais');

/**
 * Peut-on affirmer à l'utilisateur qu'il n'a AUCUNE zone ?
 *
 * Seulement après un chargement réussi. Tant que l'état est `jamais`,
 * `chargement` ou `echec`, une liste vide ne dit rien du serveur.
 */
export function listeVraimentVide(etat: EtatDesZones, nombre: number): boolean {
  return etat === 'chargees' && nombre === 0;
}

/** Essais et attente : la fenêtre de redémarrage mesurée se compte en
 *  secondes, pas en minutes — trois essais espacés de 1,5 s la couvrent sans
 *  faire patienter un serveur réellement absent. */
export const ESSAIS = 3;
export const PAUSE_MS = 1500;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Charge la liste des zones, avec essais, et tient `etatDesZones` à jour.
 *
 * Ne jette pas : l'appelant lit l'état. Rend la liste chargée, ou `null` quand
 * tous les essais ont échoué — et dans ce cas le magasin passé en argument
 * n'est PAS écrasé, pour qu'un écran déjà peuplé ne se vide pas sous les yeux
 * de l'utilisateur à cause d'un relevé tombé pendant un redémarrage.
 */
export async function chargerLesZones(
  poser: (zs: Zone[]) => void,
  charger: () => Promise<Zone[]> = api.getZones,
  essais: number = ESSAIS,
  pause: number = PAUSE_MS,
): Promise<Zone[] | null> {
  etatDesZones.set(get(etatDesZones) === 'chargees' ? 'chargees' : 'chargement');
  for (let i = 0; i < essais; i++) {
    try {
      const liste = (await charger()) ?? [];
      poser(liste);
      etatDesZones.set('chargees');
      return liste;
    } catch {
      if (i < essais - 1) await dormir(pause);
    }
  }
  etatDesZones.set('echec');
  return null;
}
