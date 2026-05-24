const fs = require('fs');

// 1. Update MapWrapper.tsx
let wrapper = fs.readFileSync('src/components/MapWrapper.tsx', 'utf8');
wrapper = wrapper.replace(/preferences\?: Preferences \| null;/g, "preferences?: Preferences | null;\n  profile?: any;");
wrapper = wrapper.replace(/preferences, mode/g, "preferences, profile, mode");
wrapper = wrapper.replace(/preferences={preferences}/g, "preferences={preferences} profile={profile}");
fs.writeFileSync('src/components/MapWrapper.tsx', wrapper);

// 2. Update page.tsx
let page = fs.readFileSync('src/app/page.tsx', 'utf8');
page = page.replace(/preferences={preferences} \/>/g, "preferences={preferences} profile={profile} />");
fs.writeFileSync('src/app/page.tsx', page);

// 3. Update InteractiveMap.tsx
let map = fs.readFileSync('src/components/InteractiveMap.tsx', 'utf8');
map = map.replace(/preferences\?: Preferences \| null;/g, "preferences?: Preferences | null;\n  profile?: any;");
map = map.replace(/preferences = null, mode/g, "preferences = null, profile = null, mode");
// Replace the role fetching
map = map.replace(/const \[userRole, setUserRole\] = useState<string>\('citizen'\);/g, "const [userRole, setUserRole] = useState<string>(profile?.role || 'citizen');");
// Remove the two lines where it fetches from profiles
map = map.replace(/const { data } = await supabase\.from\('profiles'\)\.select\('role'\)\.eq\('id', session\.user\.id\)\.single\(\);[\r\n\s]*if \(data\) setUserRole\(data\.role\);/g, "if (profile?.role) setUserRole(profile.role);");
fs.writeFileSync('src/components/InteractiveMap.tsx', map);

