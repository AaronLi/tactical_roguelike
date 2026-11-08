'use strict';
// The Supabase project the game saves progress to (docs/cloud.md). Paste the project's URL and its anon (public) key here, from the
// dashboard's Project Settings > API. Left empty, there are no cloud saves: the game saves in this browser only, as it always has,
// and makes no request to Supabase. (Both are meant to be in the page: Row Level Security is what keeps each player to their
// own rows. Never put the service_role key here.) ?cloud=0 in the URL turns the cloud saves off for that visit.
const G_CloudConfig = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
G.CloudConfig = G_CloudConfig;

interface GameModules { CloudConfig: typeof G_CloudConfig; }
