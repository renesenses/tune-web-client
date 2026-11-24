/**
 * tune-server-rust#9038 — l'étiquette de qualité d'une liste de titres d'un
 * service, quand la RÈGLE DE VERSION du profil peut jouer une autre version.
 *
 * Fil 2828 : dans une playlist Spotify, chaque titre portait « Lossy OGG
 * 44.1/16 », mais la lecture partait en FLAC 44,1 kHz / 24 bits — la version
 * Qobuz du même enregistrement, choisie par la règle de version du profil
 * (`local`, `quality`, `service:<nom>`, tune-server-rust#2264,
 * `orchestrator/version_de_lecture.rs`). L'étiquette décrit la version du
 * service ; ce qui joue est décidé au lancement, piste par piste, par une
 * recherche que la liste ne refait pas (elle coûterait une recherche par
 * titre et par service).
 *
 * Ce module ne refait donc aucune règle : il dit seulement QUAND l'étiquette
 * peut ne pas être celle de la version jouée, pour que la liste le signale.
 * La qualité réelle s'affiche à la lecture (« Version jouée », `versionJouee.ts`).
 */
import { get, writable } from 'svelte/store';
import { currentProfileId } from './stores/profile';
import { getVersionRule, regleLisible } from './groupesVersions';

/** Les services dont la règle peut remplacer une piste : `SERVICES_DE_VERSIONS`
 *  côté serveur (`tune-core/src/library/groupes_versions.rs`). */
export const SERVICES_DE_VERSIONS = ['qobuz', 'tidal', 'deezer', 'spotify'] as const;

/**
 * La piste de ce service peut-elle être jouée dans une AUTRE version que
 * celle que décrit son étiquette ? Faux sans règle (`none`, inconnue), pour
 * une piste locale ou d'une autre source (radio, podcast, UPnP…), et quand la
 * règle préfère justement ce service.
 */
export function peutJouerUneAutreVersion(source: string | null | undefined, regle: string | null | undefined): boolean {
  if (!regle || regle === 'none') return false;
  const s = (source ?? '').toLowerCase();
  if (!(SERVICES_DE_VERSIONS as readonly string[]).includes(s)) return false;
  return regle !== `service:${s}`;
}

/** La règle du profil actif (`rule`), `null` tant qu'elle n'est pas lue. */
export const regleDeVersion = writable<string | null>(null);

/** Relue au plus une fois par minute : chaque liste montée la demande. */
export const FRAICHEUR_REGLE_MS = 60_000;
let lueA = 0;
/** Le profil pour lequel la règle a été lue : un autre profil la relit. */
let profilLu: unknown = undefined;
let enCours: Promise<void> | null = null;

/** Relit la règle (au plus une fois par [`FRAICHEUR_REGLE_MS`], sauf `force`).
 *  Une erreur (serveur ancien : 404) laisse `null` : aucune marque. */
export function rafraichirRegleDeVersion(force = false): Promise<void> {
  if (enCours) return enCours;
  const profil = get(currentProfileId);
  const memeProfil = profil === profilLu;
  if (!force && memeProfil && lueA !== 0 && Date.now() - lueA < FRAICHEUR_REGLE_MS) return Promise.resolve();
  profilLu = profil;
  enCours = getVersionRule()
    .then((r) => { regleDeVersion.set(regleLisible(r) ? r.rule : null); })
    .catch(() => { regleDeVersion.set(null); })
    .finally(() => { lueA = Date.now(); enCours = null; });
  return enCours;
}

/** Pour les tests : oublie la règle lue. */
export function oublierRegleDeVersion(): void {
  lueA = 0;
  profilLu = undefined;
  enCours = null;
  regleDeVersion.set(null);
}
