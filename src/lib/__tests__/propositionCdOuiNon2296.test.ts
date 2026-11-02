// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ToastContainer from '../../components/partages/ToastContainer.svelte';
import { notifications } from '../stores/notifications';
import { preparerLocale, t } from '../i18n';
import { creerPropositionChargementCd, type DependancesProposition } from '../propositionChargementCd';
import type { WSEvent } from '../types';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi_ from '../locales/vi';
import el_ from '../locales/el';
import nb_ from '../locales/nb';
import pl_ from '../locales/pl';
import zh from '../locales/zh';

/**
 * tune-web-client#2296 (Tades, rc7, fil 2372) — « Au lieu d'éteindre la
 * fenêtre au bout de quelques trop courtes secondes, mets une boîte Oui/Non » :
 * le lecteur CD n'est pas forcément dans la pièce de l'écran. La proposition
 * « Disque inséré — Charger en mémoire » attend désormais la réponse.
 */

const INSERE: WSEvent = {
  type: 'cd.disque.insere',
  data: {
    disc_id: 'D1', nom: 'Miles Davis — Kind of Blue', album: 'Kind of Blue', artiste: 'Miles Davis',
    pistes: 2, pochette: null, memoire: { disponible: true, actif: true },
  },
};

beforeAll(async () => { await preparerLocale('fr'); });
afterEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.useRealTimers();
});

describe('#2296 — une question Oui / Non qui attend la réponse', () => {
  it('la question ne s’efface pas d’elle-même ; « Non » la retire sans rien lancer', async () => {
    vi.useFakeTimers();
    const oui = vi.fn();
    const non = vi.fn();
    notifications.question('Disque inséré : X', 'Charger en mémoire', oui, 'Non', non);
    vi.advanceTimersByTime(10 * 60_000);
    expect(get(notifications), 'la question a disparu toute seule').toHaveLength(1);

    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const vue = mount(ToastContainer, { target: cible });
    flushSync();
    const boutons = [...cible.querySelectorAll('button.toast-action')].map((b) => b as HTMLButtonElement);
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Charger en mémoire', 'Non']);
    boutons[1].click();
    flushSync();
    expect(non).toHaveBeenCalledTimes(1);
    expect(oui, '« Non » a lancé le chargement').not.toHaveBeenCalled();
    expect(get(notifications)).toHaveLength(0);
    unmount(vue);
    cible.remove();
  });

  it('le toast d’action ordinaire garde sa durée', () => {
    vi.useFakeTimers();
    notifications.withAction('m', 'b', () => {}, 15000);
    vi.advanceTimersByTime(15_001);
    expect(get(notifications)).toHaveLength(0);
  });
});

describe('#2296 — « Disque inséré » est une question', () => {
  function banc() {
    const questions: { message: string; oui: string; non: string; action: () => void }[] = [];
    const proposes: string[] = [];
    const retires: number[] = [];
    const charges: number[] = [];
    const d: DependancesProposition = {
      proposer: (m) => { proposes.push(m); return 100 + proposes.length; },
      demander: (message, oui, action, non) => { questions.push({ message, oui, non, action }); return questions.length; },
      info: () => {},
      erreur: () => {},
      retirer: (id) => retires.push(id),
      traduire: (cle) => get(t)(cle as any),
      zoneCourante: () => 3,
      charger: () => { charges.push(1); return Promise.resolve({}); },
      jouer: () => Promise.resolve({}),
    };
    return { traiter: creerPropositionChargementCd(d), questions, proposes, retires, charges };
  }

  it('à l’insertion : Oui = « Charger en mémoire », Non = « Non », rien ne part seul', () => {
    const b = banc();
    b.traiter(INSERE);
    expect(b.proposes, 'la proposition est encore un toast qui s’efface').toHaveLength(0);
    expect(b.questions).toHaveLength(1);
    expect(b.questions[0].message).toBe(fr['v2.cd.insertedPrompt'].replace('{disc}', 'Miles Davis — Kind of Blue'));
    expect(b.questions[0].oui).toBe(fr['v2.cd.loadIntoMemory']);
    expect(b.questions[0].non).toBe(fr['v2.cd.declineLoad']);
    expect(b.charges).toHaveLength(0);
    b.questions[0].action();
    expect(b.charges).toHaveLength(1);
  });

  it('le disque éjecté avant la réponse : la question est retirée', () => {
    const b = banc();
    b.traiter(INSERE);
    b.traiter({ type: 'sources.changed', data: [{ id: 'cd', type: 'cd', greffon: 'cd', nom: 'Miles Davis — Kind of Blue', etat: 'disque', detail: {} }] });
    expect(b.retires, 'le disque est toujours là').toHaveLength(0);
    b.traiter({ type: 'sources.changed', data: [{ id: 'cd', type: 'cd', greffon: 'cd', nom: 'Lecteur CD', etat: 'vide', detail: {} }] });
    expect(b.retires).toEqual([1]);
  });

  it('« Non » existe dans les douze catalogues', () => {
    for (const [l, cat] of Object.entries({ fr, en, de, es, it: it_, hu, ja, ko, ro, sv, vi: vi_, el: el_, nb: nb_, pl: pl_, zh })) {
      const v = (cat as Record<string, string>)['v2.cd.declineLoad'];
      expect(typeof v === 'string' && v.trim().length > 0, `${l} : v2.cd.declineLoad`).toBe(true);
    }
  });
});
