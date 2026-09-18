/**
 * #884 — BALAYAGE : le refus premium du serveur ne doit JAMAIS arriver tel quel
 * à l'écran, par AUCUN chemin HTTP.
 *
 * `tune-server/src/premium_guard.rs` compose son refus 402 avec
 * `feature.display_name()` et, quand la route n'a pas passé ses en-têtes à
 * `require_premium_localise`, il le compose **en français** — le défaut de
 * l'application, faute de requête sous la main. Relevé le 18/09/2026 sur
 * `origin/main` du serveur : **8 sites d'appel localisés sur 58**. Un
 * anglophone qui groupe deux zones lit donc « « Multiroom Sync » nécessite
 * Tune Premium. » au milieu d'une interface anglaise.
 *
 * Le client web ne peut pas corriger les 50 sites Rust. Il peut faire mieux :
 * ne plus JAMAIS montrer ce message. `fetchJSON` le fait depuis #2419 — il
 * intercepte le 402 et pose sa propre phrase, traduite dans les onze langues
 * (`premium.required`, `zone.freeCapReached`). Mais il n'était QU'UN chemin sur
 * onze : `apiFetch`, `apiPost`, `apiPatch`, `apiDelete`, `fetchVoid`,
 * `applianceFetch`, `createSupportTicketMultipart`, `importerPontRoon`, le
 * `fetchJSON` jumeau d'`api/_client.ts`… laissaient tous passer la phrase du
 * serveur, et des dizaines d'écrans l'affichent (`notifications.error(e.message)`).
 * Or `radios.rs`, `plugins.rs`, `room_correction.rs`, `converter.rs`,
 * `playlist_transfer.rs` sont gardés premium ET servis par ces chemins-là.
 *
 * ── POURQUOI UN BALAYAGE, ET PAS UNE GARDE PAR SITE ────────────────────────
 * Un test par site d'appel serait ingérable et ne dirait rien du site suivant
 * qu'on ajoutera. Cette garde COMPTE : elle recense les points d'entrée HTTP et
 * exige que le nombre de points NON couverts soit **zéro**.
 *
 * ── LE PIÈGE DE LA GARDE DE TEXTE, ET COMMENT IL EST ÉVITÉ ─────────────────
 * Une garde qui chercherait le littéral « nécessite Tune Premium » serait verte
 * pour de mauvaises raisons :
 *   1. sa propre DÉFINITION dans le dictionnaire (`src/lib/locales/*.ts`
 *      définit `premium.required`) ;
 *   2. les COMMENTAIRES — ce fichier-ci en est la preuve vivante : il cite le
 *      message trois fois.
 * Donc :
 *   • le recensement EXCLUT `src/lib/locales/` et `src/lib/__tests__/`
 *     (`fichiersRecenses`), le dictionnaire n'est jamais lu ;
 *   • il travaille sur la source AMPUTÉE DE SES COMMENTAIRES
 *     (`sansCommentaires`), blocs `/* *\/` et lignes `//` ;
 *   • et il ne cherche pas le message, mais le MARQUEUR d'appel de l'aide
 *     partagée `messageRefusPremium(` — un site corrigé ne peut donc pas
 *     inventer sa propre formulation pour passer.
 *
 * Le second volet ne lit aucune source : il APPELLE chaque chemin contre un
 * `fetch` stubé qui rend le vrai 402 français du serveur, et vérifie que le mot
 * « nécessite » n'atteint pas l'appelant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ───────────────────────────── outillage du recensement ────────────────────

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // src/lib

/** Dossiers hors champ du recensement. `locales` est LE piège : `premium.required`
 *  y est défini, une garde qui le lirait serait verte grâce à sa définition. */
const HORS_CHAMP = new Set(['locales', '__tests__']);

function fichiersRecenses(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (HORS_CHAMP.has(e.name)) continue;
      out.push(...fichiersRecenses(join(dir, e.name)));
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts')) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

/**
 * Source amputée de ses commentaires.
 *
 * Les blocs `/* … *\/` d'abord (les `/** … *\/` en font partie), puis les
 * lignes `//`. Le `[^:]` épargne les `https://` ; un `//` dans une chaîne
 * littérale pourrait encore tronquer une fin de ligne, mais le recensement ne
 * cherche que deux marqueurs de CODE (`status === 401`, `messageRefusPremium(`)
 * qu'une fin de chaîne tronquée ne peut pas fabriquer.
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

/** Marqueur d'un point d'entrée HTTP : il traite le 401 de sa réponse. */
const SENTINELLE_401 = 'status === 401';
/** Le point d'entrée doit traiter le 402 comme il traite le 401… */
const SENTINELLE_402 = 'status === 402';
/** …et le traiter par l'AIDE PARTAGÉE, jamais par une phrase à lui.
 *  C'est ce second marqueur qui interdit 49 formulations divergentes. */
const AIDES_PARTAGEES = ['refusPremiumDe(', 'messageRefusPremium('];

type PointDEntree = { fichier: string; nom: string; couvert: boolean };

/**
 * Recense les points d'entrée HTTP d'un fichier.
 *
 * Un point d'entrée est une fonction qui exécute un `fetch(` ET traite le 401
 * de la réponse — c'est très exactement la forme de celles qui composent une
 * erreur visible à partir d'une réponse du serveur. La borne basse est le
 * dernier `function ` avant la sentinelle, la borne haute la première accolade
 * en colonne 0 après elle (fin de fonction de haut niveau).
 */
function pointsDEntree(chemin: string): PointDEntree[] {
  const texte = sansCommentaires(readFileSync(chemin, 'utf8'));
  const points: PointDEntree[] = [];
  for (let i = texte.indexOf(SENTINELLE_401); i !== -1; i = texte.indexOf(SENTINELLE_401, i + 1)) {
    const debut = texte.lastIndexOf('function ', i);
    if (debut === -1) continue;
    let fin = texte.indexOf('\n}', i);
    if (fin === -1) fin = texte.length;
    const bloc = texte.slice(debut, fin);
    if (!bloc.includes('fetch(')) continue; // pas un point d'entrée HTTP
    const nom = /function\s+([A-Za-z0-9_$]+)/.exec(bloc)?.[1] ?? '(anonyme)';
    points.push({
      fichier: relative(LIB, chemin),
      nom,
      couvert: bloc.includes(SENTINELLE_402) && AIDES_PARTAGEES.some((a) => bloc.includes(a)),
    });
  }
  return points;
}

// ───────────────────────────── volet 1 : le compte ─────────────────────────

describe('#884 — balayage des points d’entrée HTTP', () => {
  const tous = fichiersRecenses(LIB).flatMap(pointsDEntree);

  it('le recensement trouve bien les chemins de `api.ts` (garde de la garde)', () => {
    // Un recensement qui ne trouve plus rien serait vert pour rien.
    expect(tous.length).toBeGreaterThanOrEqual(8);
    expect(tous.map((p) => p.nom)).toEqual(
      expect.arrayContaining(['apiFetch', 'apiPost', 'apiPatch', 'apiDelete', 'fetchJSON']),
    );
    // Et le dictionnaire reste hors champ.
    expect(tous.map((p) => p.fichier)).not.toContain(expect.stringContaining('locales'));
  });

  it('ZÉRO point d’entrée ne laisse passer le refus 402 du serveur', () => {
    const nus = tous.filter((p) => !p.couvert);
    expect(
      nus.map((p) => `${p.fichier}:${p.nom}`),
      `${nus.length} point(s) d’entrée sur ${tous.length} montrent encore le message du serveur`,
    ).toEqual([]);
  });
});

// ──────────────────── volet 2 : la preuve, sans lire de source ─────────────

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal('window', { ...globalThis.window, location: { hash: '' } });

/**
 * Le refus tel que `require_premium` (NON localisé) le rend — forme EXACTE de
 * `corps_du_refus()` (`tune-server/src/premium_guard.rs`), relue le 18/09/2026 :
 * `code` porte le nom du DROIT (`multiroom_sync`), pas `premium_required`, et
 * `message` est la phrase composée en français faute d'en-têtes.
 */
const REFUS_FR = {
  error: 'premium_required',
  code: 'multiroom_sync',
  feature: 'Multiroom Sync',
  message: '« Multiroom Sync » nécessite Tune Premium.',
  upgrade_url: 'https://mozaiklabs.fr/pricing',
};

function stub402() {
  const texte = JSON.stringify(REFUS_FR);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      headers: { get: () => null },
      json: async () => REFUS_FR,
      text: async () => texte,
      blob: async () => new Blob(),
    })) as unknown as typeof fetch,
  );
}

async function motDuRefus(appel: () => Promise<unknown>): Promise<string> {
  try {
    await appel();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return '(aucune erreur levée)';
}

describe('#884 — aucun chemin ne rend le français du serveur', () => {
  beforeEach(() => {
    storage.clear();
    stub402();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('les chemins d’`api.ts` et son jumeau `api/_client.ts`', async () => {
    const api = await import('../api');
    const jumeau = await import('../api/_client');

    const chemins: Array<[string, () => Promise<unknown>]> = [
      ['apiFetch', () => api.apiFetch('/radios/favorites')],
      ['apiPost', () => api.apiPost('/radios/favorites', {})],
      ['apiPatch', () => api.apiPatch('/radios/favorites/1', {})],
      ['apiDelete', () => api.apiDelete('/radios/favorites/1')],
      ['fetchJSON', () => api.createGroup(1, [2])],
      ['fetchVoid', () => api.ungroupZones('g1')],
      ['applianceFetch', () => api.getApplianceStatus()],
      ['createSupportTicketMultipart', () => api.createSupportTicketMultipart(new FormData())],
      ['importerPontRoon', () => api.importerPontRoon(new ArrayBuffer(4), true)],
      ['api/_client.fetchJSON', () => jumeau.fetchJSON('/api/v1/metadata/etat')],
    ];

    // La phrase de l'application, lue dans le MÊME magasin que le code de
    // production : c'est elle que chaque chemin doit rendre. Exiger seulement
    // « pas de français » laisserait passer `premium_required` nu — un jeton
    // brut dans un bandeau, qui ne se traduit dans aucune des onze langues.
    const { get } = await import('svelte/store');
    const { t } = await import('../i18n');
    const { notifications } = await import('../stores/notifications');
    const attendu = get(t)('premium.required');
    expect(attendu).not.toBe('premium.required'); // la clé existe bien

    // Deux canaux LÉGITIMES, et deux seulement : `fetchJSON`/`fetchVoid` posent
    // eux-mêmes le bandeau et lèvent la sentinelle `premium_required` que les
    // appelants historiques comparent ; les autres aides se contentent de lever.
    // La phrase doit atteindre l'utilisateur par l'un OU l'autre — et le
    // français du serveur par AUCUN.
    const fuites: string[] = [];
    for (const [nom, appel] of chemins) {
      (notifications.error as ReturnType<typeof vi.fn>).mockClear();
      const leve = await motDuRefus(appel);
      const bandeaux = (notifications.error as ReturnType<typeof vi.fn>).mock.calls
        .map((c) => String(c[0]))
        .join(' | ');
      const vu = `${leve} | ${bandeaux}`;
      const fuiteFr = vu.includes('nécessite') || vu.includes('Multiroom Sync');
      if (fuiteFr || !vu.includes(attendu)) fuites.push(`${nom} → levé: ${leve} — bandeau: ${bandeaux}`);
    }
    expect(fuites, `${fuites.length} chemin(s) ne rendent pas la phrase de l’application`).toEqual([]);
  });
});
