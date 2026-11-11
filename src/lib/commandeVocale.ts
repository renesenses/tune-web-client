/**
 * Commande vocale de Tune AI (rc12, décidée le 11/11/2026).
 *
 * L'interrupteur « Commande vocale » des Réglages écrivait
 * `tune_voice_ai_enabled` et demandait le micro, mais rien ne lisait cette
 * clé : un testeur qui a des tremblements l'a activée et rien ne s'est passé.
 *
 * Ce module branche la dictée sur la Web Speech API du navigateur
 * (`SpeechRecognition` / `webkitSpeechRecognition`) : aucun service tiers,
 * aucune clé. Il dit aussi POURQUOI elle ne peut pas marcher, au lieu de se
 * taire :
 *
 *  - `nonPrisEnCharge` : le navigateur n'a pas de reconnaissance vocale
 *    (Firefox) ;
 *  - `nonSecurise` : la page est servie en http sur une adresse du réseau
 *    local (`http://192.168.x.x:8888`) ; le navigateur y refuse le micro.
 *    `localhost` et l'accès https par le relais Mozaiklabs, eux, sont des
 *    contextes sécurisés.
 */
import type { Locale } from './locales';

export const CLE_VOIX = 'tune_voice_ai_enabled';
export const CLE_RELIRE = 'tune_voice_ai_review';

export type RaisonIndispo = 'nonPrisEnCharge' | 'nonSecurise';
export type EchecDictee = 'refuse' | 'nonPrisEnCharge' | 'nonSecurise' | 'aucuneParole' | 'pasDeMicro' | 'reseau' | 'autre';

/** Le minimum de `window` que lit ce module (injectable dans les tests). */
export interface FenetreVocale {
  isSecureContext?: boolean;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

function fenetre(): FenetreVocale | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as FenetreVocale);
}

function constructeur(w: FenetreVocale | undefined): (new () => Reconnaissance) | null {
  const C = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  return typeof C === 'function' ? (C as new () => Reconnaissance) : null;
}

/**
 * Pourquoi la dictée ne peut pas marcher ici, ou `null` si elle peut.
 * L'absence de reconnaissance passe d'abord : en https, Firefox n'en aurait
 * toujours pas, alors que Chrome en http local en a une à qui il ne manque
 * que le contexte sécurisé.
 */
export function raisonIndisponible(w: FenetreVocale | undefined = fenetre()): RaisonIndispo | null {
  if (!constructeur(w)) return 'nonPrisEnCharge';
  if (w?.isSecureContext === false) return 'nonSecurise';
  return null;
}

export const CLE_RAISON: Record<RaisonIndispo, string> = {
  nonPrisEnCharge: 'voice.unsupported',
  nonSecurise: 'voice.insecure',
};

export const CLE_ECHEC: Record<EchecDictee, string> = {
  refuse: 'settings.micDenied',
  nonPrisEnCharge: 'voice.unsupported',
  nonSecurise: 'voice.insecure',
  aucuneParole: 'voice.noSpeech',
  pasDeMicro: 'voice.noMic',
  reseau: 'voice.network',
  autre: 'voice.failed',
};

/** Les codes `error` de `SpeechRecognitionErrorEvent`, ramenés aux nôtres. */
export function echecDepuisCode(code: string | undefined): EchecDictee {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'refuse';
    case 'no-speech':
      return 'aucuneParole';
    case 'audio-capture':
      return 'pasDeMicro';
    case 'network':
      return 'reseau';
    default:
      return 'autre';
  }
}

const LANGUES: Record<Locale, string> = {
  fr: 'fr-FR', en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP',
  ko: 'ko-KR', ro: 'ro-RO', sv: 'sv-SE', hu: 'hu-HU', vi: 'vi-VN', el: 'el-GR', nb: 'nb-NO', pl: 'pl-PL',
};

/** La langue de reconnaissance (BCP 47) qui suit celle de l'interface. */
export function langueDictee(locale: string): string {
  return LANGUES[locale as Locale] ?? 'en-US';
}

function lire(cle: string): boolean {
  try { return localStorage.getItem(cle) === 'true'; } catch { return false; }
}
function ecrire(cle: string, v: boolean) {
  try { localStorage.setItem(cle, String(v)); } catch { /* stockage indisponible */ }
}

export const voixActivee = () => lire(CLE_VOIX);
export const ecrireVoixActivee = (v: boolean) => ecrire(CLE_VOIX, v);
/** « Relire avant l'envoi » : la dictée remplit le champ sans l'envoyer. */
export const relireAvantEnvoi = () => lire(CLE_RELIRE);
export const ecrireRelireAvantEnvoi = (v: boolean) => ecrire(CLE_RELIRE, v);

/** Le sous-ensemble de `SpeechRecognition` dont on se sert. */
interface Reconnaissance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface Dictee {
  arreter(): void;
  annuler(): void;
}

export interface RappelsDictee {
  /** Le texte reconnu jusqu'ici, à chaque résultat (provisoire ou final). */
  texte(t: string): void;
  /** Fin de la parole sans erreur, avec le texte reconnu (peut être vide). */
  fin(t: string): void;
  /** Échec : la dictée est finie, `fin` ne sera pas appelé. */
  echec(e: EchecDictee): void;
}

/**
 * Démarre une dictée d'une phrase : le texte arrive en direct par `texte`,
 * et la fin de la parole (le navigateur coupe sur le silence) appelle `fin`.
 * Rend `null` et appelle `echec` si la dictée ne peut pas démarrer ici.
 */
export function demarrerDictee(locale: string, r: RappelsDictee, w: FenetreVocale | undefined = fenetre()): Dictee | null {
  const raison = raisonIndisponible(w);
  if (raison) { r.echec(raison); return null; }
  const C = constructeur(w)!;
  let rec: Reconnaissance;
  try { rec = new C(); } catch { r.echec('autre'); return null; }
  rec.lang = langueDictee(locale);
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let texte = '';
  let erreur: EchecDictee | null = null;
  let annulee = false;

  rec.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0]?.transcript ?? '';
    texte = t.trim();
    if (!annulee) r.texte(texte);
  };
  rec.onerror = (e) => {
    // `aborted` suit notre propre `annuler()` : ce n'est pas un échec à dire.
    if (e.error === 'aborted') { annulee = true; return; }
    erreur = echecDepuisCode(e.error);
  };
  rec.onend = () => {
    if (annulee) return;
    // Sans parole, Chrome lève `no-speech` ; Safari finit parfois sans rien.
    if (erreur) r.echec(erreur);
    else if (!texte) r.echec('aucuneParole');
    else r.fin(texte);
  };

  try { rec.start(); } catch { r.echec('autre'); return null; }
  return {
    arreter: () => { try { rec.stop(); } catch { /* déjà finie */ } },
    annuler: () => { annulee = true; try { rec.abort(); } catch { /* déjà finie */ } },
  };
}
