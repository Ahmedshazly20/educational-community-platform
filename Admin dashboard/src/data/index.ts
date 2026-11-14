import type { AdminApi } from './client';
import { MockAdminApi } from './mock/mockAdapter';
import { SupabaseAdminApi } from './supabase/supabaseAdapter';

const mode = (import.meta.env.VITE_DATA_MODE as string | undefined) ?? 'mock';

export const isMockMode = mode !== 'supabase';

export const api: AdminApi = isMockMode ? new MockAdminApi() : new SupabaseAdminApi();
