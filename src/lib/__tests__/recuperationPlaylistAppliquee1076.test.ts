/**
 * #1076 — la récupération de playlist lit ce que le SERVEUR a fait.
 *
 * Le serveur applique réellement les remplacements depuis la v0.9.155
 * (tune-server-rust#3685, PR #4273) et rend un compte rendu piste par piste.
 * Le client faisait l'inverse : `applyOneRecovery` réécrivait son état en
 * optimiste juste après l'appel, et affichait « disponible » pour une piste
 * que le serveur venait peut-être de refuser.
 *
 * Trois refus NOMMÉS existent côté serveur : piste de remplacement absente de
 * la base, piste de SERVICE proposée en remplacement, ligne disparue de la
 * playlist entre la lecture et l'écriture. Aucun n'atteignait l'écran.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  appliquesParPiste,
  refusParPiste,
  pisteAppliquee,
  resumeApplication,
} from '../recuperationPlaylist';

const traduire = (c: string) =>
  c === 'playlist.recoverPartial' ? '{applied} appliqué(s), {rejected} refusé(s).'
  : c === 'playlist.recoverNoneApplied' ? 'Aucun remplacement appliqué ({rejected} refusé(s)).'
  : c;

const MIXTE = {
  playlist_id: 3,
  total_tracks: 10,
  applied: [{ track_id: 11, new_source: 'local', new_source_id: '99', new_track_id: 99 }],
  rejected: [
    { track_id: 12, reason: "la piste de remplacement 42 n'existe pas dans la bibliothèque" },
    { track_id: 13, reason: "la piste de remplacement 42 n'existe pas dans la bibliothèque" },
  ],
  applied_count: 1,
  rejected_count: 2,
  still_missing: 2,
};

const RIEN = { ...MIXTE, applied: [], applied_count: 0, rejected_count: 2 };

describe('#1076 — lire le compte rendu', () => {
  it('les appliqués portent leur NOUVEL identifiant', () => {
    expect(appliquesParPiste(MIXTE).get(11)?.new_track_id).toBe(99);
    expect(appliquesParPiste(MIXTE).size).toBe(1);
  });

  it('les refus portent leur motif', () => {
    const r = refusParPiste(MIXTE);
    expect(r.size).toBe(2);
    expect(r.get(12)).toContain("n'existe pas dans la bibliothèque");
  });

  it('🔴 « disponible » se lit dans `applied`, jamais ailleurs', () => {
    expect(pisteAppliquee(MIXTE, 11)).toBe(true);
    // Contre-épreuve : la piste REFUSÉE. C'est celle-là que l'écran passait à
    // « disponible ».
    expect(pisteAppliquee(MIXTE, 12)).toBe(false);
    expect(pisteAppliquee(RIEN, 11)).toBe(false);
    // Une réponse vide ou absurde n'autorise rien.
    expect(pisteAppliquee(null, 11)).toBe(false);
    expect(pisteAppliquee({ applied: 'oui' }, 11)).toBe(false);
  });

  it('un refus sans motif reste lisible', () => {
    expect(refusParPiste({ rejected: [{ track_id: 5, reason: '  ' }] }).get(5))
      .toBe('refus sans motif');
  });
});

describe('#1076 — la phrase de l\'écran', () => {
  it('rien à dire quand tout est passé', () => {
    expect(resumeApplication({ applied: [{ track_id: 1 }], rejected: [] }, traduire)).toBeNull();
    expect(resumeApplication({}, traduire)).toBeNull();
  });

  it('mixte : le compte, puis les motifs DISTINCTS', () => {
    const txt = resumeApplication(MIXTE, traduire)!;
    expect(txt).toContain('1 appliqué(s), 2 refusé(s).');
    // Deux pistes refusées pour la même raison ne méritent pas deux fois la
    // même phrase.
    expect(txt.match(/n'existe pas/g)).toHaveLength(1);
  });

  it('rien d\'appliqué : ce n\'est pas la même phrase', () => {
    expect(resumeApplication(RIEN, traduire)).toContain('Aucun remplacement appliqué');
  });
});

describe('#1076 — le branchement', () => {
  const api = readFileSync('src/lib/api.ts', 'utf8');
  const vue = readFileSync('src/components/v2-heritage/PlaylistManagerView.svelte', 'utf8');
  const types = readFileSync('src/lib/types.ts', 'utf8');

  it('🔴 le 422 est ACCEPTÉ : c\'est un refus documenté, pas une panne', () => {
    const i = api.indexOf('export function applyRecovery(');
    const bloc = api.slice(i, api.indexOf('\n}', i));
    expect(bloc).toContain('(statut) => statut === 422');
    // Contre-épreuve : le crochet est OPT-IN, rien ne change pour les autres.
    expect(api).toContain('accepter?: (statut: number) => boolean');
    expect(api).toContain('if (!response.ok && !accepter?.(response.status)) {');
  });

  it('🔴 la réécriture optimiste a disparu', () => {
    const i = vue.indexOf('async function applyOneRecovery(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('pisteAppliquee(res, trackId)');
    // Le passage à « available » est désormais SOUS la garde.
    const g = bloc.indexOf('pisteAppliquee(res, trackId)');
    const a = bloc.indexOf("status: 'available'");
    expect(a).toBeGreaterThan(g);
    // Et le motif atteint l'écran.
    expect(bloc).toContain('resumeApplication(res,');
    expect(bloc).not.toContain("console.error('Apply recovery error:'");
  });

  it('l\'application en masse lit aussi le compte rendu', () => {
    const i = vue.indexOf('async function applyAllRecovery(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('resumeApplication(res,');
    expect(bloc).not.toContain("console.error('Apply all recovery error:'");
  });

  it('l\'écran affiche le message', () => {
    expect(vue).toContain('<div class="recover-msg">{recoverMsg}</div>');
  });

  it('🔴 le type ne décrit plus l\'ancienne forme', () => {
    const i = types.indexOf('export interface RecoverApplyResponse {');
    const bloc = types.slice(i, types.indexOf('\n}', i));
    for (const k of ['applied', 'rejected', 'applied_count', 'rejected_count', 'still_missing']) {
      expect(bloc, k).toContain(k);
    }
    // `recovered` n'existe plus côté serveur.
    expect(bloc).not.toContain('recovered:');
  });
});
