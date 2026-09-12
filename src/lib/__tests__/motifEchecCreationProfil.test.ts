/**
 * Un refus de création de profil doit dire CE QUI S'EST PASSÉ.
 *
 * Chantier multi-profil, lot C. `createProfile` rendait `null` pour toute
 * cause, et l'écran devinait : il affichait « les profils multiples demandent
 * la version Premium » aussi bien sur un refus de palier que sur une coupure
 * réseau. Envoyer quelqu'un à la caisse parce que son Wi-Fi a lâché est la
 * pire des deux erreurs possibles.
 *
 * Le serveur, lui, sait : `profiles.rs` refuse en **402** avec
 * `{"error":"premium_required","feature":"multi_profiles"}`, et `fetchJSON`
 * fait déjà voyager le statut sur l'erreur depuis #2178.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motifDeLErreur } from '../stores/profile';

describe('motifDeLErreur — reconnaître le refus', () => {
  it('🔴 un 402 est un refus de PALIER', () => {
    expect(motifDeLErreur({ status: 402, message: 'premium_required' })).toBe('premium');
  });

  it('un nom déjà pris est un 409', () => {
    expect(motifDeLErreur({ status: 409, message: 'conflict' })).toBe('nom-pris');
  });

  it('🔴 tout le reste est « autre » — surtout pas « premium »', () => {
    // Le défaut corrigé : une panne réseau annonçait un besoin d'abonnement.
    expect(motifDeLErreur(new Error('Failed to fetch'))).toBe('autre');
    expect(motifDeLErreur({ status: 500, message: 'boom' })).toBe('autre');
    expect(motifDeLErreur(null)).toBe('autre');
    expect(motifDeLErreur(undefined)).toBe('autre');
  });

  it('lit aussi le MESSAGE, pour les aides qui lèvent des Error nues', () => {
    // Toutes les aides du client ne passent pas encore par `erreurSentinelle` :
    // certaines lèvent une `Error` dont le texte porte le code.
    expect(motifDeLErreur(new Error('premium_required'))).toBe('premium');
    expect(motifDeLErreur(new Error('HTTP 409'))).toBe('nom-pris');
  });

  it('un objet sans rien d’exploitable ne devine pas', () => {
    expect(motifDeLErreur({})).toBe('autre');
    expect(motifDeLErreur('premium')).toBe('autre');
  });
});

/* ───────────────────────────── Le câblage ──────────────────────────────── */

const lire = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('Le motif remonte jusqu’à l’écran', () => {
  it('🔴 `createProfile` ne rend plus un `null` muet', () => {
    const src = lire('src/lib/stores/profile.ts');
    expect(src).toContain('Promise<ResultatCreation>');
    expect(src).toContain('return { ok: false, motif: motifDeLErreur(e) };');
    // Borné à la fonction : `profile.ts` porte d'autres `return null` légitimes
    // (mes premières bornes allaient jusqu'à la fin du fichier et les
    // attrapaient).
    const debut = src.indexOf('export async function createProfile');
    const fin = src.indexOf('\nexport ', debut + 1);
    expect(debut, 'createProfile a disparu').toBeGreaterThan(-1);
    expect(
      /return null;/.test(src.slice(debut, fin)),
      'createProfile rend de nouveau `null` : la cause est perdue',
    ).toBe(false);
  });

  it('🔴 l’écran Profils ne présume plus le premium', () => {
    const src = lire('src/components/ProfilesSettings.svelte');
    expect(src).toContain('MESSAGE_ECHEC[resultat.motif]');
    // Chaque motif a son message, et ils sont distincts : trois motifs qui
    // pointeraient la même clé reviendraient au défaut d'origine.
    for (const cle of ['profiles.premiumRequired', 'profiles.nameTaken', 'profiles.createFailed']) {
      expect(src, `le motif « ${cle} » n’a plus de message`).toContain(cle);
    }
  });

  it('🔴 le sélecteur n’ignore plus le résultat', () => {
    // Il faisait `await createProfile(...)` puis fermait la fenêtre : un refus
    // de palier se comportait exactement comme une réussite, et la liste
    // restait inchangée sans un mot.
    const src = lire('src/components/ProfileSelector.svelte');
    const i = src.indexOf('async function handleCreate');
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps).toContain('const resultat = await createProfile');
    expect(corps).toContain('if (!resultat.ok)');
    expect(
      corps.indexOf('return;'),
      'la fenêtre se ferme malgré le refus',
    ).toBeLessThan(corps.indexOf('showCreateDialog = false'));
  });

  it('🔴 le message générique n’affirme plus le premium', () => {
    // `profiles.createFailed` DISAIT « les profils multiples demandent la
    // version Premium » — c'est devenu le message de repli, il ne doit donc
    // plus affirmer une cause qu'on ne connaît pas.
    const fr = readFileSync(resolve(process.cwd(), 'src/lib/locales/fr.ts'), 'utf8');
    const ligne = fr.split('\n').find((l) => l.includes('"profiles.createFailed"')) ?? '';
    expect(ligne).not.toMatch(/[Pp]remium/);
    // …et le message DU premium, lui, le dit toujours.
    const premium = fr.split('\n').find((l) => l.includes('"profiles.premiumRequired"')) ?? '';
    expect(premium).toMatch(/[Pp]remium/);
  });
});
