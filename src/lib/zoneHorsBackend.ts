/**
 * tune-server-rust#5353 — la zone dont la sortie s'ouvre HORS du backend choisi.
 *
 * Décision de Bertrand (29/09/2026) : quand ASIO est choisi, les zones liées à
 * une sortie WASAPI (« This Computer », « Speakers ») restent jouables, mais
 * elles sont SIGNALÉES. Jean-François (fil 2018) jouait sur « Speakers » en
 * croyant jouer sur son pilote ASIO, et rien à l'écran ne le lui disait.
 *
 * Le serveur pose `backend_sortie` et `hors_backend_choisi` sur une zone locale
 * dont la sortie est connue. Sans ces champs (serveur plus ancien, zone non
 * locale, sortie absente), rien n'est signalé : une absence n'est pas un « oui ».
 */
import type { Zone } from './types';

export interface SignalementHorsBackend {
  /** Le backend réel de la sortie, en capitales : « WASAPI ». */
  badge: string;
  /** ASIO est choisi et cette sortie n'est pas ASIO : conseiller la zone ASIO. */
  noteAsio: boolean;
}

/**
 * tune-server-rust#7806 — le pilote réel d'une zone locale Windows, en
 * capitales (« WASAPI », « ASIO »), ou `null` quand le serveur ne le dit pas
 * (hors Windows, serveur antérieur, sortie inconnue). Le testeur du fil 2248
 * lisait son DSD sur « This Computer » en croyant lire en ASIO : la zone était
 * en WASAPI, et le DSD y était converti en PCM.
 */
export function piloteDeLaZone(z: Pick<Zone, 'pilote_local'>): 'WASAPI' | 'ASIO' | null {
  const p = (z.pilote_local ?? '').trim().toLowerCase();
  if (p === 'asio') return 'ASIO';
  if (p === 'wasapi') return 'WASAPI';
  return null;
}

/** Une sortie ASIO présente qu'aucune zone ne porte (`GET /zones/asio-sans-zone`). */
export interface SortieAsioSansZone {
  device_id: string;
  name: string;
  backend?: string;
}

/**
 * tune-server-rust#7806 — les sorties ASIO à signaler : celles du serveur,
 * moins celles qu'une zone de la liste porte déjà (la zone vient d'être créée,
 * la liste du serveur n'est pas encore relue).
 */
export function sortiesAsioAAvertir(
  sorties: SortieAsioSansZone[] | null | undefined,
  zones: Pick<Zone, 'output_device_id'>[],
): SortieAsioSansZone[] {
  return (sorties ?? []).filter(
    (s) => !!s?.device_id && !zones.some((z) => z.output_device_id === s.device_id),
  );
}

export function signalementHorsBackend(
  z: Pick<Zone, 'backend_sortie' | 'hors_backend_choisi'>,
): SignalementHorsBackend | null {
  if (z.hors_backend_choisi !== true) return null;
  const backend = (z.backend_sortie ?? '').trim();
  if (!backend) return null;
  return { badge: backend.toUpperCase(), noteAsio: backend.toLowerCase() !== 'asio' };
}
