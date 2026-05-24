const fs = require('fs');
let layout = fs.readFileSync('src/app/admin/layout.tsx', 'utf8');

layout = layout.replace(
  "import { createClient } from '@/lib/supabase/server';",
  "import { createClient, createAdminClient } from '@/lib/supabase/server';"
);

layout = layout.replace(
  "const { data: profile, error: profileError } = await supabase",
  "const adminSupabase = await createAdminClient();\n  const { data: profile, error: profileError } = await adminSupabase"
);

fs.writeFileSync('src/app/admin/layout.tsx', layout);
