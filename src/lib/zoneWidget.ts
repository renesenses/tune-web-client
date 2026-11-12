// tune-server-rust#8531 — les touches média du clavier visent la zone choisie
// dans la fenêtre du widget de bureau.
//
// Le widget (Tauri) capte Lecture/Pause, Suivant et Précédent du clavier et
// les envoie au serveur, sur SA zone. La page ne peut appeler aucune commande
// native : elle signale donc la zone qu'elle affiche en naviguant vers
// `/__widget/zone/<id>`, une adresse que la fenêtre intercepte et ne charge
// jamais (même mécanisme que `/__widget/epingle`, voir `vueMini.ts`).
//
// Seulement sous `hote=widget` (vue mini ET interface complète du widget) :
// dans un navigateur, cette adresse serait un 404.
import type { Readable } from 'svelte/store';

/** La page vit-elle dans une fenêtre du widget de bureau (mini ou complète) ? */
export function estHoteWidget(search: string | null | undefined): boolean {
  return new URLSearchParams(search ?? '').get('hote') === 'widget';
}

/** L'adresse qu'intercepte la fenêtre Tauri pour retenir la zone. */
export function adresseZone(id: number): string {
  return `/__widget/zone/${id}`;
}

/**
 * Signale la zone affichée à chaque CHANGEMENT d'identifiant (pas à chaque
 * mise à jour de la zone : position, volume… arrivent plusieurs fois par
 * seconde). Rend de quoi se désabonner.
 */
export function brancherSignalZone(
  zone: Readable<{ id: number | null } | null | undefined>,
  naviguer: (adresse: string) => void,
): () => void {
  let derniere: number | null = null;
  return zone.subscribe((z) => {
    const id = z?.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id === derniere) return;
    derniere = id;
    naviguer(adresseZone(id));
  });
}
