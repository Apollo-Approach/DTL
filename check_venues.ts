import fs from 'fs';

const categories = {
  Stage: ['venue', 'church', 'live_music_venue', 'theater', 'performing_arts_theater'],
};

// We don't have direct DB access here maybe, but we can check the database if we connect via psql or whatever, or check if there's a JSON file.
