// renesenses/tune-server-rust#8198, volet 1 — lecture du vérificateur
// `GET /api/v1/streaming/spotify/diagnostic` (contrat, section B).
import { describe, expect, it } from 'vitest';
import {
  alerteAccesApi,
  chargerDiagnosticSpotify,
  corrections,
  lignesDiagnostic,
  type DiagnosticSpotify,
} from '../diagnosticSpotify';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const TOUT_VA_BIEN: DiagnosticSpotify = {
  service: 'spotify',
  client_id: { etat: 'ok' },
  redirect_uri: { valeur: 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback', etat: 'ok', relais: false },
  connexion: { etat: 'connecte', compte: 'Alex' },
  acces_api: { etat: 'ok', detail: null },
  premium: { etat: 'inconnu' },
  derniere_erreur: null,
  a_corriger: [],
};

describe('#8198 — chargerDiagnosticSpotify', () => {
  it('rend le diagnostic du serveur', async () => {
    expect(await chargerDiagnosticSpotify(async () => TOUT_VA_BIEN)).toEqual(TOUT_VA_BIEN);
  });

  it('serveur plus ancien (404) : null, sans lever', async () => {
    const e404 = Object.assign(new Error('404 Not Found'), { status: 404 });
    expect(await chargerDiagnosticSpotify(async () => { throw e404; })).toBeNull();
  });

  it('une autre panne remonte', async () => {
    const e500 = Object.assign(new Error('boom'), { status: 500 });
    await expect(chargerDiagnosticSpotify(async () => { throw e500; })).rejects.toThrow('boom');
  });
});

describe('#8198 — les lignes lisibles', () => {
  it('cinq lignes dans l’ordre du parcours, avec l’adresse à copier', () => {
    const l = lignesDiagnostic(TOUT_VA_BIEN);
    expect(l.map((x) => x.id)).toEqual(['client_id', 'redirect_uri', 'connexion', 'acces_api', 'premium']);
    expect(l[1].aCopier).toBe('http://127.0.0.1:8888/api/v1/streaming/spotify/callback');
    expect(l[2].extra).toBe('Alex');
    expect(l.slice(0, 4).every((x) => x.etat === 'ok')).toBe(true);
  });

  it('« Premium inconnu » dit qu’il est requis pour le propriétaire et pour la lecture', () => {
    const p = lignesDiagnostic(TOUT_VA_BIEN)[4];
    expect(p.valeur).toBe('v2.spotify.diag.premiumInconnu');
    expect(p.etat).toBe('info');
    const fr = dictionnaire('fr')[p.valeur];
    expect(fr).toContain('propriétaire');
    expect(fr).toContain('lecture');
  });

  it('les refus se lisent comme des refus', () => {
    const l = lignesDiagnostic({
      client_id: { etat: 'forme_invalide' },
      redirect_uri: { valeur: 'http://localhost:8888/cb', etat: 'localhost', relais: false },
      connexion: { etat: 'session_expiree', compte: null },
      acces_api: { etat: 'compte_non_autorise' },
      premium: { etat: 'non' },
    });
    expect(l.map((x) => x.etat)).toEqual(['ko', 'ko', 'ko', 'ko', 'ko']);
    expect(l[3].valeur).toBe('v2.spotify.diag.accesRefuse');
  });

  it('un diagnostic incomplet ne casse rien', () => {
    expect(lignesDiagnostic({})).toHaveLength(5);
  });
});

describe('#8198 — a_corriger, chacun avec son geste', () => {
  it('chaque valeur du contrat a une phrase, présente dans les quinze langues', () => {
    const toutes = [
      'client_id_absent', 'client_id_forme_invalide', 'redirect_localhost', 'redirect_http_hors_bouclage',
      'non_connecte', 'session_expiree', 'compte_non_autorise', 'jeton_refuse', 'premium_absent',
      'spotify_code_invalide',
    ];
    const c = corrections({ a_corriger: toutes });
    expect(c.map((x) => x.item)).toEqual(toutes);
    expect(c.some((x) => x.cle === 'v2.spotify.fix.inconnu')).toBe(false);
    expect(c.find((x) => x.item === 'spotify_code_invalide')?.cle).toBe('v2.spotify.err.codeInvalide');
    for (const lg of ONZE_LANGUES) {
      for (const x of c) expect(dictionnaire(lg)[x.cle], `${lg} ${x.cle}`).toBeTruthy();
    }
  });

  it('un problème inconnu garde son nom ; les doublons tombent', () => {
    const c = corrections({ a_corriger: ['quelque_chose_de_neuf', 'non_connecte', 'non_connecte'] });
    expect(c).toEqual([
      { item: 'quelque_chose_de_neuf', cle: 'v2.spotify.fix.inconnu' },
      { item: 'non_connecte', cle: 'v2.spotify.fix.nonConnecte' },
    ]);
    expect(dictionnaire('fr')['v2.spotify.fix.inconnu']).toContain('{code}');
  });
});

describe('#8198 — l’alerte après connexion', () => {
  it('compte non autorisé ou jeton refusé : une phrase ; sinon rien', () => {
    const avec = (etat: string): DiagnosticSpotify => ({ ...TOUT_VA_BIEN, acces_api: { etat } });
    expect(alerteAccesApi(avec('compte_non_autorise'))).toBe('v2.spotify.err.compteNonAutorise');
    expect(alerteAccesApi(avec('jeton_refuse'))).toBe('v2.spotify.fix.jetonRefuse');
    expect(alerteAccesApi(avec('ok'))).toBeNull();
    expect(alerteAccesApi(avec('erreur'))).toBeNull();
    expect(alerteAccesApi(null)).toBeNull();
    expect(alerteAccesApi({ ...avec('compte_non_autorise'), connexion: { etat: 'non_connecte' } })).toBeNull();
  });
});
