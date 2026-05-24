const fs = require('fs');

let page = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

page = page.replace(
  /const scoreVenue = \(v\) => \{/g,
  `const scoreVenue = (v: any) => {`
);

fs.writeFileSync('src/components/NearbyOfferings.tsx', page);
