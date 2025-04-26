// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Hello from Functions!")

// --- Constants ---
const CTGOV_API_BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const DEFAULT_PAGE_SIZE = 50; // Adjust as needed

// --- Interfaces for expected input data (adjust based on extract-facts output and frontend filters) ---
interface ExtractedFacts {
  age?: number;
  gender?: string;
  conditions?: Array<{ term: string; icd10Code?: string }>;
  zipCode?: string;
  // ... other fields from extract-facts
}

interface SearchFilters {
  recruitingStatus?: 'RECRUITING' | 'ACTIVE_NOT_RECRUITING' | 'COMPLETED' | 'ANY'; // Example statuses
  travelRadiusMiles?: number;
  phase?: Array<'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4'>; // Example phases
  conditionKeyword?: string; // Specific keyword override/addition from user
  // ... other filters from frontend
}

interface RequestPayload {
  extractedFacts: ExtractedFacts;
  filters: SearchFilters;
}

// --- Main Function Logic ---
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Get Input Data
    if (!req.body) {
      return new Response(JSON.stringify({ error: 'Missing request body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { extractedFacts, filters }: RequestPayload = await req.json();
    console.log("Received data for trial search:", { extractedFacts, filters });

    // 2. Construct Query Parameters for ClinicalTrials.gov API v2
    const queryParams = new URLSearchParams();
    queryParams.set('pageSize', String(DEFAULT_PAGE_SIZE));
    queryParams.set('format', 'json');

    // --- Query based on extracted facts and filters --- 
    let filterQueryParts: string[] = [];

    // Status (Default to Recruiting if not specified)
    const status = filters.recruitingStatus === 'ANY' ? null : (filters.recruitingStatus || 'RECRUITING');
    if (status) {
      filterQueryParts.push(`STATUS ${status}`);
    }

    // Condition: Use specific keyword OR terms from extracted facts
    const conditionSearchTerm = filters.conditionKeyword || extractedFacts.conditions?.map(c => c.term).join(' OR ');
    if (conditionSearchTerm) {
       // Use AREA[Condition] for searching condition fields
      filterQueryParts.push(`AREA[Condition] ${conditionSearchTerm}`);
    }

    // Age (API expects age in years)
    if (extractedFacts.age !== undefined) {
       // Search trials where the patient's age falls within the trial's eligibility range
       // Using AREA specifier for age range seems more consistent with other filters
      // filterQueryParts.push(`AREA[MinimumAge] RANGE[, ${extractedFacts.age} years]`); // Temporarily commented out
      // filterQueryParts.push(`AREA[MaximumAge] RANGE[${extractedFacts.age} years, ]`); // Temporarily commented out
    }

    // Gender
    if (extractedFacts.gender && extractedFacts.gender !== 'Other') { // API uses Male, Female, All
      const apiGender = extractedFacts.gender === 'Male' || extractedFacts.gender === 'Female' ? extractedFacts.gender : 'All';
      filterQueryParts.push(`AREA[Gender] ${apiGender}`);
    }

    // Location / Radius Search (Requires Zip Code)
    if (filters.travelRadiusMiles && extractedFacts.zipCode) {
      filterQueryParts.push(`AREA[LocationGeoPoint] NEAR[${extractedFacts.zipCode}] ${filters.travelRadiusMiles} miles`);
    }

    // Phases
    if (filters.phase && filters.phase.length > 0) {
      filterQueryParts.push(`AREA[Phase] ${filters.phase.join(' OR ')}`);
    }

    // Combine filter parts
    if (filterQueryParts.length > 0) {
        queryParams.set('filter.advanced', filterQueryParts.join(' AND '));
    }
    
    // Fields to retrieve (customize as needed)
    queryParams.set('fields', 'NCTId,BriefTitle,Condition,Keyword,OverallStatus,Phase,StudyType,EligibilityCriteria,BriefSummary,DetailedDescription,CentralContactName,CentralContactPhone,LocationFacility,LocationCity,LocationState,LocationZip,LocationCountry,LocationGeoPoint');

    // 3. Call ClinicalTrials.gov API
    const apiUrl = `${CTGOV_API_BASE_URL}?${queryParams.toString()}`;
    console.log(`Querying ClinicalTrials.gov: ${apiUrl}`);

    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`ClinicalTrials.gov API error (${response.status}): ${errorBody}`);
      throw new Error(`ClinicalTrials.gov API request failed with status ${response.status}`);
    }

    const searchResults = await response.json();
    console.log(`Received ${searchResults.studies?.length || 0} trials from ClinicalTrials.gov`);

    // 4. Return Raw Search Results
    return new Response(JSON.stringify(searchResults.studies || []), { // Return only the studies array
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in search-trials function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: `Trial search failed: ${errorMessage}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/search-trials' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
