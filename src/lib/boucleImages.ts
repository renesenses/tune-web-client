/**
 * Une boucle d'images qui ne tourne QUE quand quelqu'un la regarde — ticket 150.
 *
 * Levente Toth (fil `high-cpugpu-usage-on-now-playing`, MacBook, Safari et Zen)
 * mesure un navigateur nettement plus chargé sur « Lecture en cours » que sur
 * l'Accueil. La 0.9.158 a traité le crête-mètre (#1256) : 30 images par seconde
 * au lieu de la fréquence de l'écran, et plus rien à l'arrêt. Deux règles, deux
 * boucles concernées sur trois — l'analyseur de spectre et le suivi karaoké
 * d'une radio les ignoraient — et AUCUNE des trois ne s'arrêtait quand l'onglet
 * passait en arrière-plan.
 *
 * ## Ce que ce module garantit, et ce qu'il ne garantit pas
 *
 * - **Cadence** : `dessiner` n'est appelé qu'une fois par ~33 ms. Un écran
 *   ProMotion à 120 Hz ne fait pas dessiner quatre fois plus.
 * - **Arrêt à l'arrêt** : `dessiner` rend `false` et la boucle se gare. Elle ne
 *   se ré-arme plus, même au retour dans l'onglet — c'est à l'appelant de la
 *   relancer (ses effets le font quand la lecture reprend).
 * - **Onglet caché** : l'image en attente est ANNULÉE sur `visibilitychange`, et
 *   la boucle ne se ré-arme qu'au retour.
 * - **Démontage** : l'annulateur rendu coupe l'image en attente ET retire
 *   l'écouteur. Une `requestAnimationFrame` oubliée survit à l'écran qui l'a
 *   créée, pour toute la vie de la page.
 *
 * 🔴 Ce qu'il ne fait PAS : réduire le coût d'une image. Les navigateurs
 * suspendent déjà `requestAnimationFrame` dans un onglet caché ; la garde de
 * visibilité ne remplace pas cette suspension, elle la rend explicite,
 * testable, et sans image en attente au moment où l'onglet part.
 */
import { tempsDeDessiner } from './cadenceCreteMetre';

/** Ce que la boucle attend d'un document — de quoi la tester sans navigateur. */
export interface DocumentObserve {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', ecouteur: () => void): void;
  removeEventListener(type: 'visibilitychange', ecouteur: () => void): void;
}

export interface OptionsBoucle {
  /** Document à observer. Par défaut celui de la page ; `null` = aucune garde. */
  doc?: DocumentObserve | null;
  /** Règle de cadence. Par défaut ~30 images par seconde. */
  rythme?: (maintenant: number, dernier: number) => boolean;
}

function documentParDefaut(): DocumentObserve | null {
  return typeof document === 'undefined' ? null : document;
}

/**
 * Lance une boucle d'images. Rend l'annulateur à appeler au démontage — il va
 * tel quel dans le `return` d'un `$effect`.
 *
 * `dessiner` rend `true` pour continuer, `false` pour garer la boucle.
 */
export function boucleImages(
  dessiner: (maintenant: number) => boolean,
  options: OptionsBoucle = {},
): () => void {
  const doc = options.doc === undefined ? documentParDefaut() : options.doc;
  const rythme = options.rythme ?? tempsDeDessiner;

  /**
   * 🔴 `null`, pas `0` — #3818 : zéro est un identifiant `requestAnimationFrame`
   * parfaitement valide. Un `if (raf)` laissait donc la toute première image
   * d'une page en vol après le démontage.
   */
  let raf: number | null = null;
  let dernier = -Infinity;
  /** La boucle s'est arrêtée d'elle-même : rien à dessiner, et plus rien à faire. */
  let garee = false;
  /** Le composant est démonté : plus rien, jamais. */
  let finie = false;

  const image = (maintenant: number) => {
    raf = null;
    if (finie) return;
    if (rythme(maintenant, dernier)) {
      dernier = maintenant;
      if (!dessiner(maintenant)) {
        // Garée POUR DE BON : seul l'appelant peut relancer une boucle, en en
        // créant une neuve. On lâche donc l'écouteur tout de suite, sans quoi
        // un écran laissé ouvert sur une lecture arrêtée en accumulerait un
        // par pause.
        garee = true;
        doc?.removeEventListener('visibilitychange', surVisibilite);
        return;
      }
    }
    armer();
  };

  const armer = () => {
    if (finie || garee || raf !== null) return;
    if (doc && doc.visibilityState === 'hidden') return;
    raf = requestAnimationFrame(image);
  };

  const surVisibilite = () => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      return;
    }
    // Le retour dessine tout de suite : la cadence se compte depuis la
    // dernière image VUE, et il n'y en a pas eu pendant l'absence.
    dernier = -Infinity;
    armer();
  };

  doc?.addEventListener('visibilitychange', surVisibilite);
  armer();

  return () => {
    finie = true;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    doc?.removeEventListener('visibilitychange', surVisibilite);
  };
}
