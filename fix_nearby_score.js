const fs = require('fs');

let page = fs.readFileSync('src/components/NearbyOfferings.tsx', 'utf8');

// Add isShuffling state
if (!page.includes('isShuffling')) {
  page = page.replace(
    /const \[shuffleSeed, setShuffleSeed\] = useState\(0\);/,
    `const [shuffleSeed, setShuffleSeed] = useState(0);\n  const [isShuffling, setIsShuffling] = useState(false);\n\n  const handleShuffle = () => {\n    setIsShuffling(true);\n    setShuffleSeed(Math.random());\n    setTimeout(() => setIsShuffling(false), 300);\n  };`
  );
}

// Update the useMemo sort logic
page = page.replace(
  /    \/\/ Default: sort by proximity to Richmond & Dundas[\s\S]*?return \[\.\.\.filtered\][\s\S]*?\}\);/m,
  `    // Sort by tier (events > promos > venues), distance bias, and random shuffle
    const scoreVenue = (v) => {
      let score = 0;
      const hasEvents = (events || []).some(e => e.venue_id === v.id && new Date(e.start_time) >= new Date());
      const hasPromos = (promos || []).some(p => p.venue_id === v.id);
      
      if (hasEvents) score += 100;
      else if (hasPromos) score += 50;
      else score += 10;
      
      const dist = distanceTo(v);
      score -= (dist * 1000);
      
      const randomFactor = shuffleSeed > 0 ? ((v.id.charCodeAt(v.id.length - 1) * shuffleSeed * 100) % 1) : 0;
      score += randomFactor * 25; // Random noise to shuffle within tiers
      
      return score;
    };

    return [...filtered]
      .sort((a, b) => scoreVenue(b) - scoreVenue(a))
      .slice(0, 10);`
);

// Update Shuffle button
page = page.replace(
  /<button\s*onClick=\{[^}]+\}\s*className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition font-bold text-sm flex items-center gap-2 border border-neutral-700"\s*>\s*🔀 Shuffle Offers\s*<\/button>/g,
  `<button
          onClick={handleShuffle}
          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition font-bold text-sm flex items-center gap-2 border border-neutral-700 active:scale-95"
        >
          <span className={isShuffling ? "animate-spin" : ""}>🔀</span> {isShuffling ? 'Shuffling...' : 'Shuffle Offers'}
        </button>`
);

// We should also replace the button if it doesn't match the exact spacing above (like if I missed a space):
page = page.replace(
  /onClick=\{\(\) => setShuffleSeed\(Math\.random\(\)\)\}/,
  `onClick={handleShuffle}`
);
page = page.replace(
  />\s*🔀 Shuffle Offers\s*<\/button>/,
  `>
          <span className={isShuffling ? "animate-spin" : ""}>🔀</span> {isShuffling ? 'Shuffling...' : 'Shuffle Offers'}
        </button>`
);
page = page.replace(
  /className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition font-bold text-sm flex items-center gap-2 border border-neutral-700"/,
  `className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition font-bold text-sm flex items-center gap-2 border border-neutral-700 active:scale-95"`
);

fs.writeFileSync('src/components/NearbyOfferings.tsx', page);
