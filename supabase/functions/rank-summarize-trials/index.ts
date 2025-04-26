// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Hello from Functions!")

// --- Configuration ---
const API_KEY = Deno.env.get('GOOGLE_API_KEY');
if (!API_KEY) {
  console.error('Missing GOOGLE_API_KEY environment variable.');
  // Throw error immediately if key is missing, as function cannot proceed
  throw new Error("GOOGLE_API_KEY environment variable is not set.");
}
// Define the REST API endpoint using the specific model
const GEMINI_MODEL = "gemini-1.5-flash-latest"; // Keep using flash for consistency
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;

// --- Interfaces ---
// Simplified Trial structure (based on fields requested in search-trials)
interface ClinicalTrial {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string; };
    statusModule: { overallStatus: string; };
    designModule: { studyType: string; phase?: { phases: string[] }; };
    conditionsModule: { conditions?: string[]; keywords?: string[]; };
    eligibilityModule: { eligibilityCriteria: string; stdAges: string[]; gender: string; };
    descriptionModule?: { briefSummary?: string; detailedDescription?: string; };
    contactsLocationsModule?: {
      centralContacts?: Array<{ name?: string; phone?: string; email?: string; }>;
      locations?: Array<{
        facility?: string; city?: string; state?: string; zip?: string; country?: string;
        geoPoint?: { lat: number; lon: number; };
      }>;
    };
  };
}

// Facts structure (should match output of extract-facts)
interface ExtractedFacts {
  age?: number;
  gender?: string;
  conditions?: Array<{ term: string; icd10Code?: string }>;
  medications?: string[];
  zipCode?: string;
}

interface RequestPayload {
  extractedFacts: ExtractedFacts;
  trials: ClinicalTrial[];
}

// Define the desired output structure for each ranked trial
const rankedTrialSchema = {
  type: "OBJECT",
  properties: {
    nctId: { type: "STRING" },
    matchPercentage: {
      type: "NUMBER",
      description: "Estimated match likelihood (0-100) based on condition, age, gender, and proximity."
    },
    summaryNote: {
      type: "STRING",
      description: "Brief summary (1-2 sentences) explaining the match score, highlighting key eligibility factors (condition, age, gender) and potential issues or proximity."
    },
    // You could add distance here if calculated separately
  },
  required: ["nctId", "matchPercentage", "summaryNote"]
};

const responseSchema = {
    type: "ARRAY",
    items: rankedTrialSchema
};

// --- Helper Function to simplify trial data for the prompt ---
function simplifyTrialForPrompt(trial: ClinicalTrial): Record<string, any> {
    const ps = trial.protocolSection;
    return {
        nctId: ps.identificationModule.nctId,
        title: ps.identificationModule.briefTitle,
        status: ps.statusModule.overallStatus,
        phase: ps.designModule.phase?.phases?.join(', ') || 'N/A',
        conditions: ps.conditionsModule?.conditions?.join(', ') || 'N/A',
        eligibilityCriteriaSummary: ps.eligibilityModule.eligibilityCriteria?.substring(0, 500) + '...', // Truncate for brevity
        genderEligible: ps.eligibilityModule.gender,
        ageRange: ps.eligibilityModule.stdAges?.join(', ') || 'N/A',
        // Include key location info if needed, maybe just country/state for prompt
    };
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
    const { extractedFacts, trials }: RequestPayload = await req.json();
    console.log(`Received ${trials.length} trials and facts for ranking:`, { extractedFacts });

    if (!trials || trials.length === 0) {
      return new Response(JSON.stringify([]), { // Return empty array if no trials
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Prepare Prompt for Gemini
    const simplifiedTrials = trials.map(simplifyTrialForPrompt);

    const prompt = `Given the following de-identified patient profile and a list of clinical trials, please analyze each trial's relevance to the patient. 

    Patient Profile:
    \`\`\`json
    ${JSON.stringify(extractedFacts, null, 2)}
    \`\`\`

    Clinical Trials:
    \`\`\`json
    ${JSON.stringify(simplifiedTrials, null, 2)}
    \`\`\`

    For EACH trial, provide:
    1.  A 'matchPercentage' (0-100) based on how well the trial's conditions, eligibility criteria (age, gender), and potentially proximity (if patient zip code is available) align with the patient profile. Higher percentage means better potential match.
    2.  A concise 'summaryNote' (1-2 sentences) explaining the match score, highlighting key positive/negative factors related to condition, age, gender, etc.

    Return the results ONLY as a valid JSON array where each object strictly adheres to the following schema:
    \`\`\`json
    ${JSON.stringify(rankedTrialSchema, null, 2)}
    \`\`\`
    Ensure the output array has the same number of elements as the input trials list. Use the correct nctId for each trial.
    `;

    // 3. Call Gemini REST API using fetch
    console.log("Sending request to Gemini REST API for ranking/summarization...");

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema, // Provide the schema for the array response
      },
    };

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Gemini API response status: ${geminiResponse.status}`);

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error("Gemini API Error:", errorBody);
      throw new Error(`Gemini API request failed with status ${geminiResponse.status}: ${errorBody}`);
    }

    const responseData = await geminiResponse.json();
    console.log("Raw Gemini ranking response:", JSON.stringify(responseData, null, 2));

    // Validate the structure received from the REST API
    if (!responseData || !responseData.candidates || responseData.candidates.length === 0 || !responseData.candidates[0].content || !responseData.candidates[0].content.parts || responseData.candidates[0].content.parts.length === 0) {
       throw new Error("Gemini returned an empty or invalid response structure for ranking.");
    }

    // Extract the JSON text payload
    const rankedJsonText = responseData.candidates[0].content.parts[0].text;
    const rankedTrialsData = JSON.parse(rankedJsonText); // Parse the JSON array string

    // Optional: Combine ranked data with original trial data if needed by frontend
    // For now, just return the ranked data (NCTId, score, note)

    console.log("Successfully ranked/summarized trials via REST API:", rankedTrialsData);

    // 4. Return Ranked & Summarized Trials
    return new Response(JSON.stringify(rankedTrialsData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in rank-summarize-trials function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: `Ranking/summarization failed: ${errorMessage}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

/* To invoke locally:

  1. Run \`supabase start\` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/rank-summarize-trials' \\
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \\
    --header 'Content-Type: application/json' \\
    --data '{"extractedFacts": {...}, "trials": [...] }' // Provide sample data

*/
