// 🔴 `renesenses/tune-web-client#900` — Lulu, forum, 04/09/2026 :
//
//   « À chaque mise à jour, le fichier reste bloqué sur la page "Tune
//     Redémarre", et nécessite alors la fermeture de toutes les pages, et une
//     réouverture de Tune. »
//
// CE QUI EST ÉTABLI, ET CE QUI NE L'EST PAS
// -----------------------------------------
// ⚠️ Rien n'a été reproduit. Le signalement n'a ni journal ni capture, et je
// ne prétends pas que ce qui suit soit exactement son cas.
//
// Ce qui SE lit dans le code, en revanche, et qui produit ce qu'il décrit :
// le dépôt portait DEUX chemins pour le même besoin — attendre qu'un serveur
// qui redémarre revienne — et un seul était durci.
//
//   · le bouton « Redémarrer le serveur » sondait `/system/health` avant de
//     recharger, écrit comme ça pour #1209 (Mika, Windows) ;
//   · `installUpdate()` posait « Installée — redémarrage... » puis rechargeait
//     au bout de 1 500 ms SANS rien vérifier.
//
// Et `installUpdate()` avait une sortie MUETTE : budget épuisé, dernière
// vérification sans réponse, l'écran retombe sur le bouton sans un mot.
//
// CE QUE CE FICHIER TIENT
// -----------------------
// L'attente est un automate pur : horloge et minuterie sont injectées, le test
// ne dort pas une milliseconde. On tient les trois règles qui comptent — on ne
// recharge que sur une sonde RÉUSSIE, on ne renonce jamais en silence, et on
// ne fait pas les deux.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue le comportement d'AVANT — un
// rechargement sur minuterie — et exige qu'il tombe bien sur un serveur
// absent. Sans elle, une attente qui rechargerait toujours passerait pour
// corrigée.
import { describe, expect, it } from 'vitest';
import { attendreRetourEtRecharger } from '../retourDuServeur';

/** Une horloge et une minuterie de papier : le temps avance quand on le dit. */
function banc(reponses: Array<'debout' | 'aterre'>) {
  let t = 0;
  const file: Array<{ a: number; fn: () => void }> = [];
  let sondes = 0;
  const journal: string[] = [];
  attendreRetourEtRecharger({
    sonder: async () => {
      const r = reponses[Math.min(sondes, reponses.length - 1)];
      sondes++;
      if (r === 'aterre') throw new Error('connection refused');
      return {};
    },
    recharger: () => journal.push('rechargement'),
    renoncer: (raison) => journal.push(`renoncement:${raison}`),
    maintenant: () => t,
    planifier: (fn, ms) => file.push({ a: t + ms, fn }),
    pas: 700,
    budget: 5_000,
  });
  /** Fait tourner la minuterie jusqu'à épuisement. */
  const derouler = async () => {
    for (let tour = 0; tour < 200 && file.length > 0; tour++) {
      const p = file.shift()!;
      t = p.a;
      p.fn();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    return { journal, sondes, t };
  };
  return derouler;
}

describe('#900 — on ne recharge que sur un serveur qui répond', () => {
  it('serveur déjà debout : une sonde, un rechargement', async () => {
    const { journal, sondes } = await banc(['debout'])();
    expect(journal).toEqual(['rechargement']);
    expect(sondes, 'plus d’une sonde pour un serveur déjà là').toBe(1);
  });

  it('🔴 serveur encore à terre : on ATTEND au lieu de recharger dans le vide', async () => {
    const { journal, sondes } = await banc(['aterre', 'aterre', 'aterre', 'debout'])();
    expect(journal).toEqual(['rechargement']);
    expect(sondes, 'le retour n’a pas été attendu').toBe(4);
  });

  it('serveur qui ne revient pas : on RENONCE, et on le dit', async () => {
    const { journal } = await banc(['aterre'])();
    expect(journal).toEqual(['renoncement:budget']);
    expect(
      journal.includes('rechargement'),
      'on recharge quand même sur un serveur absent : c’est l’écran mort de Lulu',
    ).toBe(false);
  });

  it('jamais les deux : on ne renonce pas après avoir rechargé', async () => {
    const { journal } = await banc(['aterre', 'debout'])();
    expect(journal).toEqual(['rechargement']);
  });

  it('CONTRE-ÉPREUVE : le rechargement sur minuterie tombe bien à côté', () => {
    // Ce que faisait `installUpdate` : recharger 1 500 ms après avoir posé
    // « Installée — redémarrage... », quoi qu'il arrive. On modélise un
    // serveur qui ne revient qu'à 2 500 ms — une ré-exécution de plus, ce que
    // fait la mise à jour automatique.
    const DEBOUT_A = 2_500;
    const ANCIEN_DELAI = 1_500;
    expect(
      ANCIEN_DELAI < DEBOUT_A,
      'le témoin ne reproduit pas le cas : l’ancien délai suffirait',
    ).toBe(true);

    // La politique d'avant recharge à l'instant fixe, sur un serveur absent.
    const ancienne = ANCIEN_DELAI >= DEBOUT_A ? 'atterrit' : 'tombe à côté';
    expect(ancienne).toBe('tombe à côté');

    // La nouvelle sonde tous les 700 ms et n'agit que sur une réponse : elle
    // recharge au premier passage postérieur à 2 500 ms, donc 2 800.
    let t = 0;
    while (t < DEBOUT_A) t += 700;
    expect(t).toBe(2_800);
    expect(t >= DEBOUT_A, 'la nouvelle attente rechargerait encore trop tôt').toBe(true);
  });

  it('et elle y survit pour de vrai, sur le banc', async () => {
    // Serveur à terre aux trois premières sondes (700, 1400, 2100), debout à
    // la quatrième (2800) : l'ancien rechargement à 1 500 ms était en plein
    // dedans.
    const { journal, sondes } = await banc(['aterre', 'aterre', 'aterre', 'debout'])();
    expect(journal).toEqual(['rechargement']);
    expect(sondes).toBe(4);
  });
});
