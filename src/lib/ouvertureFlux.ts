/**
 * Ouverture d'un flux : décider s'il faut le montrer, et surtout quand arrêter.
 *
 * `renesenses/tune-server-rust#2267` — demande de DEvir. Quand un flux met du
 * temps à s'ouvrir (NAS en WiFi, renderer réseau, extraction YouTube), la barre
 * de lecture reste figée et rien ne dit que quelque chose se passe. Une attente
 * normale se lit alors comme une panne.
 *
 * ## Le serveur sait déjà — rien à ajouter côté Rust
 *
 * `ZoneState.resolving` (`tune-core/src/playback/mod.rs:132`) veut dire « Tune a
 * accepté la demande mais n'a pas encore d'URL jouable ». Il a été ajouté pour
 * exactement ce problème, mesuré chez un testeur à 32 secondes d'écran muet
 * (forum #1359), et volontairement comme un booléen ADDITIF : `PlayState` est
 * lu par 77 `match`, y toucher aurait obligé à trancher un quatrième cas
 * partout, pour un besoin d'affichage.
 *
 * Il arrive déjà jusqu'ici : `/zones` (`routes/zones.rs:1438`), `/zones/{id}`
 * (`:1609`), `/playback` (`routes/playback.rs:285`) et le snapshot WebSocket
 * (`routes/ws.rs:137`) le portent tous, et `zone.updated` remplace le store
 * avec la charge utile du serveur (`src/App.svelte:711`).
 *
 * ⚠️ À ne pas confondre avec `PlaybackState`, qui déclare un `'buffering'`
 * FANTÔME (`src/lib/types.ts:13`) : `PlayState` côté serveur n'a que
 * `Stopped | Playing | Paused` (`playback/mod.rs:17-21`), et le `match` de
 * `ws.rs:122-126` est exhaustif sur ces trois-là. Le serveur n'émet jamais
 * `"buffering"`.
 *
 * ## Ce qui est réellement difficile : éteindre
 *
 * Un indicateur allumé pour toujours est PIRE que pas d'indicateur — il
 * remplace « je ne sais pas » par « c'est cassé ». Deux règles s'ajoutent donc
 * au simple `resolving === true` :
 *
 *  1. **Ne rien superposer à une barre qui avance vraiment.** Pendant un
 *     enchaînement, le serveur résout la piste suivante alors que la
 *     précédente s'entend encore ; la barre montre alors une vraie position, et
 *     annoncer une attente par-dessus serait un mensonge.
 *
 *  2. **Plafonner la durée de vie.** Le drapeau est bien abaissé sur tous les
 *     chemins d'erreur de l'orchestrateur (`orchestrator.rs:1513` et `:1538`,
 *     puis `playback/mod.rs:399/492/554/576`), mais deux trous restent
 *     invisibles du client : le chemin `SUPERSEDED_BEFORE_TRANSCODE`
 *     (`orchestrator.rs:1530-1541`) sort en laissant VOLONTAIREMENT le drapeau
 *     levé — la lecture gagnante le possède, et si elle n'aboutit pas plus
 *     personne ne l'abaisse — et une coupure WebSocket fige le store sur la
 *     dernière valeur reçue. Dans les deux cas l'indicateur tournerait sans fin.
 *
 * L'état est tenu par le composant et passé en argument : la fonction reste
 * pure, donc vérifiable sans rendu — il n'y a ni `@testing-library/svelte` ni
 * test de rendu dans ce dépôt.
 */

/** La part de la zone dont dépend la décision. */
export interface ZoneOuverture {
  state?: string | null;
  resolving?: boolean | null;
}

export interface EtatOuverture {
  /**
   * Instant (ms) où l'ouverture en cours a été observée pour la première fois,
   * `null` quand aucune n'est en cours. C'est lui qui arme le plafond : le
   * garder au lieu de le réécrire à chaque tick est ce qui permet de mesurer
   * une durée plutôt qu'un instant.
   */
  depuisMs: number | null;
  /** Faut-il montrer l'indicateur maintenant ? */
  visible: boolean;
}

/**
 * Au-delà de cette durée, on cesse d'annoncer une ouverture même si le serveur
 * la déclare encore.
 *
 * Le plafond doit passer AU-DESSUS de la plus longue attente légitime observée,
 * sans quoi il éteindrait un chargement parfaitement normal : 32 s mesurées sur
 * une extraction yt-dlp (#1359) et ~23 s sur un pré-transcodage HI-RES DASH
 * (#1146, d'où le `PLAY_GRACE_MS = 30000` de `stores/zones.ts`). Une minute
 * laisse de la marge à la première tout en bornant un drapeau bloqué.
 */
export const PLAFOND_OUVERTURE_MS = 60_000;

export const ETAT_OUVERTURE_INITIAL: EtatOuverture = Object.freeze({
  depuisMs: null,
  visible: false,
});

/**
 * Calcule le nouvel état d'affichage à partir du précédent et de la zone.
 *
 * Appelée à chaque changement de zone ET sur un ticker tant qu'une ouverture
 * court : le plafond doit pouvoir se déclencher même si plus aucune mise à jour
 * n'arrive du serveur — c'est précisément le cas qu'il couvre.
 */
export function suivreOuverture(
  precedent: EtatOuverture,
  zone: ZoneOuverture | null | undefined,
  maintenantMs: number,
): EtatOuverture {
  // `=== true` et non un test de véracité : le champ est optionnel côté client
  // (`Zone.resolving?: boolean`) et une zone servie par une vieille route peut
  // l'omettre. Un champ absent veut dire « je ne sais pas », donc « ne rien
  // annoncer », jamais « en cours ».
  const ouvre = zone?.resolving === true && zone?.state !== 'playing';

  if (!ouvre) {
    // Même RÉFÉRENCE que l'état initial : voir la note d'idempotence ci-dessous.
    return precedent === ETAT_OUVERTURE_INITIAL ? precedent : ETAT_OUVERTURE_INITIAL;
  }

  const depuisMs = precedent.depuisMs ?? maintenantMs;
  const visible = maintenantMs - depuisMs < PLAFOND_OUVERTURE_MS;

  // ── IDEMPOTENCE : rendre le MÊME objet quand rien n'a changé (#2555) ──────
  //
  // Cette fonction est appelée depuis un `$effect` qui LIT `etatOuverture`
  // (pour le passer en `precedent`) puis ÉCRIT le résultat. Tant qu'aucune
  // ouverture ne court, le chemin ci-dessus rend `ETAT_OUVERTURE_INITIAL` —
  // toujours la même référence — donc Svelte ne voit aucun changement et
  // l'effet converge.
  //
  // Dès qu'une ouverture court, l'ancien code rendait un objet NEUF à chaque
  // appel. L'effet invalidait alors sa propre dépendance et se relançait sans
  // fin : Svelte s'en protège par `effect_update_depth_exceeded`, et cette
  // erreur ARRÊTE son ordonnanceur de rendu. Toute l'interface cessait de se
  // rafraîchir — l'URL changeait encore, plus rien ne s'affichait. Cinq
  // testeurs, trois systèmes.
  //
  // Rendre `precedent` à l'identique referme la boucle à la source, sans rien
  // changer au comportement observable : les deux seuls champs sont comparés.
  if (precedent.depuisMs === depuisMs && precedent.visible === visible) {
    return precedent;
  }

  return { depuisMs, visible };
}
