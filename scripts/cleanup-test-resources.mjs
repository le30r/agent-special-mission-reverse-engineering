#!/usr/bin/env node
import { sweepOrphans } from './lib/test-resources.mjs';
// Deliberately never called by E2E startup; legacy unmarked directories are not ours to delete.
console.log(JSON.stringify(await sweepOrphans(), null, 2));
