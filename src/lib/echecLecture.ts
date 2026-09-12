/**
 * UN échec de lecture DOIT se voir. Point.
 *
 * ## Le défaut (renesenses/tune-server-rust#3732, #3737)
 *
 * Le 09/09/2026, un testeur Windows signale « lecture impossible des albums ».
 * Il a fallu descendre dans 200 lignes de son journal serveur pour découvrir
 * que son DAC n'était plus énuméré par WASAPI. Le serveur le savait, l'écrivait,
 * et NOMMAIT même les appareils disponibles :
 *
 *     exclusive_open_failed_without_fallback backend="WASAPI"
 *       requested_device="audio-gd USB audio"
 *       error="Endpoint WASAPI demandé introuvable : « audio-gd USB audio ».
 *              Disponibles : Haut-parleurs [{0.0.0.00000000}.{e0ea21cf-…}]"
 *
 * Il l'a poussé à toutes les télécommandes, avec `fatal: true`. Aucune ne l'a
 * affiché. Une heure de diagnostic pour un message que l'utilisateur aurait lu
 * en trois secondes.
 *
 * ## Pourquoi un module, et pas dix-neuf `catch` écrits à la main
 *
 * Les dix-neuf appels de lecture de la coquille v2 finissaient par
 * `.catch(() => {})`. Les corriger un par un rouvrirait le trou au vingtième :
 * `.catch(signalerEchecLecture)` est plus court que `.catch(() => {})`, donc
 * c'est aussi le geste le plus facile à répéter. Un garde le vérifie
 * (`v2EchecsLectureVisibles.test.ts`).
 *
 * ## Ce que ce module n'invente pas
 *
 * Rien. Le message vient du SERVEUR et est affiché tel quel ; `library.playbackError`
 * — la clé que la v1 emploie déjà (`LibraryView.svelte`) — ne sert que de
 * préfixe quand le message brut ne se suffit pas. Aucune clé de traduction
 * nouvelle n'a été ajoutée : les onze langues portent déjà celle-ci.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';

/**
 * Un échec nommé se lit plus longtemps qu'un succès : le message du serveur
 * porte l'appareil demandé ET la liste des disponibles, ce qui fait deux
 * lignes. Cinq secondes ne suffisent pas à les lire.
 */
const DUREE_ECHEC_MS = 10000;

/**
 * Le MOTIF nommé par le serveur, que le message de l'erreur ne porte pas.
 *
 * 🔴 Mesuré dans le navigateur le 12/09/2026, route `/play` coupée avec le
 * refus exact de `routes/playback.rs` (`400 {"error":"no tracks to play"}`).
 * Le bandeau affichait :
 *
 *     « Erreur de lecture : 400 Bad Request »
 *
 * …et non « no tracks to play ». La cause est dans `lib/api.ts` : il construit
 * ses erreurs à DEUX endroits, et les deux ne se valent pas.
 *
 *   - `erreurDepuisReponse()` lit `j?.error ?? j?.message ?? j?.detail` — le
 *     motif entre dans le message ;
 *   - `apiError()`, le chemin des LECTURES, honore `body.detail` et
 *     `body.message` mais range `body.error` dans `err.code` — **jamais dans
 *     le message**. Le refus le plus courant du serveur de lecture est
 *     précisément de cette forme-là.
 *
 * L'information n'est donc pas perdue : elle est à côté, dans `.code`. On la
 * relit ici plutôt que de corriger `api.ts`, qui appartient à un autre lot en
 * cours (UH) — la correction de fond y est signalée, pas faite.
 */
function codeRefus(e: unknown): string {
  const c = (e as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' ? c.trim() : '';
}

/** Le texte affichable de l'échec : son message ET le motif nommé du serveur. */
function detailEchec(e: unknown): string {
  const texte = texteEchec(e);
  const code = codeRefus(e);
  if (!code) return texte;
  if (!texte) return code;
  // « 400 Bad Request — no tracks to play ». On n'accole pas un motif que le
  // message porte déjà : le répéter ne renseigne personne.
  return texte.includes(code) ? texte : `${texte} — ${code}`;
}

/** Le texte de l'échec, quelle que soit la forme sous laquelle il remonte. */
export function texteEchec(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as { message?: unknown; error?: unknown };
  if (typeof o.message === 'string') return o.message;
  if (typeof o.error === 'string') return o.error;
  const s = String(e);
  return s === '[object Object]' ? '' : s;
}

/**
 * Le message qu'un écran à BANDEAU affiche pour un échec de lecture — et la
 * trace console qui va avec.
 *
 * ## Pourquoi tous les écrans ne prennent pas le même chemin
 *
 * `signalerEchecLecture` pose un toast. Trois écrans v2 — `FavoritesV2`,
 * `StreamingV2` et l'onglet Bandcamp — ont leur PROPRE bandeau `error` en tête
 * de liste, et c'est un meilleur endroit : il est là où le regard est, et il se
 * REMPLACE au lieu de s'empiler. Les y remplacer par un toast serait une
 * régression d'ergonomie.
 *
 * Mais leur bandeau ne portait que le repli générique — « Lecture impossible. »
 * — et n'écrivait RIEN dans la console. Des trois niveaux qu'un échec doit
 * atteindre, il n'en tenait qu'un :
 *
 *   1. l'utilisateur voit qu'il s'est passé quelque chose  ✔ (le bandeau)
 *   2. la console garde de quoi diagnostiquer              ✘ (rien du tout)
 *   3. et QUOI a échoué                                    ✘ (repli générique)
 *
 * Un testeur avec « Lecture impossible. » à l'écran n'a pas plus à nous donner
 * qu'un testeur devant un écran muet : c'est le défaut de #3732 déplacé d'un
 * cran, pas corrigé. Ici on rend les trois niveaux, sans toucher au bandeau.
 *
 * `cleRepli` est la CLÉ de la phrase de l'écran (`v2.stream.playFailed`,
 * `library.playbackError`) ; le message du SERVEUR s'y accole quand il y en a
 * un. On n'invente rien : sans détail, le repli seul.
 *
 * 🔴 Une CLÉ, et pas une phrase déjà traduite : l'appel se fait dans un
 * `.catch(…)`, donc dans une fonction imbriquée, et `$t(…)` y est refusé par
 * Svelte 5 — « Cannot subscribe to stores that are not declared at the top
 * level of the component ». La faute ne casse pas le build (esbuild transpile
 * sans résoudre) et n'apparaîtrait que chez l'utilisateur ; `check-svelte`
 * l'a arrêtée ici. La traduction se lit donc par `get(t)`, à l'instant de
 * l'échec, ce qui est de toute façon le bon moment.
 */
export function messageEchecLecture(e: unknown, cleRepli: string): string {
  console.error('Play error:', e);
  const detail = detailEchec(e);
  const repli = get(t)(cleRepli);
  return detail ? `${repli} : ${detail}` : repli;
}

/**
 * Poser un toast d'échec SANS jamais en empiler deux identiques.
 *
 * 🔴 Le cas qui compte est le REDÉMARRAGE DU SERVEUR. `notifications.push`
 * ajoute sans regarder ce qui est déjà là (`stores/notifications.ts`), et un
 * échec de lecture reste 10 secondes à l'écran. Quatre zones qui perdent leur
 * sortie en même temps, ce sont quatre `zone.playback_error` identiques, donc
 * quatre bandeaux superposés pendant dix secondes pour UN seul événement —
 * l'écran devient moins lisible que lorsqu'il ne disait rien.
 *
 * On ne SUPPRIME pas le second message : on retire le précédent, identique,
 * avant de poser le nouveau. Le compte à l'écran reste de un, l'utilisateur
 * garde ses dix secondes pleines à partir du dernier échec, et un message
 * DIFFÉRENT n'est jamais masqué par celui d'avant.
 */
let dernierToast: { message: string; id: number } | null = null;

function annoncerSansEmpiler(message: string): void {
  // `dismiss` sur un identifiant déjà expiré est un filtre qui ne trouve rien :
  // inoffensif, donc pas de fenêtre de temps à régler ni à faire vieillir.
  if (dernierToast?.message === message) notifications.dismiss(dernierToast.id);
  dernierToast = { message, id: notifications.error(message, DUREE_ECHEC_MS) };
}

/**
 * Rendre la main à l'utilisateur après un `POST /play` refusé.
 *
 * C'est exactement ce que fait la v1 (`LibraryView.svelte`) : le préfixe traduit,
 * deux points, puis le message du serveur — `400 "no tracks to play"` compris,
 * qui sans cela ne laisse AUCUNE trace, ni à l'écran ni au journal.
 */
export function signalerEchecLecture(e: unknown): void {
  console.error('Play error:', e);
  // La couche API traduit elle-même quelques refus nommés (`file_not_found`,
  // `zone_no_output_device`) et pose son propre bandeau. En poser un second
  // empilerait deux messages pour un seul échec.
  if ((e as { dejaAnnonce?: boolean } | null)?.dejaAnnonce === true) return;
  const detail = detailEchec(e);
  const prefixe = get(t)('library.playbackError');
  annoncerSansEmpiler(detail ? `${prefixe} : ${detail}` : prefixe);
}

/**
 * Le même échec, arrivé par WebSocket (`zone.playback_error`).
 *
 * Le message du serveur est déjà complet et localisé : on l'affiche TEL QUEL,
 * sans préfixe — « Endpoint WASAPI demandé introuvable : … Disponibles : … »
 * n'a pas besoin qu'on lui explique que c'est une erreur de lecture. Le titre
 * de la piste est accolé quand le serveur le donne, comme le fait `App.svelte`.
 */
export function signalerErreurServeur(data: {
  message?: string;
  error?: string;
  track_title?: string;
} | null | undefined): void {
  const msg = data?.message || data?.error || get(t)('library.playbackError');
  const titre = data?.track_title;
  // Même bus anti-empilement : c'est PAR CE CHEMIN qu'arrive le redémarrage de
  // serveur, une notification par zone, toutes le même texte.
  annoncerSansEmpiler(titre ? `${msg} — ${titre}` : msg);
}
