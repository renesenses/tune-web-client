// @vitest-environment jsdom
//
// web#3275 (alec_eiffel, forum, fil 2953) — LES FLÈCHES PRÉCÉDENT / SUIVANT DE
// L'INTERFACE, ET LES ÉCRANS RETROUVÉS COMME ILS ÉTAIENT.
//
// Le parcours de la demande : A → B → C, Précédent ×2 retrouve A avec son
// filtre ET son défilement, Suivant ramène B. On branche le VRAI écrivain
// d'historique de la coquille (`brancherHistoriqueCoquille`) sur le vrai
// `history` de jsdom ; les écrans sont simulés par ce qu'ils font réellement
// (déclarer leur état par `memoireEcran`, porter un conteneur défilant), et
// démontés à chaque changement de vue comme `ShellV2` les démonte.
//
// ⚠️ jsdom ne met pas en page : `scrollHeight` / `clientHeight` valent zéro. On
// leur donne une hauteur, comme `historiqueCoquilleV2_828_867` le fait.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { activeView } from '../stores/navigation';
import { brancherHistoriqueCoquille, detailOuvert, ongletCourant } from '../historiqueCoquille';
import {
  _poserRacine,
  _reinitialiserMemoire,
  _reinitialiserRangs,
  brancherRaccourcisNavigation,
  memoireEcran,
  naviguer,
  peutAvancer,
  peutReculer,
  sensDuRaccourci,
} from '../memoireNavigation';

const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Précédent / Suivant attendus sur leur ÉVÉNEMENT (#1308), par les flèches de l'interface. */
function geste(sens: 'reculer' | 'avancer'): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error(`aucun popstate après ${sens}`)), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
    if (!naviguer(sens)) { clearTimeout(filet); reject(new Error(`flèche ${sens} grisée`)); }
  });
}

/** Défiler comme l'utilisateur : la position, PUIS l'événement que le navigateur émet. */
function defiler(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

let racine: HTMLElement;
let debrancher: (() => void) | null = null;
const avantMiseEnPage = {
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
};

/** Un ÉCRAN monté : sa liste défilante, et son état déclaré à la coquille. */
interface Ecran { vue: string; liste: HTMLElement; etat: { filtre: string }; arreter: () => void; reprise: { filtre: string } | null }
let monte: Ecran | null = null;

function monter(vue: string): Ecran {
  monte?.arreter();
  racine.innerHTML = '';
  const liste = document.createElement('div');
  liste.className = `liste-${vue} defile`;
  racine.appendChild(liste);
  const etat = { filtre: '' };
  const m = memoireEcran<{ filtre: string }>(vue, () => ({ filtre: etat.filtre }));
  if (m.reprise) etat.filtre = m.reprise.filtre;
  monte = { vue, liste, etat, arreter: m.arreter, reprise: m.reprise };
  return monte;
}

/** Changer de vue comme la barre latérale, puis monter l'écran d'arrivée (`ShellV2`, `{#if}`). */
function allerA(vue: string): Ecran {
  activeView.set(vue as any);
  return monter(vue);
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 12000 });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  _reinitialiserMemoire();
  _reinitialiserRangs();
  racine = document.createElement('main');
  document.body.appendChild(racine);
  _poserRacine(() => racine);
  history.replaceState(null, '', '#');
  activeView.set('library' as any);
  detailOuvert.set(null);
  ongletCourant.set(null);
  debrancher = brancherHistoriqueCoquille({ fenetre: window });
});

afterEach(() => {
  debrancher?.();
  debrancher = null;
  monte?.arreter();
  monte = null;
  racine.remove();
  if (avantMiseEnPage.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', avantMiseEnPage.scrollHeight);
  if (avantMiseEnPage.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', avantMiseEnPage.clientHeight);
  document.body.innerHTML = '';
});

describe('web#3275 — Précédent / Suivant retrouvent chaque écran comme il était', () => {
  it('A → B → C, Précédent ×2 rend A avec son filtre et son défilement, Suivant rend B', async () => {
    const a = monter('library');
    expect(get(peutReculer), 'au démarrage, rien avant : Précédent grisé').toBe(false);
    expect(get(peutAvancer), 'au démarrage, rien après : Suivant grisé').toBe(false);

    a.etat.filtre = 'FLAC';
    defiler(a.liste, 1800);

    const b = allerA('search');
    b.etat.filtre = 'miles davis';
    defiler(b.liste, 420);
    allerA('settings');

    expect(get(peutReculer)).toBe(true);
    expect(get(peutAvancer), 'au bout du chemin, Suivant grisé').toBe(false);

    await geste('reculer');
    expect(get(activeView)).toBe('search');
    await geste('reculer');
    expect(get(activeView)).toBe('library');
    const a2 = monter('library');
    expect(a2.reprise, 'l’écran remonté par Précédent reçoit ce qu’il montrait').not.toBeNull();
    expect(a2.etat.filtre, 'le filtre de A est rendu').toBe('FLAC');
    expect(a2.liste.scrollTop, 'avant la reprise, la liste neuve est en tête').toBe(0);
    await attendre(120);
    expect(a2.liste.scrollTop, 'le défilement de A est rendu').toBe(1800);
    expect(get(peutReculer), 'première entrée : Précédent grisé').toBe(false);
    expect(get(peutAvancer), 'B et C sont devant : Suivant actif').toBe(true);

    await geste('avancer');
    expect(get(activeView)).toBe('search');
    const b2 = monter('search');
    expect(b2.etat.filtre, 'Suivant rend B avec sa requête').toBe('miles davis');
    await attendre(120);
    expect(b2.liste.scrollTop, 'et son défilement').toBe(420);
    expect(get(peutReculer)).toBe(true);
    expect(get(peutAvancer)).toBe(true);
  });

  it('une arrivée DÉLIBÉRÉE (barre latérale) repart de la racine : rien n’est rendu', async () => {
    const a = monter('library');
    a.etat.filtre = 'DSD';
    allerA('search');
    const a2 = allerA('library');
    expect(a2.reprise, '#3843 : la barre latérale n’est pas un retour').toBeNull();
    expect(a2.etat.filtre).toBe('');
  });

  it('naviguer vers une nouvelle entrée après un retour efface ce qui était devant', async () => {
    monter('library');
    allerA('search');
    allerA('settings');
    await geste('reculer');
    monter('search');
    expect(get(peutAvancer)).toBe(true);
    allerA('radios');
    expect(get(peutAvancer), 'la branche abandonnée n’est plus atteignable').toBe(false);
    expect(get(peutReculer)).toBe(true);
  });

  it('flèche grisée : le clic ne fait rien (et ne quitte pas Tune)', () => {
    monter('library');
    const back = vi.spyOn(history, 'back');
    const forward = vi.spyOn(history, 'forward');
    expect(naviguer('reculer')).toBe(false);
    expect(naviguer('avancer')).toBe(false);
    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
    back.mockRestore();
    forward.mockRestore();
  });

  it('le retour ne rejoue rien : seul l’état déclaré est reposé', async () => {
    const a = monter('library');
    const capteur = vi.fn(() => ({ filtre: 'Hi-Res' }));
    monte!.arreter();
    const m = memoireEcran('library', capteur);
    monte = { ...a, arreter: m.arreter };
    allerA('search');
    expect(capteur, 'l’état est LU une fois, à la sortie de l’entrée').toHaveBeenCalledTimes(1);
    await geste('reculer');
    const a2 = monter('library');
    expect(a2.etat.filtre).toBe('Hi-Res');
    expect(capteur, 'revenir ne rappelle pas l’écran quitté : on ne repose que des valeurs').toHaveBeenCalledTimes(1);
  });
});

describe('web#3275 — raccourcis clavier', () => {
  const touche = (init: KeyboardEventInit, cible: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    cible.dispatchEvent(e);
    return e;
  };

  it('Alt+← recule, Alt+→ avance, Cmd+[ / Cmd+] aussi', async () => {
    const arret = brancherRaccourcisNavigation();
    try {
      monter('library');
      allerA('search');
      const attendu = new Promise((r) => window.addEventListener('popstate', r, { once: true }));
      const e = touche({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
      expect(e.defaultPrevented, 'le défaut du navigateur est empêché : un seul recul').toBe(true);
      await attendu;
      expect(get(activeView)).toBe('library');
      monter('library');
      const attendu2 = new Promise((r) => window.addEventListener('popstate', r, { once: true }));
      touche({ key: ']', code: 'BracketRight', metaKey: true });
      await attendu2;
      expect(get(activeView)).toBe('search');
    } finally {
      arret();
    }
  });

  it('ignorés dans un champ de saisie (Alt+← y déplace le curseur)', () => {
    const arret = brancherRaccourcisNavigation();
    const back = vi.spyOn(history, 'back');
    try {
      monter('library');
      allerA('search');
      for (const tag of ['input', 'textarea', 'select']) {
        const champ = document.createElement(tag);
        document.body.appendChild(champ);
        const e = touche({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }, champ);
        expect(e.defaultPrevented, `${tag} : la frappe reste au champ`).toBe(false);
      }
      const editable = document.createElement('div');
      editable.setAttribute('role', 'textbox');
      document.body.appendChild(editable);
      touche({ key: '[', code: 'BracketLeft', metaKey: true }, editable);
      expect(back).not.toHaveBeenCalled();
    } finally {
      back.mockRestore();
      arret();
    }
  });

  it('ignorés sous une fenêtre modale, et sans modificateur', () => {
    const dialogue = document.createElement('div');
    dialogue.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialogue);
    const base = { key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: false, metaKey: false, shiftKey: false, target: document.body, defaultPrevented: false, isComposing: false };
    expect(sensDuRaccourci({ ...base, altKey: true })).toBeNull();
    dialogue.remove();
    expect(sensDuRaccourci({ ...base, altKey: true })).toBe('reculer');
    expect(sensDuRaccourci({ ...base, altKey: false }), '← seule reste à la lecture').toBeNull();
    expect(sensDuRaccourci({ ...base, altKey: true, shiftKey: true })).toBeNull();
    expect(sensDuRaccourci({ ...base, altKey: true, isComposing: true })).toBeNull();
  });
});
