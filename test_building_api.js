import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testQuery() {
  // Try 595 Richmond St
  // The Addresses query to get its exact coordinate
  const url1 = `https://maps.london.ca/server/rest/services/OpenData/OpenData_Community/MapServer/0/query?where=Upper(UnitFullAddress)%20LIKE%20'%25595%20RICHMOND%20ST%25'&outFields=UnitFullAddress&outSR=4326&f=json`;
  const res1 = await fetch(url1);
  const data1 = await res1.json();
  const geom = data1.features[0].geometry;
  console.log('Address Coords (WGS84):', geom);
  
  // Now try building layer
  const geometryParam = encodeURIComponent(`{"x":${geom.x},"y":${geom.y},"spatialReference":{"wkid":4326}}`);
  
  // Try Layer 2 (Building Outlines)
  const url2 = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/2/query?geometry=${geometryParam}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=10&units=esriSRUnit_Meter&outSR=4326&f=geojson`;
  console.log('Querying Layer 2...');
  const res2 = await fetch(url2);
  const data2 = await res2.json();
  console.log('Layer 2 Features:', data2.features?.length || data2);
  
  // What about using native coordinate system? 
  // Let's get the address point in native wkid 26917
  const url3 = `https://maps.london.ca/server/rest/services/OpenData/OpenData_Community/MapServer/0/query?where=Upper(UnitFullAddress)%20LIKE%20'%25595%20RICHMOND%20ST%25'&outFields=UnitFullAddress&f=json`;
  const res3 = await fetch(url3);
  const data3 = await res3.json();
  const geomNative = data3.features[0].geometry;
  console.log('Address Coords (NAD83):', geomNative);
  
  // Now try native intersection on Layer 2
  const geometryParamNative = encodeURIComponent(`{"x":${geomNative.x},"y":${geomNative.y},"spatialReference":{"wkid":26917}}`);
  const url4 = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/2/query?geometry=${geometryParamNative}&geometryType=esriGeometryPoint&inSR=26917&spatialRel=esriSpatialRelIntersects&distance=10&units=esriSRUnit_Meter&outSR=4326&f=geojson`;
  console.log('Querying Layer 2 with Native SR...');
  const res4 = await fetch(url4);
  const data4 = await res4.json();
  console.log('Layer 2 Native Features:', data4.features?.length || data4);
}

testQuery();
