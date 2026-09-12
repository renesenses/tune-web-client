/**
 * Les JOURNAUX du serveur — lecture et export, pour les DEUX coquilles.
 *
 * 🔴 #865, et c'est le défaut le plus cher de la liste.
 *
 * À chaque fois qu'on demande ses journaux à un testeur, celui qui est en `?v2`
 * ne peut pas les fournir : ni page, ni bouton, ni fichier. `DiagnosticsView`
 * les sert depuis toujours, mais `App.svelte` est son SEUL montage, et la
 * coquille `ShellV2` ne monte jamais `App.svelte` — elle rend `TuneHealthV2`
 * sous la même vue `diagnostics`, et cet écran ne parle que des traitements de
 * fond de la bibliothèque. Écrit, pas branché : le motif de ce dépôt.
 *
 * Ce module est le PORTAGE, pas une réécriture. Le geste vient mot pour mot de
 * `DiagnosticsView.svelte` — même route, même nombre de lignes, même en-tête,
 * même nom de fichier — extrait ici pour que les deux écrans l'appellent au
 * lieu d'en tenir chacun une copie. Il y en avait déjà deux dans le client
 * actuel (`DiagnosticsView` et `SettingsView`), et elles avaient DÉJÀ divergé :
 * celle de `SettingsView` lit la réponse en `.text()` alors que la route rend
 * du JSON, et exporte donc le JSON brut au lieu des lignes de journal.
 *
 * ## Rien ici ne parle à l'utilisateur
 *
 * Ni notification, ni traduction — la même règle que `historiqueLecture`. Le
 * module rend ce qu'il a lu ; l'écran décide comment l'annoncer et dans quelle
 * langue. C'est aussi ce qui permet de l'éprouver sans monter de composant.
 */

import * as api from './api';

/** Ce que la route `/system/logs` rend, une fois dépouillée. */
export interface Journaux {
  /** Les lignes, telles quelles. Chaîne vide si le serveur n'en a aucune. */
  texte: string;
  /** D'où le serveur les tient : `journald`, `fichier`, … Jamais vide. */
  source: string;
}

/** Un fichier prêt à être remis à un testeur. */
export interface FichierJournaux {
  nom: string;
  contenu: string;
}

/**
 * Combien de lignes on demande.
 *
 * Mille, comme `DiagnosticsView` depuis l'origine. Ce n'est pas un réglage à
 * négocier : c'est ce que les testeurs ont l'habitude de joindre, et un export
 * plus court couperait précisément le redémarrage qu'on cherche à lire.
 */
export const LIGNES_PAR_DEFAUT = 1000;

/**
 * Le nom du fichier remis — `tune-logs-2026-09-12.txt`.
 *
 * 🔴 Ce nom est un CONTRAT, pas un détail. C'est lui que Bertrand et les
 * testeurs se citent sur le forum (« envoie-moi ton tune-logs »), et les deux
 * coquilles doivent produire le même. La date reste en ISO, donc triable, et
 * volontairement sans heure : deux exports le même jour s'écrasent l'un
 * l'autre dans le dossier de téléchargement plutôt que de s'y empiler.
 */
export function nomFichierJournaux(quand: Date = new Date()): string {
  return `tune-logs-${quand.toISOString().slice(0, 10)}.txt`;
}

/**
 * L'en-tête du fichier.
 *
 * Sans lui, un journal reçu sur le forum ne dit ni quelle version tournait, ni
 * sur quel système, ni d'où les lignes viennent — trois questions qu'il faut
 * sinon reposer au testeur, et un aller-retour de plus par signalement.
 */
export function enteteJournaux(version: string, os: string, source: string): string {
  return `Tune Server ${version} | ${os} | source: ${source}\n${'='.repeat(60)}\n\n`;
}

/** Lit les dernières lignes du serveur. Lève si la route refuse. */
export async function lireJournaux(lignes: number = LIGNES_PAR_DEFAUT): Promise<Journaux> {
  const r: any = await api.apiFetch(`/system/logs?lines=${lignes}`);
  return { texte: r?.logs ?? '', source: r?.source ?? 'unknown' };
}

export interface OptionsFichier {
  lignes?: number;
  /**
   * Ce qu'on écrit à la place quand le serveur ne rend aucune ligne. L'écran
   * le fournit traduit : un fichier vide se lit comme un export raté, et le
   * testeur le renvoie une seconde fois pour rien.
   */
  siVide?: string;
  /** Injectable pour les témoins — la date du nom de fichier. */
  quand?: Date;
}

/**
 * Compose le fichier complet : en-tête puis journaux.
 *
 * La fiche `/system/diagnostics` est facultative — un serveur qui la refuse ne
 * doit pas coûter l'export, qui est justement ce qu'on vient chercher quand ce
 * serveur va mal. On dit alors qu'on ne sait pas, au lieu de renoncer.
 */
export async function construireFichierJournaux(o: OptionsFichier = {}): Promise<FichierJournaux> {
  const { texte, source } = await lireJournaux(o.lignes ?? LIGNES_PAR_DEFAUT);
  const diag: any = await api.apiFetch('/system/diagnostics').catch(() => null);
  const entete = enteteJournaux(
    diag?.server_version ?? 'inconnue',
    diag?.os ?? 'inconnu',
    source,
  );
  return {
    nom: nomFichierJournaux(o.quand ?? new Date()),
    contenu: entete + (texte || o.siVide || ''),
  };
}

/**
 * Remet un texte au navigateur sous forme de fichier.
 *
 * L'ancre est posée dans le document AVANT le clic et retirée après : un
 * `<a download>` détaché n'ouvre rien dans plusieurs navigateurs, et c'est de
 * là que venait l'export muet de `SettingsView` sur certaines webviews.
 *
 * `doc` est un paramètre pour que le témoin puisse regarder ce qui a été
 * fabriqué sans dépendre d'un vrai téléchargement.
 */
export function telechargerTexte(
  nom: string,
  contenu: string,
  doc: Document = document,
): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/plain' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = nom;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Le geste complet : lire, composer, remettre. Lève ce que le serveur a dit. */
export async function telechargerJournaux(o: OptionsFichier = {}): Promise<FichierJournaux> {
  const fichier = await construireFichierJournaux(o);
  telechargerTexte(fichier.nom, fichier.contenu);
  return fichier;
}
