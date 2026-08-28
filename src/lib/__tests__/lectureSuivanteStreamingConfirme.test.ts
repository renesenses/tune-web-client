import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// « Lecture suivante » enfilait bien la piste d'un service, mais ne disait
// rien (#2079, Sandro, fil forum 1493). Le serveur, lui, répond
// `201 { added, queue_length }` — la confirmation existait, le client la
// jetait. La bibliothèque locale et Oxygen affichaient déjà leur toast :
// seul le chemin des services restait muet, pour TOUS les services et pas
// seulement Qobuz.
//
// Ces tests lisent la SOURCE du composant, comme `shutdownErrorHonesty` :
// un succès silencieux ne se distingue d'une panne dans aucun test de
// rendu, mais il se voit dans la suite d'instructions du gestionnaire.

function lire(fichier: string): string {
  return readFileSync(resolve(__dirname, '../../components', fichier), 'utf-8');
}

const streaming = lire('StreamingView.svelte');
const bibliotheque = lire('LibraryView.svelte');

/** Le corps du gestionnaire « Lecture suivante » du chemin services. */
function gestionnaireStreaming(): string {
  const debut = streaming.indexOf('async function playNextStreaming(');
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = streaming.indexOf('function goBack()', debut);
  expect(fin).toBeGreaterThan(debut);
  return streaming.slice(debut, fin);
}

describe('« Lecture suivante » sur une piste de service confirme (#2079)', () => {
  it("un enfilage réussi affiche un toast de succès, après l'ajout", () => {
    const h = gestionnaireStreaming();
    const ajout = h.indexOf('api.addToQueue(');
    const succes = h.indexOf('notifications.success(', ajout);

    expect(ajout).toBeGreaterThanOrEqual(0);
    // Le toast doit venir APRÈS l'ajout : annoncé avant, il mentirait dès que
    // la requête échoue.
    expect(succes).toBeGreaterThan(ajout);
    // Il réutilise le libellé déjà traduit dans les onze langues, comme le
    // fait la bibliothèque locale — aucune clé neuve à faire dériver.
    expect(h).toContain("$tr('streaming.playNext').toLowerCase()");
  });

  it('un échec ne reste pas muet non plus', () => {
    const h = gestionnaireStreaming();
    const attrape = h.indexOf('} catch');
    expect(attrape).toBeGreaterThanOrEqual(0);
    expect(h.indexOf('notifications.error(', attrape)).toBeGreaterThan(attrape);
  });

  it('une zone absente ou une piste sans source_id se dit, au lieu de sortir en silence', () => {
    const h = gestionnaireStreaming();
    const garde = h.indexOf('if (!zone?.id)');
    expect(garde).toBeGreaterThanOrEqual(0);
    // La garde d'origine était `if (!zone?.id || !track.source_id) return;` :
    // un `return` nu, sans un mot pour l'utilisateur.
    expect(h).not.toMatch(/if \(!zone\?\.id \|\| !track\.source_id\) return;/);
    expect(h.indexOf('notifications.error(', garde)).toBeGreaterThan(garde);
  });

  it("le second clic est désarmé tant que le premier n'a pas répondu", () => {
    const h = gestionnaireStreaming();
    // Le toast n'arrive qu'après trois allers-retours réseau ; sans verrou,
    // le reclic qu'appelle le silence part avant lui et enfile la piste une
    // deuxième fois — le symptôme réellement vécu.
    const sortie = h.indexOf('if (enfilageSuivantEnCours) return;');
    const prise = h.indexOf('enfilageSuivantEnCours = true;', sortie);
    const relache = h.indexOf('enfilageSuivantEnCours = false;', prise);

    expect(sortie).toBeGreaterThanOrEqual(0);
    expect(prise).toBeGreaterThan(sortie);
    // Relâché dans un `finally` : sinon une erreur laisse le bouton mort.
    expect(relache).toBeGreaterThan(prise);
    expect(h.slice(prise)).toMatch(/\}\s*finally\s*\{[\s\S]*enfilageSuivantEnCours = false;/);
    // Le drapeau doit être déclaré au composant, pas dans le gestionnaire :
    // une variable locale se recrée à chaque clic et ne verrouille rien.
    expect(streaming).toMatch(/let enfilageSuivantEnCours = \$state\(false\);/);
  });

  it('la bibliothèque locale, elle, confirmait déjà — et continue', () => {
    // Témoin : ce chemin-là n'a jamais été muet. S'il le devenait, le
    // correctif aurait déplacé le défaut au lieu de le supprimer.
    expect(bibliotheque).toContain("$tr('library.playNext').toLowerCase()");
  });
});
