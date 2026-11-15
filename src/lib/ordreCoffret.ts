/**
 * Réordonner les albums d'un coffret — tune-server-rust#8571 (fil 2763, go
 * de Bertrand du 12/11/2026).
 *
 * À la composition (Métadonnées › Coffrets) comme après (fiche d'un coffret
 * composé à la main), l'ordre des albums EST l'ordre des disques : chaque
 * album garde ses disques dans leur ordre, le suivant prend la suite (règle
 * de #8463). Ce module tient les règles pures ; l'écran, le glisser-déposer
 * et les boutons Monter / Descendre vivent dans `OrdreCoffretListeV2`.
 */

/** Déplace l'élément `de` à la place `vers` ; rend une NOUVELLE liste. */
export function deplacerDans<T>(liste: readonly T[], de: number, vers: number): T[] {
  const copie = [...liste];
  if (de < 0 || de >= copie.length) return copie;
  const cible = Math.max(0, Math.min(copie.length - 1, vers));
  if (cible === de) return copie;
  const [el] = copie.splice(de, 1);
  copie.splice(cible, 0, el);
  return copie;
}

/**
 * Les disques que chaque album occupera, dans l'ordre donné : `nbDisques`
 * par album (au moins 1). `[{ a, b }]`, bornes comprises.
 */
export function plagesDeDisques(nbDisques: readonly number[]): { a: number; b: number }[] {
  let a = 1;
  return nbDisques.map((n) => {
    const k = Math.max(1, Math.floor(n || 1));
    const plage = { a, b: a + k - 1 };
    a += k;
    return plage;
  });
}

/** Un album d'un coffret composé à la main, tel que `GET …/ordre` le rend. */
export interface MembreCoffret {
  /** Son rang à la composition (0 : l'album qui a fondé le coffret). */
  membre: number;
  titre: string;
  /** Ses disques DANS le coffret, croissants. */
  disques: number[];
  pistes: number;
}

export interface OrdreCoffret {
  coffret: number;
  membres: MembreCoffret[];
}

/** La forme rendue par le serveur, vérifiée avant d'être affichée. */
export function estOrdreCoffret(r: unknown): r is OrdreCoffret {
  const o = r as OrdreCoffret | null | undefined;
  return !!o && typeof o.coffret === 'number' && Array.isArray(o.membres)
    && o.membres.every((m) => typeof m?.membre === 'number' && Array.isArray(m.disques));
}

/**
 * La sonde : la fiche d'édition (`GET /library/albums/{id}/edition`) d'un
 * serveur qui sait réordonner annonce `ordre_coffret: true`. Un serveur
 * antérieur ne l'envoie pas : le geste n'apparaît pas.
 */
export function ordreCoffretAnnonce(r: unknown): boolean {
  return (r as { ordre_coffret?: unknown } | null | undefined)?.ordre_coffret === true;
}

/** Vrai si `ordre` diffère de l'ordre d'origine (rien à enregistrer sinon). */
export function ordreChange(origine: readonly number[], ordre: readonly number[]): boolean {
  return origine.length !== ordre.length || origine.some((m, i) => m !== ordre[i]);
}
