/**
 * NORMALISER UN CHEMIN AVANT DE L'ENVOYER AU SERVEUR — Yves, 28/09/2026.
 *
 * macOS rend les noms de fichiers en **NFD** (décomposé) : dans « CDThèque »,
 * le `è` s'écrit `e` suivi d'un accent combinant, et la chaîne occupe NEUF
 * caractères au lieu de huit. Un chemin recopié du Finder, ou rendu par une
 * route qui lit le disque, arrive donc sous cette forme.
 *
 * 🔴 Le serveur, lui, bâtit son motif SQL en **NFC** (`folder_like_pattern`,
 * `tune-core/src/db/track_repo.rs`) : c'est la forme que porte la base. Les
 * deux formes se ressemblent à l'écran et ne sont pas la même chaîne.
 *
 * Mesuré sur le .18 le 28/09 : `/data/recordings/Tidal/José González` demandé
 * en NFC rend « Local Valley (Deluxe) » ; le MÊME dossier demandé en NFD rend
 * « cal Valley (Deluxe) » — deux caractères perdus pour deux lettres
 * accentuées. C'est le « arillion » d'Yves, pour son unique `è`.
 *
 * ⚠️ Ceci est la ceinture, pas le remède. Le défaut de fond est côté serveur,
 * qui compte la longueur du préfixe sur la chaîne brute alors qu'il cherche en
 * NFC. Tant qu'il n'est pas corrigé, un chemin NFD venu d'ailleurs — une règle
 * enregistrée avant ce correctif, un client tiers — produira toujours des noms
 * tronqués. Ne pas fermer le sujet sur ce seul fichier.
 */
export function normaliserChemin(chemin: string | null | undefined): string {
  if (!chemin) return '';
  return chemin.normalize('NFC');
}
