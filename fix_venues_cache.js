const fs = require('fs');

let page = fs.readFileSync('src/app/admin/venues/page.tsx', 'utf8');
if (!page.includes("export const dynamic")) {
  page = page.replace(
    /import VenueManager from '\.\/VenueManager';/,
    `import VenueManager from './VenueManager';\n\nexport const dynamic = 'force-dynamic';`
  );
  fs.writeFileSync('src/app/admin/venues/page.tsx', page);
}

