import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Haversine formula to calculate distance in meters between two lat/lng points
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; 
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

// Decode PostGIS POINT string (e.g. 0101000020E6100000...)
function decodePostGISPoint(hexString) {
  try {
    const buf = Buffer.from(hexString, 'hex');
    const x = buf.readDoubleLE(9); // Longitude
    const y = buf.readDoubleLE(17); // Latitude
    return { lat: y, lng: x };
  } catch(e) {
    return null;
  }
}

async function auditCoordinates() {
  console.log("Fetching venues from database...")
  const { data: venues, error } = await supabase.from('venues').select('name, address, location')
  
  if (error) {
    console.error("Failed to fetch venues:", error)
    return
  }

  console.log(`Found ${venues.length} venues. Starting real-world coordinate audit...`)
  console.log("This will take about a minute to respect API rate limits.\n")
  
  const report = [];
  const distanceThreshold = 50; // Flag venues more than 50 meters off
  
  for (const venue of venues) {
    if (!venue.location || !venue.address) continue;
    
    const dbCoords = decodePostGISPoint(venue.location);
    if (!dbCoords) continue;
    
    try {
      // Use Nominatim to geocode the address
      const query = encodeURIComponent(venue.address + ", London, Ontario");
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`, {
        headers: { 'User-Agent': 'DTL-Coordinate-Audit/1.0' }
      });
      
      const geoData = await res.json();
      
      if (geoData && geoData.length > 0) {
        const realLat = parseFloat(geoData[0].lat);
        const realLng = parseFloat(geoData[0].lon);
        
        const distance = getDistanceFromLatLonInM(dbCoords.lat, dbCoords.lng, realLat, realLng);
        
        if (distance > distanceThreshold) {
          report.push({
            name: venue.name,
            address: venue.address,
            dbLat: dbCoords.lat.toFixed(5),
            dbLng: dbCoords.lng.toFixed(5),
            realLat: realLat.toFixed(5),
            realLng: realLng.toFixed(5),
            diffMeters: Math.round(distance)
          });
          process.stdout.write('❌');
        } else {
          process.stdout.write('✅');
        }
      } else {
        process.stdout.write('❓'); // Geocode failed
      }
      
      // Delay to respect Nominatim API rate limit (1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      process.stdout.write('E');
    }
  }

  console.log("\n\nAudit Complete!");
  
  // Sort report by worst offenders first
  report.sort((a, b) => b.diffMeters - a.diffMeters);
  
  // Save to markdown report
  let md = `# Coordinate Audit Report\n\n`;
  md += `Found **${report.length}** venues that are more than ${distanceThreshold} meters away from their real-world address coordinates.\n\n`;
  md += `| Venue | Address | Distance Off | DB Coordinates | Real Coordinates |\n`;
  md += `|-------|---------|--------------|----------------|------------------|\n`;
  
  report.forEach(r => {
    md += `| **${r.name}** | ${r.address} | 🚨 **${r.diffMeters}m** | ${r.dbLat}, ${r.dbLng} | ${r.realLat}, ${r.realLng} |\n`;
  });
  
  fs.writeFileSync('coordinate_audit_report.md', md);
  console.log(`\nFound ${report.length} highly suspicious coordinates.`);
  console.log(`Detailed report saved to: coordinate_audit_report.md\n`);
  
  // Print top 5 offenders to console
  if (report.length > 0) {
    console.log("Top 5 Worst Offenders:");
    report.slice(0, 5).forEach(r => {
      console.log(`- ${r.name} (${r.diffMeters} meters off)`);
    });
  }
}

auditCoordinates();
