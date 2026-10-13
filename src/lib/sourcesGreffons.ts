/**
 * Les sources de streaming fournies par des greffons WASM —
 * renesenses/tune-server-rust#6197, étape 2.
 *
 * Un greffon peut s'inscrire comme service : il apparaît alors dans
 * `GET /streaming/services` comme Qobuz ou TIDAL, mais l'écran ne sait rien de
 * ce qu'il demande pour se connecter. `identifiantsService` ne connaît que les
 * services écrits en dur (Qobuz, Bandcamp) ; un greffon, lui, DÉCLARE ses
 * champs dans son manifeste, et le serveur les sert sur
 * `GET /plugins/sources` :
 *
 * ```json
 * { "sources": [ { "plugin_id", "service", "display_name",
 *                  "login_fields": [{ "key", "label", "type", "required" }],
 *                  "http_allowed_domains", "registered" } ],
 *   "network": { "<plugin_id>": [ { "host", "requests", "refused",
 *                                   "last_status", "last_error", "last_at_ms" } ] } }
 * ```
 *
 * Ce module ne fait que lire cette réponse et en tirer le formulaire : le
 * serveur filtre de toute façon ce qu'il reçoit sur ces mêmes champs.
 */

/** Un champ de connexion déclaré par le greffon. */
export interface ChampDeConnexion {
  key: string;
  label: string;
  /** `text`, `email` ou `password` (masqué). Tout autre type se lit `text`. */
  type: string;
  required: boolean;
}

/** Une source fournie par un greffon. */
export interface SourceDeGreffon {
  plugin_id: string;
  service: string;
  display_name: string;
  login_fields: ChampDeConnexion[];
  http_allowed_domains: string[];
  /** Le nom est inscrit PAR CE greffon (un nom déjà pris est refusé). */
  registered: boolean;
}

/** Une ligne du journal réseau d'un greffon : un hôte distant. */
export interface LigneDuJournalReseau {
  host: string;
  requests: number;
  refused: number;
  last_status: number | null;
  last_error: string | null;
  last_at_ms: number;
}

export interface SourcesDesGreffons {
  sources: SourceDeGreffon[];
  network: Record<string, LigneDuJournalReseau[]>;
}

const VIDE: SourcesDesGreffons = { sources: [], network: {} };

function texte(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function nombre(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * La réponse de `GET /plugins/sources`, lue sans confiance : un serveur plus
 * ancien répond 404 (l'appelant rend alors `VIDE`), un champ manquant ou d'un
 * autre type est ignoré plutôt que de casser l'écran des Réglages.
 */
export function lireSourcesDesGreffons(brut: unknown): SourcesDesGreffons {
  if (!brut || typeof brut !== 'object') return VIDE;
  const r = brut as Record<string, unknown>;
  const sources: SourceDeGreffon[] = (Array.isArray(r.sources) ? r.sources : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      plugin_id: texte(s.plugin_id),
      service: texte(s.service),
      display_name: texte(s.display_name) || texte(s.service),
      login_fields: (Array.isArray(s.login_fields) ? s.login_fields : [])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && !!texte((c as any).key))
        .map((c) => ({
          key: texte(c.key),
          label: texte(c.label) || texte(c.key),
          type: ['email', 'password'].includes(texte(c.type)) ? texte(c.type) : 'text',
          required: c.required === true,
        })),
      http_allowed_domains: (Array.isArray(s.http_allowed_domains) ? s.http_allowed_domains : [])
        .filter((d): d is string => typeof d === 'string'),
      registered: s.registered === true,
    }))
    .filter((s) => s.service && s.plugin_id);
  const network: Record<string, LigneDuJournalReseau[]> = {};
  const brutReseau = r.network && typeof r.network === 'object' ? (r.network as Record<string, unknown>) : {};
  for (const [id, lignes] of Object.entries(brutReseau)) {
    if (!Array.isArray(lignes)) continue;
    network[id] = lignes
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && !!texte((l as any).host))
      .map((l) => ({
        host: texte(l.host),
        requests: nombre(l.requests),
        refused: nombre(l.refused),
        last_status: typeof l.last_status === 'number' ? l.last_status : null,
        last_error: texte(l.last_error) || null,
        last_at_ms: nombre(l.last_at_ms),
      }));
  }
  return { sources, network };
}

/**
 * La source qu'un greffon fournit sous le nom de service `nom` — seulement si
 * c'est bien LUI qui l'a inscrite. Un greffon dont le nom est pris par Qobuz
 * ne doit pas prêter ses champs à la carte de Qobuz.
 */
export function sourceDuService(lues: SourcesDesGreffons, nom: string): SourceDeGreffon | undefined {
  return lues.sources.find((s) => s.service === nom && s.registered);
}

/** Les valeurs saisies, une par clé de champ. */
export type SaisieDeSource = Record<string, string>;

/** Une saisie vide pour chaque champ de la source. */
export function saisieVide(source: SourceDeGreffon): SaisieDeSource {
  return Object.fromEntries(source.login_fields.map((c) => [c.key, '']));
}

/** Le bouton « Se connecter » peut-il être armé : chaque champ requis rempli. */
export function saisieComplete(source: SourceDeGreffon, saisie: SaisieDeSource | undefined): boolean {
  return source.login_fields.every((c) => !c.required || !!(saisie?.[c.key] ?? '').trim());
}

/**
 * Le corps de `POST /streaming/{service}/auth` : les champs DÉCLARÉS, et eux
 * seuls ; un champ facultatif vide n'est pas envoyé. Un mot de passe n'est
 * pas rogné (une espace peut en faire partie), le reste l'est.
 */
export function corpsDeConnexion(source: SourceDeGreffon, saisie: SaisieDeSource | undefined): Record<string, string> {
  const corps: Record<string, string> = {};
  for (const c of source.login_fields) {
    const brut = saisie?.[c.key] ?? '';
    const v = c.type === 'password' ? brut : brut.trim();
    if (v) corps[c.key] = v;
  }
  return corps;
}

/** La saisie après la réponse : les mots de passe sont effacés, succès ou échec. */
export function sansLesMotsDePasse(source: SourceDeGreffon, saisie: SaisieDeSource | undefined): SaisieDeSource {
  const suite: SaisieDeSource = { ...(saisie ?? {}) };
  for (const c of source.login_fields) if (c.type === 'password') suite[c.key] = '';
  return suite;
}

/** L'attribut `autocomplete` d'un champ : le gestionnaire de mots de passe s'y retrouve. */
export function autocompleteDuChamp(c: ChampDeConnexion): 'current-password' | 'username' | 'off' {
  if (c.type === 'password') return 'current-password';
  if (c.type === 'email' || c.key === 'username') return 'username';
  return 'off';
}

/** Le journal d'un greffon, les hôtes les plus récents d'abord. */
export function journalTrie(lues: SourcesDesGreffons, pluginId: string): LigneDuJournalReseau[] {
  return [...(lues.network[pluginId] ?? [])].sort((a, b) => b.last_at_ms - a.last_at_ms);
}
