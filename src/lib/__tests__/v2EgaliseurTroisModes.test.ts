/**
 * L'égaliseur v2 offre les TROIS modes du client actuel.
 *
 * Il n'en avait qu'un — graphique — et le disait lui-même : « L'égaliseur
 * paramétrique et l'assistant Tune Master Profiler ne sont pas encore repris
 * dans ce client ». C'était le dernier écart fonctionnel face au v1
 * (Bertrand, 04/09/2026 : « la der »).
 *
 * ## Deux reprises, deux raisonnements opposés — et le test tient les deux
 *
 * `ParametricEq.svelte` est monté TEL QUEL : il transpose les biquads RBJ de
 * `tune-core/src/audio/eq.rs`, et deux implémentations divergeraient sans que
 * personne ne l'entende.
 *
 * `ProfilerV2.svelte` est NEUF : le Profiler ne calcule rien, c'est un
 * questionnaire qui produit une charge `eq_profile`. Et il vivait EN LIGNE
 * dans un fichier v1 de 1 981 lignes — le reprendre aurait voulu dire découper
 * l'écran du client actuel pour le seul confort du v2.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (f: string) => readFileSync(join(process.cwd(), 'src/components/v2', f), 'utf8');
const eq = lire('EqualizerV2.svelte');

/**
 * Le source SANS ses commentaires.
 *
 * Trois gardes se sont fait piéger aujourd'hui par leur propre documentation :
 * un commentaire qui CITE le défaut n'est pas le défaut. Ici, l'en-tête du
 * mode paramétrique parle des « biquads RBJ » pour expliquer pourquoi on ne
 * les recopie pas — et faisait rougir le test qui vérifie qu'on ne les recopie
 * pas.
 */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '');

describe('Égaliseur v2 — les trois modes', () => {
  it('le sélecteur propose graphique, paramétrique et assistant', () => {
    for (const cle of ['v2.eq.modeGraphic', 'v2.eq.modeParametric', 'v2.eq.modeAssistant']) {
      expect(eq, `le mode ${cle} a disparu du sélecteur`).toContain(cle);
    }
  });

  it('la promesse « pas encore repris » a disparu', () => {
    // La phrase décrivait un manque qui n'existe plus : la laisser ferait
    // douter d'une fonction présente à l'écran.
    expect(eq).not.toContain('v2.eq.moreC');
  });
});

describe('Paramétrique — le composant v1 est REPRIS, pas réécrit', () => {
  it('EqualizerV2 monte ParametricEq', () => {
    expect(eq).toContain("import ParametricEq from '../ParametricEq.svelte'");
    expect(eq).toMatch(/<ParametricEq[^>]*bind:bands=\{pBandes\}/);
  });

  it('aucune transposition de filtres n’est recopiée dans le v2', () => {
    // Si un jour `coeffs(` ou `biquad` apparaît ici, c'est que quelqu'un a
    // recommencé les maths — et qu'elles vont diverger du serveur.
    expect(sansCommentaires(eq)).not.toMatch(/function coeffs\(|biquad/i);
  });

  it('passer au paramétrique SÈME la courbe depuis le graphique', () => {
    // Arriver sur un éditeur vide effacerait le réglage en cours au premier
    // enregistrement.
    expect(eq).toContain('function versParametrique(');
    expect(eq).toMatch(/versParametrique[\s\S]{0,600}NEUTRAL_PARAMETRIC_BAND/);
  });

  it('toucher une bande allume l’égaliseur', () => {
    // Sinon la courbe part avec `enabled: false` : les points bougent, le son
    // ne change pas.
    expect(eq).toMatch(/function surChangementParametrique\(\)[\s\S]{0,200}enabled = true/);
  });

  it('le mode courant décide seulement quelles bandes partent', () => {
    expect(eq).toMatch(/sousMode === 'parametrique'[\s\S]{0,120}state\.snapshot\(pBandes\)/);
  });
});

describe('Assistant — le profil passe par une AUTRE route', () => {
  const prof = lire('ProfilerV2.svelte');

  it('il envoie eq_profile via setDsp, pas des bandes via setEq', () => {
    // Mélanger les deux enverrait deux corrections concurrentes à la même zone.
    expect(prof).toContain('api.setDsp(');
    expect(prof).toContain('eq_profile');
    expect(prof).not.toContain('api.setEq(');
  });

  it('remettre à zéro DÉSACTIVE le profil côté serveur', () => {
    // Sans `enabled: false`, la correction retirée continue de jouer.
    expect(prof).toMatch(/reinitialiser\(\)[\s\S]{0,700}enabled: false/);
  });

  it('il partage la clé de stockage du client actuel', () => {
    // Un utilisateur qui passe d'un client à l'autre retrouve son
    // questionnaire ; une clé propre au v2 le lui ferait ressaisir.
    expect(prof).toContain("'tune-master-profiler'");
  });

  it('les curseurs s’appliquent SANS notification', () => {
    // Trois glissements produiraient trois bandeaux « profil appliqué ».
    expect(prof).toMatch(/envoiDiffere[\s\S]{0,300}appliquer\(true\)/);
  });
});
