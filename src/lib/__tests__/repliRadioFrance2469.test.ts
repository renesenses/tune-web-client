// @vitest-environment jsdom
import { mount, unmount, flushSync } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import AlbumArt from '../../components/partages/AlbumArt.svelte';
import { pochetteRadioFranceDirecte } from '../repliPochetteRadioFrance';

const image = 'https://www.radiofrance.fr/s3/cruiser-production/test/image.jpg?taille=600';
let composant: any;
let cible: HTMLDivElement;
afterEach(() => { if (composant) unmount(composant); composant = null; cible?.remove(); });
function poser(coverPath: string, repli?: string) {
  cible = document.createElement('div'); document.body.append(cible);
  composant = mount(AlbumArt, { target: cible, props: { coverPath, repli } }); flushSync();
}
function echouer() { cible.querySelector('img')!.dispatchEvent(new Event('error')); flushSync(); }

it('essaie Radio France en direct une fois après le proxy, puis cesse sans boucle', () => {
  poser(image);
  expect(cible.querySelector('img')!.getAttribute('src')).toContain('/library/artwork/proxy?');
  echouer();
  const directe = cible.querySelector('img');
  expect(directe, 'la pochette directe Radio France doit être essayée avant le placeholder').toBeTruthy();
  expect(directe!.getAttribute('src')).toBe(image);
  expect(directe!.getAttribute('referrerpolicy')).toBe('no-referrer');
  echouer();
  expect(cible.querySelector('img')).toBeNull();
});
it('garde le repli explicite prioritaire', () => {
  poser(image, '/api/v1/library/artwork/logo.jpg');
  echouer();
  expect(cible.querySelector('img')!.getAttribute('src')).toBe('/api/v1/library/artwork/logo.jpg');
  echouer();
  expect(cible.querySelector('img')).toBeNull();
});
it('ne fait pas de tentative directe pour les autres origines', () => {
  poser('https://images.example.org/couverture.jpg');
  echouer(); expect(cible.querySelector('img')).toBeNull();
});
it('borne les origines et chemins autorisés pour ce repli', () => {
  for (const adresse of [
    'http://www.radiofrance.fr/s3/image.jpg', 'https://radiofrance.fr.example.org/s3/image.jpg',
    'https://www.radiofrance.fr/autre/image.jpg', 'https://127.0.0.1/s3/image.jpg',
    'https://user:password@www.radiofrance.fr/s3/image.jpg', 'https://www.radiofrance.fr:8443/s3/image.jpg',
  ]) expect(pochetteRadioFranceDirecte(adresse)).toBeNull();
  expect(pochetteRadioFranceDirecte('https://www.radiofrance.fr/pikapi/images/identifiant')).toBeTruthy();
});
