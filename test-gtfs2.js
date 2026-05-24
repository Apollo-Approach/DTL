const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const https = require('http');

https.get('http://gtfs.ltconline.ca/Vehicle/VehiclePositions.pb', (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    const v = message.entity[0].vehicle;
    console.log("hasStatus:", v.hasOwnProperty('occupancyStatus'));
    console.log("statusValue:", v.occupancyStatus);
    console.log("hasPct:", v.hasOwnProperty('occupancyPercentage'));
    console.log("pctValue:", v.occupancyPercentage);
  });
});
