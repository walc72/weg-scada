// node --test .github/scripts/dependabot-auto.test.mjs — casos tomados de PRs reales de Dependabot de este repo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir } from './dependabot-auto.mjs';

const grupo = (...l) => l.map(([p, a, b]) => `Updates \`${p}\` from ${a} to ${b}`).join('\n');

test('grupo de menores y parches → mergea', () => {
  const r = decidir('chore(deps): Bump the menores-npm group with 2 updates', grupo(['@xyflow/react', '12.11.6', '12.12.1'], ['html-to-image', '1.11.11', '1.11.13']));
  assert.equal(r.ok, true, r.motivo);
});

test('imagen docker menor (nginx 1.27-alpine → 1.29-alpine) → mergea', () => {
  assert.equal(decidir('chore(docker): Bump nginx from 1.27-alpine to 1.29-alpine in /nodered', grupo(['nginx', '1.27-alpine', '1.29-alpine'])).ok, true);
});

test('0.x que cambia la menor (pdfkit 0.15 → 0.20, #199) → manual', () => {
  const r = decidir('Bump the menores-npm group', grupo(['vite', '8.3.6', '8.3.7'], ['pdfkit', '0.15.2', '0.20.2']));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /pdfkit/);
});

test('0.x parche → mergea', () => {
  assert.equal(decidir('Bump x', grupo(['pdfkit', '0.20.2', '0.20.3'])).ok, true);
});

test('paquete sensible aunque sea parche (mqtt) → manual', () => {
  assert.equal(decidir('Bump the menores-npm group', grupo(['mqtt', '5.16.0', '5.16.1'])).ok, false);
});

test('acciones mayores (#192) → manual', () => {
  assert.equal(decidir('chore(ci): Bump the acciones group', grupo(['actions/checkout', '4', '7'])).ok, false);
});

test('PR suelto mayor por título (node 22-alpine → 25-alpine, #196) → manual', () => {
  assert.equal(decidir('chore(docker): Bump node from 22-alpine to 25-alpine in /nodered/weg-api', '').ok, false);
});

test('PR suelto mayor por cuerpo (react-router 7 → 8, #206) → manual', () => {
  const body = 'Bumps [react-router](https://github.com/remix-run/react-router/tree/HEAD/packages/react-router) from 7.18.5 to 8.5.1.';
  assert.equal(decidir('chore(deps): Bump react-router from 7.18.5 to 8.5.1 in /frontend-react', body).ok, false);
});

test('PR suelto parche por cuerpo → mergea', () => {
  const body = 'Bumps [vite](https://github.com/vitejs/vite) from 8.3.6 to 8.3.7.';
  assert.equal(decidir('chore(deps): Bump vite from 8.3.6 to 8.3.7 in /frontend-react', body).ok, true);
});

test('sin nada reconocible → manual', () => {
  assert.equal(decidir('algo raro', 'texto').ok, false);
});

test('cuerpo con CRLF → igual reconoce', () => {
  assert.equal(decidir('Bump the menores-npm group', 'Updates `vite` from 8.3.6 to 8.3.7\r\nUpdates `clsx` from 2.1.0 to 2.1.1\r\n').ok, true);
});
