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
 * appareil qui retient la sienne, par son identifiant dans `localStorage`.
 * Deux appareils sur la même zone navigateur se voleraient le flux (session
 * à consommateur unique) : chaque appareil a la sienne.
 *
 * Ordre de résolution :
 *   1. l'identifiant retenu, s'il désigne encore une zone navigateur ;
 *   2. une zone navigateur qui porte déjà le nom proposé (stockage effacé,
 *      navigation privée) — on ne recrée pas un doublon ;
 *   3. sinon on la crée, et on la retient.
 */
import type { ZoneCandidate } from './zoneNavigateur';

export const CLE_ZONE_DE_CET_APPAREIL = 'tune.zoneNavigateur.cetAppareil';

export function idRetenu(): number | null {
  try {
    const v = Number(localStorage.getItem(CLE_ZONE_DE_CET_APPAREIL));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function retenir(id: number): void {
  try {
    localStorage.setItem(CLE_ZONE_DE_CET_APPAREIL, String(id));
  } catch {
    /* navigation privée : on recréera ou retrouvera par le nom */
  }
}

export async function zoneDeCetAppareil(
  zones: readonly ZoneCandidate[],
  nom: string,
  creer: (nom: string) => Promise<{ id?: number | null } | null | undefined>,
): Promise<number> {
  const navigateurs = zones.filter((z) => z?.output_type === 'browser' && z.id != null);
  const retenu = idRetenu();
  if (retenu != null && navigateurs.some((z) => z.id === retenu)) return retenu;
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
