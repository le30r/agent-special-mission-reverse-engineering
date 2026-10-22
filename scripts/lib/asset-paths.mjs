import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
// Relative overrides are resolved against this checkout, never another developer's tree.
export const original = path.resolve(root, process.env.AGENT_ORIGINAL_DIR || 'agent-original');
export const source = path.join(original, 'game-resources');
export const scripts = path.join(original, 'game-installed/Program_Executable_Files/Scripts');
export const videoSource = path.join(original, 'extracted/Data');
export const videoNames = ['Title.avi', 'Titres.avi', 'Rolik1.avi', 'Rolik2.avi', 'Rolik5.avi', 'Final.avi'];
