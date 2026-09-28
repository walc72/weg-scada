'use strict';

// Configura el usuario y la contraseña del superadmin desde la consola del
// servidor (la cuenta no se crea desde la UI). Uso, en la VM:
//   docker exec -it weg-api node src/cli/superadmin.js
// Pide usuario y contraseña (sin mostrarla) y los guarda en settings.json.
// Las sesiones abiertas del superadmin vencen solas (o reiniciar weg-api).

const readline = require('readline');
const settings = require('../services/settings');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // No mostrar lo que se tipea (solo el texto de la pregunta)
      rl._writeToOutput = (s) => { if (s.startsWith(question)) rl.output.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error('Correr con una terminal interactiva: docker exec -it weg-api node src/cli/superadmin.js');
    process.exit(1);
  }
  const current = settings.listUsers().find(u => u.role === 'superadmin');
  const defUser = (current && current.user) || 'superadmin';
  const user = (await ask(`Usuario superadmin [${defUser}]: `)).trim() || defUser;
  const pass = await ask('Contraseña nueva: ', { hidden: true });
  const again = await ask('Repetir contraseña: ', { hidden: true });
  if (pass !== again) { console.error('Las contraseñas no coinciden. No se guardó nada.'); process.exit(1); }
  try {
    settings.setSuperadmin(user, pass);
    console.log(`Superadmin "${user}" guardado.`);
  } catch (e) {
    console.error(`No se guardó: ${e.message}`);
    process.exit(1);
  }
})();
