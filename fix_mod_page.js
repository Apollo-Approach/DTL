const fs = require('fs');

let page = fs.readFileSync('src/app/mod/page.tsx', 'utf8');

// remove the inner import
page = page.replace(
  /[ \t]*import \{ getCurrentUserRole \} from '@\/app\/actions\/user';[\r\n]+[ \t]*const role = await getCurrentUserRole\(session\.user\.id\);/,
  `      const role = await getCurrentUserRole(session.user.id);`
);

fs.writeFileSync('src/app/mod/page.tsx', page);

