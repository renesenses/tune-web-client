import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onboardingRequis, type SourcesOnboarding } from '../onboardingRequis';

/**
 * L'assistant de première installation, et le fait qu'il soit ATTEIGNABLE.
 *
 * 🔴 Ce fichier garde deux choses distinctes, et il faut les deux.
 *
 * La RÈGLE — quand proposer l'assistant — est éprouvée en appelant la
 * fonction. La seconde moitié est plus ingrate : une règle juste ne sert à
 * rien si aucune coquille ne la monte. Ce client a déjà produit le cas, deux
 * fois documentées : `LoginView`, 352 lignes, inatteignable dans les deux
 * interfaces (#1021) ; et `OnboardingView`, 1 117 lignes, rendue par
 * `$activeView === 'onboarding'` — valeur que PERSONNE ne pose. Le vrai
 * assistant a toujours été `OnboardingWizard`, monté ailleurs.
 *
 * D'où la garde de branchement plus bas : elle lit les deux coquilles et
 * exige le MONTAGE, pas l'import.
 */

const RACINE = resolve(process.cwd());
const lire = (chemin: string) => readFileSync(resolve(RACINE, chemin), 'utf8');

/** Des sources muettes : chaque essai ne remplace que ce qu'il éprouve. */
function sources(sur: Partial<SourcesOnboarding> = {}): SourcesOnboarding {
  return {
    drapeauLocal: () => null,
    config: async () => null,
    statut: async () => null,
    pistes: async () => 1,
    memoriser: () => {},
    ...sur,
  };
}

describe('quand proposer l’assistant', () => {
  it('l’appareil se souvient que c’est fait : on ne demande RIEN au serveur', async () => {
    const config = vi.fn(async () => null);
    expect(await onboardingRequis(sources({ drapeauLocal: () => 'true', config }))).toBe(false);
    expect(config, 'le raccourci local doit éviter tout aller-retour').not.toHaveBeenCalled();
  });

  it('le serveur dit que c’est fait — sous ses quatre orthographes', async () => {
    for (const dit of [
      { onboarding_complete: true },
      { onboarding_complete: 'true' },
      { onboarding_completed: true },
      { onboarding_completed: 'true' },
    ]) {
      expect(await onboardingRequis(sources({ config: async () => dit })), JSON.stringify(dit)).toBe(false);
    }
  });

  it('le serveur dit que c’est fait : on le mémorise pour ne plus le redemander', async () => {
    const memoriser = vi.fn();
    await onboardingRequis(sources({ config: async () => ({ onboarding_complete: true }), memoriser }));
    expect(memoriser).toHaveBeenCalled();
  });

  it('l’état dédié dit que ce n’est pas complet : on propose', async () => {
    expect(await onboardingRequis(sources({ statut: async () => ({ complete: false }) }))).toBe(true);
  });

  it('dernier recours : une bibliothèque vide trahit une installation neuve', async () => {
    expect(await onboardingRequis(sources({ pistes: async () => 0 }))).toBe(true);
    expect(await onboardingRequis(sources({ pistes: async () => 1 }))).toBe(false);
  });

  it('une panne ne met JAMAIS l’assistant devant quelqu’un qui écoute depuis un an', async () => {
    const casse = async () => { throw new Error('serveur injoignable'); };
    expect(await onboardingRequis(sources({ config: casse, statut: casse, pistes: casse }))).toBe(false);
  });

  it('un statut « complete » ne déclenche pas l’assistant', async () => {
    // `complete: true` ne doit pas être lu comme « il y a un statut, donc on
    // propose » : seul `complete === false` déclenche.
    expect(await onboardingRequis(sources({ statut: async () => ({ complete: true }) }))).toBe(false);
  });
});

describe('l’assistant est ATTEIGNABLE depuis les deux coquilles', () => {
  /*
   * On cherche le MONTAGE `<AssistantPremiereInstallation`, jamais le nom nu :
   * l'import le contient, les commentaires qui l'expliquent aussi. Une garde
   * satisfaite par la documentation de ce qu'elle garde ne garde rien.
   */
  const MONTAGE = /<AssistantPremiereInstallation[\s/>]/;

  it('la coquille de la future v1 le monte', () => {
    expect(lire('src/components/v2/ShellV2.svelte')).toMatch(MONTAGE);
  });

  it('la coquille actuelle le monte', () => {
    expect(lire('src/App.svelte')).toMatch(MONTAGE);
  });

  it('l’enveloppe monte le VRAI assistant, celui qui est branché', () => {
    // `OnboardingView` — 1 117 lignes — n'a jamais été atteignable : elle
    // pendait à `$activeView === 'onboarding'`, valeur que personne ne pose.
    const enveloppe = lire('src/components/partages/AssistantPremiereInstallation.svelte');
    expect(enveloppe).toMatch(/<OnboardingWizard[\s/>]/);
    expect(enveloppe, 'OnboardingView n’a jamais été branchée').not.toMatch(/<OnboardingView[\s/>]/);
  });

  it('la règle n’est écrite qu’UNE fois', () => {
    // Elle a quatre niveaux de repli et un piège : deux copies divergeront.
    expect(lire('src/App.svelte'), 'App a gardé sa propre copie de la règle')
      .not.toMatch(/function checkOnboarding\s*\(/);
  });
});
