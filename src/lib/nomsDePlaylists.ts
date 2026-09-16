/**
 * Nommer une playlist de SERVICE jouée, depuis l'Historique — #988.
 *
 * FabienM, fil 1774, point 10 : « cas d'une playlist : son nom n'apparaît
 * pas, c'est indiqué "Sans nom". Il faut mettre le nom de la playlist jouée. »
 *
 * Le serveur nomme les playlists LOCALES depuis la .151 (`context_name`).
 * Pour une playlist Qobuz ou Tidal, il ne sait rien : c'est au client de le
 * demander au service, UNE fois par playlist, et de s'en souvenir — l'écran
 * se recalcule à chaque écoute reçue, et sans mémoire il redemanderait le
 * même nom à chaque tic.
 *
 * Ce module ne connaît ni l'écran ni `api` : il reçoit la fonction qui
 * demande, et rend ce qu'il sait. Un échec est mémorisé aussi (`null`), pour
 * ne pas marteler un service qui ne répond pas.
 */

export interface FichePlaylist {
  nom: string | null;
  pochette: string | null;
}

export type DemandePlaylist = (service: string, id: string) =>
  Promise<{ name?: string | null; cover_path?: string | null } | null | undefined>;

export class NomsDePlaylists {
  private readonly connues = new Map<string, FichePlaylist | null>();
  private readonly enCours = new Map<string, Promise<FichePlaylist | null>>();

  constructor(private readonly demander: DemandePlaylist) {}

  static cle(service: string, id: string): string {
    return `${service.toLowerCase()}:${id}`;
  }

  /** Ce qu'on sait déjà, sans rien demander. `undefined` = jamais demandé. */
  lire(service: string, id: string): FichePlaylist | null | undefined {
    return this.connues.get(NomsDePlaylists.cle(service, id));
  }

  /**
   * Demande si nécessaire, et rend la fiche. Deux appels concurrents pour la
   * même playlist ne produisent qu'UNE requête.
   */
  resoudre(service: string, id: string): Promise<FichePlaylist | null> {
    const cle = NomsDePlaylists.cle(service, id);
    if (this.connues.has(cle)) return Promise.resolve(this.connues.get(cle) ?? null);
    const deja = this.enCours.get(cle);
    if (deja) return deja;
    const p = this.demander(service, id)
      .then((r) => {
        const nom = r?.name != null && String(r.name).trim() !== '' ? String(r.name).trim() : null;
        const fiche: FichePlaylist | null = nom == null && !r?.cover_path
          ? null
          : { nom, pochette: r?.cover_path ?? null };
        this.connues.set(cle, fiche);
        return fiche;
      })
      .catch(() => {
        this.connues.set(cle, null);
        return null;
      })
      .finally(() => { this.enCours.delete(cle); });
    this.enCours.set(cle, p);
    return p;
  }
}
