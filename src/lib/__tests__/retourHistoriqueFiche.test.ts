import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  finDuRetourProgrammatique,
  opPourFiche,
  reculerAvecIntention,
  retourProgrammatiqueEnCours,
} from '../historiqueNavigation';

/**
 * Le retour d'écran détruisait l'entrée d'historique qu'il quittait.
 *
 * Relevé dans Chrome sur .18 (v0.9.126) en instrumentant `pushState`,
 * `replaceState`, `history.back` et `popstate` :
 *
 *   retour NAVIGATEUR : ['POP #library']
 *   retour ÉCRAN      : ['replace #library', 'back()', 'POP #library']
 *
 * Le `replace` écrase `#album/2691` — l'adresse de la fiche — avant de
 * reculer. « Suivant » ne peut plus y revenir.
 */

/** Une pile d'historique jouable, qui note ce qu'on lui fait. */
function historiqueJouable(entreeInitiale = '#library') {
  const pile: string[] = [entreeInitiale];
  let curseur = 0;
  const ops: string[] = [];
  const ecouteurs: Array<() => void> = [];
  return {
    ops,
    pile: () => [...pile],
    entreeCourante: () => pile[curseur],
    peutAvancer: () => curseur < pile.length - 1,
    push(url: string) {
      ops.push(`push ${url}`);
      pile.splice(curseur + 1);
      pile.push(url);
      curseur = pile.length - 1;
    },
    replace(url: string) {
      ops.push(`replace ${url}`);
      pile[curseur] = url;
    },
    back() {
      ops.push('back()');
      if (curseur > 0) curseur--;
      // `popstate` arrive de façon asynchrone dans un vrai navigateur ; ici on
      // le déclenche à la demande, pour pouvoir observer l'entre-deux.
      this.popstateEnAttente = true;
    },
    popstateEnAttente: false,
    livrerPopstate() {
      if (!this.popstateEnAttente) return;
      this.popstateEnAttente = false;
      ops.push(`POP ${pile[curseur]}`);
      finDuRetourProgrammatique();
      ecouteurs.forEach(e => e());
    },
    surPopstate(cb: () => void) { ecouteurs.push(cb); },
  };
}

/**
 * La souscription d'App.svelte, réduite à sa décision : une fiche s'ouvre ou
 * se ferme, que fait-on de l'historique ?
 */
function souscriptionFiche(h: ReturnType<typeof historiqueJouable>) {
  return (idAlbum: number | null) => {
    const op = opPourFiche(idAlbum !== null);
    if (op === 'push') h.push(`#album/${idAlbum}`);
    else if (op === 'replace') h.replace('#library');
  };
}

describe('le retour d’écran ne détruit plus l’entrée qu’il quitte', () => {
  beforeEach(() => finDuRetourProgrammatique());

  it('retour d’écran : une seule opération, comme le retour navigateur', () => {
    const h = historiqueJouable();
    const surFiche = souscriptionFiche(h);

    surFiche(2691);                       // on ouvre la fiche
    expect(h.ops).toEqual(['push #album/2691']);

    reculerAvecIntention(() => surFiche(null), { historique: h, programmerFilet: () => {} });
    h.livrerPopstate();

    expect(h.ops).toEqual(['push #album/2691', 'back()', 'POP #library']);
  });

  it('contre-épreuve : sans l’intention, le `replace` revient et écrase la fiche', () => {
    const h = historiqueJouable();
    const surFiche = souscriptionFiche(h);
    surFiche(2691);
    surFiche(null);                       // fermeture SANS annoncer le retour
    h.back();
    h.livrerPopstate();
    expect(h.ops).toEqual(['push #album/2691', 'replace #library', 'back()', 'POP #library']);
  });

  it('l’entrée de la fiche survit : « suivant » peut y revenir', () => {
    const h = historiqueJouable();
    const surFiche = souscriptionFiche(h);
    surFiche(2691);
    reculerAvecIntention(() => surFiche(null), { historique: h, programmerFilet: () => {} });
    h.livrerPopstate();

    expect(h.pile()).toEqual(['#library', '#album/2691']);
    expect(h.peutAvancer()).toBe(true);
  });

  it('fermer une fiche AUTREMENT qu’en reculant réécrit toujours l’entrée', () => {
    const h = historiqueJouable();
    const surFiche = souscriptionFiche(h);
    surFiche(2691);
    surFiche(null);                       // clic ailleurs, changement d'onglet…
    expect(h.ops).toEqual(['push #album/2691', 'replace #library']);
  });

  it('l’intention ne vaut que pour le retour en cours', () => {
    const h = historiqueJouable();
    const surFiche = souscriptionFiche(h);

    surFiche(2691);
    reculerAvecIntention(() => surFiche(null), { historique: h, programmerFilet: () => {} });
    h.livrerPopstate();
    expect(retourProgrammatiqueEnCours()).toBe(false);

    surFiche(4102);
    surFiche(null);                       // fermeture normale : replace de nouveau
    expect(h.ops.slice(-1)).toEqual(['replace #library']);
  });

  it('les mutations tournent DANS la fenêtre d’intention, avant le back()', () => {
    const h = historiqueJouable();
    const vues: boolean[] = [];
    reculerAvecIntention(() => { vues.push(retourProgrammatiqueEnCours()); }, {
      historique: h,
      programmerFilet: () => {},
    });
    expect(vues).toEqual([true]);
    expect(h.ops).toEqual(['back()']);
  });

  it('filet de sécurité : sans `popstate`, le drapeau retombe seul', () => {
    const h = historiqueJouable();
    let filet: (() => void) | null = null;
    reculerAvecIntention(() => {}, {
      historique: h,
      programmerFilet: (cb) => { filet = cb; },
    });
    expect(retourProgrammatiqueEnCours()).toBe(true);
    filet!();
    expect(retourProgrammatiqueEnCours()).toBe(false);
  });

  it('une mutation qui échoue ne laisse pas le drapeau levé ni le retour en plan', () => {
    const h = historiqueJouable();
    let filet: (() => void) | null = null;
    expect(() =>
      reculerAvecIntention(() => { throw new Error('boum'); }, {
        historique: h,
        programmerFilet: (cb) => { filet = cb; },
      }),
    ).toThrow('boum');
    expect(h.ops).toEqual(['back()']);
    filet!();
    expect(retourProgrammatiqueEnCours()).toBe(false);
  });
});

describe('les vues déclarent leur intention', () => {
  const source = (chemin: string) =>
    readFileSync(resolve(__dirname, '../..', chemin), 'utf-8');

  it('App.svelte décide par `opPourFiche` au lieu d’un `replaceState` inconditionnel', () => {
    const app = source('App.svelte');
    expect(app).toMatch(/opPourFiche/);
    expect(app).toMatch(/finDuRetourProgrammatique/);
  });

  it('le goBack() de LibraryView annonce le retour', () => {
    const vue = source('components/LibraryView.svelte');
    expect(vue).toMatch(/reculerAvecIntention/);
    // Plus de `history.back()` nu dans le goBack de la bibliothèque.
    expect(vue).not.toMatch(/window\.history\.back\(\)/);
  });
});
