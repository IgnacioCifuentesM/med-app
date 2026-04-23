import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  "https://zkmspbbukelaafxkglnq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbXNwYmJ1a2VsYWFmeGtnbG5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDc0OTUsImV4cCI6MjA5MDUyMzQ5NX0.pBkfrKRHaZ1EHTsuMBV2C76AIvIylnkYZP7lwOMqwNY", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});