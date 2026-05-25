import fetch from 'node-fetch'; 

async function testBuildingAPI() {
  const lng = -81.2491425135516;
  const lat = 42.9850547127357;
  
  const dLng = 0.001;
  const dLat = 0.001;

  const geometryParam = encodeURIComponent(`{"xmin":${lng - dLng},"ymin":${lat - dLat},"xmax":${lng + dLng},"ymax":${lat + dLat},"spatialReference":{"wkid":4326}}`);
  const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&f=json`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  console.log("Music Hall Area API response:");
  if (data.features && data.features.length > 0) {
    console.log(`Found ${data.features.length} buildings in envelope!`);
    for (const f of data.features) {
      console.log("-", f.attributes.SHAPE_Length, f.attributes.SHAPE_Area, f.attributes);
    }
  } else {
    console.log("NO BUILDINGS FOUND!");
  }
}

testBuildingAPI();
