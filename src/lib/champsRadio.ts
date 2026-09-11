/**
 * Ce qu'on envoie à `PUT /radios/{id}` — et surtout ce qu'on N'envoie PAS.
 *
 * ## 🔴 `renesenses/tune-web-client#870`
 *
 * Belkadi Yacine, 0.9.143 Linux, fil 1734 : sa station `jb-radio` est devenue
 * **entièrement figée**. 23 refus de `PUT /radios/{id}` dans les journaux, tous
 * en `radio_url_pas_un_flux` — « cette adresse répond bien, mais elle rend
 * text/html et non un flux audio ».
 *
 * Le serveur avait pourtant prévu le cas. `tune-server/src/routes/radios.rs`
 * porte une garde de compatibilité écrite noir sur blanc :
 *
 *   « La validation porte sur ce qui est SAISI, jamais sur ce qui est déjà
 *     enregistré : on ne relit `station.url` que si la requête ne propose pas
 *     de nouvelle adresse. Une station créée avant ce correctif […] reste donc
 *     modifiable — on peut renommer, reclasser ou dé-favoriser sans être
 *     obligé de réparer son adresse d'abord. »
 *
 * Cette garde était INATTEIGNABLE depuis l'interface. Les deux écrans
 * d'édition — `RadioEditModale` (v2) et `RadiosView` (client actuel) —
 * envoyaient `stream_url` à chaque enregistrement, modifiée ou non. Le serveur
 * voyait donc toujours une adresse « proposée », sondait, et refusait — même
 * quand seul le nom changeait. Le champ étant `required type="url"`, on ne
 * pouvait pas non plus le vider pour contourner.
 *
 * ## La règle, énoncée une fois
 *
 * À la MODIFICATION, une adresse non touchée n'est pas proposée : la clé est
 * ABSENTE de l'objet, pas vide. `JSON.stringify` retire les clés `undefined`,
 * et le serveur lit alors `None` — ce que sa garde attend. Une chaîne vide
 * serait `Some("")`, c'est-à-dire une proposition, et le refus reviendrait.
 *
 * À la CRÉATION, tout est envoyé : il n'y a pas d'existant à préserver, et
 * `stream_url` y est obligatoire.
 *
 * Les autres champs restent envoyés tels quels, même inchangés. Les omettre
 * aussi serait un autre changement, plus large, qu'aucun rapport ne demande —
 * et qui rendrait indistinguables « genre vidé » et « genre non touché ».
 */

export interface ChampsRadio {
  name: string;
  stream_url: string;
  logo_url: string;
  genre: string;
  country: string;
  homepage_url: string;
}

/** Ce qui était enregistré avant l'ouverture du formulaire. */
export interface RadioInitiale {
  stream_url?: string | null;
}

/**
 * Les champs à poster.
 *
 * @param saisi    ce que le formulaire porte, déjà `trim()`é.
 * @param initiale la station telle qu'elle était, ou `null` pour une création.
 */
export function champsRadioAEnvoyer(
  saisi: ChampsRadio,
  initiale: RadioInitiale | null,
): Partial<ChampsRadio> {
  if (initiale === null) return { ...saisi };
  const inchangee = saisi.stream_url === (initiale.stream_url ?? '').trim();
  if (!inchangee) return { ...saisi };
  const { stream_url: _adresse, ...reste } = saisi;
  return reste;
}
