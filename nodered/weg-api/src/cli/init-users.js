'use strict';

// Usuarios iniciales de una instalación nueva (lo usa packaging/install.sh).
// Lee por stdin un JSON { superadmin: {user, password}, admin: {user, password} }
// y los guarda hasheados en settings.json. Las contraseñas nunca pasan por la
// línea de comandos ni por el .env.
//   echo '{...}' | docker compose run --rm -T --no-deps weg-api node src/cli/init-users.js

const settings = require('../services/settings');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const { superadmin, admin } = JSON.parse(raw || '{}');
    if (!superadmin || !superadmin.user || !superadmin.password) throw new Error('falta superadmin {user, password}');
    settings.setSuperadmin(superadmin.user, superadmin.password);
    if (admin && admin.user && admin.password) {
      const exists = settings.findUser(admin.user);
      const actor = { user: superadmin.user, role: 'superadmin' };
      if (exists) settings.updateUser(actor, admin.user, { password: admin.password });
      else settings.createUser(actor, { user: admin.user, role: 'admin', password: admin.password });
    }
    console.log(settings.listUsers().map(u => `${u.user} (${u.role})`).join(', '));
  } catch (e) {
    console.error(`No se pudieron crear los usuarios: ${e.message}`);
    process.exit(1);
  }
});
