// Le `localStorage` de jsdom, rendu aux bancs quand Node le masque —
// renesenses/tune-web-client#1555. Appelé par `setupStockageWeb.ts`
// (`vitest.config.ts` → `setupFiles`) ; ce module-ci n'a AUCUN effet à
// l'import, pour que le banc qui le teste ne se répare pas lui-même.
//
// 🔴 Depuis Node 25, Node expose SON PROPRE `localStorage` global (Web
// Storage, activé par défaut). Sans `--localstorage-file`, son accesseur rend
// `undefined` et avertit « localStorage is not available because
// --localstorage-file was not provided ». Cet accesseur masque celui de
// jsdom : sous Node 26, `localStorage` vaut `undefined` dans un banc jsdom, et
// `getToken()` (`auth.ts`) lève `Cannot read properties of undefined (reading
// 'getItem')`.
//
// MESURÉ sur Shrek le 24/09/2026, Node 26.10.0, `origin/main` intact :
// `pontRoonImport4349.test.ts` tombe à 10 rouges sur 10 (« le sélecteur de
// fichier est absent ») — `fetchJSON` lève avant même d'appeler `fetch`,
// l'écran affiche « indisponible » au lieu du sélecteur. Sous Node 22 (CI,
// Shrek), le même banc est vert, seul comme sous charge : ce n'était pas une
// attente trop courte, les `setTimeout(0)` de `laisserFaire()` vident déjà
// toutes les micro-tâches.
//
// On rend donc aux bancs jsdom le stockage de jsdom — celui qu'ils avaient
// toujours eu —, et uniquement quand l'accesseur global est inutilisable.
// Sous Node 22, rien n'est touché.

type Cible = Record<string, unknown>;

/** Le stockage est-il utilisable (un objet qui sait `getItem`) ? */
function utilisable(s: unknown): boolean {
  return !!s && typeof (s as Storage).getItem === 'function';
}

/**
 * Remplace, sur `cible`, chaque stockage Web inutilisable par celui de
 * `fenetre` (la fenêtre jsdom). Rend les noms réparés.
 */
export function reparerStockageWeb(
  cible: Cible,
  fenetre: { localStorage?: unknown; sessionStorage?: unknown } | null | undefined,
): string[] {
  const repares: string[] = [];
  if (!fenetre) return repares;
  for (const nom of ['localStorage', 'sessionStorage'] as const) {
    let actuel: unknown;
    try {
      actuel = cible[nom];
    } catch {
      actuel = undefined;
    }
    if (utilisable(actuel)) continue;
    let deJsdom: unknown;
    try {
      deJsdom = fenetre[nom];
    } catch {
      continue;
    }
    if (!utilisable(deJsdom)) continue;
    Object.defineProperty(cible, nom, { value: deJsdom, configurable: true, writable: true });
    repares.push(nom);
  }
  return repares;
}
