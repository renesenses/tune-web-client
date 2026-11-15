import { describe, expect, it } from 'vitest';
import { GUIDE_SPOTIFY, urlGuideSpotify } from './guideSpotify';

describe('urlGuideSpotify', () => {
  it('suit la langue de l’interface quand le site la parle', () => {
    expect(urlGuideSpotify('fr')).toBe(`${GUIDE_SPOTIFY}?lang=fr`);
    expect(urlGuideSpotify('ja')).toBe(`${GUIDE_SPOTIFY}?lang=ja`);
  });
  it('retombe sur l’anglais pour une langue que le site ne parle pas', () => {
    for (const l of ['pl', 'ro', 'nb', 'sv', 'el', 'vi', '']) {
      expect(urlGuideSpotify(l)).toBe(`${GUIDE_SPOTIFY}?lang=en`);
    }
  });
});
