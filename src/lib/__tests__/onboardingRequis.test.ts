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

  /*
   * 🔴 Mesuré sur le .18 le 20/09/2026, en lecture seule :
   *
   *     GET /api/v1/onboarding/status
   *     {"complete":false,"current_step":0,"steps":[… six fois done:false]}
   *     GET /api/v1/library/stats
   *     {"albums":4363,"artists":1638,"listens":1268,"tracks":47118, …}
   *
   * Un serveur configuré depuis des mois, et un état dédié qui jure que
   * l'installation n'a pas commencé. Ce n'est pas une information : c'est une
   * CONTRADICTION, et la bibliothèque est le témoin le plus dur des deux —
   * 47 118 pistes ne s'indexent pas toutes seules avant la première étape.
   *
   * La cause a été trouvée en aval : l'assistant ne prévenait JAMAIS le
   * serveur qu'il avait fini (voir la garde de branchement plus bas), si bien
   * que `onboarding_complete` est resté faux sur toutes les installations du
   * monde. Le départage va donc dans le sens du silence.
   */
  it('l’état dédié dit « pas terminé » alors que la bibliothèque est PLEINE : on se tait', async () => {
    const aLaMesureDu18 = sources({ statut: async () => ({ complete: false }), pistes: async () => 47118 });
    expect(await onboardingRequis(aLaMesureDu18)).toBe(false);
  });

  it('la contradiction ne se mémorise PAS : le serveur peut encore dire vrai', async () => {
    // Se taire n'est pas conclure. Poser le drapeau local ici rendrait le
    // silence définitif sur cet appareil, y compris si le serveur finissait
    // par annoncer une installation réellement neuve.
    const memoriser = vi.fn();
    await onboardingRequis(sources({ statut: async () => ({ complete: false }), pistes: async () => 47118, memoriser }));
    expect(memoriser).not.toHaveBeenCalled();
  });

  /*
   * 🔴 LA CONTRE-ÉPREUVE. Sans elle la garde ci-dessus ne garde rien : on
   * aurait simplement éteint l'assistant pour tout le monde. Une installation
   * réellement vierge — zéro piste — doit TOUJOURS le voir, que l'état dédié
   * réponde, qu'il dise « pas terminé », ou qu'il ne réponde pas du tout.
   */
  it('une installation RÉELLEMENT vierge voit toujours l’assistant', async () => {
    for (const statut of [
      async () => ({ complete: false }),
      async () => null,
      async () => ({}),
    ] as SourcesOnboarding['statut'][]) {
      expect(await onboardingRequis(sources({ statut, pistes: async () => 0 }))).toBe(true);
    }
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
    expect(await onboardingRequis(sources({ statut: async () => ({ complete: true }) }))).toBe(false);
  });

  it('le statut « terminé » suffit, même sur une bibliothèque vide', async () => {
    // Une installation terminée peut n'avoir aucun fichier local : elle
    // n'écoute que du streaming. Le compte de pistes ne doit pas la renvoyer
    // à l'assistant qu'elle vient de finir.
    const memoriser = vi.fn();
    const s = sources({ statut: async () => ({ complete: true }), pistes: async () => 0, memoriser });
    expect(await onboardingRequis(s)).toBe(false);
    expect(memoriser, 'un « terminé » affirmé se retient').toHaveBeenCalled();
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

  it('l’enveloppe monte le VRAI assistant, celui qui est branché', () => {
    // `OnboardingView` — 1 117 lignes — n'a jamais été atteignable : elle
    // pendait à `$activeView === 'onboarding'`, valeur que personne ne pose.
    const enveloppe = lire('src/components/partages/AssistantPremiereInstallation.svelte');
    expect(enveloppe).toMatch(/<OnboardingWizard[\s/>]/);
    expect(enveloppe, 'OnboardingView n’a jamais été branchée').not.toMatch(/<OnboardingView[\s/>]/);
  });

});

/**
 * L'assistant PRÉVIENT le serveur qu'il a fini.
 *
 * 🔴 C'est la cause du défaut mesuré sur le .18, et elle est du genre « écrit
 * mais pas branché » : `api.onboardingStep()` et `api.skipOnboarding()`
 * existent dans `lib/api.ts` depuis le premier jour et n'avaient AUCUN
 * appelant. L'assistant ne posait que son drapeau local — propre à
 * l'appareil. Le serveur ne franchissait donc jamais son étape finale :
 * `onboarding_complete` est resté faux sur toutes les installations, et
 * chaque navigateur neuf repartait de zéro.
 *
 * La garde lit le CORPS des deux sorties, pas le fichier entier : un import,
 * un commentaire, ou un appel ajouté ailleurs la satisferaient à tort.
 */
describe('l’assistant prévient le serveur quand il a fini', () => {
  const source = lire('src/components/partages/OnboardingWizard.svelte');

  /** Le corps d'une fonction, accolades appariées — pas sa seule déclaration. */
  function corpsDe(nom: string): string {
    const declaration = source.indexOf(`function ${nom}(`);
    expect(declaration, `fonction ${nom} introuvable`).toBeGreaterThan(-1);
    const ouvrante = source.indexOf('{', declaration);
    expect(ouvrante, `corps de ${nom} introuvable`).toBeGreaterThan(-1);
    let profondeur = 0;
    let i = ouvrante;
    for (; i < source.length; i++) {
      if (source[i] === '{') profondeur++;
      else if (source[i] === '}' && --profondeur === 0) break;
    }
    expect(profondeur, `accolades non appariées dans ${nom}`).toBe(0);
    return source.slice(ouvrante + 1, i);
  }

  it('« terminer » franchit l’étape finale côté serveur', () => {
    const corps = corpsDe('finishOnboarding');
    expect(corps, 'le drapeau local seul est propre à CET appareil').toMatch(/api\.onboardingStep\(\s*['"]complete['"]/);
  });

  it('« passer » le dit aussi au serveur', () => {
    // Passer l'assistant est une décision, pas un abandon : le serveur doit
    // la connaître, sinon le prochain navigateur la redemande.
    expect(corpsDe('skipOnboarding')).toMatch(/api\.skipOnboarding\(/);
  });

  it('un serveur muet ne bloque pas l’utilisateur', () => {
    // L'appel est un envoi, pas une condition : l'assistant se ferme même si
    // le serveur refuse. D'où le drapeau local posé AVANT, et le rattrapage
    // d'erreur sur l'appel.
    for (const nom of ['finishOnboarding', 'skipOnboarding']) {
      const corps = corpsDe(nom);
      expect(corps, `${nom} : l’appel doit être rattrapé`).toMatch(/\.catch\(/);
      const drapeau = corps.indexOf("localStorage.setItem('tune_onboarding_completed'");
      const appel = corps.indexOf('api.');
      expect(drapeau, `${nom} : drapeau local introuvable`).toBeGreaterThan(-1);
      expect(appel, `${nom} : appel serveur introuvable`).toBeGreaterThan(-1);
      expect(drapeau, `${nom} : le drapeau local se pose AVANT l’aller-retour`).toBeLessThan(appel);
    }
  });
});
