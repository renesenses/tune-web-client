/**
 * Tests de l'anonymisation.
 *
 * Les chaines ci-dessous sont reprises telles quelles de passages reels : c'est
 * ce que l'automate ramasse quand il explore une application qui decouvre le
 * reseau local. Chacune partirait dans une issue publique sans ce filtre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, hostname, userInfo } from 'node:os';
import { createScrubber, scrubDeep } from '../src/scrub.mjs';

const DEVICES = [
  'AirPods Pro de Jean-Philippe #2',
  '55PUS7502/12',
  'MacBookPro18,2',
  'Chifoomi',
  'Haut-parleurs MacBook Pro',
  'airplay-192.168.1.197-7000',
];

const scrub = createScrubber({ deviceNames: DEVICES });

test('le nom d\'un appareil personnel ne sort pas', () => {
  const out = scrub('Fausse erreur « Device not yet discovered: AirPods Pro de Jean-Philippe #2. »');
  assert.equal(out.includes('Jean-Philippe'), false);
  assert.equal(out.includes('AirPods'), false);
  assert.match(out, /<appareil>/);
});

test('le modele du televiseur et celui de la machine sont masques', () => {
  assert.equal(scrub('Controle sans effet : « 55PUS7502/12 Cast »').includes('55PUS7502'), false);
  assert.equal(scrub('« MacBookPro18,2 AirPlay »').includes('MacBookPro18'), false);
});

test('les adresses du reseau local sont masquees, la boucle locale reste lisible', () => {
  // L'identifiant complet figure dans la liste des zones connues du serveur :
  // il est masque en entier, ce qui vaut mieux que de n'en retirer que l'IP.
  assert.equal(scrub('POST /api/v1/devices/airplay-192.168.1.197-7000/pair'), 'POST /api/v1/devices/<appareil>/pair');
  assert.match(scrub('connexion vers 10.0.4.31:7000'), /<ip-locale>:7000/);
  assert.equal(scrub('http://127.0.0.1:55500/api/v1/zones'), 'http://localhost:8888/api/v1/zones');
  // Sans schema devant, le port jetable doit disparaitre aussi : sinon deux
  // passages produisent deux titres differents pour le meme defaut.
  assert.equal(scrub('images sous 127.0.0.1:56198/api'), 'images sous localhost:8888/api');
});

test('le dossier personnel et le nom de compte disparaissent', () => {
  const home = homedir();
  const user = userInfo().username;
  assert.equal(scrub(`base ${home}/Library/Application Support/Tune/tune.db`).includes(home), false);
  assert.equal(scrub(`utilisateur ${user} connecte`).includes(user), false);
});

test('le nom de la machine disparait, y compris en .local', () => {
  const host = hostname().replace(/\.local$/, '');
  const out = scrub(`decouvert sur ${host}.local`);
  assert.equal(out.includes(host), false);
});

test('un nom plus long est masque avant un nom plus court qu\'il contient', () => {
  // « Chifoomi » est aussi un fragment d'autres libelles : si la regle courte
  // passait en premier, il resterait « <appareil> Pro de Jean-Philippe ».
  const out = scrub('AirPods Pro de Jean-Philippe #2 et Chifoomi');
  assert.equal(out, '<appareil> et <appareil>');
});

test('l\'anonymisation traverse toute la structure d\'une issue', () => {
  const issue = {
    title: 'Erreur sur Chifoomi',
    trail: ['Cliquer sur « 55PUS7502/12 Cast »'],
    call: { url: 'http://127.0.0.1:9999/api/v1/zones', nested: { note: 'depuis 192.168.1.42' } },
    occurrences: 3,
    ok: true,
  };
  const out = scrubDeep(issue, scrub);

  assert.equal(out.title, 'Erreur sur <appareil>');
  assert.equal(out.trail[0].includes('55PUS7502'), false);
  assert.match(out.call.nested.note, /<ip-locale>/);
  // Les valeurs non textuelles traversent sans dommage.
  assert.equal(out.occurrences, 3);
  assert.equal(out.ok, true);
});

test('un texte sans donnee personnelle ressort intact', () => {
  const text = 'POST /api/v1/library/albums/144/rate → 400 : rating must be 1-5';
  assert.equal(scrub(text), text);
});
