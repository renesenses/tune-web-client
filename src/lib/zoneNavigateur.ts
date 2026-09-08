/**
 * « Créer une zone sur cet ordinateur » — une seule fois.
 *
 * Alex Campbell, 08/09/2026 : « the button should detect if Tune can already
 * play music out of the local computer so it does not create multiple
 * instances of the same device ». Sa capture en montre **six**, toutes
 * nommées « This computer », toutes marquées BROWSER.
 *
 * ## Pourquoi il a cliqué six fois
 *
 * Le bouton ne détectait rien : chaque clic créait une zone. Et rien ne lui
 * disait où regarder — la nouvelle zone apparaît **plus bas dans la liste des
 * sorties**, hors du champ visuel du bouton. Devant un écran qui ne change
 * pas, on reclique.
 *
 * ## Pourquoi UNE seule suffit
 *
 * Une zone navigateur n'appartient à aucune machine : elle vaut
 * `output_type: 'browser'` et `output_device_id: null`. Le serveur ne peut
 * donc pas distinguer celle de l'ordinateur d'Alex de celle de sa tablette —
 * n'importe quel navigateur s'y rattache. Six zones identiques ne donnent pas
 * six destinations : elles donnent six façons de se tromper.
 */

export interface ZoneCandidate {
  id?: number | null;
  name?: string;
  output_type?: string | null;
  output_device_id?: string | null;
}

/**
 * La zone navigateur déjà présente, s'il y en a une.
 *
 * On ne se fie pas au NOM : « This computer », « Cet ordinateur », « Mon Mac »
 * désignent la même chose, et un utilisateur qui renomme sa zone ne doit pas
 * s'en retrouver avec deux.
 *
 * La plus ancienne l'emporte — `id` croissant. C'est celle sur laquelle les
 * réglages, l'égaliseur et les raccourcis ont eu le temps de s'accumuler.
 */
export function zoneNavigateurExistante(zones: readonly ZoneCandidate[]): ZoneCandidate | null {
  const candidates = zones
    .filter((z) => z?.output_type === 'browser' && z.id != null)
    .sort((a, b) => (a.id as number) - (b.id as number));

  return candidates[0] ?? null;
}

/** Combien de zones navigateur en trop — ce que l'écran peut signaler. */
export function zonesNavigateurEnDouble(zones: readonly ZoneCandidate[]): number {
  return Math.max(0, zones.filter((z) => z?.output_type === 'browser' && z.id != null).length - 1);
}
