const fs = require('fs');

let page = fs.readFileSync('src/components/VenueDetailModal.tsx', 'utf8');

page = page.replace(
  /days\.map\(d => d\.charAt/g,
  `days.map((d: string) => d.charAt`
);

fs.writeFileSync('src/components/VenueDetailModal.tsx', page);
