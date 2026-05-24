const fs = require('fs');
let page = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

// The issue is an extra `</div>\n      )}` or something similar.
// I will just view the lines to see what happened.
const lines = page.split('\n');
for(let i = 150; i < 180; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
