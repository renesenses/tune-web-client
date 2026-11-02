// @vitest-environment jsdom
//
// renesenses/tune-server-rust#6840 — la question du partage des écoutes avec
// le compte, posée au démarrage.
//
// Ce banc MONTE la fenêtre contre un faux serveur qui tient le même automate
// que le vrai (`ecoutes_au_compte::enregistrer_reponse`) : `a_demander`,
// fermée une fois → toujours `a_demander` (une relance), fermée deux fois →
// `refuse`. Il vérifie : absente sur un serveur non relié, déjà répondu, ou
// qui ne publie pas l'état ; présente sinon, sans case précochée et sans
// aucun PATCH avant un clic ; « Oui » / « Non » / fermeture envoient chacun
// leur mot ; une seule relance d'un démarrage à l'autre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import ConsentementEcoutes from '../../components/partages/ConsentementEcoutes.svelte';
import {
  CLE_CONSENTEMENT_ECOUTES,
  _reinitialiserDemarrage,
  lireConsentementEcoutes,
  questionAPoser,
} from '../consentementEcoutes';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let etat: { state: string; linked: boolean; answered_at: string | null; dismissals: number; max_dismissals: number };
let publie: boolean;
let patchEchoue: boolean;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Le même automate que le serveur. */
function repondreCommeLeServeur(mot: string) {
  if (mot === 'accepte' || mot === 'refuse') {
    etat.state = mot;
    etat.answered_at = '2026-10-23T12:00:00Z';
  } else if (mot === 'fermee' && etat.state === 'a_demander') {
    etat.dismissals += 1;
    if (etat.dismissals >= etat.max_dismissals) {
      etat.state = 'refuse';
      etat.answered_at = '2026-10-23T12:00:00Z';
    }
  }
}

async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ConsentementEcoutes, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}

function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}

const fenetre = () => document.querySelector('[data-consentement="ecoutes"]');
const bouton = (mot: string) => document.querySelector<HTMLButtonElement>(`[data-reponse="${mot}"]`);

beforeEach(() => {
  _reinitialiserDemarrage();
  publie = true;
  patchEchoue = false;
  patchs.length = 0;
  etat = { state: 'a_demander', linked: true, answered_at: null, dismissals: 0, max_dismissals: 2 };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (patchEchoue) return json({ error: 'boom' }, 500);
      repondreCommeLeServeur(String(corps[CLE_CONSENTEMENT_ECOUTES]));
      return json({ ok: true, [CLE_CONSENTEMENT_ECOUTES]: etat.state });
    }
    if (/\/system\/config(\?|$)/.test(u)) {
      return json(publie ? { music_dirs: [], [CLE_CONSENTEMENT_ECOUTES]: { ...etat } } : { music_dirs: [] });
    }
    return json({});
  }));
});

afterEach(() => {
  demonter();
  vi.unstubAllGlobals();
});

describe('#6840 — libellés', () => {
  it('les douze libellés existent dans les douze langues', () => {
    expect(ONZE_LANGUES.length).toBe(15);
    const cles = ['Title', 'Intro', 'SentLabel', 'Sent', 'NeverLabel', 'Never', 'Benefit',
      'SettingsReminder', 'Error', 'No', 'Yes', 'Close'].map((k) => `settings.cloudListensConsent${k}`);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of cles) expect(d[k], `${code} : ${k}`).toBeTruthy();
    }
  });
});

describe('#6840 — quand la question se pose', () => {
  it('lecture de l’état : non publié ou illisible → jamais de question', () => {
    expect(questionAPoser(lireConsentementEcoutes({}))).toBe(false);
    expect(questionAPoser(lireConsentementEcoutes({ cloud_listens_consent: { state: 'peut-etre', linked: true } }))).toBe(false);
    expect(questionAPoser(lireConsentementEcoutes({ cloud_listens_consent: { state: 'a_demander', linked: true } }))).toBe(true);
    expect(questionAPoser(lireConsentementEcoutes({ cloud_listens_consent: { state: 'a_demander', linked: 'true' } }))).toBe(false);
  });

  it('serveur non relié : aucune fenêtre', async () => {
    etat.linked = false;
    await monter();
    expect(fenetre()).toBeNull();
  });

  it('déjà répondu (accepté ou refusé) : aucune fenêtre', async () => {
    for (const s of ['accepte', 'refuse']) {
      _reinitialiserDemarrage();
      etat.state = s;
      await monter();
      expect(fenetre(), `fenêtre ouverte sur « ${s} »`).toBeNull();
      demonter();
    }
  });

  it('serveur qui ne publie pas l’état : aucune fenêtre', async () => {
    publie = false;
    await monter();
    expect(fenetre()).toBeNull();
  });

  it('relié et jamais répondu : la fenêtre, son texte, Oui mis en avant, rien d’envoyé avant un clic', async () => {
    await monter();
    const f = fenetre();
    expect(f, 'fenêtre absente sur un serveur relié à demander').not.toBeNull();
    for (const k of ['Title', 'Sent', 'Never', 'Benefit', 'SettingsReminder']) {
      expect(f!.textContent).toContain(fr[`settings.cloudListensConsent${k}`]);
    }
    expect(f!.querySelector('input[type="checkbox"]'), 'case à cocher dans la question').toBeNull();
    expect(bouton('accepte')!.textContent).toContain(fr['settings.cloudListensConsentYes']);
    expect(bouton('accepte')!.classList.contains('ce-oui')).toBe(true);
    expect(bouton('refuse')!.textContent).toContain(fr['settings.cloudListensConsentNo']);
    expect(patchs, 'une réponse est partie sans clic').toEqual([]);
  });
});

describe('#6840 — les réponses', () => {
  it('« Oui, partager » envoie accepte et ferme', async () => {
    await monter();
    bouton('accepte')!.click();
    await attendre();
    expect(patchs).toEqual([{ [CLE_CONSENTEMENT_ECOUTES]: 'accepte' }]);
    expect(fenetre()).toBeNull();
  });

  it('« Non » envoie refuse et ferme', async () => {
    await monter();
    bouton('refuse')!.click();
    await attendre();
    expect(patchs).toEqual([{ [CLE_CONSENTEMENT_ECOUTES]: 'refuse' }]);
    expect(fenetre()).toBeNull();
  });

  it('une réponse non enregistrée ne se tait pas : la fenêtre reste, avec l’erreur', async () => {
    patchEchoue = true;
    await monter();
    bouton('accepte')!.click();
    await attendre();
    expect(fenetre()).not.toBeNull();
    expect(fenetre()!.textContent).toContain(fr['settings.cloudListensConsentError']);
  });

  it('Échap vaut fermeture sans réponse', async () => {
    await monter();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await attendre();
    expect(patchs).toEqual([{ [CLE_CONSENTEMENT_ECOUTES]: 'fermee' }]);
    expect(fenetre()).toBeNull();
  });

  it('fermée sans réponse : une seule relance, au démarrage suivant, puis plus jamais', async () => {
    // Premier démarrage : fermée.
    await monter();
    bouton('fermee')!.click();
    await attendre();
    expect(patchs).toEqual([{ [CLE_CONSENTEMENT_ECOUTES]: 'fermee' }]);
    expect(fenetre()).toBeNull();
    // Même démarrage, coquille remontée : pas de seconde question.
    demonter();
    await monter();
    expect(fenetre(), 'redemandée dans le même démarrage').toBeNull();
    demonter();

    // Démarrage suivant : la relance.
    _reinitialiserDemarrage();
    await monter();
    expect(fenetre(), 'pas de relance au démarrage suivant').not.toBeNull();
    bouton('fermee')!.click();
    await attendre();
    expect(etat.state).toBe('refuse');
    demonter();

    // Troisième démarrage : plus jamais.
    _reinitialiserDemarrage();
    await monter();
    expect(fenetre(), 'redemandée plus d’une fois').toBeNull();
    expect(patchs.length).toBe(2);
  });
});
