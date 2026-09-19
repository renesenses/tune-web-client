/**
 * LE JETON QUI DIT « les services, sans le local » — le deuxième temps de la
 * recherche.
 *
 * Bertrand, 19/09/2026 : « La recherche se fait en deux temps : local puis
 * streaming. Il ne faut pas faire patienter l'utilisateur ».
 *
 * L'écran de recherche tient son local de `/library/search` et JETTE celui de
 * la réponse fédérée — il ne lit que `r.services`. Sans jeton, `/search`
 * refaisait pourtant tout le bloc local pour rien. Mesuré sur le .18
 * (0.9.155), requête « coltrane », à chaud :
 *
 *     /library/search                          0,24 s   ← ce qui s'affiche
 *     /search sans sources                     2,03 s
 *       ↳ le bloc `local`, refait puis jeté    0,95 s
 *       ↳ les services                         1,20 s
 *
 * 🔴 La MÊME graphie que le serveur (`routes/filtre_sources.rs`,
 * `JETON_SERVICES`). Deux orthographes divergentes rendraient un jeton que le
 * serveur ne reconnaît pas — et un jeton inconnu ne sélectionne RIEN, ni
 * service ni local : la recherche de streaming rendrait zéro résultat sans un
 * mot. C'est la ligne « valeur inconnue » du contrat.
 *
 * ⚠️ Ce n'est pas `all` : `all` rend le local EN PLUS.
 */
export const SOURCES_SERVICES = 'streaming';
