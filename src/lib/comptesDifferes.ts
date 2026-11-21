/**
 * tune-server-rust#9116 (fil 2935, Thierry C., 544 147 pistes) — « à quoi te
 * sert de compter le nombre de fichiers présents dans chaque arborescence
 * quand c'est moi qui prendrai la décision d'ouvrir tel ou tel disque ? ».
 *
 * L'écran Répertoires annonce au serveur qu'il sait recevoir des comptes
 * DIFFÉRÉS (`?comptes_differes=1`). Le serveur rend alors la liste des
 * dossiers tout de suite et, tant que son arbre des dossiers n'est pas
 * construit, l'annonce par `comptes_en_attente: true` (comptes à 0) ou
 * `pistes_en_attente: true` (pistes du dossier pas encore lues). Ce module
 * redemande la même réponse en arrière-plan jusqu'à ce que tout soit connu,
 * sans jamais retenir la navigation.
 */
export interface EtatDesComptes {
  comptes_en_attente?: boolean;
  pistes_en_attente?: boolean;
}

/** Les cinq premières relances ; ensuite, une toutes les `RELANCE_LENTE_MS`. */
export const DELAIS_DES_COMPTES_MS = [700, 1500, 3000, 6000, 10000] as const;
export const RELANCE_LENTE_MS = 15000;

export const encoreEnAttente = (r: EtatDesComptes) => !!(r.comptes_en_attente || r.pistes_en_attente);

export interface Minuterie {
  poser: (f: () => void, ms: number) => unknown;
  retirer: (id: unknown) => void;
}

const minuterieDuNavigateur: Minuterie = {
  poser: (f, ms) => setTimeout(f, ms),
  retirer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Relance `lire` jusqu'à une réponse complète, qu'elle passe à `appliquer`.
 * Après les cinq premières relances sans succès, `lent()` est appelé une
 * fois (l'écran affiche « comptes en cours ») et les relances continuent,
 * plus espacées. Rend la fonction qui ARRÊTE tout (changement de dossier,
 * démontage) : plus aucune minuterie ni aucun `appliquer` ensuite.
 */
export function suivreLesComptes<T extends EtatDesComptes>(
  lire: () => Promise<T>,
  appliquer: (r: T) => void,
  lent: () => void = () => {},
  minuterie: Minuterie = minuterieDuNavigateur,
  delais: readonly number[] = DELAIS_DES_COMPTES_MS,
  relanceLente: number = RELANCE_LENTE_MS,
): () => void {
  let arrete = false;
  let minuteur: unknown = null;
  let essai = 0;
  const suivante = () => {
    if (arrete) return;
    const ms = essai < delais.length ? delais[essai] : relanceLente;
    minuteur = minuterie.poser(async () => {
      minuteur = null;
      if (arrete) return;
      essai += 1;
      let r: T | null = null;
      try {
        r = await lire();
      } catch {
        r = null;
      }
      if (arrete) return;
      if (r && !encoreEnAttente(r)) {
        appliquer(r);
        return;
      }
      if (essai === delais.length) lent();
      suivante();
    }, ms);
  };
  suivante();
  return () => {
    arrete = true;
    if (minuteur !== null) minuterie.retirer(minuteur);
    minuteur = null;
  };
}
