// @vitest-environment jsdom
//
// L'aide de la « Requête avancée » des playlists intelligentes : un bouton
// « Aide » ouvre sur place la syntaxe, les opérateurs, les champs et des
// exemples, avec le lien vers la page complète du guide sur le site.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

import RequeteAvanceeV2 from '../../components/v2/RequeteAvanceeV2.svelte';
import { COMBINAISONS, DATES, DOC_REQUETE_AVANCEE, EXEMPLES, GROUPES, OPERATEURS } from '../aideRequeteSpl';
import { t } from '../i18n';
import { dictionnaire, en, fr, ONZE_LANGUES } from './onzeDictionnaires';

const tr = (cle: string) => get(t)(cle);

describe('l’aide de la requête avancée', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    cible?.remove();
  });

  function monter() {
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(RequeteAvanceeV2, { target: cible, props: { triPar: 'title', ordre: 'asc', maximum: 200, onReprendre: () => {} } });
    flushSync();
  }

  it('fermée au départ, le bouton « Aide » l’ouvre et la referme', () => {
    monter();
    const bouton = cible.querySelector('[data-requete-aide]') as HTMLButtonElement;
    expect(bouton.textContent?.trim()).toBe(tr('v2.spl.reqDoc.bouton'));
    expect(cible.querySelector('[data-requete-doc]')).toBeNull();
    bouton.click();
    flushSync();
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    const doc = cible.querySelector('[data-requete-doc]')!;
    expect(doc.textContent).toContain('compositeur');
    expect(doc.textContent).toContain('derniere_ecoute');
    expect(doc.textContent).toContain(tr('v2.spl.reqDoc.chHires'));
    bouton.click();
    flushSync();
    expect(cible.querySelector('[data-requete-doc]')).toBeNull();
  });

  it('un exemple se recopie dans la requête', () => {
    monter();
    (cible.querySelector('[data-requete-aide]') as HTMLButtonElement).click();
    flushSync();
    const ex = cible.querySelector('[data-exemple]') as HTMLButtonElement;
    ex.click();
    flushSync();
    expect(cible.querySelector('textarea')!.value).toBe('genre:jazz annee:1955..1965');
  });

  it('le lien « Documentation complète » mène à la page du guide', () => {
    monter();
    (cible.querySelector('[data-requete-aide]') as HTMLButtonElement).click();
    flushSync();
    const lien = cible.querySelector('[data-doc-complete]') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe(DOC_REQUETE_AVANCEE);
    expect(DOC_REQUETE_AVANCEE).toBe('https://mozaiklabs.fr/docs/smart-playlist-query');
    expect(lien.getAttribute('target')).toBe('_blank');
  });

  it('chaque clé de l’aide est traduite dans les quinze langues', () => {
    const cles = Object.keys(fr).filter((k) => k.startsWith('v2.spl.reqDoc.'));
    expect(cles.length).toBeGreaterThan(70);
    for (const lg of ONZE_LANGUES) {
      const dict = dictionnaire(lg);
      const manquantes = cles.filter((k) => !dict[k]);
      expect(manquantes, lg).toEqual([]);
    }
  });

  it('chaque clé citée par les tableaux existe en fr et en', () => {
    // Les tableaux vivent dans lib/ : v2ClesTraductionExistent ne les lit pas.
    const citees = [
      ...[OPERATEURS, COMBINAISONS, DATES, EXEMPLES].flat().map((l) => l.labelKey),
      ...GROUPES.flatMap((g) => [g.titreKey, ...g.lignes.map((l) => l.labelKey)]),
    ];
    expect(citees.length).toBeGreaterThan(50);
    expect(citees.filter((k) => !(k in fr))).toEqual([]);
    expect(citees.filter((k) => !(k in en))).toEqual([]);
  });

  it('les écritures de l’aide restent celles de la grammaire du serveur', () => {
    const src = readFileSync('src/lib/aideRequeteSpl.ts', 'utf8');
    for (const champ of ['interprete', 'artiste_album', 'annee_originale', 'note_album', 'jamais_ecoute', 'hires:verifie', 'pochette:vide']) {
      expect(src).toContain(`'${champ}`);
    }
  });
});
