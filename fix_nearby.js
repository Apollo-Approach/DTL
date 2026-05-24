const fs = require('fs');

let page = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

const target = `<h2 className="text-xl md:text-2xl font-bold flex items-center gap-3">
          Nearby Offerings
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full border border-purple-500/30 font-semibold uppercase tracking-wider">
            Live Network
          </span>
        </h2>`;

const replacement = `<h2 className="text-xl md:text-2xl font-bold flex flex-wrap items-center gap-3">
          Nightly Offers
          <span className="text-sm font-normal text-red-500/80">
            Please Sign in and Enable Location Services to improve experience.
          </span>
        </h2>`;

if (page.includes(target)) {
  page = page.replace(target, replacement);
  fs.writeFileSync('src/components/NearbyOfferings.tsx', page);
  console.log("Replacement successful");
} else {
  console.log("Target not found!");
}
