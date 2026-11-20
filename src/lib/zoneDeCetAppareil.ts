/**
 * « Ce téléphone » — la zone navigateur de CET appareil, en un appui.
 *
 * Essai en 5G du 09/10/2026, Bertrand : « Il me faut sur l'iPhone une sortie
 * sur cet iPhone !! », puis « Je ne vois pas de zone téléphone ! ». Les zones
 * navigateur existaient (« Cet ordinateur », « aPhone »), mais rien ne disait
 * laquelle était CE téléphone, et la création d'une zone vivait dans l'écran
 * Zones, loin de la barre de lecture.
 *
 * Une zone navigateur n'appartient à aucune machine côté serveur
 * (`output_device_id: null`, voir `zoneNavigateur.ts`) : c'est donc CET
 * appareil qui retient la sienne.
 * Deux appareils sur la même zone navigateur se voleraient le flux (session
 * à consommateur unique) : chaque appareil a la sienne.
 *
 * 🔴 web#3180 — la retenue passe par `retenirZoneDeCetAppareil`, la clé de
 * `zoneNavigateurProprietaire.ts` (pour l'onglet). Avant, « Ce téléphone »
 * rangeait la sienne sous une autre clé : la zone qu'il créait ou retrouvait
 * n'était pas jouable ici dès que ce navigateur en avait retenu une autre.
 *
 * Ordre de résolution :
 *   1. la dernière zone retenue qui est encore une zone navigateur ;
 *   2. une zone navigateur qui porte déjà le nom proposé (onglet neuf,
 *      navigation privée) — on ne recrée pas un doublon ;
 *   3. sinon on la crée, et on la retient.
 */
import type { ZoneCandidate } from './zoneNavigateur';
import {
  derniereZoneRetenue,
  retenirZoneDeCetAppareil,
  zonesRetenues,
} from './zoneNavigateurProprietaire';

export function idRetenu(): number | null {
  return derniereZoneRetenue();
}

function retenir(id: number): void {
  retenirZoneDeCetAppareil(id);
}

export async function zoneDeCetAppareil(
  zones: readonly ZoneCandidate[],
  nom: string,
  creer: (nom: string) => Promise<{ id?: number | null } | null | undefined>,
): Promise<number> {
  const navigateurs = zones.filter((z) => z?.output_type === 'browser' && z.id != null);
  const retenues = zonesRetenues() ?? [];
  for (let i = retenues.length - 1; i >= 0; i--) {
    if (navigateurs.some((z) => z.id === retenues[i])) return retenues[i];
  }
  // Le serveur suffixe le nom d'une zone navigateur par l'IP du client
  // (`create_zone_handler`) : « Ce téléphone (127.0.0.1) » par le pont.
  const base = nom.trim();
  const homonyme = navigateurs.find((z) => {
    const n = (z.name ?? '').trim();
    return n === base || n.startsWith(`${base} (`);
  });
  if (homonyme?.id != null) {
    retenir(homonyme.id);
    return homonyme.id;
  }
  const cree = await creer(nom);
  if (cree?.id == null) throw new Error('zone navigateur non créée');
  retenir(cree.id);
  return cree.id;
}
