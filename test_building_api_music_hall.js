import fs from 'fs';
import fetch from 'node-fetch'; // Next.js polyfills this globally, but in a script we might need to rely on global fetch if Node 18+

async function testBuildingAPI() {
  const lng = -81.2491425135516;
  const lat = 42.9850547127357;

  const geometryParam = encodeURIComponent(`{"x":${lng},"y":${lat},"spatialReference":{"wkid":4326}}`);
  const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=json`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  console.log("Music Hall API response:");
  if (data.features && data.features.length > 0) {
    console.log("Found building!");
    console.log(data.features[0].geometry.rings);
  } else {
    console.log("NO BUILDING FOUND for those coordinates!");
  }
}

testBuildingAPI();
