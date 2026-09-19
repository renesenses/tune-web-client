/**
 * Le geste demande une zone — et le DIT quand il n'y en a pas — #1233.
 *
 * Bertrand, présentation du 18/09/2026 : « fiche Titres phares non
 * clickables ! ». Les lignes sont pourtant branchées : `BioEtTitresPhares`
 * monte `ListePistesV2` avec `onLire={(_p, i) => lireDepuis(i)}`, et
 * `lireDepuis` enchaîne bien la liste. Ce qu'elle fait aussi, c'est sortir en
 * silence :
 *
 * ```ts
 * const zid = $currentZoneId;
 * if (zid == null) return;   // ← rien ne joue, rien ne le dit
 * ```
 *
 * Sans zone active, le clic ne fait rien et l'écran se tait : de l'extérieur,
 * la ligne est « non cliquable ».
 *
 * 🔴 CE N'ÉTAIT PAS UN DÉFAUT D'UN ÉCRAN, mais de VINGT-HUIT gestes. Relevé
 * sur `main` le 19/09/2026 : `git grep -A1 "const zid = $currentZoneId;" --
 * src/components/v2 | grep -c "zid == null) return;"` rend **28**, répartis
 * sur quatorze fichiers — lecture, mise en file, égaliseur, crossfeed,
 * profileur. Tous muets.
 *
 * Deux écrans seulement disaient quelque chose (`ArtistesV2`,
 * `CollectionsV2`), chacun avec SA clé. Le message existait donc déjà… sept
 * fois : `queue.noZoneSelected`, `nowplaying.noZoneSelected`,
 * `library.noZoneSelected`, `library.noZoneSelectedShort`,
 * `library.noZoneSelectedSelectZone`, `v2.art.noZone`, `v2.col.noZone`.
 *
 * On n'en ajoute donc PAS une huitième : `library.noZoneSelectedSelectZone`
 * est la plus explicite (« Aucune zone sélectionnée — sélectionnez une
 * zone »), et elle est déjà traduite dans les onze langues.
 */
import { get } from 'svelte/store';
import { currentZoneId } from './stores/zones';
import { notifications } from './stores/notifications';

/**
 * L'identifiant de la zone active, ou `null` APRÈS l'avoir dit.
 *
 * Rend un nombre pour que l'appelant garde exactement sa forme :
 *
 * ```ts
 * const zid = zoneRequise();
 * if (zid == null) return;
 * ```
 */
export function zoneRequise(): number | null {
  const zid = get(currentZoneId);
  if (zid != null) return zid;
  void direQuIlEnFautUne();
  return null;
}

/**
 * ⚠️ Import DYNAMIQUE de l'i18n, et c'est nécessaire.
 *
 * `lib/i18n` tire des magasins qui lisent `localStorage` à l'évaluation du
 * module. L'importer en tête ferait entrer ces effets dans le graphe de tout
 * fichier qui importe celui-ci — y compris les bancs qui tournent en `node`,
 * où `localStorage` n'existe pas. C'est exactement le motif retenu par
 * `stores/zones.ts` pour `loadingInstead()`.
 */
async function direQuIlEnFautUne(): Promise<void> {
  try {
    const { t } = await import('./i18n');
    notifications.error(get(t)('library.noZoneSelectedSelectZone' as any));
  } catch {
    /* Un message qu'on ne sait pas traduire ne doit pas faire tomber le geste. */
  }
}
