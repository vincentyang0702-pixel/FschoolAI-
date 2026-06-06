import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://wqgxpouhbwhwpzudrptp.supabase.co';
const SUPABASE_ANON = 'sb_publishable_e-3KMudaL-iXf5GGsuiQaA_VW21ZZFA';

// App data lives in the isolated `neuroagi` schema inside the shared
// FschoolAI project — keeps us off Vincent's public.* tables.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  db: { schema: 'neuroagi' },
});
