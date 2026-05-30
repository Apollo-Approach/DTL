require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const turf = require('@turf/turf');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decodeWKB(wkbHex) {
    if (!wkbHex) return null;
    const buf = Buffer.from(wkbHex, 'hex');
    try {
        const lng = buf.readDoubleLE(9);
        const lat = buf.readDoubleLE(17);
        return { lat, lng };
    } catch(e) {
        return null;
    }
}

function toWKB(lng, lat) {
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0); // little endian
    buf.writeUInt32LE(0x20000001, 1); // Point with SRID flag
    buf.writeUInt32LE(4326, 5); // SRID 4326
    buf.writeDoubleLE(lng, 9);
    buf.writeDoubleLE(lat, 17);
    return buf.toString('hex').toUpperCase();
}

async function run() {
    console.log("Fetching venues from database...");
    const { data: venues, error } = await supabase.from('venues').select('id, name, location, offerings');
    if (error) {
        console.error("Error fetching venues:", error);
        return;
    }

    let updatedCount = 0;

    for (const v of venues) {
        const dbCoords = decodeWKB(v.location);

        let mapsCoords = null;
        if (v.offerings && v.offerings.maps_grounding_lite && v.offerings.maps_grounding_lite.places && v.offerings.maps_grounding_lite.places.length > 0) {
            const loc = v.offerings.maps_grounding_lite.places[0].location;
            if (loc && loc.latitude && loc.longitude) {
                mapsCoords = { lat: loc.latitude, lng: loc.longitude };
            }
        }

        let needsUpdate = false;

        if (mapsCoords) {
            if (!dbCoords) {
                // If corrupted so badly it couldn't even decode, we force update
                needsUpdate = true;
            } else {
                const pt1 = turf.point([dbCoords.lng, dbCoords.lat]);
                const pt2 = turf.point([mapsCoords.lng, mapsCoords.lat]);
                const distance = turf.distance(pt1, pt2, { units: 'meters' });

                if (distance > 20) {
                    needsUpdate = true;
                }
            }
        }

        if (needsUpdate) {
            console.log(`Updating ${v.name}...`);
            const newWKB = toWKB(mapsCoords.lng, mapsCoords.lat);
            const { error: updateError } = await supabase.from('venues').update({ location: newWKB }).eq('id', v.id);
            if (updateError) {
                console.error(`Failed to update ${v.name}:`, updateError);
            } else {
                updatedCount++;
                console.log(`✓ Updated ${v.name} to Google Maps coordinates (${mapsCoords.lat}, ${mapsCoords.lng})`);
            }
        }
    }

    console.log(`\nSuccessfully synced ${updatedCount} venues to Google Maps coordinates.`);
}

run();
