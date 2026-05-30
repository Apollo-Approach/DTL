const fs = require('fs');

async function downloadAllBuildings() {
  console.log("Downloading MapServer/3 (Buildings Polygons) from London Open Data...");
  
  const baseUrl = "https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query";
  
  // Get object IDs
  console.log("Fetching Object IDs...");
  const idRes = await fetch(`${baseUrl}?where=1=1&returnIdsOnly=true&f=json`);
  const idData = await idRes.json();
  const objectIds = idData.objectIds.sort((a,b) => a-b);
  console.log(`Found ${objectIds.length} buildings.`);
  
  const featureCollection = { type: "FeatureCollection", features: [] };
  const chunkSize = 2000;

  for (let i = 0; i < objectIds.length; i += chunkSize) {
    const chunk = objectIds.slice(i, i + chunkSize);
    const minId = chunk[0];
    const maxId = chunk[chunk.length - 1];
    
    // Use range to keep URL length small
    const where = `OBJECTID >= ${minId} AND OBJECTID <= ${maxId}`;
    const url = `${baseUrl}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson`;
    
    let success = false;
    let retries = 3;
    while (!success && retries > 0) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.features) {
          featureCollection.features.push(...data.features);
          success = true;
          process.stdout.write(`\rDownloaded ${featureCollection.features.length} / ${objectIds.length}`);
        } else {
          throw new Error("No features in response");
        }
      } catch (err) {
        retries--;
        console.error(`\nChunk ${minId}-${maxId} failed: ${err.message}. Retries left: ${retries}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  
  fs.writeFileSync('london_buildings.geojson', JSON.stringify(featureCollection));
  console.log(`\nSuccessfully downloaded and saved london_buildings.geojson`);
}

downloadAllBuildings();
