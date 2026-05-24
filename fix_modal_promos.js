const fs = require('fs');

let page = fs.readFileSync('src/components/VenueDetailModal.tsx', 'utf8');

// We will replace the promo count and mapping logic.
// Find `const tabCounts = {`
const tabCountsTarget = `  const tabCounts = {
    details: null, // No count needed
    events: upcomingEvents.length || null,
    offers: promos.length || null,
  };`;

const tabCountsReplacement = `  // Group promos by discount_value to prevent duplicates for everyday specials
  const groupedPromosMap = new Map();
  promos.forEach(p => {
    if (!groupedPromosMap.has(p.discount_value)) {
      groupedPromosMap.set(p.discount_value, { ...p, all_days: [p.recurring_day] });
    } else {
      const existing = groupedPromosMap.get(p.discount_value);
      if (p.recurring_day && !existing.all_days.includes(p.recurring_day)) {
        existing.all_days.push(p.recurring_day);
      }
    }
  });

  const groupedPromos = Array.from(groupedPromosMap.values()).map(p => {
    const days = p.all_days.filter(Boolean);
    if (days.length === 7) {
      p.display_day = "Everyday";
    } else if (days.length > 1) {
      // capitalize each day
      p.display_day = days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
    } else {
      p.display_day = p.recurring_day;
    }
    return p;
  });

  const tabCounts = {
    details: null, // No count needed
    events: upcomingEvents.length || null,
    offers: groupedPromos.length || null,
  };`;

page = page.replace(tabCountsTarget, tabCountsReplacement);

// Now update the map loop
const mapTarget = `              {promos.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                  <p className="text-neutral-500 text-sm">No active offers right now.</p>
                  <p className="text-neutral-600 text-xs mt-1">Check back later for deals and specials!</p>
                </div>
              ) : (
                promos.map((promo) => (`;

const mapReplacement = `              {groupedPromos.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                  <p className="text-neutral-500 text-sm">No active offers right now.</p>
                  <p className="text-neutral-600 text-xs mt-1">Check back later for deals and specials!</p>
                </div>
              ) : (
                groupedPromos.map((promo) => {
                  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                  const todayPromo = promos.find(orig => orig.discount_value === promo.discount_value && orig.recurring_day?.toLowerCase() === today);
                  const activePromoId = todayPromo ? todayPromo.id : promo.id;
                  return (`;

page = page.replace(mapTarget, mapReplacement);

// Update `promo.recurring_day` references to `promo.display_day`
const recurringTarget = `{promo.recurring_day && (
                          <p className="text-[10px] text-neutral-500 mt-1 font-normal capitalize">
                            Every {promo.recurring_day}`;
const recurringReplacement = `{promo.display_day && (
                          <p className="text-[10px] text-neutral-500 mt-1 font-normal capitalize">
                            {promo.display_day === 'Everyday' ? 'Everyday' : \`Every \${promo.display_day}\`}`;

page = page.replace(recurringTarget, recurringReplacement);

// Close the map loop properly
const mapCloseTarget = `                      <SecureQR 
                        promotionId={promo.id}
                        venueName={venue.name}
                        discountValue={promo.discount_value}
                        title={promo.title}
                      />
                    </div>
                  </details>
                ))
              )}`;

const mapCloseReplacement = `                      <SecureQR 
                        promotionId={activePromoId}
                        venueName={venue.name}
                        discountValue={promo.discount_value}
                        title={promo.title}
                      />
                    </div>
                  </details>
                );
              })
              )}`;

page = page.replace(mapCloseTarget, mapCloseReplacement);

fs.writeFileSync('src/components/VenueDetailModal.tsx', page);
console.log('Update complete');
