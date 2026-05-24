const fs = require('fs');

let page = fs.readFileSync('src/app/page.tsx', 'utf8');

// Remove UserMenu from page.tsx header
page = page.replace(
  /<div className="mt-1">\s*<UserMenu user=\{user\} profile=\{profile\} \/>\s*<\/div>/g,
  ''
);

// Add user and profile to NearbyOfferings in page.tsx
page = page.replace(
  /<NearbyOfferings venues=\{venues\} promos=\{promos\} events=\{events\} preferences=\{preferences\} \/>/g,
  `<NearbyOfferings venues={venues} promos={promos} events={events} preferences={preferences} user={user} profile={profile} />`
);
fs.writeFileSync('src/app/page.tsx', page);


let nearby = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

// Add UserMenu import
if (!nearby.includes('import UserMenu')) {
  nearby = nearby.replace(
    /import \{ createClient \} from '@\/lib\/supabase\/client';/,
    "import { createClient } from '@/lib/supabase/client';\nimport UserMenu from './UserMenu';"
  );
}

// Update Props
nearby = nearby.replace(
  /export default function NearbyOfferings\(\{ venues, promos, events = \[\], preferences \}: NearbyOfferingsProps\) \{/,
  `export default function NearbyOfferings({ venues, promos, events = [], preferences, user, profile }: NearbyOfferingsProps & { user?: any, profile?: any }) {`
);

// Add shuffleSeed state
nearby = nearby.replace(
  /const \[forYou, setForYou\] = useState\(false\);/,
  `const [forYou, setForYou] = useState(false);\n  const [shuffleSeed, setShuffleSeed] = useState(0);`
);

// Update useMemo dependencies
nearby = nearby.replace(
  /}, \[venues, preferences, forYou, activeSituationTag, promos\]\);/,
  `}, [venues, preferences, forYou, activeSituationTag, promos, shuffleSeed]);`
);

// Update the return sort
nearby = nearby.replace(
  /return \[\.\.\.filtered\]\s*\.sort\(\(a, b\) => distanceTo\(a\) - distanceTo\(b\)\);/,
  `return [...filtered]\n      .sort((a, b) => {\n        if (shuffleSeed > 0) {\n          const hashA = (a.name.charCodeAt(0) * shuffleSeed) % 1;\n          const hashB = (b.name.charCodeAt(0) * shuffleSeed) % 1;\n          return hashA - hashB;\n        }\n        return distanceTo(a) - distanceTo(b);\n      });`
);

// Replace For You button with UserMenu
nearby = nearby.replace(
  /\{preferences && \(\s*<button\s*onClick=\{[^}]+\}\s*className=\{[^}]+\}\s*>\s*🎯 For You\s*<\/button>\s*\)\}/g,
  `<UserMenu user={user} profile={profile} />`
);

// Replace Situation Chips with Shuffle button
nearby = nearby.replace(
  /\{\/\* Situation Chips — Sprint 3\.3 \(Temporarily Disabled\) \*\/\}\s*\{false && \([\s\S]*?\}\s*\)\}/,
  `{/* Shuffle Button */}\n      <div className="flex pb-4">\n        <button\n          onClick={() => setShuffleSeed(Math.random())}\n          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition font-bold text-sm flex items-center gap-2 border border-neutral-700"\n        >\n          🔀 Shuffle Offers\n        </button>\n      </div>`
);

fs.writeFileSync('src/components/NearbyOfferings.tsx', nearby);

console.log("Replacements complete");
