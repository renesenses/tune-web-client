// @vitest-environment jsdom
// tune-server-rust#5069 — « +8.4 dB rendus par le volume » affiché alors que
// le volume de Tune est déjà à 100 % et que rien n'est rendu.
//
// Le gain de la compensation est multiplié au volume puis RABOTÉ à l'unité :
// au volume maximal, la demande ne passe pas. Le serveur publie désormais
// `rendered_db` / `unrendered_db` ; la carte doit dire ce qui est vraiment
// rendu, et — au maximum — le geste qui règle le problème. Un serveur
// antérieur (≤ 0.9.165) ne publie pas ces champs : l'ancienne phrase reste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const mocks = vi.hoisted(() => ({
  getDsp: vi.fn(),
  setDsp: vi.fn(),
}));
vi.mock('../api', () => mocks);

import CompensationNiveauV2 from '../../components/v2/CompensationNiveauV2.svelte';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import { libelleCompensation } from '../compensationNiveau';

/** Le cas du ticket : égaliseur 31 bandes, réserve −8,4 dB, volume à 100 %. */
const AU_MAXIMUM = {
  enabled: true, eq_db: -8.4, crossfeed_db: 0, compensation_db: 8.4,
  rendered_db: 0, unrendered_db: 8.4, volume: 1, local_output_only: true,
};

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserCharger() { for (let i = 0; i < 4; i++) await respirer(); flushSync(); }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
async function texteDeLaCarte(): Promise<string> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CompensationNiveauV2, { target: hote, props: { revision: 0 } });
  flushSync();
  await laisserCharger();
  const bloc = hote.querySelector('[data-testid="compensation-niveau"] .val');
  expect(bloc, 'la carte manque').not.toBeNull();
  return bloc!.textContent ?? '';
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  currentZoneId.set(3);
  locale.set('fr');
});
afterEach(() => {
  if (monte) unmount(monte as any);
  monte = null;
  hote?.remove();
  hote = null;
});

describe('Compensation de niveau : ce qui est VRAIMENT rendu (#5069)', () => {
  it('au volume maximal, la carte ne prétend plus rendre +8.4 dB et dit quoi faire', async () => {
    mocks.getDsp.mockResolvedValue({ level_compensation: AU_MAXIMUM });
    const texte = await texteDeLaCarte();
    expect(texte, 'la carte annonce des dB « rendus par le volume » alors que le volume est à 100 %')
      .not.toContain('+8.4 dB rendus par le volume');
    expect(texte).toContain('+8.4 dB à rendre, 0.0 dB rendus');
    expect(texte).toContain('volume de Tune est déjà au maximum');
    expect(texte).toContain("Baissez le volume de Tune et montez celui de l'ampli.");
  });

  it('en partie rendu : la part rendue et la part perdue sont chiffrées', async () => {
    mocks.getDsp.mockResolvedValue({
      level_compensation: { ...AU_MAXIMUM, volume: 0.708, rendered_db: 3.0, unrendered_db: 5.4 },
    });
    const texte = await texteDeLaCarte();
    expect(texte).toContain('+8.4 dB à rendre, +3.0 dB rendus par le volume, 5.4 dB non rendus');
    expect(texte).toContain('Baissez le volume de Tune');
  });

  it('tout rendu : la phrase d\'avant, inchangée', async () => {
    mocks.getDsp.mockResolvedValue({
      level_compensation: { ...AU_MAXIMUM, volume: 0.3, rendered_db: 8.4, unrendered_db: 0 },
    });
    const texte = await texteDeLaCarte();
    expect(texte).toContain('+8.4 dB rendus par le volume');
    expect(texte).not.toContain('Baissez');
  });

  it('serveur antérieur (sans `rendered_db`) : l\'ancienne phrase, pas de chiffre inventé', () => {
    const l = libelleCompensation({
      enabled: true, eq_db: -8.4, crossfeed_db: 0, compensation_db: 8.4, local_output_only: true,
    });
    expect(l.cle).toBe('v2.lc.valueOn');
  });

  it('éteinte : rien n\'est demandé, donc rien n\'est « perdu » à annoncer', () => {
    const l = libelleCompensation({ ...AU_MAXIMUM, enabled: false, compensation_db: 0, rendered_db: 0, unrendered_db: 0 });
    expect(l.cle).toBe('v2.lc.valueOff');
  });

  it('les deux phrases existent dans les onze langues, avec leurs marqueurs', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of ['v2.lc.valueAtMax', 'v2.lc.valuePartial']) {
        expect(d[cle], `${langue} : ${cle}`).toBeTruthy();
        expect(d[cle], `${langue} : ${cle} sans {eq}/{cf}/{comp}`).toMatch(/\{eq\}.*\{cf\}.*\{comp\}/);
      }
      expect(d['v2.lc.valuePartial'], `${langue} : valuePartial sans {rendu}/{perdu}`).toMatch(/\{rendu\}.*\{perdu\}/);
    }
  });
});
