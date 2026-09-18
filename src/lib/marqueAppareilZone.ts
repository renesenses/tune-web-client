/**
 * Le MODE de saisie d'une marque (ou d'un modèle) d'appareil : liste du
 * catalogue, ou saisie libre.
 *
 * #1107 — « si pour la marque on choisit "Autre" et que l'on efface le mot
 * autre pour mettre le nom voulu, la zone revient à "Choisir une marque" et on
 * ne peut plus entrer le texte voulu. » (Gros Bidon, forum fil 1828.)
 *
 * `ZoneDeviceEditor` DÉDUISAIT le mode du contenu du champ :
 *
 *     brandIsCustom = selectedBrand === 'Autre'
 *                   || (selectedBrand.trim() !== '' && hors catalogue)
 *
 * Or c'est ce même champ que l'utilisateur vide pour y taper son texte. À la
 * dernière lettre effacée la condition retombe à faux, le `<input>` quitte le
 * DOM et le `<select>` le remplace : la saisie en cours est perdue, et il n'y
 * a plus nulle part où taper. Le même défaut confisquait le champ en pleine
 * frappe dès que le texte tapé coïncidait avec une entrée du catalogue.
 *
 * 🔴 La règle : ce qu'on TAPE ne décide plus de l'endroit où l'on tape.
 *
 * Le mode a donc un état propre, à trois valeurs :
 *
 *   - `true`  — l'utilisateur a choisi « Autre… » : saisie libre, quoi qu'il
 *               tape ensuite, y compris rien du tout ;
 *   - `false` — l'utilisateur a choisi une entrée de la liste, ou est revenu à
 *               la liste par le geste explicite ;
 *   - `null`  — personne n'a encore tranché : c'est l'ouverture de l'écran, et
 *               là seulement on déduit de la valeur reçue du serveur. Il le
 *               faut : le catalogue arrive APRÈS le montage, et une marque
 *               enregistrée hors catalogue doit s'afficher en saisie libre dès
 *               qu'on sait qu'elle n'y figure pas.
 */

/** Une entrée de liste : marque du catalogue, ou modèle d'une marque. */
export interface EntreeCatalogue {
  name: string;
}

/** La valeur figure-t-elle dans la liste ? Casse et espaces ignorés. */
export function figureDansLaListe(liste: EntreeCatalogue[], valeur: string): boolean {
  const v = valeur.trim().toLowerCase();
  if (v === '') return false;
  return liste.some((e) => e.name.toLowerCase() === v);
}

/**
 * Faut-il afficher le champ de saisie libre plutôt que la liste ?
 *
 * `choix` est l'état propre (voir en-tête) : dès qu'il vaut `true` ou `false`,
 * il COMMANDE, et `valeur` n'est même pas regardée — c'est tout l'objet du
 * correctif. La déduction ne sert qu'au cas `null`, à l'ouverture.
 */
export function saisieLibre(
  choix: boolean | null,
  liste: EntreeCatalogue[],
  valeur: string,
): boolean {
  if (choix !== null) return choix;
  return valeur.trim() !== '' && !figureDansLaListe(liste, valeur);
}
