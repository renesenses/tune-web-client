import { readable } from 'svelte/store';
import { getMediaServers } from '../api';
import type { MediaServer } from '../types';

export interface RegistreUpnp {
  serveurs: Map<string, MediaServer>;
  connu: boolean;
}

/** Un seul sondage du registre Tune pour tous les albums/pistes affichés.
 * Aucun accès aux serveurs distants depuis les vignettes. Une réponse tardive
 * ne peut pas repeupler le magasin après sa désinscription. */
export const disponibiliteUpnp = readable<RegistreUpnp>({ serveurs: new Map(), connu: false }, set => {
  let actif = true;
  let occupe = false;
  let requete: AbortController | null = null;
  let serveurs = new Map<string, MediaServer>();
  set({ serveurs, connu: false });
  async function actualiser() {
    if (occupe) return;
    occupe = true;
    const controle = new AbortController();
    requete = controle;
    const delai = setTimeout(() => controle.abort(), 8_000);
    try {
      const liste = await getMediaServers(controle.signal);
      if (!actif) return;
      serveurs = new Map(liste.map(s => [s.id, s]));
      set({ serveurs, connu: true });
    } catch {
      if (actif) set({ serveurs, connu: false });
    } finally { clearTimeout(delai); requete = null; occupe = false; }
  }
  void actualiser();
  const intervalle = setInterval(actualiser, 30_000);
  return () => { actif = false; clearInterval(intervalle); requete?.abort(); };
});

export type EtatUpnp = 'present' | 'stale' | 'absent' | 'disabled' | 'unknown';

export function etatSourceUpnp(sourceId: string | null | undefined, registre: RegistreUpnp): { etat: EtatUpnp; nom: string } {
  const [udn, identite] = (sourceId ?? '').split('|');
  const serveur = identite ? registre.serveurs.get(udn) : undefined;
  const nom = serveur?.name ?? '';
  if (!registre.connu || !serveur) return { etat: 'unknown', nom };
  if (serveur.active === false) return { etat: 'disabled', nom };
  if (serveur.presence === 'absent') return { etat: 'absent', nom };
  if (serveur.reachable === false) return { etat: 'stale', nom };
  // Une annonce SSDP récente constate une présence, pas la lisibilité du fichier.
  return { etat: serveur.reachable === true ? 'present' : 'unknown', nom };
}
