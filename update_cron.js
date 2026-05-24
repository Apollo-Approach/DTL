const fs = require('fs');

let page = fs.readFileSync('src/app/api/cron/ingest-events/route.ts', 'utf8');

// Add import
page = page.replace(
  /import \{ createHash \} from 'crypto';/,
  `import { createHash } from 'crypto';\nimport { fetchChurchEvents } from '@/lib/scrapers/churches';`
);

// Add churches to results object
page = page.replace(
  /    lmh: \{ fetched: 0, inserted: 0, skipped: 0, errors: 0 \},/,
  `    lmh: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },\n    churches: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },`
);

// Call fetchChurchEvents
page = page.replace(
  /    const \[tmEvents, lmhEvents\] = await Promise\.all\(\[\n      apiKey \? fetchTicketmasterEvents\(apiKey\) : Promise\.resolve\(\[\]\),\n      fetchLMHEvents\(\),\n    \]\);/,
  `    const [tmEvents, lmhEvents, churchEvents] = await Promise.all([\n      apiKey ? fetchTicketmasterEvents(apiKey) : Promise.resolve([]),\n      fetchLMHEvents(),\n      fetchChurchEvents(),\n    ]);`
);

// Update counts
page = page.replace(
  /    results\.lmh\.fetched = lmhEvents\.length;/,
  `    results.lmh.fetched = lmhEvents.length;\n    results.churches.fetched = churchEvents.length;`
);

// Update allEvents concat
page = page.replace(
  /    const allEvents = \[\.\.\.tmEvents, \.\.\.lmhEvents\];/,
  `    const allEvents = [...tmEvents, ...lmhEvents, ...churchEvents];`
);

// Update source resolving
page = page.replace(
  /      const source = event\.source_platform === 'ticketmaster' \? 'ticketmaster' : 'lmh';/,
  `      const source = event.source_platform === 'ticketmaster' ? 'ticketmaster' : (event.source_platform === 'church-scraper' ? 'churches' : 'lmh');`
);

// Update purging
page = page.replace(
  /\.in\('source_platform', \['ticketmaster', 'lmh-wordpress'\]\);/,
  `.in('source_platform', ['ticketmaster', 'lmh-wordpress', 'church-scraper']);`
);

// Update total return
page = page.replace(
  /      total_ingested: tmEvents\.length \+ lmhEvents\.length,\n      total_persisted: results\.ticketmaster\.inserted \+ results\.lmh\.inserted,/,
  `      total_ingested: tmEvents.length + lmhEvents.length + churchEvents.length,\n      total_persisted: results.ticketmaster.inserted + results.lmh.inserted + results.churches.inserted,`
);

fs.writeFileSync('src/app/api/cron/ingest-events/route.ts', page);
console.log("Cron updated");
