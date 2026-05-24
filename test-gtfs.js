const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const https = require('http');

https.get('http://gtfs.ltconline.ca/Vehicle/VehiclePositions.pb', (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    console.log("Entities:", message.entity.length);
    if (message.entity.length > 0) {
      console.log(message.entity[0].vehicle);
      const withStatus = message.entity.find(e => e.vehicle && e.vehicle.hasOwnProperty('occupancyStatus') || e.vehicle.hasOwnProperty('occupancyPercentage'));
      console.log("With status:", withStatus ? withStatus.vehicle : "None");
    }
  });
});
