/**
 * Charger la liste des pistes d'une fiche de service — album, discographie,
 * playlist — SANS pouvoir rester sur « Chargement... ».
 *
 * 🔴 `renesenses/tune-web-client#1154`. `StreamingView.selectAlbum` écrivait :
 *
 *     loading = true;
 *     try { albumTracks = await api.getStreamingAlbumTracks(service, id); }
 *     catch (e) { console.error('Get streaming album tracks error:', e); }
 *     loading = false;
 *
 * Trois manques dans ces cinq lignes :
 *
 *  1. **L'attente n'est bornée par rien.** `fetchJSON` ne pose pas de délai, et
 *     `fetch()` n'en a pas tant que la connexion tient. Un amont qui accepte
 *     puis se tait — Qobuz, via la route `/streaming/{svc}/albums/{id}/tracks`
 *     — laisse la promesse en suspens, donc `loading` à `true`, donc le
 *     spinner pour toujours. C'est ce que montre la capture de Tades.
 *  2. **L'échec n'est pas dit.** Le `catch` ne parle qu'à la console. Pour
 *     l'auditeur, une erreur et un album vide sont le même écran.
 *  3. **La liste n'est pas remise à zéro**, et rien ne périme une réponse en
 *     retard : les pistes de l'album précédent restaient affichées sous le
 *     titre du suivant.
 *
 * La décision vit ici pour se prouver sans monter la vue ; l'écran l'applique.
 */

/** Ce qu'une demande de pistes rapporte à l'écran. */
export type IssuePistes<T> =
  /** Les pistes sont là : les publier, éteindre le témoin. */
  | { etat: 'pistes'; pistes: T[] }
  /** Ça a échoué : vider la liste, éteindre le témoin, DIRE `motif`. */
  | { etat: 'erreur'; motif: string }
  /**
   * La demande a été dépassée pendant qu'elle courait (autre fiche ouverte,
   * retour, changement de service). Ne toucher à RIEN : ni aux pistes, qui
   * appartiennent désormais à une autre fiche, ni au témoin, qu'une demande
   * plus récente tient peut-être allumé à bon droit.
   */
  | { etat: 'perimee' };

export interface DemandePistes<T> {
  /** L'appel au serveur. */
  demande: () => Promise<T[]>;
  /** Vrai tant que cette demande-ci est celle que l'écran attend encore. */
  estCourante: () => boolean;
  /** Borne de patience, en millisecondes. */
  delaiMs: number;
  /** Motif à dire quand la borne est atteinte — déjà traduit. */
  motifDelai: string;
  /** Motif de repli quand l'échec n'en porte aucun — déjà traduit. */
  motifParDefaut: string;
}

/**
 * Le motif lisible d'un échec.
 *
 * `apiError()` porte le message du serveur depuis #859, et #1160 l'a
 * reconfirmé : quand il y en a un, c'est lui qu'il faut montrer. Un rejet nu,
 * une ficelle, un message vide retombent sur le repli traduit — jamais sur un
 * bandeau vide, qui serait le défaut qu'on corrige sous un autre nom.
 */
function motifLisible(erreur: unknown, repli: string): string {
  const brut =
    erreur instanceof Error
      ? erreur.message
      : typeof erreur === 'string'
        ? erreur
        : '';
  const m = brut.trim();
  return m.length > 0 ? m : repli;
}

/**
 * La demande, bornée dans le temps.
 *
 * La minuterie est TOUJOURS annulée : sans ça, chaque fiche ouverte laisserait
 * une attente de trente secondes derrière elle.
 */
function avecBorne<T>(promesse: Promise<T>, ms: number, motif: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const minuterie = setTimeout(() => reject(new Error(motif)), ms);
    promesse.then(
      (v) => {
        clearTimeout(minuterie);
        resolve(v);
      },
      (e) => {
        clearTimeout(minuterie);
        reject(e);
      },
    );
  });
}

export async function chargerPistes<T>(o: DemandePistes<T>): Promise<IssuePistes<T>> {
  let pistes: T[];
  try {
    pistes = await avecBorne(o.demande(), o.delaiMs, o.motifDelai);
  } catch (erreur) {
    // La péremption se teste APRÈS coup : au moment du départ, la demande
    // était bien la bonne. Un échec arrivé trop tard ne doit rien annoncer —
    // un bandeau d'erreur sur la fiche qu'on vient d'ouvrir serait un mensonge.
    if (!o.estCourante()) return { etat: 'perimee' };
    return { etat: 'erreur', motif: motifLisible(erreur, o.motifParDefaut) };
  }
  if (!o.estCourante()) return { etat: 'perimee' };
  return { etat: 'pistes', pistes };
}
