const fs = require('fs');
let manager = fs.readFileSync('src/app/admin/venues/VenueManager.tsx', 'utf8');

// 1. Remove the misplaced import
manager = manager.replace("import { saveVenue } from '@/app/actions/venues';\n", '');
// 2. Add it at the top
manager = "import { saveVenue } from '@/app/actions/venues';\n" + manager;
fs.writeFileSync('src/app/admin/venues/VenueManager.tsx', manager);

// 3. Fix page.tsx
let page = fs.readFileSync('src/app/admin/venues/page.tsx', 'utf8');
page = page.replace("import { createClient }", "import { createAdminClient }");
page = page.replace("const supabase = await createClient();", "const supabase = await createAdminClient();");
fs.writeFileSync('src/app/admin/venues/page.tsx', page);
