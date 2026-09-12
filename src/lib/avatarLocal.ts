/**
 * La photo d'avatar CHOISIE SUR LA MACHINE — celle qu'on envoie soi-même.
 *
 * Jusqu'ici la bulle en haut à droite du nouveau client n'avait qu'une source :
 * `GET /cloud/sso/status` → `user.avatar_url`, c'est-à-dire la photo du compte
 * **mozaiklabs.fr**. Sur un serveur personnel sans `client_id` cloud, ce champ
 * n'existe pas, le menu affiche `cloudComingSoon`, et il n'y a **aucun** moyen
 * de se donner une image. Deux testeurs l'ont demandé à un jour d'intervalle
 * (fils 1681 et 1676, issue #893) et l'un des deux s'en croyait bloqué.
 *
 * Ce module est la moitié « image » de la réponse, entièrement côté client :
 * le fichier choisi est **recadré au carré, réduit et ré-encodé** ici, puis
 * rangé dans les préférences (`avatarImage`). Rien n'est téléversé nulle part —
 * le serveur Tune n'expose aucune route d'avatar, et `avatar_path` y stocke
 * une couleur hexadécimale, pas une image.
 *
 * ## Pourquoi réduire, et pas seulement lire le fichier
 *
 * Les préférences voyagent en ENTIER : à chaque modification, le magasin les
 * écrit dans `localStorage` puis les pousse en `PATCH /system/config`
 * (`ui_preferences`). Y ranger un JPEG d'appareil photo de 4 Mo ferait repartir
 * 4 Mo à chaque changement de thème, et dépasserait le quota `localStorage`
 * (~5 Mo) — qui échoue en silence dans le `catch` du magasin, donc sans que
 * rien ne le dise. 192 px de côté en WebP tiennent dans quelques kilo-octets.
 *
 * 192 et non 128 : le bouton fait 44 px, et 44 × 3 = 132 sur un écran à forte
 * densité. Un avatar flou sur un portable récent serait un correctif à moitié
 * livré.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne touche ni au compte cloud, ni aux profils (`avatar_color`), ni à
 * l'interface actuelle — qui n'a pas de bulle de compte. Une photo posée ici
 * vit dans les préférences de ce navigateur, avec la même persistance et les
 * mêmes limites que tous les autres réglages.
 */

/** Côté du carré produit, en pixels. Voir l'en-tête pour le choix de 192. */
export const COTE_MAX = 192;

/**
 * Plafond du FICHIER SOURCE accepté, avant tout décodage.
 *
 * Ce n'est pas le poids du résultat (voir `POIDS_ENCODE_MAX`) mais une
 * protection contre le décodage lui-même : une image de 100 mégapixels fait
 * allouer ~400 Mo au navigateur avant qu'on ait la moindre chance de la
 * réduire, et l'onglet gèle sans message. 16 Mio laissent passer toutes les
 * photos de téléphone et de reflex courantes.
 */
export const TAILLE_SOURCE_MAX = 16 * 1024 * 1024;

/**
 * Plafond du résultat encodé, data-URL comprise.
 *
 * Il borne ce qui repart dans CHAQUE écriture de préférences. À 192 px, un
 * WebP de qualité 0,82 pèse typiquement 5 à 12 Ko : la marge est large, et le
 * plafond n'existe que pour le cas où le navigateur ne connaîtrait pas WebP et
 * retomberait sur un PNG (voir `encodeCanevas`).
 */
export const POIDS_ENCODE_MAX = 96 * 1024;

/** Qualités WebP essayées dans l'ordre, jusqu'à tenir sous le plafond. */
export const QUALITES = [0.82, 0.7, 0.6, 0.5, 0.4];

/** Pourquoi une image a été refusée. Chaque motif a son message à l'écran :
 *  « ça n'a pas marché » sans dire quoi corriger renvoie l'utilisateur à
 *  réessayer le même fichier. */
export type MotifRefus = 'type' | 'taille' | 'lecture' | 'poids';

/** Clé i18n du message à afficher pour chaque motif. La table vit ici, à côté
 *  des motifs, pour qu'un motif ajouté sans message se voie à la compilation. */
export const CLE_MESSAGE: Record<MotifRefus, string> = {
  type: 'settings.avatarErrorType',
  taille: 'settings.avatarErrorSize',
  lecture: 'settings.avatarErrorRead',
  poids: 'settings.avatarErrorWeight',
};

export class AvatarRefuse extends Error {
  readonly motif: MotifRefus;
  constructor(motif: MotifRefus) {
    super(motif);
    this.name = 'AvatarRefuse';
    this.motif = motif;
  }
}

/**
 * Le carré à découper au CENTRE de l'image, et la taille à laquelle le rendre.
 *
 * Recadrage centré plutôt que déformation : l'avatar est rond, une photo
 * étirée pour tenir dans un carré y devient méconnaissable.
 *
 * 🔴 On ne grandit JAMAIS. Une icône de 48 px redessinée à 192 sortirait floue
 * et trois fois plus lourde que l'originale, pour zéro pixel de détail gagné.
 */
export function cadreCarre(largeur: number, hauteur: number, coteMax = COTE_MAX) {
  const cote = Math.min(largeur, hauteur);
  return {
    sx: Math.round((largeur - cote) / 2),
    sy: Math.round((hauteur - cote) / 2),
    source: cote,
    cible: Math.max(1, Math.min(coteMax, Math.floor(cote))),
  };
}

/**
 * Le fichier a-t-il une chance d'être une image, avant de le décoder ?
 *
 * Contrôle volontairement grossier : le type MIME annoncé et le poids. Le vrai
 * juge est le décodeur du navigateur — un fichier au bon type mais au contenu
 * cassé finit en motif `lecture`, et c'est correct. Refuser ici sur une liste
 * blanche de formats reviendrait à interdire ce que le navigateur sait lire.
 */
export function verifieFichier(type: string, taille: number): void {
  if (!type || !type.startsWith('image/')) throw new AvatarRefuse('type');
  if (taille > TAILLE_SOURCE_MAX) throw new AvatarRefuse('taille');
}

/** Poids d'une data-URL en octets. Le préfixe et le base64 sont de l'ASCII :
 *  une longueur de chaîne EST un compte d'octets ici. */
export function octetsDataUrl(url: string): number {
  return url.length;
}

/**
 * La valeur relue est-elle bien une photo que ce client a pu écrire ?
 *
 * 🔴 Ce n'est pas de la paranoïa de sérialisation. `avatarImage` voyage dans
 * `ui_preferences`, que `syncPreferencesFromServer` RELIT DU SERVEUR : la
 * chaîne qu'on s'apprête à poser dans un attribut `src` est une valeur
 * distante. On n'accepte donc que la forme exacte que `encodeCanevas` produit
 * — `data:image/<type>;base64,<ascii>` — et pas une octet de plus que le
 * plafond, sans quoi une préférence gonflée à la main repartirait dans chaque
 * `PATCH /system/config`.
 *
 * Tout ce qui n'entre pas dans ce moule est traité comme « aucune photo » : le
 * dégradé revient, ce qui est un état honnête, là où un `src` invalide laisse
 * un rond cassé.
 */
export function estDataUrlImage(valeur: unknown): valeur is string {
  return (
    typeof valeur === 'string' &&
    /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i.test(valeur) &&
    octetsDataUrl(valeur) <= POIDS_ENCODE_MAX
  );
}

/**
 * Décode le fichier en quelque chose que `drawImage` sait dessiner.
 *
 * `createImageBitmap` d'abord : il décode hors du fil principal et rend les
 * dimensions sans détour. Repli sur `<img>` + `URL.createObjectURL` pour les
 * navigateurs qui ne l'ont pas — et pour les formats qu'il refuse alors que la
 * balise `<img>`, elle, les affiche (le SVG en est le cas courant).
 *
 * L'URL d'objet est révoquée dans les DEUX issues : une fuite par image
 * refusée finirait par retenir en mémoire tous les fichiers essayés.
 */
async function decode(fichier: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fichier);
    } catch {
      // On ne renonce pas ici : le repli `<img>` lit des formats que
      // `createImageBitmap` refuse.
    }
  }
  const url = URL.createObjectURL(fichier);
  try {
    return await new Promise<HTMLImageElement>((resoudre, rejeter) => {
      const img = new Image();
      img.onload = () => resoudre(img);
      img.onerror = () => rejeter(new AvatarRefuse('lecture'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dimensions d'un décodé, quelle que soit sa forme. */
function dimensions(image: ImageBitmap | HTMLImageElement): { l: number; h: number } {
  const l = 'naturalWidth' in image ? image.naturalWidth || image.width : image.width;
  const h = 'naturalHeight' in image ? image.naturalHeight || image.height : image.height;
  return { l, h };
}

/**
 * Encode le canevas en data-URL, la plus légère qui tienne.
 *
 * 🔴 `toDataURL('image/webp', q)` ne signale PAS un format inconnu : il rend
 * silencieusement un PNG. C'est écrit dans la spécification, et c'est
 * exactement le genre de repli muet qui fait boucler une recherche de
 * qualité — la qualité n'a aucun effet sur PNG, donc réessayer cinq fois
 * produirait cinq octets près la même chaîne. On lit donc le préfixe rendu, et
 * on s'arrête au premier tour si ce n'est pas du WebP.
 */
export function encodeCanevas(canevas: HTMLCanvasElement): string {
  let dernier = '';
  for (const q of QUALITES) {
    dernier = canevas.toDataURL('image/webp', q);
    if (!dernier.startsWith('data:image/webp')) return dernier;
    if (octetsDataUrl(dernier) <= POIDS_ENCODE_MAX) return dernier;
  }
  return dernier;
}

/**
 * Le chemin complet : un fichier choisi par l'utilisateur → la data-URL à
 * ranger dans les préférences.
 *
 * Rejette une `AvatarRefuse` portant son motif ; l'appelant traduit le motif
 * par `CLE_MESSAGE`. Aucune exception anonyme ne sort d'ici : un `catch`
 * générique côté composant afficherait « erreur » sans rien apprendre.
 */
export async function avatarDepuisFichier(fichier: File): Promise<string> {
  verifieFichier(fichier.type, fichier.size);

  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await decode(fichier);
  } catch {
    throw new AvatarRefuse('lecture');
  }

  try {
    const { l, h } = dimensions(image);
    // Une image sans dimension utile n'est pas dessinable : `drawImage` y
    // lèverait, ou pire, rendrait un carré vide qu'on enregistrerait.
    if (!l || !h) throw new AvatarRefuse('lecture');

    const cadre = cadreCarre(l, h);
    const canevas = document.createElement('canvas');
    canevas.width = cadre.cible;
    canevas.height = cadre.cible;
    const ctx = canevas.getContext('2d');
    if (!ctx) throw new AvatarRefuse('lecture');
    // Le lissage de qualité change visiblement une réduction 4000 → 192 ; sans
    // lui, le rééchantillonnage au plus proche voisin crénelle les contours.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image as CanvasImageSource,
      cadre.sx, cadre.sy, cadre.source, cadre.source,
      0, 0, cadre.cible, cadre.cible,
    );

    const url = encodeCanevas(canevas);
    if (octetsDataUrl(url) > POIDS_ENCODE_MAX) throw new AvatarRefuse('poids');
    return url;
  } finally {
    // `ImageBitmap` retient sa surface décodée jusqu'à `close()` ; la laisser
    // au ramasse-miettes garde plusieurs mégaoctets vivants sans raison. Test
    // sur la MÉTHODE et non `instanceof ImageBitmap` : dans le navigateur qui a
    // imposé le repli `<img>`, le constructeur global peut ne pas exister du
    // tout, et `instanceof` y lèverait à la place de nettoyer.
    const fermable = image as Partial<ImageBitmap>;
    if (typeof fermable.close === 'function') fermable.close();
  }
}
