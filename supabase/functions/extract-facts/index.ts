// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.11.3'; // Import via npm specifier (Supabase supports this)
import { corsHeaders } from '../_shared/cors.ts';

// --- Configuration ---
const API_KEY = Deno.env.get('GOOGLE_API_KEY');
if (!API_KEY) {
  console.error('Missing GOOGLE_API_KEY environment variable.');
  // Optional: Throw an error or handle appropriately if key is mandatory at startup
}
const genAI = new GoogleGenerativeAI(API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Or gemini-1.5-pro-latest

// Define the structure we want Gemini to return
const desiredJsonSchema = {
  type: "OBJECT",
  properties: {
    age: { type: "NUMBER", description: "Patient's age in years" },
    gender: { type: "STRING", description: "Patient's gender (e.g., Male, Female, Other)" },
    conditions: { 
      type: "ARRAY", 
      description: "List of major medical conditions or diagnoses, preferably with ICD-10 codes if available.",
      items: { 
        type: "OBJECT",
        properties: {
          term: { type: "STRING", description: "Condition name/term" },
          icd10Code: { type: "STRING", description: "ICD-10 code, if found" }
        },
        required: ["term"]
      } 
    },
    medications: { 
      type: "ARRAY", 
      description: "List of relevant medications the patient is taking.",
      items: { type: "STRING" } 
    },
    immunizations: {
      type: "ARRAY",
      description: "List of immunizations the patient has received",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Name of the vaccine/immunization" },
          date: { type: "STRING", description: "Date of immunization if available" },
          status: { type: "STRING", description: "Status of the immunization (completed, in progress, etc.)" }
        },
        required: ["name"]
      }
    },
    zipCode: { type: "STRING", description: "Patient's 5-digit ZIP code for location/distance calculation." },
    // Add other fields as needed based on CCD/FHIR structure and trial criteria
  },
  required: ["age", "gender", "conditions", "zipCode"] // Example required fields
};

// --- Helper: Basic De-identification (Placeholder - Requires Adaptation!) ---

// List of potentially identifying keys (adapt based on your actual data structure)
// This is NOT exhaustive and depends heavily on the source format (CCD/FHIR profile)
const IDENTIFYING_KEYS = new Set([
  'name', 'firstName', 'lastName', 'patientName', 'participantName', // Names
  'mrn', 'medicalRecordNumber', 'identifier', 'id', // IDs (check context - some IDs might be needed)
  'dob', 'birthDate', 'dateOfBirth', // Full Dates of Birth (keep age/year if needed)
  'address', 'streetAddress', 'city', 'county', 'postalCode', // Finer grain than Zip (keep zipCode if needed)
  'phone', 'telephone', 'email', // Contact info
  'ssn', 'socialSecurityNumber', // SSN
  'healthPlanBeneficiaryNumber', 'accountNumber', 'certificateLicenseNumber', // Other Numbers
  'vehicleIdentifier', 'deviceIdentifier', // Device/Vehicle IDs
  'url', 'ipAddress', // Web identifiers
  'biometricIdentifier', 'fingerprint', 'voiceprint', // Biometrics
  'photo', 'image', // Images
  // Potentially: encounterId, specific dates/times of service (generalize if needed)
]);

function deIdentifyDataRecursive(data: any): any {
  if (Array.isArray(data)) {
    // If it's an array, map over elements and apply recursively
    return data.map(deIdentifyDataRecursive);
  } else if (data !== null && typeof data === 'object') {
    // If it's an object, create a new object excluding/modifying identifying keys
    const cleanObject: { [key: string]: any } = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!IDENTIFYING_KEYS.has(key.toLowerCase())) { // Check against lowercase key
          // Key is not identifying, apply recursively to its value
          cleanObject[key] = deIdentifyDataRecursive(data[key]);
        } else {
          // Key IS potentially identifying - log and skip (or mask/generalize)
          console.log(`De-identifying: Removing key '${key}'`);
          // Alternatively, you might mask: cleanObject[key] = '***REDACTED***';
          // Or generalize dates: if (isDate(data[key])) cleanObject[key] = getYear(data[key]);
        }
      }
    }
    return cleanObject;
  } else {
    // Primitive type (string, number, boolean, null, undefined), return as is
    return data;
  }
}

function deIdentifyData(inputData: any): any {
  console.log("Starting de-identification process...");
  // Perform a deep copy first to avoid modifying the original object
  const dataCopy = JSON.parse(JSON.stringify(inputData)); 
  const deIdentified = deIdentifyDataRecursive(dataCopy);
  console.log("Data after de-identification attempt:", JSON.stringify(deIdentified)); // Log the result
  return deIdentified;
}

// --- Main Function Logic ---
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Get Input Data (expects JSON output from parse-ccd function)
    if (!req.body) {
      return new Response(JSON.stringify({ error: 'Missing request body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const parsedInputData = await req.json();
    console.log("Received data for extraction:", parsedInputData);

    // 2. De-identify (CRITICAL STEP - IMPLEMENT ROBUSTLY)
    const deIdentifiedData = deIdentifyData(JSON.parse(JSON.stringify(parsedInputData))); // Deep copy before modifying

    // 3. Prepare Prompt for Gemini
    const prompt = `Analyze the following de-identified patient data, which originated from a CCD or FHIR document. Extract the specified information and return it ONLY as a valid JSON object matching the provided schema. 
    
    Patient Data:
    \`\`\`json
    ${JSON.stringify(deIdentifiedData, null, 2)}
    \`\`\`

    Focus on extracting:
    - Age (years)
    - Gender
    - Conditions (list with terms and ICD-10 if available)
    - Medications (list)
    - Immunizations (with name, date if available, and status) - Look for fields like "immunization", "vaccine", "vaccination", "immunizationHistory", etc. These might be in sections called "immunizations", "vaccinations", or within a clinical data section.
    - 5-digit ZIP Code
    
    For immunizations, look for patterns like this sample from a CCD document:
    \`\`\`
    <section>
      <templateId root="2.16.840.1.113883.10.20.22.2.2" extension="2014-06-09"/>
      <templateId root="2.16.840.1.113883.10.20.22.2.2"/>
      <code code="11369-6" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="History of immunizations"/>
      <title>IMMUNIZATIONS</title>
      <entry typeCode="DRIV">
        <substanceAdministration classCode="SBADM" moodCode="EVN">
          <consumable>
            <manufacturedProduct>
              <manufacturedMaterial>
                <code code="33332-0" codeSystem="2.16.840.1.113883.6.1" displayName="Influenza virus vaccine"/>
              </manufacturedMaterial>
            </manufacturedProduct>
          </consumable>
          <effectiveTime value="20140815"/>
          <status code="completed"/>
        </substanceAdministration>
      </entry>
    </section>
    \`\`\`

    Extract the name of the vaccine, the date if available, and status if available.
    
    If a required field isn't clearly present, use null or an empty list as appropriate for the type. Ensure the output strictly adheres to the JSON schema.`;

    // 4. Call Gemini API
    if (!API_KEY) {
      throw new Error("GOOGLE_API_KEY is not configured in Supabase secrets.");
    }
    
    console.log("Sending request to Gemini...");
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json", // Request JSON output
            responseSchema: desiredJsonSchema,    // Provide the schema
        },
    });

    const response = result.response;
    console.log("Raw Gemini response:", JSON.stringify(response, null, 2)); // Log raw response for debugging

    if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
       throw new Error("Gemini returned an empty or invalid response.");
    }
    
    // Extract the JSON text, assuming it's valid because we requested JSON output + schema
    const extractedJsonText = response.candidates[0].content.parts[0].text;
    const extractedFacts = JSON.parse(extractedJsonText); // Parse the JSON string from Gemini

    console.log("Successfully extracted facts:", extractedFacts);

    // 5. Return Extracted Facts
    return new Response(JSON.stringify(extractedFacts), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in extract-facts function:', error);
    // Check if it's a GoogleGenerativeAI error for potentially more specific info
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new Response(JSON.stringify({ error: `Fact extraction failed: ${errorMessage}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/extract-facts' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
