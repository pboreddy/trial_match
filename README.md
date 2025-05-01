# TrialMatch Web

TrialMatch is a web app that ingests a patient's Continuity of Care Document (CCD XML), mines key eligibility facts, queries ClinicalTrials.gov v2, and uses Gemini-2.5 to rank & summarize the best recruiting trials within X miles.

## Project Structure

-   `/frontend`: Next.js 14 (React + TypeScript) application using shadcn/ui.
-   `/supabase`: Configuration and Edge Functions for the Supabase backend (database, auth, functions).

# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL='YOUR_SUPABASE_PROJECT_URL'
NEXT_PUBLIC_SUPABASE_ANON_KEY='YOUR_SUPABASE_ANON_KEY' 
