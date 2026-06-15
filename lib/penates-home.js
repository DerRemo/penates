// lib/penates-home.js
// Single source of truth for the penates state dir (default ~/.penates).
// Read LAZILY (a function, not a constant) so tests can set
// process.env.PENATES_HOME in beforeEach before any load()/save() runs.
import { join } from 'path';
import { homedir } from 'os';

export function penatesHome() {
  return process.env.PENATES_HOME || join(homedir(), '.penates');
}
