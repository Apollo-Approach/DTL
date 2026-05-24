const fs = require('fs');

let page = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

page = page.replace(
  /        <\/div>\n      \)\}\n\n      \{\/\* Live Feed Banner/g,
  `\n      {/* Live Feed Banner`
);

fs.writeFileSync('src/components/NearbyOfferings.tsx', page);
