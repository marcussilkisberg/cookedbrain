import type { CookedTest } from '../core/types';
import { flinch } from './flinch';
import { snipe } from './snipe';
import { deadstop } from './deadstop';
import { echo } from './echo';
import { digits } from './digits';
import { flashgrid } from './flashgrid';
import { chimp } from './chimp';
import { liar } from './liar';
import { offcolour } from './offcolour';
import { sums } from './sums';
import { spin } from './spin';
import { keys } from './keys';
import { pattern } from './pattern';
import { oddone } from './oddone';
import { dont } from './dont';

export const TESTS: CookedTest[] = [flinch, snipe, deadstop, echo, digits, flashgrid, chimp, liar, offcolour, sums, spin, pattern, oddone, dont, keys];

export const testById = (id: string) => TESTS.find((t) => t.id === id);
