const fs = require('fs');
let content = fs.readFileSync('src/app/actions/venues.ts', 'utf8');

content = content.replace(
  /export async function saveVenue\(payload: any, venueId\?: string\) {/,
  `export async function saveVenue(payload: any, venueId?: string) {
  console.log("saveVenue called with venueId:", venueId);
  console.log("payload:", payload);`
);

content = content.replace(
  /const adminSupabase = await createAdminClient\(\);/,
  `const adminSupabase = await createAdminClient();
  console.log("adminSupabase created");`
);

content = content.replace(
  /if \(error\) throw error;/,
  `if (error) {
        console.error("Supabase update error:", error);
        throw error;
      }
      console.log("Supabase update success");`
);

fs.writeFileSync('src/app/actions/venues.ts', content);
