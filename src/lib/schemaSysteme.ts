/**
 * Le schéma du système : serveur → zones → appareils.
 *
 * Il existait déjà, mais seulement comme TEXTE Mermaid, généré pour être joint
 * au ticket et rendu ailleurs — côté admin mozaiklabs. L'utilisateur, lui, ne
 * l'a jamais vu.
 *
 * Bertrand, 05/09/2026 : « onglet visualiser son système (avec le schéma
 * mermaid affiché) ». D'où ce module : il rend le MODÈLE — un serveur, ses
 * zones, leurs appareils — et deux vues de ce modèle, l'une pour l'écran,
 * l'autre pour le presse-papiers.
 *
 * ## Pourquoi le modèle, et pas une chaîne
 *
 * Un écran qui affiche du Mermaid doit embarquer Mermaid : environ un demi-Mo
 * sur un paquet qui pèse déjà 4,6 Mo et sur lequel l'outil de construction
 * proteste. Or le graphe a trois niveaux et deux arêtes par zone : le dessiner
 * directement coûte moins cher que la bibliothèque qui saurait le dessiner.
 *
 * Le texte Mermaid ne disparaît pas pour autant — il reste la forme jointe aux
 * tickets, et il reste copiable. Les deux sortent du MÊME modèle : le schéma
 * qu'on regarde et celui qu'on envoie au support ne peuvent plus diverger.
 */

import type { Zone } from './types';

/** Un appareil au bout d'une zone, quand on sait le nommer. */
export interface NoeudAppareil {
  libelle: string;
}

export interface NoeudZone {
  nom: string;
  /** DLNA, AIRPLAY, LOCAL… — en capitales, c'est le transport. */
  transport: string;
  appareil: NoeudAppareil | null;
  /** `false` seulement si le serveur l'a dit hors ligne ; `true` sinon. */
  enLigne: boolean;
}

export interface SchemaSysteme {
  serveur: string;
  zones: NoeudZone[];
}

/**
 * Le modèle, depuis les zones connues du client.
 *
 * Une zone sans identifiant est écartée : elle n'est pas encore une zone, et
 * la faire figurer donnerait un schéma que le serveur ne reconnaîtrait pas.
 */
export function modeleSysteme(zones: readonly Zone[], version: string): SchemaSysteme {
  return {
    serveur: `Tune Server v${version}`,
    zones: (zones ?? [])
      .filter((z) => z.id != null)
      .map((z) => {
        const appareil = [z.brand ?? (z as any).detected_manufacturer, z.model ?? (z as any).detected_model]
          .filter(Boolean)
          .join(' ');
        return {
          nom: z.name,
          transport: String((z as any).output_type ?? 'local').toUpperCase(),
          appareil: appareil ? { libelle: appareil } : null,
          // 🔴 `!== false` et non `=== true` : une zone dont le serveur ne dit
          // rien est réputée en ligne. Avec `=== true`, toute zone sans le
          // champ apparaissait en pointillés, c'est-à-dire en panne.
          enLigne: (z as any).online !== false,
        };
      }),
  };
}

/**
 * Le même modèle en Mermaid — la forme jointe aux tickets.
 *
 * Les libellés sont échappés en entités numériques (`#NN;`) : un nom
 * d'appareil portant un guillemet ou un crochet casserait l'analyseur.
 */
export function mermaidSysteme(s: SchemaSysteme): string {
  const esc = (t: string) => t.replace(/[^\p{L}\p{N} .:+/·'-]/gu, (c) => `#${c.codePointAt(0)};`);
  const lignes: string[] = ['flowchart LR', `  S["${esc(s.serveur)}"]`];
  s.zones.forEach((z, i) => {
    const zid = `Z${i}`;
    lignes.push(`  S --> ${zid}["${esc(z.nom)} (${esc(z.transport)})"]`);
    if (z.appareil) lignes.push(`  ${zid} --> D${i}["${esc(z.appareil.libelle)}"]`);
    if (!z.enLigne) lignes.push(`  style ${zid} stroke-dasharray: 4 4`);
  });
  return lignes.join('\n');
}

/* ------------------------------------------------------------------ */
/* Mise en page du dessin                                              */
/* ------------------------------------------------------------------ */

/** Une boîte posée sur le plan, en unités de pixels. */
export interface Boite {
  x: number; y: number; l: number; h: number;
  texte: string;
  /** `serveur` | `zone` | `appareil` — c'est ce qui décide de son allure. */
  genre: 'serveur' | 'zone' | 'appareil';
  /** Hors ligne : la boîte se dessine en pointillés. */
  horsLigne?: boolean;
}

export interface Trait { x1: number; y1: number; x2: number; y2: number; horsLigne?: boolean }

export interface Plan { boites: Boite[]; traits: Trait[]; largeur: number; hauteur: number }

const COL_L = 190;   // largeur d'une boîte
const COL_H = 46;    // hauteur d'une boîte
const ECART_X = 74;  // espace entre deux colonnes
const ECART_Y = 16;  // espace entre deux lignes

/**
 * Range le modèle en trois colonnes — serveur, zones, appareils — de gauche à
 * droite, comme le `flowchart LR` d'origine.
 *
 * Le serveur est centré sur la HAUTEUR TOTALE des zones : posé en haut, il
 * pointait vers le bas sur une installation à six zones, et le trait vers la
 * dernière zone traversait tout le dessin.
 */
export function planSysteme(s: SchemaSysteme): Plan {
  const boites: Boite[] = [];
  const traits: Trait[] = [];

  const n = Math.max(s.zones.length, 1);
  const hauteur = n * COL_H + (n - 1) * ECART_Y;
  const xS = 0, xZ = COL_L + ECART_X, xD = 2 * (COL_L + ECART_X);

  const yS = hauteur / 2 - COL_H / 2;
  boites.push({ x: xS, y: yS, l: COL_L, h: COL_H, texte: s.serveur, genre: 'serveur' });

  s.zones.forEach((z, i) => {
    const y = i * (COL_H + ECART_Y);
    boites.push({
      x: xZ, y, l: COL_L, h: COL_H,
      texte: `${z.nom} (${z.transport})`, genre: 'zone', horsLigne: !z.enLigne,
    });
    traits.push({ x1: xS + COL_L, y1: yS + COL_H / 2, x2: xZ, y2: y + COL_H / 2, horsLigne: !z.enLigne });
    if (z.appareil) {
      boites.push({ x: xD, y, l: COL_L, h: COL_H, texte: z.appareil.libelle, genre: 'appareil' });
      traits.push({ x1: xZ + COL_L, y1: y + COL_H / 2, x2: xD, y2: y + COL_H / 2 });
    }
  });

  const aDesAppareils = s.zones.some((z) => z.appareil);
  return {
    boites, traits,
    largeur: aDesAppareils ? xD + COL_L : xZ + COL_L,
    hauteur,
  };
}
