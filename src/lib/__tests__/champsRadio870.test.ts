// 🔴 `renesenses/tune-web-client#870` — Belkadi Yacine, 0.9.143 Linux, fil
// @vitest-environment jsdom
//
// 1734, ticket 107 : sa station `jb-radio` n'est plus modifiable DU TOUT.
// 23 refus de `PUT /radios/{id}` dans ses journaux, tous en
// `radio_url_pas_un_flux`, en trois rafales — et aucun n'aboutit.
//
// Le serveur avait prévu le cas : sa garde de compatibilité ne sonde que
// l'adresse PROPOSÉE, jamais celle déjà enregistrée, pour qu'une station
// antérieure à #3578 reste renommable. L'interface la rendait inatteignable en
// envoyant `stream_url` à chaque enregistrement.
//
// CE QUE CE FICHIER TIENT
// -----------------------
// La règle est un calcul pur : elle se vérifie exactement, sans serveur et
// sans navigateur. On tient en plus le fait que les DEUX écrans d'édition
// l'appellent — le v2 de la capture, et celui du client actuel, qui portait le
// même blocage et n'avait pas été relu quand la fiche a été ouverte.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue le comportement d'AVANT et exige
// que le même prédicat le refuse. Sans elle, une règle qui renverrait toujours
// tout passerait pour gardée.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as api from '../api';
import RadioEditModale from '../../components/v2/RadioEditModale.svelte';
import { champsRadioAEnvoyer, type ChampsRadio } from '../champsRadio';

const SAISI: ChampsRadio = {
  name: 'jb-radio',
  stream_url: 'https://jb-radio.net',
  logo_url: '',
  genre: 'Variété',
  country: 'FR',
  homepage_url: '',
};

describe('#870 — une adresse non touchée n’est pas PROPOSÉE', () => {
  it('à la modification, `stream_url` est ABSENTE de l’objet', () => {
    const envoye = champsRadioAEnvoyer(SAISI, { stream_url: 'https://jb-radio.net' });
    expect(
      'stream_url' in envoye,
      'l’adresse est proposée : le serveur la sonde et refuse, même pour un simple renommage',
    ).toBe(false);
    // Le reste passe : renommer, reclasser, corriger le logo redevient possible.
    expect(envoye).toEqual({
      name: 'jb-radio', logo_url: '', genre: 'Variété', country: 'FR', homepage_url: '',
    });
  });

  it('ABSENTE, et non VIDE : une chaîne vide serait encore une proposition', () => {
    const envoye = champsRadioAEnvoyer(SAISI, { stream_url: 'https://jb-radio.net' });
    // `JSON.stringify` retire les clés `undefined` ; il garde `''`.
    expect(JSON.parse(JSON.stringify(envoye))).not.toHaveProperty('stream_url');
    expect((envoye as Record<string, unknown>).stream_url).toBeUndefined();
  });

  it('une adresse RÉELLEMENT changée est proposée — le refus reste voulu', () => {
    const envoye = champsRadioAEnvoyer(
      { ...SAISI, stream_url: 'https://jb-radio.net/live.mp3' },
      { stream_url: 'https://jb-radio.net' },
    );
    expect(envoye.stream_url).toBe('https://jb-radio.net/live.mp3');
  });

  it('à la CRÉATION, tout part : il n’y a pas d’existant à préserver', () => {
    expect(champsRadioAEnvoyer(SAISI, null)).toEqual(SAISI);
  });

  it('l’adresse enregistrée est comparée après `trim` et tolère `null`', () => {
    expect(champsRadioAEnvoyer(SAISI, { stream_url: '  https://jb-radio.net  ' }))
      .not.toHaveProperty('stream_url');
    // Une station sans adresse enregistrée : tout ce qui est saisi est nouveau.
    expect(champsRadioAEnvoyer(SAISI, { stream_url: null }).stream_url)
      .toBe('https://jb-radio.net');
  });

  it('CONTRE-ÉPREUVE : le comportement d’avant est bien REFUSÉ', () => {
    const avant = (saisi: ChampsRadio) => ({ ...saisi });
    expect(
      'stream_url' in avant(SAISI),
      'la règle laisse passer l’envoi systématique : elle ne garde rien',
    ).toBe(true);
    expect('stream_url' in champsRadioAEnvoyer(SAISI, { stream_url: SAISI.stream_url })).toBe(false);
  });
});

describe('#870 — les DEUX écrans d’édition appliquent la règle', () => {
  // Le v2 est celui de la capture du testeur : on le MONTE et on regarde ce
  // qui part sur le réseau. C'est la seule épreuve qui tienne vraiment — les
  // deux tentatives de garde par lecture du source se sont trompées avant
  // elle : `champsRadioAEnvoyer(saisi, { stream_url: … })` mentionne
  // légitimement l'adresse, et l'écran v1 range le résultat dans une variable
  // avant de l'envoyer. Un prédicat sur le texte n'aurait gardé ni l'un ni
  // l'autre.
  it('v2 : enregistrer sans toucher à l’adresse ne la propose PAS', async () => {
    const envoye: Array<[number, Record<string, unknown>]> = [];
    vi.spyOn(api, 'updateRadio').mockImplementation(async (id: number, data: any) => {
      envoye.push([id, data]);
      return { id, name: data.name } as never;
    });
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const monte = mount(RadioEditModale as never, {
      target: hote,
      props: {
        radio: {
          id: 42, name: 'jb-radio', stream_url: 'https://jb-radio.net',
          genre: 'Variété', country: 'FR',
        },
        onClose: () => {},
      } as never,
    });
    flushSync();
    // On ne change QUE le nom, comme le testeur qui veut juste renommer.
    const champNom = document.querySelector('input') as HTMLInputElement;
    expect(champNom, 'aucun champ rendu').toBeTruthy();
    champNom.value = 'JB Radio';
    champNom.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (document.querySelector('form') as HTMLFormElement).requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();

    expect(envoye.length, '`updateRadio` n’a pas été appelée').toBe(1);
    const [id, corps] = envoye[0];
    expect(id).toBe(42);
    expect(
      'stream_url' in corps,
      'l’écran propose encore l’adresse : le serveur la sonde et refuse le renommage',
    ).toBe(false);
    expect(corps.name).toBe('JB Radio');
    unmount(monte, { outro: false });
    hote.remove();
  });

  it('v1 : `saveEdit` ne bâtit plus son objet à la main', () => {
    // Cet écran n'avait pas été relu quand la fiche a été ouverte ; il portait
    // le même blocage. Le monter demanderait la moitié de l'application — on
    // tient donc SA fonction, et uniquement elle.
    const src = readFileSync(
      resolve(__dirname, '../../components/RadiosView.svelte'),
      'utf-8',
    );
    const debut = src.indexOf('async function saveEdit()');
    expect(debut, '`saveEdit` a disparu de RadiosView').toBeGreaterThanOrEqual(0);
    const corps = src.slice(debut, src.indexOf('\n  }', debut));
    expect(
      /champsRadioAEnvoyer\(/.test(corps),
      '`saveEdit` rebâtit son objet : le blocage y revient',
    ).toBe(true);
    // `saveEdit` mentionne forcément `stream_url` — c'est ce qu'il PASSE à la
    // règle. Ce qui doit être vrai, c'est que l'appel réseau ne reçoive plus
    // d'objet bâti sur place : il prend le résultat de la règle, donc pas
    // d'accolade dans ses arguments.
    const appel = corps.slice(corps.indexOf('api.updateRadio('));
    const args = appel.slice(appel.indexOf('(') + 1, appel.indexOf(')'));
    expect(
      /\{/.test(args),
      `l’appel réseau porte encore un objet littéral : ${args.trim()}`,
    ).toBe(false);
    expect(args).toContain('aEnvoyer');
  });

  it('la bascule du cœur n’est PAS touchée : elle envoyait déjà `{ favorite }` seul', () => {
    // C'est pour ça que dé-favoriser marchait quand le reste était figé — la
    // fiche l'annonçait comme bloqué, c'était inexact.
    for (const ecran of ['components/RadiosView.svelte', 'components/v2/RadiosV2.svelte']) {
      const src = readFileSync(resolve(__dirname, '../../', ecran), 'utf-8');
      expect(/updateRadio\([^)]*\{\s*favorite:/.test(src), ecran).toBe(true);
    }
  });
});
