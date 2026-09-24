/**
 * LE MODE GRAND ÉCRAN, ET SA PORTE D'ENTRÉE — #1141.
 *
 * ## Le signalement
 *
 * **Bilou**, forum fil 1770, 13/09/2026, 0.9.148, deux phrases du même
 * message :
 *
 *   « en nouvelle version V1 il n'y a pas le choix vu-mètres dans lecture en
 *     cours et ce choix n'apparaît pas dans les paramètres d'ailleurs »
 *
 *   « Remarque : comment passer au mode grand écran en nouvelle version V1 ??? »
 *
 * ## Ce que le code prouve — et il les explique toutes les deux
 *
 * Les vu-mètres à aiguille n'existent QUE dans le mode Grand écran : `vuMeter`
 * n'est lu et écrit que par `v2-heritage/TvView.svelte`, et `TvVuMeters` /
 * `TvVuBars` ne sont importés que par lui. L'écran « Lecture en cours » monte
 * `AudioVisualizer`, dont les seuls modes sont `spectrum` et `waveform` — pas
 * d'aiguilles. Le testeur a donc raison sur les faits : le réglage n'est ni
 * dans « Lecture en cours », ni dans les Paramètres. Il n'y a jamais été.
 *
 * 🔴 Et l'écran qui le porte n'avait **qu'une seule porte d'entrée**. Relevé
 * sur `origin/main` : `activeView.set('tv')` n'a qu'un appelant dans tout le
 * dépôt — un bouton de la grappe haut-droite de `ShellV2`, qui cumule trois
 * traits :
 *
 *   • il n'est rendu que sous `{#if $activeView === 'nowplaying'}` ;
 *   • il n'a **aucun libellé visible** — « Mode Grand écran » ne vit que dans
 *     son `title` et son `aria-label` ;
 *   • il est posé dans la grappe dont #1140 signale qu'elle recouvre ses
 *     voisins.
 *
 * `'tv'` est pourtant une vue de plein droit (`stores/navigation.View`), avec
 * son écran, ses réglages et sa porte de sortie. Les deux phrases de Bilou n'en
 * font qu'une : il ne trouve pas les vu-mètres parce qu'il ne trouve pas
 * l'écran qui les porte.
 *
 * ## Le geste retenu — arbitrage de Bertrand, 23/09/2026
 *
 * **Donner un libellé visible à l'icône qui existe déjà.** C'est le geste
 * minimal, et il règle exactement la plainte : Bilou ne trouve plus la porte.
 *
 * Deux placements ont été écartés, et il faut le dire ici pour qu'on ne les
 * « rétablisse » pas demain :
 *
 *   • **la barre latérale** — son ordre est celui que Bertrand a donné en liste
 *     le 20/09/2026, et `ordreBarreLaterale.test.ts` le fige exprès (« sans
 *     garde, un remaniement ultérieur remettrait naturellement ces entrées à
 *     leur ancienne place ») ;
 *   • **le menu du compte** — il porte des réglages PERSONNELS (profils,
 *     thèmes, interface, connexion). Un mode d'affichage n'y a pas sa place, et
 *     un testeur qui cherche l'écran aux vu-mètres n'ira jamais y cliquer.
 *
 * ## Pourquoi un module, avec un seul appelant
 *
 * Parce que la règle qu'il porte n'était pas éprouvable là où elle vivait : un
 * `try` / `.catch()` écrit à la ligne dans `ShellV2` ne se teste pas. Or elle
 * est tout sauf anodine — le plein écran ne doit JAMAIS empêcher l'ouverture
 * de la vue. Ici elle est pure et la racine INJECTÉE : la garde fournit une
 * racine qui refuse, qui lève, ou qui n'existe pas, et vérifie que la vue
 * s'ouvre quand même.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne touche à aucune boucle de dessin ni à sa cadence : `TvVuMeters`,
 * `TvVuBars` et `AudioVisualizer` sont le sujet de #1256, instruit ailleurs.
 */

/** Ce qu'il faut d'un élément pour lui demander le plein écran. */
export interface RacinePleinEcran {
  requestFullscreen?: () => Promise<void> | void;
}

/**
 * Demander le plein écran, sans jamais faire échouer ce qui suit.
 *
 * 🔴 Le navigateur REFUSE le plein écran hors d'un geste utilisateur, et Safari
 * lève au lieu de rendre une promesse rejetée. Les deux doivent être avalés :
 * la vue s'ouvre quand même — c'est déjà la note que portait `ShellV2`, et elle
 * est la raison d'être du `try` comme du `.catch`.
 */
export function demanderPleinEcran(racine: RacinePleinEcran | null | undefined): void {
  try {
    const p = racine?.requestFullscreen?.();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => {});
    }
  } catch {
    /* le plein écran peut être refusé : la vue s'ouvre quand même */
  }
}

/**
 * Entrer en mode Grand écran : le plein écran, puis la vue.
 *
 * `aller` est injecté plutôt qu'importé : c'est ce qui rend la règle
 * éprouvable sans monter la coquille.
 *
 * 🔴 L'ORDRE COMPTE, et l'échec du premier ne doit pas emporter le second :
 * une porte qui n'ouvre rien quand le navigateur refuse le plein écran serait
 * exactement le défaut qu'on corrige.
 */
export function entrerEnModeGrandEcran(
  aller: (vue: 'tv') => void,
  racine: RacinePleinEcran | null | undefined =
    typeof document !== 'undefined' ? document.documentElement : null,
): void {
  demanderPleinEcran(racine);
  aller('tv');
}
