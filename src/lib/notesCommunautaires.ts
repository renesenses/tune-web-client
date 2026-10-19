/**
 * Notes et écoutes de la communauté (renesenses/tune-server-rust#6545).
 *
 * 1. Le consentement : « Partager mes notes et mes écoutes avec la communauté
 *    (anonymement) », réglage serveur DÉSACTIVÉ par défaut et distinct de
 *    l'envoi « Mes écoutes ». Lu par `GET /system/config`, écrit par `PATCH`.
 * 2. L'affichage : `GET /library/albums/{id}/community` rend les agrégats
 *    publics du site (gardés quelques heures par le serveur) ; la fiche
 *    d'album en tire « ★ 4,2 (37 notes) · 1 240 écoutes dans la communauté ».
 *    Le site ne rend rien sous trois personnes distinctes : une partie nulle
 *    n'est pas affichée, et rien du tout quand les deux le sont.
 */

/** Clé du réglage serveur (`tune_core::cloud::notes_communautaires::CLE_PARTAGE`). */
export const CLE_PARTAGE_COMMUNAUTAIRE = 'cloud_community_share_enabled';

export interface AgregatsCommunautaires {
  available: boolean;
  rating: { average: number; count: number } | null;
  listens: { count: number; listeners: number } | null;
}

function nombre(n: number, langue: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(langue, options).format(n);
  } catch {
    return String(n);
  }
}

/**
 * La ligne affichée sous « Ma note », ou `null` quand il n'y a rien à dire
 * (serveur non relié, site muet, seuil non atteint).
 */
export function ligneCommunautaire(
  a: AgregatsCommunautaires | null | undefined,
  langue: string,
  t: (cle: string) => string,
): string | null {
  if (!a || a.available !== true) return null;
  const parties: string[] = [];
  const r = a.rating;
  if (r && typeof r.average === 'number' && typeof r.count === 'number' && r.count > 0) {
    parties.push(
      t('library.communityRating')
        .replace('{average}', nombre(r.average, langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
        .replace('{count}', nombre(r.count, langue)),
    );
  }
  const l = a.listens;
  if (l && typeof l.count === 'number' && l.count > 0) {
    parties.push(t('library.communityListens').replace('{count}', nombre(l.count, langue)));
  }
  if (parties.length === 0) return null;
  return t('library.communityLine').replace('{parts}', parties.join(' · '));
}
