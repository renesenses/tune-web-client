/**
 * Proposer de charger le CD inséré en mémoire — renesenses/tune-server-rust#6596
 * (« option 3 » du fil 2342, décision du 20/10).
 *
 * À l'insertion d'un disque, le serveur publie `cd.disque.insere`. Le client
 * propose alors, SANS rien bloquer ni rien jouer : « Disque inséré : … —
 * Charger en mémoire ». Le chargement ne touche ni à la file ni à la lecture
 * en cours (`POST /ext/cd/memoire/charger`). Sa fin (`cd.memoire.termine`)
 * donne « Disque chargé — Lire » : c'est l'utilisateur qui lance la lecture,
 * jamais le client tout seul. La progression se lit dans l'écran Lecture CD.
 *
 * Seul le client qui a demandé le chargement annonce « Disque chargé » : un
 * chargement parti d'une lecture (le disque joue déjà) ne propose rien.
 */
import type { WSEvent } from './types';
import { chargementDepuisEvenement, chargerCdEnMemoire, codeRefusCd, jouerCd } from './lectureCd';

export interface AnnonceInsertionCd {
  disc_id: string;
  nom?: string | null;
  album?: string | null;
  artiste?: string | null;
  pistes?: number | null;
  memoire?: { disponible?: boolean; actif?: boolean } | null;
}

/** Ce dont la proposition a besoin, injecté (les témoins le simulent). */
export interface DependancesProposition {
  /** Toast avec un bouton ; rend son identifiant. */
  proposer: (message: string, bouton: string, action: () => void) => number;
  info: (message: string) => void;
  erreur: (message: string) => void;
  retirer: (id: number) => void;
  /** La traduction d'une clé. */
  traduire: (cle: string) => string;
  /** La zone courante au moment du geste, `null` sans zone. */
  zoneCourante: () => number | null;
  charger?: () => Promise<unknown>;
  jouer?: (zoneId: number) => Promise<unknown>;
  /** Après « Lire » : la barre de lecture suit la zone. */
  apresLecture?: (zoneId: number) => void;
}

/** Le nom du disque à montrer : « Artiste — Album », l'album, ou « CD audio ». */
export function nomDisqueInsere(a: AnnonceInsertionCd, repli: string): string {
  const nom = (a.nom ?? '').trim();
  if (nom && nom !== 'CD audio') return nom;
  const album = (a.album ?? '').trim();
  return album || repli;
}

/**
 * Le suivi des propositions : un évènement du bus à la fois. Rend la
 * fonction qui traite un évènement (les témoins l'appellent directement).
 */
export function creerPropositionChargementCd(d: DependancesProposition): (ev: WSEvent) => void {
  const charger = d.charger ?? chargerCdEnMemoire;
  const jouer = d.jouer ?? ((z: number) => jouerCd(z));
  /** Disques dont CE client a demandé le chargement → leur nom. */
  const demandes = new Map<string, string>();
  /** Le toast de proposition encore affiché, par disque. */
  const toasts = new Map<string, number>();

  function lancerLecture() {
    const z = d.zoneCourante();
    if (z == null) { d.erreur(d.traduire('v2.art.noZone')); return; }
    jouer(z).then(
      () => d.apresLecture?.(z),
      () => d.erreur(d.traduire('v2.cd.playFailed')),
    );
  }

  function demanderChargement(discId: string, nom: string) {
    toasts.delete(discId);
    demandes.set(discId, nom);
    d.info(d.traduire('v2.cd.memLoadStarted'));
    charger().catch((e) => {
      demandes.delete(discId);
      const code = codeRefusCd(e);
      d.erreur(d.traduire(code === 'extraction_en_cours' ? 'v2.cd.busyRipping' : 'v2.cd.memLoadFailed'));
    });
  }

  return (ev: WSEvent) => {
    if (ev?.type === 'cd.disque.insere') {
      const a = ev.data as AnnonceInsertionCd | null;
      if (!a || typeof a.disc_id !== 'string') return;
      // Réglage coupé (petite machine) ou serveur sans mémoire : rien à proposer.
      if (a.memoire?.actif !== true) return;
      const nom = nomDisqueInsere(a, d.traduire('v2.cd.unknownAlbum'));
      const ancien = toasts.get(a.disc_id);
      if (ancien != null) d.retirer(ancien);
      const id = d.proposer(
        d.traduire('v2.cd.insertedPrompt').replace('{disc}', nom),
        d.traduire('v2.cd.loadIntoMemory'),
        () => demanderChargement(a.disc_id, nom),
      );
      toasts.set(a.disc_id, id);
      return;
    }
    if (ev?.type === 'cd.memoire.termine') {
      const c = chargementDepuisEvenement(ev);
      if (!c) return;
      const nom = demandes.get(c.disc_id);
      if (nom === undefined) return;
      demandes.delete(c.disc_id);
      if (c.fin === 'termine') {
        d.proposer(
          d.traduire('v2.cd.memReadyPrompt').replace('{disc}', nom),
          d.traduire('v2.cd.playDisc'),
          lancerLecture,
        );
      } else if (c.fin === 'ejecte' || c.fin === 'echec') {
        d.erreur(d.traduire('v2.cd.memLoadFailed'));
      }
    }
  };
}

/** Abonne le bus ; rend la fonction de désabonnement. */
export function abonnerPropositionChargementCd(
  onEvent: (h: (ev: WSEvent) => void) => () => void,
  d: DependancesProposition,
): () => void {
  return onEvent(creerPropositionChargementCd(d));
}
