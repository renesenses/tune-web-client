/**
 * tune-server-rust#7532 (web#2545, fil forum 2558, client VIP) — LES EN-TÊTES
 * COMMUNS NE SONT PLUS JAMAIS ÉCRASÉS PAR CEUX DE L'APPEL.
 *
 * `fetchJSON` faisait `fetch(url, { headers, ...options })` : dès qu'un appel
 * passait `options.headers` (tous les POST/PUT JSON, dont l'aperçu, la création
 * et la modification d'une collection intelligente), son objet REMPLAÇAIT celui
 * de `fetchJSON`. `X-Profile-Id`, `Authorization` et `Accept-Language`
 * partaient à la trappe. L'aperçu d'une collection « Favori est Album favori »
 * arrivait donc sans profil : le serveur retombait sur le profil global, celui
 * qui porte les favoris (« 402 albums »), tandis que la collection enregistrée
 * et l'écran Favoris, lus avec le profil du navigateur, restaient vides.
 *
 * Règle : on part des en-têtes communs, et chaque en-tête de l'appel s'y
 * ajoute ou remplace celui du MÊME NOM (comparaison insensible à la casse,
 * comme HTTP : sans elle, `Content-Type` et `content-type` partiraient tous
 * deux et le navigateur les joindrait en « application/json, application/json »).
 * Un appel peut donc viser un autre profil en posant lui-même `X-Profile-Id` ;
 * il ne peut plus le PERDRE en posant autre chose.
 */
export function fusionnerEntetes(
  communs: Record<string, string>,
  propres?: HeadersInit | null,
): Record<string, string> {
  const resultat: Record<string, string> = { ...communs };
  if (!propres) return resultat;
  const poser = (cle: string, valeur: string) => {
    const bas = cle.toLowerCase();
    for (const existante of Object.keys(resultat)) {
      if (existante.toLowerCase() === bas) delete resultat[existante];
    }
    resultat[cle] = valeur;
  };
  if (typeof Headers !== 'undefined' && propres instanceof Headers) {
    propres.forEach((valeur, cle) => poser(cle, valeur));
  } else if (Array.isArray(propres)) {
    for (const [cle, valeur] of propres) poser(cle, valeur);
  } else {
    for (const [cle, valeur] of Object.entries(propres as Record<string, string>)) {
      if (valeur !== undefined) poser(cle, valeur);
    }
  }
  return resultat;
}

/**
 * Le corps est-il du JSON à annoncer comme tel ?
 *
 * #4447 : pas de `Content-Type` sans corps. #7532 : pas de
 * `Content-Type: application/json` non plus sur un `FormData` (le navigateur
 * doit poser lui-même `multipart/form-data; boundary=…`, faute de quoi le
 * serveur ne retrouve pas les parties), ni sur des octets bruts, un `Blob` ou
 * des paramètres de formulaire, que le navigateur décrit seul.
 */
export function corpsJson(body: unknown): boolean {
  if (body == null) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
  return true;
}
