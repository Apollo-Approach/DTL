const fs = require('fs');
let page = fs.readFileSync('src/app/page.tsx', 'utf8');

// revert the NearbyOfferings replacement
page = page.replace(
  /<NearbyOfferings venues=\{venues\} promos=\{promos\} events=\{events\} preferences=\{preferences\} profile=\{profile\} \/>/g,
  `<NearbyOfferings venues={venues} promos={promos} events={events} preferences={preferences} />`
);

fs.writeFileSync('src/app/page.tsx', page);

