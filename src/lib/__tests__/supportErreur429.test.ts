/**
 * Support premium : un 429 doit dire QUOI et QUAND (#2178).
 *
 * Reivax66 a vu « Une erreur est survenue. Réessaie dans un instant. (429) » en
 * envoyant un ticket, et en a conclu que la fonction était cassée. Le message
 * ne nommait ni la limite d'envoi, ni le moment de réessayer — alors que
 * mozaiklabs annonce le délai dans `Retry-After`, que le serveur Tune relaie
 * désormais dans `retry_after`.
 *
 * Les phrases sont assertées MOT POUR MOT : c'est ce que lit le testeur, et
 * c'est le seul niveau où la régression se voit.
 */
import { describe, it, expect } from 'vitest';
import { fr as frBrut, en as enBrut } from '../locales';

const fr = frBrut as Record<string, string>;
const en = enBrut as Record<string, string>;
import { messageErreurSupport, delaiLisible, statutHttp } from '../supportErrors';

/** Même contrat que `tr1()` de SupportView : lecture + interpolation `{clé}`. */
function traduire(dict: Record<string, string>) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? fr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

const trFr = traduire(fr);
const trEn = traduire(en);

/** L'erreur telle que la lève `lib/api.ts` sur un échec HTTP. */
function erreur(message: string, status: number, retryAfter?: number): Error {
  const e = new Error(message) as Error & { status: number; retryAfter?: number };
  e.status = status;
  e.retryAfter = retryAfter;
  return e;
}

describe('429 du relais support', () => {
  it('avec Retry-After : nomme la limite ET le moment de réessayer', () => {
    // 3540 s = 59 min, le cas réel du plafond horaire de mozaiklabs.
    const e = erreur('429 — rate_limited', 429, 3540);

    expect(messageErreurSupport(e, trFr, 'fr')).toBe(
      "Limite d'envoi du support atteinte : trop de messages en peu de temps. " +
        "Ton message n'a pas été envoyé — réessaie dans 59 minutes.",
    );
    expect(messageErreurSupport(e, trEn, 'en')).toBe(
      'Support sending limit reached: too many messages in a short time. ' +
        'Your message was not sent — try again in 59 minutes.',
    );
  });

  it('sans en-tête : replie sur « plus tard », sans inventer de délai', () => {
    const e = erreur('429 — rate_limited', 429);

    expect(messageErreurSupport(e, trFr, 'fr')).toBe(
      "Limite d'envoi du support atteinte : trop de messages en peu de temps. " +
        "Ton message n'a pas été envoyé — réessaie plus tard.",
    );
    expect(messageErreurSupport(e, trEn, 'en')).toBe(
      'Support sending limit reached: too many messages in a short time. ' +
        'Your message was not sent — try again later.',
    );
  });

  it('ne montre JAMAIS le message générique ni le code 429 nu', () => {
    for (const e of [erreur('429', 429, 60), erreur('429 — Too Many Attempts.', 429)]) {
      const m = messageErreurSupport(e, trFr, 'fr');
      expect(m).not.toContain(fr['support.errorGeneric']);
      expect(m).not.toContain('429');
    }
  });

  it('choisit une unité lisible et arrondit au-dessus', () => {
    expect(delaiLisible(45, 'fr')).toBe('dans 45 secondes');
    expect(delaiLisible(61, 'fr')).toBe('dans 2 minutes'); // jamais « dans 1 minute » : trop tôt
    expect(delaiLisible(3600, 'fr')).toBe('dans 1 heure');
    expect(delaiLisible(5400, 'en')).toBe('in 2 hours');
  });

  it('un délai absurde ou nul ne produit pas « dans 0 seconde »', () => {
    for (const secs of [0, -5, Number.NaN]) {
      expect(messageErreurSupport(erreur('429', 429, secs), trFr, 'fr')).toBe(
        fr['support.errorRateLimited'],
      );
    }
  });
});

describe('les autres codes du même chemin', () => {
  it('412 / 403 / 401 gardent leur message dédié', () => {
    expect(messageErreurSupport(erreur('412', 412), trFr, 'fr')).toBe(fr['support.errorNotConnected']);
    expect(messageErreurSupport(erreur('403', 403), trFr, 'fr')).toBe(fr['support.errorPremiumOnly']);
    expect(messageErreurSupport(erreur('401', 401), trFr, 'fr')).toBe(fr['support.errorSessionExpired']);
  });

  it('les sentinelles de lib/api.ts sont traduites, pas noyées dans le générique', () => {
    // `apiPost` lève ces deux-là AVANT toute lecture de statut : elles ne
    // portaient aucun code, donc l'écran affichait le générique tout nu.
    expect(messageErreurSupport(new Error('Session expired'), trFr, 'fr')).toBe(
      fr['support.errorSessionExpired'],
    );
    expect(messageErreurSupport(new Error('premium_required'), trFr, 'fr')).toBe(
      fr['support.errorPremiumOnly'],
    );
  });

  it('502 / 503 / 504 disent que le service est injoignable, pas « une erreur »', () => {
    for (const s of [502, 503, 504]) {
      expect(messageErreurSupport(erreur(`${s}`, s), trFr, 'fr')).toBe(fr['support.errorUnavailable']);
    }
  });

  it('un message serveur de pièce jointe (400/413) passe tel quel', () => {
    const e = erreur('Le fichier « logs.txt » dépasse 50 Mo.', 413);
    expect(messageErreurSupport(e, trFr, 'fr')).toBe('Le fichier « logs.txt » dépasse 50 Mo.');
  });

  it('un code non traité reste VISIBLE (#1267)', () => {
    expect(messageErreurSupport(erreur('422 — validation', 422), trFr, 'fr')).toBe(
      `${fr['support.errorGeneric']} (422)`,
    );
  });

  it('un code enfoui dans le détail ne détourne plus la traduction', () => {
    // L'ancien `msg.includes('403')` faisait de ce 500 un refus premium.
    const e = erreur('500 — upstream said 403 to the relay', 500);
    expect(messageErreurSupport(e, trFr, 'fr')).toBe(`${fr['support.errorGeneric']} (500)`);
  });

  it('le statut se lit en propriété, et à défaut en tête du message', () => {
    expect(statutHttp(erreur('peu importe', 429))).toBe(429);
    expect(statutHttp(new Error('429 — Too Many Attempts.'))).toBe(429);
    expect(statutHttp(new Error('Session expired'))).toBeUndefined();
  });
});
