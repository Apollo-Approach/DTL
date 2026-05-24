const fs = require('fs');

let page = fs.readFileSync('src/components/VenueDetailModal.tsx', 'utf8');

page = page.replace(
  /promo\.situation_tags\.map\(tag => \{/g,
  `promo.situation_tags.map((tag: string) => {`
);

fs.writeFileSync('src/components/VenueDetailModal.tsx', page);
