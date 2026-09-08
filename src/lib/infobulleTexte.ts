/**
 * « Un texte coupé se lit en entier » — chantier `renesenses/tune-server-rust#2411`.
 *
 * ## Pourquoi une action, alors que les lots 0 à 2 écrivaient `title=` à la main
 *
 * Les lots 0 (`#590`), 1 (`#603`) et 2 (`#607`) ont posé un attribut `title=`
 * littéral sur chaque texte tronqué. C'était le bon premier pas, et il tient
 * toujours. Mais il porte **deux défauts que l'écrit-à-la-main ne peut pas
 * corriger**, et ce lot les traite tous les deux en un seul endroit :
 *
 * ### 1. Un `title=` écrit à la main s'affiche même quand RIEN n'est coupé
 *
 * `text-overflow: ellipsis` ne coupe que si le texte dépasse sa boîte. Sur une
 * fenêtre large, « Jazz » dans une colonne de 300 px n'est pas tronqué du
 * tout — et pourtant une bulle « Jazz » apparaît au survol, qui répète
 * mot pour mot ce qu'on est en train de lire. Le balisage ne peut pas le
 * savoir : la troncature est une propriété de la MISE EN PAGE, pas de la
 * source. Seul le temps d'exécution le sait, en comparant `scrollWidth` à
 * `clientWidth`.
 *
 * L'action mesure donc, et **retire** l'attribut quand le texte tient. Elle
 * remesure au redimensionnement (la largeur du panneau change le verdict) et
 * quand le texte lui-même change (on passe d'une piste à l'autre sans que
 * l'élément soit recréé).
 *
 * ⚠️ **Repli assumé** : tant que l'élément n'est pas mis en page
 * (`clientWidth === 0` — onglet caché, composant monté mais pas encore
 * peint, jsdom), on ne peut pas mesurer. On pose alors la bulle. Une bulle en
 * trop se referme ; un texte illisible ne se répare pas.
 *
 * ### 2. Un `title=` natif ne s'ouvre JAMAIS au clavier
 *
 * C'est le point que ce dépôt avait déjà établi, noir sur blanc, dans
 * `SettingHint.svelte` : « une bulle qu'on ne peut pas atteindre au clavier
 * n'existe pas pour qui n'utilise pas la souris ». Aucun navigateur n'affiche
 * l'infobulle native quand un élément reçoit le focus au clavier. Les lots 0 à
 * 2 livrent donc, tels quels, **une accessibilité au survol seulement**.
 *
 * Ce qu'il faut bien voir : la troncature CSS est **purement visuelle**. Le
 * texte entier est dans le DOM, et un lecteur d'écran le lit en entier — le
 * `title` ne lui apprend rien. La personne réellement privée, c'est
 * **l'utilisateur voyant qui navigue au clavier** : il voit « Concerto pour
 * piano n… » et n'a aucun geste pour lire la suite.
 *
 * L'action lui rend ce geste : quand l'élément — ou l'ancêtre focalisable qui
 * le contient — prend le focus **au clavier**, une bulle s'affiche avec le
 * texte entier. Elle porte `aria-hidden`, précisément parce que le lecteur
 * d'écran, lui, n'a jamais rien perdu : l'annoncer une seconde fois serait du
 * bruit.
 *
 * **Une ligne, une bulle.** Une ligne de liste porte presque toujours DEUX
 * textes coupés dans le même bouton — le titre et l'artiste. Si chacun ouvrait
 * la sienne, la seconde chasserait la première et le clavier n'apprendrait que
 * l'artiste : le titre, celui qu'on cherchait justement à lire, resterait
 * invisible. Les textes coupés d'une même ligne sont donc groupés, et la bulle
 * les dit tous, dans l'ordre du balisage.
 *
 * **S'il n'existe aucun ancêtre focalisable, l'action ne pose rien de plus** —
 * et surtout pas un `tabindex` : ajouter deux cents arrêts de tabulation sur
 * des `<span>` décoratifs rendrait la navigation au clavier pire qu'avant.
 * Un texte qu'aucun geste clavier n'atteint n'a pas besoin d'une bulle au
 * clavier.
 *
 * ### Le focus à la SOURIS ne déclenche pas la bulle
 *
 * Cliquer un bouton lui donne le focus. Sans précaution, la bulle s'ouvrirait
 * à chaque clic, en double avec l'infobulle native. On suit donc le dernier
 * geste : un `pointerdown`/`mousedown` marque « à la souris », une touche
 * marque « au clavier ». C'est le même critère que `:focus-visible`, écrit à
 * la main parce qu'il doit être vérifiable dans les deux sens par un témoin.
 *
 * ## Emploi
 *
 *     <span class="truncate" use:bulleTexte>{piste.title}</span>
 *     <span class="truncate" use:bulleTexte={`${a.nom} — ${a.role}`}>…</span>
 *
 * Sans argument, l'action lit le `textContent` de l'élément : la bulle ne peut
 * alors PAS diverger du texte affiché, et elle suit tout seul un changement de
 * données. On ne passe un texte explicite que lorsque la bulle doit dire plus
 * que ce que l'élément montre.
 *
 * Ce n'est **pas** un doublon de `use:tip` (`lib/tooltip.ts`) : celle-là prend
 * une CLÉ de traduction et sert les bulles d'AIDE, qu'un réglage peut couper.
 * Ici la bulle porte une DONNÉE — le titre qu'on essaie de lire — et couper
 * les bulles d'aide ne doit pas rendre un texte illisible.
 */

/** Le dernier geste était-il un geste de pointeur ? Voir plus haut. */
let gestePointeur = false;
let ecouteursPoses = false;

function poserLesEcouteursDeGeste() {
  if (ecouteursPoses || typeof document === 'undefined') return;
  ecouteursPoses = true;
  const pointeur = () => {
    gestePointeur = true;
  };
  const clavier = () => {
    gestePointeur = false;
  };
  document.addEventListener('pointerdown', pointeur, true);
  document.addEventListener('mousedown', pointeur, true);
  document.addEventListener('touchstart', pointeur, true);
  document.addEventListener('keydown', clavier, true);
}

/** Pour les témoins : remettre le geste à « clavier ». */
export function reinitialiserLeGeste() {
  gestePointeur = false;
}

/**
 * Les éléments qu'une tabulation atteint. `closest` s'applique à l'élément
 * lui-même d'abord, ce qui couvre le cas d'un `<a class="truncate">`.
 */
const FOCALISABLES =
  'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

/** L'élément déborde-t-il de sa boîte ? */
export function texteDeborde(node: HTMLElement): boolean {
  // Pas encore mis en page : on ne sait pas, donc on garde la bulle.
  if (node.clientWidth === 0 && node.clientHeight === 0) return true;
  // `text-overflow: ellipsis` coupe en largeur, `line-clamp` en hauteur.
  return node.scrollWidth - node.clientWidth > 1 || node.scrollHeight - node.clientHeight > 1;
}

/** La bulle du clavier. Une seule à la fois dans tout le document. */
let bulleOuverte: HTMLElement | null = null;
/** L'élément focalisable pour lequel elle est ouverte. */
let bulleOuvertePour: HTMLElement | null = null;

function fermerLaBulle() {
  bulleOuverte?.remove();
  bulleOuverte = null;
  bulleOuvertePour = null;
}

function ouvrirLaBulle(ancre: HTMLElement, texte: string): HTMLElement {
  fermerLaBulle();
  const bulle = document.createElement('div');
  bulle.className = 'bulle-texte-coupe';
  bulle.setAttribute('role', 'tooltip');
  // Le lecteur d'écran lit déjà le texte entier : la troncature est visuelle.
  // Cette bulle est là pour l'œil, pas pour l'oreille.
  bulle.setAttribute('aria-hidden', 'true');
  bulle.textContent = texte;
  document.body.appendChild(bulle);
  const boite = ancre.getBoundingClientRect();
  bulle.style.left = `${Math.max(4, boite.left)}px`;
  bulle.style.top = `${boite.bottom + 6}px`;
  bulleOuverte = bulle;
  bulleOuvertePour = ancre;
  return bulle;
}

/**
 * Ce qu'une ligne focalisable contient de textes coupés.
 *
 * Une ligne de liste porte presque toujours DEUX textes coupés dans le même
 * bouton — le titre et l'artiste. Si chacun ouvrait sa bulle, la seconde
 * chasserait la première et le clavier n'apprendrait que l'artiste : le titre,
 * celui qu'on cherchait à lire, resterait invisible. Un seul geste, une seule
 * bulle, et elle dit la ligne entière.
 */
type Inscrit = { node: HTMLElement; texte: () => string };
type Groupe = { inscrits: Set<Inscrit>; detacher: () => void };
const parAncetre = new WeakMap<HTMLElement, Groupe>();

/** Les textes réellement coupés de cette ligne, dans l'ordre du balisage. */
function morceauxDe(focalisable: HTMLElement): string[] {
  const groupe = parAncetre.get(focalisable);
  if (!groupe) return [];
  const vus = new Set<string>();
  const morceaux: string[] = [];
  for (const i of groupe.inscrits) {
    if (!texteDeborde(i.node)) continue;
    const v = i.texte();
    // Le même texte deux fois dans la ligne ne se dit qu'une.
    if (!v || vus.has(v)) continue;
    vus.add(v);
    morceaux.push(v);
  }
  return morceaux;
}

export function bulleTexte(node: HTMLElement, texte?: string) {
  poserLesEcouteursDeGeste();

  let explicite = texte;
  const texteVoulu = () => (explicite ?? node.textContent ?? '').trim();

  function appliquer() {
    const valeur = texteVoulu();
    if (valeur && texteDeborde(node)) node.setAttribute('title', valeur);
    else node.removeAttribute('title');
  }

  appliquer();

  // La largeur de la boîte change le verdict : un panneau qu'on élargit peut
  // faire tenir un titre qui ne tenait pas.
  const ro =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => appliquer());
  ro?.observe(node);

  // Le texte change sans que l'élément soit recréé (on passe d'une piste à la
  // suivante dans une liste clefée) : la bulle doit suivre.
  const mo =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => appliquer());
  mo?.observe(node, { childList: true, characterData: true, subtree: true });

  // Le geste clavier. Aucun ancêtre focalisable ⇒ rien à ouvrir : ce texte
  // n'est de toute façon pas atteignable au clavier.
  const focalisable = node.closest<HTMLElement>(FOCALISABLES);
  const inscrit: Inscrit = { node, texte: texteVoulu };

  if (focalisable) {
    let groupe = parAncetre.get(focalisable);
    if (!groupe) {
      // Les écouteurs sont posés UNE fois par ligne, pas une fois par texte.
      const surFocus = () => {
        if (gestePointeur) return;
        const morceaux = morceauxDe(focalisable);
        if (morceaux.length === 0) return;
        ouvrirLaBulle(focalisable, morceaux.join('\n'));
      };
      const surPerte = () => fermerLaBulle();
      const surEchap = (e: KeyboardEvent) => {
        if (e.key === 'Escape') fermerLaBulle();
      };
      focalisable.addEventListener('focusin', surFocus);
      focalisable.addEventListener('focusout', surPerte);
      focalisable.addEventListener('keydown', surEchap);
      groupe = {
        inscrits: new Set<Inscrit>(),
        detacher() {
          focalisable.removeEventListener('focusin', surFocus);
          focalisable.removeEventListener('focusout', surPerte);
          focalisable.removeEventListener('keydown', surEchap);
        },
      };
      parAncetre.set(focalisable, groupe);
    }
    groupe.inscrits.add(inscrit);
  }

  return {
    update(suivant?: string) {
      explicite = suivant;
      appliquer();
    },
    destroy() {
      ro?.disconnect();
      mo?.disconnect();
      if (focalisable) {
        const groupe = parAncetre.get(focalisable);
        groupe?.inscrits.delete(inscrit);
        if (groupe && groupe.inscrits.size === 0) {
          groupe.detacher();
          parAncetre.delete(focalisable);
          // Uniquement la sienne : démonter une ligne ne doit pas refermer la
          // bulle qu'une autre vient d'ouvrir.
          if (bulleOuvertePour === focalisable) fermerLaBulle();
        }
      }
    },
  };
}
