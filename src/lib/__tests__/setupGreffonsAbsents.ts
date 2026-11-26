// Branché dans `vitest.config.ts` → `setupFiles` (fil 3104) : le registre
// des greffons constatés absents (`routesAbsentes`) est un état de module.
// Un banc qui sert un 404 ne doit pas décider de la réponse du suivant.
import { beforeEach } from 'vitest';
import { oublierGreffonsAbsents } from '../routesAbsentes';

beforeEach(() => oublierGreffonsAbsents());
