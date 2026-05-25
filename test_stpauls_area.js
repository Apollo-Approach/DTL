import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

function decodePostGISPoint(hexString) {
  try {
    const buf = Buffer.from(hexString, 'hex');
    const x = buf.readDoubleLE(9);
    const y = buf.readDoubleLE(17);
    return { lat: y, lng: x };
  } catch(e) { return null; }
}

function calculateCentroid(rings) {
  let x = 0, y = 0, n = 0;
  for (const ring of rings) {
    for (const pt of ring) {
      x += pt[0]; y += pt[1]; n++;
    }
  }
  return { x: x/n, y: y/n };
}

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function testStPauls() {
  const dbCoords = { lat: 42.98552856324153, lng: -81.25016854634664 };
  const d = 0.0005;
  const geometryParam = encodeURIComponent(`{"xmin":${dbCoords.lng - d},"ymin":${dbCoords.lat - d},"xmax":${dbCoords.lng + d},"ymax":${dbCoords.lat + d},"spatialReference":{"wkid":4326}}`);
  const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=json`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.features) {
    console.log(`Found ${data.features.length} features`);
    for (let i = 0; i < data.features.length; i++) {
      const f = data.features[i];
      const area = f.attributes['SHAPE.STArea()'];
      const centroid = calculateCentroid(f.geometry.rings);
      const dist = haversineDist(dbCoords.lat, dbCoords.lng, centroid.y, centroid.x);
      console.log(`Building ${i}: Area=${area}, DistanceToCentroid=${dist.toFixed(2)}m, CentroidLng=${centroid.x}, CentroidLat=${centroid.y}`);
    }
  }
}

testStPauls();
