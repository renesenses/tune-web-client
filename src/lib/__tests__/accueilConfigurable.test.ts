/**
 * Page d'accueil configurable.
 *
 * Chantier ouvert par Bertrand le 02/09/2026 : l'accueil affichait quatre
 * sections figées dans son balisage ; il en veut une page composée par
 * l'utilisateur — ajouter, retirer, réordonner au glisser-déposer, et la
 * disposition rangée PAR PROFIL.
 *
 * ⚠️ Ces tests lisent la SOURCE. Ils tiennent des décisions précises ; ils ne
 * remplacent pas un essai à la souris.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ecran = () => lire('../../components/v2/HomeV2.svelte');

describe('Accueil — le registre', () => {
  it('les quatorze widgets demandés sont là', () => {
    // La liste vient mot pour mot de la demande de Bertrand.
    for (const id of [
      'zones', 'reprendre', 'recemment-ajoutes', 'recemment-ecoutes', 'hasard',
      'statistiques', 'nouveautes-artistes', 'nouveau-bibliotheque',
      'autres-versions', 'favoris', 'recommandations', 'radios-artistes',
      'podcasts-abonnements', 'qobuz-selection',
    ]) {
      expect(widgetParId(id), `le widget « ${id} » a disparu du registre`).toBeTruthy();
    }
  });

  it('aucun titre en dur : tous passent par une clé', () => {
    for (const w of WIDGETS) {
      expect(w.cleTitre.startsWith('v2.home.'), `« ${w.id} » n’a pas de clé de traduction`).toBe(true);
    }
  });

  it('tous les widgets sont HORIZONTAUX, sauf les chiffres', () => {
    // Décision de Bertrand : une bande qui défile, pour tous. Mêler grilles et
    // bandes rendrait la hauteur de la page imprévisible.
    for (const w of WIDGETS) {
      expect(['bande', 'chiffres']).toContain(w.forme);
    }
    expect(WIDGETS.filter((w) => w.forme === 'chiffres').map((w) => w.id)).toEqual(['statistiques']);
  });

  it('la disposition par défaut est celle de l’accueil ACTUEL', () => {
    // Personne ne doit voir son écran changer sans l'avoir demandé.
    expect(DISPOSITION_DEFAUT).toEqual([
      'reprendre', 'nouveautes-artistes', 'recemment-ajoutes', 'statistiques',
    ]);
    for (const id of DISPOSITION_DEFAUT) {
      expect(widgetParId(id), `le défaut cite « ${id} », absent du registre`).toBeTruthy();
    }
  });

  it('« au hasard » ne fait AUCUN appel réseau', () => {
    // La bibliothèque est déjà chargée par la coquille : une route « au
    // hasard » ferait payer un aller-retour pour un tirage local.
    const src = lire('../accueilWidgets.ts');
    const i = src.indexOf("id: 'hasard'");
    const bloc = src.slice(i, src.indexOf('},\n  {', i));
    expect(/api\.\w+\(/.test(bloc), '« au hasard » appelle le serveur').toBe(false);
    // Et c'est un vrai tirage sans remise : `sort(() => Math.random() - .5)`
    // n'est pas un mélange, il biaise selon l'algorithme de tri du moteur.
    expect(bloc.includes('splice(Math.floor(Math.random()'), 'le tirage a changé de méthode').toBe(true);
  });
});

describe('Accueil — la configuration', () => {
  it('elle est rangée PAR PROFIL, côté serveur', () => {
    // Choix de Bertrand : chacun sa page, et elle suit d'un appareil à l'autre.
    const src = ecran();
    expect(src.includes('api.getProfilePreferences('), 'la lecture des préférences a disparu').toBe(true);
    expect(src.includes('api.setProfilePreferences('), 'l’écriture a disparu').toBe(true);
    expect(src.includes("const CLE = 'home_widgets'"), 'la clé de rangement a changé').toBe(true);
  });

  it('l’écriture FUSIONNE, elle n’écrase pas', () => {
    // Un écran qui n'envoie que sa clé ne doit pas effacer celles des autres.
    const api = lire('../api.ts');
    const i = api.indexOf('export function setProfilePreferences');
    expect(api.slice(i, i + 300).includes("method: 'PUT'"), 'la méthode a changé').toBe(true);
  });

  it('un identifiant inconnu est IGNORÉ', () => {
    // Un widget retiré du registre laisserait sinon un trou muet dans la page
    // de qui l'avait choisi.
    expect(
      ecran().includes("d.filter((id: any) => typeof id === 'string' && widgetParId(id))"),
      'les identifiants inconnus ne sont plus filtrés.',
    ).toBe(true);
  });

  it('des préférences illisibles ne vident pas la page', () => {
    const src = ecran();
    const i = src.indexOf('async function charger()');
    const bloc = src.slice(i, src.indexOf('\n  }', i));
    expect(bloc.includes('catch'), 'l’échec n’est plus rattrapé').toBe(true);
    expect(/catch\s*\{[^}]*disposition\s*=\s*\[\]/.test(bloc), 'l’échec vide la page').toBe(false);
  });
});

describe('Accueil — le mode édition', () => {
  it('seule la POIGNÉE est déplaçable', () => {
    // Rendre la bande entière `draggable` empêcherait de la faire défiler à la
    // souris, qui est son geste principal.
    const src = ecran();
    const i = src.indexOf('class="poignee"');
    expect(i, 'la poignée a disparu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 400).includes('draggable="true"'), 'la poignée n’est plus déplaçable').toBe(true);
    expect(/class="bande"[^>]*draggable/.test(src), 'la bande entière est devenue déplaçable').toBe(false);
  });

  it('le clavier peut réordonner', () => {
    // Le glisser-déposer n'existe pas au clavier : sans les flèches, qui ne se
    // sert pas d'une souris ne pourrait jamais réordonner sa page.
    const src = ecran();
    expect(src.includes('function auClavier'), 'le déplacement au clavier a disparu').toBe(true);
    expect(src.includes("e.key === 'ArrowUp'"), 'les flèches ne déplacent plus').toBe(true);
    expect(src.includes('tabindex="0"'), 'la poignée n’est plus focalisable').toBe(true);
  });

  it('la cible de dépôt se voit', () => {
    // Sans repère, on lâche à l'aveugle.
    expect(/\.bloc\.cible\{[^}]*border-top-color/.test(ecran()), 'la cible de dépôt n’est plus signalée').toBe(true);
  });

  it('chaque widget se charge SEUL', () => {
    // Quatorze widgets, jusqu'à quatorze appels : un widget lent ou en panne ne
    // doit pas retenir les autres, et son échec ne doit pas vider la page.
    const src = ecran();
    expect(src.includes('function chargerWidget(id: string)'), 'le chargement par widget a disparu').toBe(true);
    expect(src.includes('echecs[id] = true;'), 'un échec ne se dit plus').toBe(true);
    // 🔴 Écriture DIRECTE, jamais par recopie : les widgets se chargent en
    // parallèle, et deux recopies dans la même trame se perdent l'une l'autre —
    // le drapeau repasse à `true` et le widget reste sur « Chargement… » pour
    // toujours. Vécu le 02/09/2026 sur deux des quatre widgets par défaut.
    expect(
      /enCours = \{ \.\.\.enCours/.test(src),
      'la mise à jour par recopie est revenue : deux widgets qui répondent ensemble se perdraient l’un l’autre.',
    ).toBe(false);
    expect(src.includes('v2.home.widgetFailed'), 'l’échec ne se distingue plus d’un widget vide').toBe(true);
  });

  it('une page vidée DIT comment la remplir', () => {
    // Sinon elle se lit comme une panne.
    expect(ecran().includes('v2.home.emptyHint'), 'l’invitation a disparu').toBe(true);
  });
});
