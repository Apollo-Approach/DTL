const fs = require('fs');

let page = fs.readFileSync('src/app/page.tsx', 'utf8');
page = page.replace(
  "Are you Down to Love Downtown London?",
  "Down to Love Downtown London"
);
fs.writeFileSync('src/app/page.tsx', page);
