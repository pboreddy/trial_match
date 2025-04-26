// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// import { createClient } from '@supabase/supabase-js';
// Add Deno reference to fix linter errors
import type { ConnInfo } from "https://deno.land/std@0.168.0/http/server.ts";

// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders } from '../_shared/cors.ts'

// console.log("Hello from Functions!") // Optional: remove or keep for basic logging

// Ensure you have set the GOOGLE_API_KEY secret in your Supabase project settings
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`;

console.log(`Function "parse-ccd" up and running!`)

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Check for API Key
  if (!GOOGLE_API_KEY) {
    console.error("Google API key not found in Supabase secrets.");
    return new Response(JSON.stringify({ error: "Server configuration error: Missing API key." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // Internal Server Error
    });
  }

  // Main try block for the overall request handling
  try {
    // 1. Read CCD data from request body - handle both text and JSON formats
    let ccdData: string;
    const contentType = req.headers.get('content-type') || '';
    
    // Log the received content type and method
    console.log("Received request with Content-Type:", contentType, "Method:", req.method);
    
    try {
      // First, try to read as raw text to see what we received
      const rawText = await req.text();
      console.log("Raw request body length:", rawText.length);
      console.log("Raw request body sample:", rawText.substring(0, 100) + '...');
      
      // If we couldn't read the body as text, something's wrong
      if (!rawText || rawText.trim() === '') {
        console.error("Empty request body received");
        return new Response(JSON.stringify({ error: "Empty request body" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      
      // For XML content types, just use the raw text
      if (contentType.includes('xml')) {
        ccdData = rawText;
      }
      // If it's JSON with an 'xml' field, extract the XML content
      else if (contentType.includes('json')) {
        try {
          const jsonObj = JSON.parse(rawText);
          // Check if this is XML wrapped in a JSON object
          if (jsonObj && typeof jsonObj.xml === 'string') {
            console.log("Found XML data inside JSON wrapper");
            ccdData = jsonObj.xml;
          } else {
            // Regular JSON data
            ccdData = rawText;
          }
        } catch (jsonError) {
          console.error("Error parsing JSON request:", jsonError);
          return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        }
      }
      // For JSON-like content without the proper content type header
      else if (rawText.trim().startsWith('{') && rawText.trim().endsWith('}')) {
        try {
          const jsonObj = JSON.parse(rawText);
          // Check if this is XML wrapped in a JSON object
          if (jsonObj && typeof jsonObj.xml === 'string') {
            console.log("Found XML data inside JSON wrapper");
            ccdData = jsonObj.xml;
          } else {
            ccdData = rawText;
          }
        } catch (jsonError) {
          // If it fails to parse as JSON, just use the raw text
          ccdData = rawText;
        }
      }
      // For anything else, just use the raw text
      else {
        ccdData = rawText;
      }
    } catch (bodyError) {
      console.error("Error reading request body:", bodyError);
      return new Response(JSON.stringify({ error: "Could not read request body" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    // Log some debug info about what we parsed
    console.log("Processed content type:", contentType);
    console.log("Processed body length:", ccdData.length);
    
    // BYPASS GEMINI FOR TESTING - ALWAYS RETURN MOCK DATA
    const BYPASS_GEMINI = false; // Set to true if Gemini API issues occur
    
    if (BYPASS_GEMINI || ccdData === "TEST_MODE") {
      console.log("Bypassing Gemini API - returning mock response");
      // Use mock data if bypassing Gemini or if we need to fall back due to errors
      const mockResponse = {
        demographics: {
          name: "John Doe",
          gender: "Male",
          birthDate: "1950-01-01",
          age: 73,
          address: "123 Main St, Anytown",
          zipCode: "12345",
          phone: "555-123-4567"
        },
        conditions: [
          "Hypertension",
          "Type 2 Diabetes",
          "Hyperlipidemia"
        ],
        medications: [
          "Lisinopril 10mg daily",
          "Metformin 500mg twice daily",
          "Atorvastatin 20mg daily"
        ],
        allergies: [
          "Penicillin",
          "Sulfa drugs"
        ],
        procedures: [
          "Colonoscopy (2020-03-15)",
          "Cataract surgery (2019-07-10)"
        ],
        vitalSigns: {
          height: "5'10\" (178 cm)",
          weight: "180 lbs (82 kg)",
          bloodPressure: "130/82 mmHg",
          temperature: "98.6 F (37 C)",
          pulse: "72 bpm",
          respiratoryRate: "16 breaths/min"
        }
      };
      
      return new Response(
        JSON.stringify(mockResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GEMINI API SECTION - wrapped in its own try/catch
    try {
      // 2. Construct the prompt for Gemini
      const prompt = `Parse the following Continuity of Care Document (CCD) XML data and extract the patient's key clinical information. Format the output as a single JSON object with the following structure:

{
  "demographics": {
    "name": "string", // Full patient name
    "gender": "string", // "Male", "Female", etc.
    "birthDate": "YYYY-MM-DD", // Date of birth
    "age": number, // Age in years, calculated from birthDate if available
    "address": "string", // Full address as a single string
    "zipCode": "string", // Postal/ZIP code only
    "phone": "string" // Phone number if available
  },
  "conditions": [
    "string", // One entry per condition/problem
    "string"
  ],
  "medications": [
    "string", // One entry per medication with dosage if available
    "string" 
  ],
  "allergies": [
    "string", // One entry per allergy
    "string"
  ],
  "procedures": [
    "string", // One entry per procedure
    "string"
  ],
  "vitalSigns": {
    "height": "string", // Height with units
    "weight": "string", // Weight with units
    "bloodPressure": "string", // BP with units
    "temperature": "string", // Temperature with units
    "pulse": "string", // Heart rate with units
    "respiratoryRate": "string" // Respiratory rate with units
  }
}

If certain sections are empty or not found in the CCD, return empty arrays [] or null values as appropriate.

IMPORTANT:
- Extract real values from the XML, not placeholder schema values like "string"
- Return actual values - if you can't find a value, use null for simple fields or [] for arrays
- Do not include any labels like "Patient name:" in the values - just the actual data
- Format dates as YYYY-MM-DD when possible
- For age, calculate from birthDate if available

CCD Data:
\`\`\`xml
${ccdData}
\`\`\`
`;

      // 3. Call the Gemini API
      console.log("Calling Gemini API...");
      const geminiReqBody = {
        contents: [{ parts: [{ text: prompt }] }],
        // Add generationConfig parameters for better results
        generationConfig: {
          "temperature": 0.2, // Lower temperature for more factual extraction
          "topP": 0.8,
          "topK": 40,
          "maxOutputTokens": 2048, // Ensure we have enough tokens for detailed output
        }
      };
      
      // Actual API call in separate try/catch for specific error handling
      try {
        const geminiRes = await fetch(GEMINI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(geminiReqBody),
        });

        // 4. Handle Gemini Response
        if (!geminiRes.ok) {
          const errorBody = await geminiRes.text();
          console.error("Gemini API Error:", geminiRes.status, errorBody);
          throw new Error(`Gemini API failed: ${geminiRes.status} ${geminiRes.statusText}. ${errorBody}`);
        }

        const geminiData = await geminiRes.json();
        console.log("Received response from Gemini API");

        // Extract the generated text (may need adjustment based on Gemini's response structure)
        // Sometimes the JSON is nested within the 'text' part. Add robust extraction.
        let parsedJsonString;
        try {
            parsedJsonString = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!parsedJsonString) {
                throw new Error("Could not find generated text in Gemini response.");
            }
            // Clean potential markdown code fences
            parsedJsonString = parsedJsonString.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } catch (extractError) {
            console.error("Error extracting text from Gemini response:", extractError);
            console.error("Full Gemini Response:", JSON.stringify(geminiData, null, 2)); // Log full response for debugging
            throw new Error(`Failed to extract content: ${extractError.message}`);
        }

        // Attempt to parse the extracted string as JSON
        let finalData;
        try {
            finalData = JSON.parse(parsedJsonString);
            
            // Add validation to check for placeholder values
            if (finalData) {
                // Validate demographic data
                if (finalData.demographics) {
                    const demo = finalData.demographics;
                    
                    // Check if demographic values are placeholders
                    if (demo.name === 'string') demo.name = null;
                    if (demo.gender === 'string') demo.gender = null;
                    if (demo.address === 'string') demo.address = null;
                    if (demo.zipCode === 'string') demo.zipCode = null;
                    if (demo.phone === 'string') demo.phone = null;
                    
                    // Validate age is a reasonable number
                    if (typeof demo.age === 'number' && (demo.age < 0 || demo.age > 120 || demo.age < 2)) {
                        console.warn(`Suspicious age value: ${demo.age}, attempting to calculate from birthDate`);
                        
                        // Try to calculate age from birthDate if available
                        if (demo.birthDate && demo.birthDate !== 'YYYY-MM-DD') {
                            try {
                                const birthYear = parseInt(demo.birthDate.substring(0, 4));
                                const currentYear = new Date().getFullYear();
                                if (birthYear > 1900 && birthYear < currentYear) {
                                    demo.age = currentYear - birthYear;
                                } else {
                                    demo.age = null;
                                }
                            } catch (e) {
                                demo.age = null;
                            }
                        } else {
                            demo.age = null;
                        }
                    }
                }
                
                // Define array fields
                const arrayFields = ['conditions', 'medications', 'allergies', 'procedures'];
                
                // Make sure each array field exists and is properly formatted
                arrayFields.forEach(field => {
                    if (!finalData[field]) {
                        finalData[field] = [];
                    } else if (!Array.isArray(finalData[field])) {
                        console.warn(`Field ${field} is not an array, converting to empty array`);
                        finalData[field] = [];
                    } else {
                        // Filter out placeholder values
                        finalData[field] = finalData[field].filter(item => 
                            item !== 'string' && 
                            item !== '[object Object]' && 
                            item !== 'N/A' &&
                            item !== null
                        );
                    }
                });
                
                // Check vital signs (object, not array)
                if (!finalData.vitalSigns || typeof finalData.vitalSigns !== 'object') {
                    finalData.vitalSigns = {
                        height: null,
                        weight: null,
                        bloodPressure: null,
                        temperature: null,
                        pulse: null,
                        respiratoryRate: null
                    };
                } else {
                    // Clean vital signs
                    const vs = finalData.vitalSigns;
                    if (vs.height === 'string') vs.height = null;
                    if (vs.weight === 'string') vs.weight = null;
                    if (vs.bloodPressure === 'string') vs.bloodPressure = null;
                    if (vs.temperature === 'string') vs.temperature = null;
                    if (vs.pulse === 'string') vs.pulse = null;
                    if (vs.respiratoryRate === 'string') vs.respiratoryRate = null;
                }
            }
        } catch (parseError) {
            console.error("Error parsing JSON from Gemini response text:", parseError);
            console.error("Raw Gemini text:", parsedJsonString); // Log the raw text that failed parsing
            throw new Error(`Gemini returned invalid JSON: ${parseError.message}`);
        }

        // 5. Return the parsed data from Gemini
        return new Response(
          JSON.stringify(finalData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      } catch (geminiError) {
        console.error("Error calling Gemini API:", geminiError);
        throw new Error(`Gemini API error: ${geminiError.message}`);
      }
    } catch (processingError) {
      console.error("Error in Gemini processing:", processingError);
      // Return a more detailed error response for debugging
      return new Response(
        JSON.stringify({ 
          error: "Error processing CCD with Gemini", 
          details: processingError.message,
          xmlSnippet: ccdData.substring(0, 200) + '...' // Include XML snippet for debugging
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }
  } catch (error) {
      console.error("Error processing request:", error);
      // General error handling
      return new Response(JSON.stringify({ error: "An unexpected error occurred.", details: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 // Internal Server Error
      });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/parse-ccd' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
