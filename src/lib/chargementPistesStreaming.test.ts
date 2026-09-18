import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chargerPistes } from './chargementPistesStreaming';

/**
 * 🔴 `renesenses/tune-web-client#1154` — une page album Qobuz de l'ANCIENNE
 * interface reste sur « Chargement... » à la place de ses pistes (Tades,
 * 0.9.151, fil 1821), alors que la MÊME session résout et joue des pistes
 * Qobuz.
 *
 * La contradiction n'en est pas une : ce sont DEUX routes.
 *
 *   lecture   → `qobuz_get_file_url` / `streaming_track_url_resolved`,
 *               mesuré 95 à 264 ms dans la session du ticket 139 ;
 *   la page   → `GET /streaming/qobuz/albums/{id}/tracks`, que rien dans le
 *               journal ne montre revenir.
 *
 * L'authentification et le réseau valent pour les deux ; seule la seconde
 * alimente la liste. Et côté client, cette seconde attente n'était bornée par
 * RIEN : `fetchJSON` n'a pas de délai, `fetch()` non plus tant que la
 * connexion n'est pas rompue. Un amont qui accepte puis se tait laissait donc
 * le témoin allumé pour toujours.
 *
 * Deux défauts, deux moitiés gardées ici :
 *
 *  1. l'attente n'était pas bornée — l'écran ne pouvait pas sortir de
 *     « Chargement... » ;
 *  2. l'échec n'était pas DIT — `catch (e) { console.error(...) }`, sans
 *     message, sans remise à zéro de la liste : l'album suivant héritait
 *     alors des pistes du précédent.
 *
 * Ce module décide ; l'écran applique. Le branchement est gardé à part par
 * `chargementPistesStreamingEcran.test.ts` — un module juste et jamais appelé
 * est le défaut dominant de ce projet.
 */

const OPTS = {
  delaiMs: 30_000,
  motifDelai: 'Le service n’a pas répondu à temps.',
  motifParDefaut: 'Impossible de charger les pistes de cet album.',
  estCourante: () => true,
};

describe('chargerPistes — l’écran ne peut pas rester sur « Chargement... »', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rend les pistes quand la requête aboutit', async () => {
    const issue = await chargerPistes<{ title: string }>({
      ...OPTS,
      demande: async () => [{ title: 'I. Intermezzo in A Minor' }],
    });
    expect(issue).toEqual({ etat: 'pistes', pistes: [{ title: 'I. Intermezzo in A Minor' }] });
  });

  it('BORNE une requête qui ne répond JAMAIS, et dit pourquoi', async () => {
    // Le cœur du #1154 : sans borne, cette promesse ne se règle pas et le
    // témoin de chargement reste allumé indéfiniment. La garde tient si, et
    // seulement si, l'appel se termine SANS que la demande ne réponde.
    const jamais = new Promise<never[]>(() => {});
    const p = chargerPistes<never>({ ...OPTS, demande: () => jamais });
    await vi.advanceTimersByTimeAsync(OPTS.delaiMs + 1);
    await expect(p).resolves.toEqual({ etat: 'erreur', motif: OPTS.motifDelai });
  });

  it('n’abandonne pas AVANT la borne : une réponse lente est servie', async () => {
    // Contre-épreuve de la borne : elle doit couper la panne, pas la lenteur.
    const lente = new Promise<{ title: string }[]>((r) =>
      setTimeout(() => r([{ title: 'II. Adagio' }]), OPTS.delaiMs - 1_000),
    );
    const p = chargerPistes<{ title: string }>({ ...OPTS, demande: () => lente });
    await vi.advanceTimersByTimeAsync(OPTS.delaiMs - 500);
    await expect(p).resolves.toEqual({ etat: 'pistes', pistes: [{ title: 'II. Adagio' }] });
  });

  it('DIT le motif du serveur au lieu de l’avaler', async () => {
    // #1160 a établi qu'`apiError()` porte bien le motif du serveur : s'il se
    // perd, c'est ici qu'il se perd.
    const issue = await chargerPistes<never>({
      ...OPTS,
      demande: async () => {
        throw new Error('502 — qobuz upstream unavailable');
      },
    });
    expect(issue).toEqual({ etat: 'erreur', motif: '502 — qobuz upstream unavailable' });
  });

  it('retombe sur un motif lisible quand l’échec n’en porte aucun', async () => {
    // Un `throw` nu ou un message vide ne doit pas produire un bandeau vide :
    // un écran muet est exactement le défaut qu'on corrige.
    for (const rejet of [new Error(''), new Error('   '), null, undefined, { code: 42 }]) {
      const issue = await chargerPistes<never>({
        ...OPTS,
        demande: async () => {
          throw rejet;
        },
      });
      expect(issue).toEqual({ etat: 'erreur', motif: OPTS.motifParDefaut });
    }
  });

  it('accepte aussi un rejet en ficelle nue comme motif', async () => {
    // Contre-épreuve du repli : il ne doit pas écraser un motif qui existe,
    // même livré hors d'un `Error`.
    const issue = await chargerPistes<never>({
      ...OPTS,
      demande: async () => {
        throw 'unknown service: qobuz';
      },
    });
    expect(issue).toEqual({ etat: 'erreur', motif: 'unknown service: qobuz' });
  });

  it('marque PÉRIMÉE la réponse d’une demande dépassée, succès compris', async () => {
    // Une réponse en retard ne doit ni publier ses pistes sur la fiche
    // suivante, ni éteindre le témoin d'une demande plus récente.
    const tardive = await chargerPistes<{ title: string }>({
      ...OPTS,
      estCourante: () => false,
      demande: async () => [{ title: 'III. Rondo. Allegro non troppo' }],
    });
    expect(tardive).toEqual({ etat: 'perimee' });

    const echouee = await chargerPistes<never>({
      ...OPTS,
      estCourante: () => false,
      demande: async () => {
        throw new Error('404 — album not found');
      },
    });
    expect(echouee).toEqual({ etat: 'perimee' });
  });

  it('périme aussi le dépassement de délai d’une demande abandonnée', async () => {
    const p = chargerPistes<never>({
      ...OPTS,
      estCourante: () => false,
      demande: () => new Promise<never[]>(() => {}),
    });
    await vi.advanceTimersByTimeAsync(OPTS.delaiMs + 1);
    await expect(p).resolves.toEqual({ etat: 'perimee' });
  });

  it('ne laisse pas une minuterie derrière elle quand la requête aboutit', async () => {
    // Sans `clearTimeout`, chaque album ouvert laisserait une minuterie de
    // trente secondes en vie — et, sous Node, un test qui ne rend pas la main.
    const avant = vi.getTimerCount();
    await chargerPistes<never>({ ...OPTS, demande: async () => [] });
    expect(vi.getTimerCount()).toBe(avant);
  });
});
