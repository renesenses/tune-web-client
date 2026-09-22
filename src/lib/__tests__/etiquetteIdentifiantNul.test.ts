// Deux lignes `item_tags` à `item_id = 0` sur le .18 (22/09/2026) : elles ne
// désignaient aucun album et gonflaient le compteur de leur étiquette. Le
// serveur les refuse en 400 ; l'écran ne les envoie plus, et l'échec remonte.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  tagItem: vi.fn(() => Promise.resolve()),
  untagItem: vi.fn(() => Promise.resolve()),
  getTagsForItem: vi.fn(() => Promise.resolve([])),
}));

import * as api from '../api';
import { poserEtiquette } from '../cibleEtiquette';

describe('poser une étiquette sur un identifiant local invalide', () => {
  it.each([0, -1, Number.NaN, 1.5])('refuse %s, sans appeler le serveur', async (id) => {
    (api.tagItem as any).mockClear();
    await expect(poserEtiquette(3, { itemType: 'album', itemId: id } as any)).rejects.toThrow();
    expect(api.tagItem).not.toHaveBeenCalled();
  });

  it('laisse passer un identifiant valide', async () => {
    (api.tagItem as any).mockClear();
    await poserEtiquette(3, { itemType: 'album', itemId: 4270 } as any);
    expect(api.tagItem).toHaveBeenCalledWith(3, 'album', 4270);
  });
});
