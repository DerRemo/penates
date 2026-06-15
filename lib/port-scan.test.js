import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLsof, parseSs } from './port-scan.js';

// Realistische lsof-Ausgabe: Header + IPv4/IPv6-Doppelzeilen, *:PORT, 127.0.0.1:PORT.
// Spalten: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
const FIXTURE = [
  'COMMAND     PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
  'node      55001  rocky   23u  IPv4 0x1111      0t0  TCP 127.0.0.1:5173 (LISTEN)',
  'node      55001  rocky   24u  IPv6 0x2222      0t0  TCP [::1]:5173 (LISTEN)',
  'next      55020  rocky   18u  IPv4 0x3333      0t0  TCP *:3000 (LISTEN)',
  'node      55099  rocky   12u  IPv4 0x4444      0t0  TCP 127.0.0.1:3333 (LISTEN)',
  'rapportd    600  rocky    8u  IPv4 0x5555      0t0  TCP *:88 (LISTEN)',
  '',
].join('\n');

test('parseLsof dedupes by port, excludes hub port, filters <1024, keeps process', () => {
  const ports = parseLsof(FIXTURE, { excludePort: 3333 });
  const byPort = new Map(ports.map((p) => [p.port, p.process]));
  assert.equal(byPort.get(5173), 'node', '5173 present, deduped IPv4+IPv6');
  assert.equal(byPort.get(3000), 'next', '3000 from *:3000');
  assert.ok(!byPort.has(3333), 'hub port excluded');
  assert.ok(!byPort.has(88), 'privileged <1024 filtered');
  // exactly the two expected ports
  assert.deepEqual(ports.map((p) => p.port).sort((a, b) => a - b), [3000, 5173]);
});

test('parseLsof tolerates empty/garbage input', () => {
  assert.deepEqual(parseLsof('', {}), []);
  assert.deepEqual(parseLsof('garbage line with no port', {}), []);
});

test('parseSs extracts listening ports, dedups, excludes <1024 and hub port', () => {
  const raw = [
    'LISTEN 0      128          0.0.0.0:22         0.0.0.0:*',
    'LISTEN 0      511        127.0.0.1:5173       0.0.0.0:*',
    'LISTEN 0      511             [::]:5173          [::]:*',
    'LISTEN 0      128          0.0.0.0:3000       0.0.0.0:*',
  ].join('\n');
  const out = parseSs(raw, { excludePort: 3000 });
  assert.deepEqual(out.map((p) => p.port).sort((a, b) => a - b), [5173]);
});

test('parseSs tolerates empty/garbage input', () => {
  assert.deepEqual(parseSs(''), []);
  assert.deepEqual(parseSs('garbage line\n'), []);
});
