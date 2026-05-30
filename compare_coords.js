require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const turf = require('@turf/turf');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decodeWKB(wkbHex) {
    if (!wkbHex) return null;
    const buf = Buffer.from(wkbHex, 'hex');
    // Assuming standard PostGIS Point WKB format we used:
    // 01 (endian) 01000020 (type/srid flag) E6100000 (srid 4326) [lng 8 bytes] [lat 8 bytes]
    try {
        const lng = buf.readDoubleLE(9);
        const lat = buf.readDoubleLE(17);
        return { lat, lng };
    } catch(e) {
        return null;
    }
}

async function run() {
    console.log("Fetching venues from database...");
    const { data: venues, error } = await supabase.from('venues').select('id, name, location, offerings');
    if (error) {
        console.error("Error fetching venues:", error);
        return;
    }

    const discrepancies = [];

    for (const v of venues) {
        const dbCoords = decodeWKB(v.location);
        if (!dbCoords) continue;

        let mapsCoords = null;
        if (v.offerings && v.offerings.maps_grounding_lite && v.offerings.maps_grounding_lite.places && v.offerings.maps_grounding_lite.places.length > 0) {
            const loc = v.offerings.maps_grounding_lite.places[0].location;
            if (loc && loc.latitude && loc.longitude) {
                mapsCoords = { lat: loc.latitude, lng: loc.longitude };
            }
        }

        if (dbCoords && mapsCoords) {
            const pt1 = turf.point([dbCoords.lng, dbCoords.lat]);
            const pt2 = turf.point([mapsCoords.lng, mapsCoords.lat]);
            const distance = turf.distance(pt1, pt2, { units: 'meters' });

            if (distance > 20) { // Highlight venues off by more than 20 meters
                discrepancies.push({
                    name: v.name,
                    id: v.id,
                    distance_meters: distance.toFixed(1),
                    db: dbCoords,
                    maps: mapsCoords
                });
            }
        }
    }

    discrepancies.sort((a, b) => b.distance_meters - a.distance_meters);

    console.log(`\nFound ${discrepancies.length} venues where the Database pin differs from the Google Maps pin by >20 meters:\n`);
    for (const d of discrepancies) {
        console.log(`[${d.distance_meters}m] ${d.name}`);
        console.log(`   DB: ${d.db.lat}, ${d.db.lng}`);
        console.log(`   Maps: ${d.maps.lat}, ${d.maps.lng}\n`);
    }
}

run();
