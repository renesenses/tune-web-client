/**
 * LES TRACÉS D'ICÔNES de la ligne de chiffres — d'après la maquette Figma de
 * Levente (`stats-bar-redesign`, page 2 du fichier « Claude »).
 *
 * La maquette emploie le jeu **Lucide**, déjà présent dans le fichier Figma.
 * Ce dépôt n'embarque aucune bibliothèque d'icônes : il dessine ses SVG en
 * ligne, à 24×24, trait `currentColor`. On reprend cet usage plutôt que
 * d'ajouter une dépendance pour huit tracés.
 *
 * ⚠️ Rendus par `{@html}`, donc ces chaînes sont des CONSTANTES et le
 * resteront : aucune valeur venue du serveur ou de l'utilisateur n'entre ici.
 */
export const TRACES: Readonly<Record<string, string>> = {
  'disc-3':
    '<circle cx="12" cy="12" r="10"/><path d="M6 12c0-1.7.7-3.2 1.8-4.2"/>' +
    '<circle cx="12" cy="12" r="2"/><path d="M18 12c0 1.7-.7 3.2-1.8 4.2"/>',
  'mic-2':
    '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  'music-2': '<circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/>',
  shapes:
    '<path d="M8.3 10a.7.7 0 0 1-.6-1.1L11.4 3a.7.7 0 0 1 1.2 0l3.7 5.9a.7.7 0 0 1-.6 1.1Z"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  hourglass:
    '<path d="M5 22h14"/><path d="M5 2h14"/>' +
    '<path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/>' +
    '<path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  'hard-drive':
    '<path d="M22 12H2"/>' +
    '<path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>' +
    '<path d="M6 16h.01"/><path d="M10 16h.01"/>',
  // Le tracé `server` de Lucide — celui des chiffres venus des SERVEURS
  // MULTIMÉDIA du réseau, pour que la carte porte la même image que l'écran
  // qui les gère (`nav.mediaservers`).
  server:
    '<rect x="2" y="2" width="20" height="8" rx="2"/>' +
    '<rect x="2" y="14" width="20" height="8" rx="2"/>' +
    '<path d="M6 6h.01"/><path d="M6 18h.01"/>',
  play: '<path d="M6 3l14 9-14 9Z"/>',
  headphones:
    '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
};

/** Le tracé d'une icône, ou celui d'un disque par défaut : une carte sans
 *  icône laisserait un cercle vide, plus voyant qu'une icône approchante. */
export function trace(nom: string): string {
  return TRACES[nom] ?? TRACES['disc-3'];
}
