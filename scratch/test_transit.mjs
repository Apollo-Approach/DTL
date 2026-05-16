import { gotScraping } from 'got-scraping';

async function test() {
  try {
    console.log("Fetching...");
    const url = 'http://gtfs.ltconline.ca/Vehicle/VehiclePositions.json';
    const response = await gotScraping.get({
      url,
      timeout: { request: 5000 },
      responseType: 'json'
    });
    console.log("Success:", response.body?.entity?.length);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
