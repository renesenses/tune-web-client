/**
 * Les RUBRIQUES éditoriales d'un genre (#1300, serveur tune-server-rust#3481).
 *
 * L'écran d'un genre ne montrait qu'une grille : les nouveautés du genre, et
 * rien d'autre. Le serveur sait depuis tune-server-rust#4524 restreindre
 * CHAQUE rubrique éditoriale à un genre —
 * `GET /streaming/{service}/genres/{id}/albums?section=<rubrique>` — et la
 * mesure contre l'API Qobuz (Jazz, `genre_ids=80`) donne des listes
 * franchement différentes : `press-awards` 9257 → 415, `ideal-discography`
 * 3520 → 422, `qobuzissims` 321 → 40. Aucun écran ne le demandait.
 *
 * 🔴 Le piège que ce module existe pour désamorcer : le client part en continu
 * sur des serveurs ANTÉRIEURS à ce travail (0.9.155, 0.9.156 — vérifié :
 * `section` n'apparaît pas une fois dans leur `tune-streaming-http`). Ces
 * serveurs ne rejettent pas le paramètre, ils le JETTENT : les sept rubriques
 * rendent alors rigoureusement la même liste. Mesuré contre un 0.9.152, genre
 * Jazz, `limit=40`, empreinte des identifiants rendus :
 *
 * ```text
 * section=new-releases       40 albums  c6f81526c4cd
 * section=press-awards       40 albums  c6f81526c4cd
 * section=ideal-discography  40 albums  c6f81526c4cd
 * section=qobuzissims        40 albums  c6f81526c4cd
 * ```
 *
 * Empiler sans garde afficherait donc sept fois la même grille de quarante
 * pochettes. La règle retenue est SONDER AVANT D'EMPILER : on demande les deux
 * premières rubriques ; si elles rendent la même liste, le serveur ignore le
 * paramètre — on s'arrête là, on n'envoie pas les cinq requêtes restantes, et
 * on rend UNE bande, celle que l'écran rendait déjà.
 */
import type { FeaturedSection } from './types';

/**
 * La clé de traduction d'une rubrique, par son identifiant serveur.
 *
 * Le serveur rend des noms anglais (`"Press Awards"`) ; les sept libellés sont
 * traduits dans les onze langues sous `streaming.section.*` depuis longtemps,
 * mais seule l'ancienne coquille s'en servait.
 */
export const CLE_RUBRIQUE: Readonly<Record<string, string>> = {
  'new-releases': 'streaming.section.newReleases',
  'best-sellers': 'streaming.section.bestSellers',
  'press-awards': 'streaming.section.pressAwards',
  'editor-picks': 'streaming.section.editorPicks',
  'most-streamed': 'streaming.section.mostStreamed',
  'ideal-discography': 'streaming.section.idealDiscography',
  qobuzissims: 'streaming.section.qobuzissimes',
};

/** Une bande de l'écran : un titre, une liste d'albums. */
export interface BandeRubrique {
  /** L'identifiant serveur de la rubrique ; `''` pour la liste par défaut. */
  id: string;
  /** La clé `streaming.section.*`, ou `null` quand la bande n'a pas de titre. */
  cle: string | null;
  /** Le nom rendu par le serveur — le repli quand aucune clé ne correspond. */
  nom: string;
  albums: unknown[];
}

/**
 * L'empreinte d'une liste : ses identifiants, dans l'ordre.
 *
 * C'est ce qui distingue « deux rubriques différentes » de « la même liste
 * rendue deux fois ». La longueur seule ne suffirait pas : sur un serveur qui
 * ignore la rubrique, les sept listes ont la même longueur ET le même contenu.
 */
export function empreinteAlbums(albums: readonly unknown[]): string {
  return albums
    .map((a) => {
      const o = a as { source_id?: unknown; id?: unknown } | null;
      return String(o?.source_id ?? o?.id ?? '');
    })
    .join('|');
}

/** Charge une rubrique ; `undefined` demande la liste par défaut, sans `?section=`. */
export type ChargeurRubrique = (section?: string) => Promise<unknown[]>;

function bande(s: FeaturedSection, albums: unknown[]): BandeRubrique {
  return { id: s.id, cle: CLE_RUBRIQUE[s.id] ?? null, nom: s.name ?? s.id, albums };
}

/** La bande SANS titre : exactement ce que l'écran rendait avant ce lot. */
async function bandeParDefaut(charger: ChargeurRubrique): Promise<BandeRubrique[]> {
  const albums = await charger().catch(() => [] as unknown[]);
  return albums?.length ? [{ id: '', cle: null, nom: '', albums }] : [];
}

/** Une rubrique qui échoue — un `type` inconnu vaut un 400 de Qobuz — ne doit
 *  pas emporter les autres avec elle : elle rend une liste vide, et disparaît. */
function sonder(charger: ChargeurRubrique, id: string): Promise<unknown[]> {
  return charger(id).then((a) => a ?? [], () => [] as unknown[]);
}

/**
 * Les bandes à afficher pour un genre, dans l'ordre où le serveur range ses
 * rubriques.
 *
 * Trois dégradations, dans cet ordre :
 *
 * 1. **moins de deux rubriques servies** — rien à empiler : la liste par
 *    défaut, sans titre, comme avant ;
 * 2. **les deux premières rubriques rendent la même liste** — le serveur jette
 *    `?section=` : une seule bande, et les rubriques suivantes ne sont même pas
 *    demandées ;
 * 3. **une rubrique vide ou en erreur** — elle est écartée ; si toutes le sont,
 *    on retombe sur la liste par défaut plutôt que sur un écran vide.
 *
 * Deux bandes ne portent jamais la même liste : à empreinte égale, la première
 * gagne.
 */
export async function chargerRubriquesGenre(
  sections: readonly FeaturedSection[] | null | undefined,
  charger: ChargeurRubrique,
): Promise<BandeRubrique[]> {
  const rubriques = (sections ?? []).filter((s): s is FeaturedSection => !!s && !!s.id);

  if (rubriques.length < 2) {
    return bandeParDefaut(charger);
  }

  const [premiere, seconde] = await Promise.all([
    sonder(charger, rubriques[0].id),
    sonder(charger, rubriques[1].id),
  ]);

  // Le serveur ne sait rien servir sous une rubrique : ni écran vide, ni
  // sept bandes vides — la liste par défaut.
  if (!premiere.length && !seconde.length) {
    return bandeParDefaut(charger);
  }

  // 🔴 La dégradation qui commande tout : deux rubriques différentes qui
  // rendent la MÊME liste ne peuvent signifier qu'une chose — le paramètre
  // n'est pas lu. On s'arrête ici, sans demander les rubriques restantes.
  if (premiere.length && empreinteAlbums(premiere) === empreinteAlbums(seconde)) {
    return [bande(rubriques[0], premiere)];
  }

  const suite = await Promise.all(rubriques.slice(2).map((s) => sonder(charger, s.id)));
  const listes = [premiere, seconde, ...suite];

  const vues = new Set<string>();
  const bandes: BandeRubrique[] = [];
  for (let i = 0; i < rubriques.length; i++) {
    const albums = listes[i];
    if (!albums.length) continue;
    const empreinte = empreinteAlbums(albums);
    if (vues.has(empreinte)) continue;
    vues.add(empreinte);
    bandes.push(bande(rubriques[i], albums));
  }

  return bandes.length ? bandes : bandeParDefaut(charger);
}
