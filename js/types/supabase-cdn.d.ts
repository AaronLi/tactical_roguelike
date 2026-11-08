// The URL js/cloud.ts loads the Supabase client from (jsDelivr's ES module build of the pinned version), typed as the package it
// is (@supabase/supabase-js, a devDependency of the same version: keep the two the same).
declare module 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm' { export * from '@supabase/supabase-js'; }
