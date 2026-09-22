/**
 * Le nom d'un PAYS, dans la langue du lecteur, à partir de son code ISO.
 *
 * ── LE DÉFAUT ────────────────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, v0.9.161 : sur chaque vignette de la page Radio,
 * un pays écrit en FRANÇAIS au milieu d'une interface roumaine — « Royaume-
 * Uni », « États-Unis », « Pays-Bas », « Suisse », « Japon », « Belgique ».
 *
 * Rien de cela n'était écrit dans le client : `radio_stations.country` est
 * une colonne texte libre, semée en toutes lettres et en français par
 * `tune-core/migrations/radios/annuaire_mozaiklabs_2026_08_30.sql:138` et
 * suivantes. Le client la recopiait, faute d'avoir autre chose.
 *
 * ── CE QUI A CHANGÉ CÔTÉ SERVEUR ─────────────────────────────────────────
 *
 * tune-server-rust #4713 joint désormais `country_code`, le code ISO 3166-1
 * alpha-2 (`tune-server/src/routes/radios_libelles.rs:136`). Le nom en clair
 * reste là, inchangé — c'est lui que cite `docs/contrat-web.json`.
 *
 * ── POURQUOI `Intl.DisplayNames` ET PAS UNE TABLE ────────────────────────
 *
 * Une table de pays ici, ce serait 249 entrées × 11 langues à tenir à jour,
 * pour redire ce que le navigateur sait déjà. `Intl.DisplayNames` rend « GB »
 * en « Royaume-Uni », « Regatul Unit », « Vereinigtes Königreich » ou
 * « イギリス » selon la langue demandée — et pour TOUS les pays, pas seulement
 * ceux que le serveur a pensé à ranger dans sa table.
 *
 * C'est aussi pourquoi ce module ne contredit pas la garde
 * « le client ne fabrique pas de table de pays » : il n'en fabrique toujours
 * pas une. Il lit un code et délègue.
 *
 * ── LE REPLI, QUI EST LE POINT DÉLICAT ───────────────────────────────────
 *
 * Trois choses peuvent manquer, et aucune ne doit produire une étiquette
 * vide ni un code nu à l'écran :
 *
 *   1. le serveur est antérieur à la v0.9.162 → pas de `country_code`. On
 *      rend `country`, exactement comme avant ce correctif ;
 *   2. le pays est écrit à la main sous une forme que le serveur ne reconnaît
 *      pas (« Ecosse ») → pas de code non plus, même repli ;
 *   3. `Intl.DisplayNames` manque, ou ne connaît pas le code. Il est présent
 *      partout depuis 2021, mais un `Intl` amputé (jsdom ancien, navigateur
 *      embarqué) jetterait ici — l'appel est donc gardé, et le repli suit.
 */

/**
 * Une fabrique par langue : `Intl.DisplayNames` coûte cher à construire, et
 * la page Radio l'appellerait une fois par vignette à chaque rendu.
 *
 * `undefined` en valeur est un échec MÉMORISÉ : inutile de retenter la
 * construction à chaque ligne quand l'environnement ne la porte pas.
 */
const fabriques = new Map<string, Intl.DisplayNames | undefined>();

function fabrique(langue: string): Intl.DisplayNames | undefined {
  if (fabriques.has(langue)) return fabriques.get(langue);
  let dn: Intl.DisplayNames | undefined;
  try {
    // `fallback: 'none'` : un code que CLDR ne connaît pas rend `undefined`
    // plutôt que le code lui-même. C'est la différence entre « on ne sait
    // pas, prends le nom du serveur » et « QQ » écrit sur une vignette.
    dn = new Intl.DisplayNames([langue], { type: 'region', fallback: 'none' });
  } catch {
    dn = undefined;
  }
  fabriques.set(langue, dn);
  return dn;
}

/**
 * Le nom du pays à AFFICHER.
 *
 * @param code   le `country_code` servi par le serveur, ou rien
 * @param langue la langue de l'interface (`$locale`)
 * @param repli  le `country` en clair servi par le serveur, ou rien
 *
 * Rend une chaîne vide seulement quand il n'y a RIEN à dire — ni code, ni
 * nom : l'appelant n'affiche alors pas de pastille du tout, ce qui est plus
 * honnête qu'un tiret.
 */
export function nomDuPays(
  code: string | null | undefined,
  langue: string,
  repli?: string | null,
): string {
  const secours = (repli ?? '').trim();
  const c = (code ?? '').trim().toUpperCase();
  // Un code ISO 3166-1 alpha-2, et rien d'autre : « USA » ou « fr-FR » n'en
  // sont pas, et `Intl.DisplayNames` les rendrait tels quels.
  if (!/^[A-Z]{2}$/.test(c)) return secours;
  // 🔴 `ZZ` est le code CLDR de la région INDÉTERMINÉE : il est parfaitement
  // valide, et `Intl.DisplayNames` le rend en toutes lettres — « région
  // indéterminée » sur une vignette de radio. Mesuré, pas supposé. Le nom du
  // serveur, même en français, dit strictement plus que ça.
  if (c === 'ZZ') return secours;

  const dn = fabrique(langue);
  if (dn) {
    try {
      const nom = dn.of(c);
      // `of()` rend le CODE lui-même quand il ne connaît pas la région.
      // « GB » sur une vignette serait pire que « Royaume-Uni » : on préfère
      // alors le nom en clair du serveur, s'il y en a un.
      if (nom && nom !== c) return nom;
    } catch {
      /* environnement sans table de régions : le repli suit */
    }
  }
  return secours || c;
}
