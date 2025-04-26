'use client'; // Still needed for UploadData and useState

import { useState, useEffect } from 'react'; // Add useEffect
import { redirect } from 'next/navigation'; // Use redirect for server-side redirect
import { createClient as createServerClient } from '@/lib/supabase/server'; // Server client for initial check
import { createClient as createBrowserClient } from '@/lib/supabase/client'; // Browser client for user display
import type { User } from '@supabase/supabase-js'; // Import User type

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadData } from '@/components/trialmatch/upload-data';
import { LogoutButton } from '@/components/trialmatch/logout-button'; // Import LogoutButton
import { Button } from '@/components/ui/button'; // Import Button
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert
import { Terminal } from "lucide-react"; // Import Icon
import { FilterControls } from '@/components/trialmatch/filter-controls'; // Import FilterControls
import { FactsReview } from '@/components/trialmatch/facts-review';
import { ResultsTable } from '@/components/trialmatch/results-table'; // Import ResultsTable
import { Progress } from "@/components/ui/progress"; // Added import for Progress

import {
    ExtractedFacts, 
    SearchFilters, 
    ClinicalTrial, 
    RankedTrialData,
    ProcessingStep
} from '@/lib/types'; // Import from shared types file

// Note: This component is now a hybrid. It runs on the server *first* for the auth check,
// but then hydrates on the client and uses client-side features (useState, UploadData).

// --- Component State ---
// type ProcessingStep = 'idle' | 'parsing' | 'extracting' | 'searching' | 'ranking' | 'complete' | 'error'; // Remove type def from here

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data state
  const [initialParsedData, setInitialParsedData] = useState<Record<string, unknown> | null>(null);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFacts | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({ recruitingStatus: 'RECRUITING' }); // Default filters
  const [rawTrials, setRawTrials] = useState<ClinicalTrial[]>([]);
  const [rankedTrials, setRankedTrials] = useState<RankedTrialData[]>([]);

  const supabaseBrowserClient = createBrowserClient(); // For getting user info on client

  useEffect(() => {
    // Check auth state on the client side to get user details
    // and handle potential redirects if server check somehow misses (unlikely but safe)
    const checkUser = async () => {
      const { data: { session }, error } = await supabaseBrowserClient.auth.getSession();
      
      if (error) {
        console.error("Error getting session:", error);
        // Potentially redirect to login here too if error indicates no auth
        redirect('/login');
      } else if (!session) {
        console.log("No session found on client, redirecting...");
        redirect('/login'); // Redirect if no session on client
      } else {
        setUser(session.user);
      }
      setLoading(false);
    };

    checkUser();
  }, [supabaseBrowserClient]);

  const handleParseSuccess = (data: Record<string, unknown>) => {
    console.log("Parsed data received:", data);
    setInitialParsedData(data);
    setExtractedFacts(null); // Reset facts
    setRawTrials([]);
    setRankedTrials([]);
    setErrorMessage(null);
    // Change step to indicate data is parsed and ready for extraction
    setProcessingStep('parsed'); 
  };

  const handleExtractFacts = async () => {
    if (!initialParsedData) {
      setErrorMessage("Cannot extract facts without parsed data.");
      setProcessingStep('error');
      return;
    }
    setProcessingStep('extracting'); // Indicate extraction is in progress
    setErrorMessage(null);

    try {
      console.log("Invoking extract-facts function...");
      const { data: facts, error: extractError } = await supabaseBrowserClient.functions.invoke(
        'extract-facts', 
        { body: initialParsedData } // Send the initially parsed data
      );

      if (extractError) {
        throw extractError;
      }

      console.log("Extracted facts received:", facts);
      setExtractedFacts(facts);
      // Set step back to idle or perhaps a new step like 'reviewing'?
      // Let's use 'idle' for now, assuming review is passive until search.
      setProcessingStep('idle'); 

    } catch (error: any) {
      console.error("Error invoking extract-facts:", error);
      setErrorMessage(error.message || 'Failed to extract facts.');
      setProcessingStep('error');
    }
  };

  const handleSearchAndRank = async () => {
      if (!extractedFacts) {
        setErrorMessage("Cannot search without extracted patient facts.");
        setProcessingStep('error');
        return;
      }
  
      setRawTrials([]);
      setRankedTrials([]);
      setErrorMessage(null);
      setProcessingStep('searching');
  
      try {
        // Step 1: Search Trials
        console.log("Invoking search-trials function...", { extractedFacts, filters });
        const { data: trialsData, error: searchError } = await supabaseBrowserClient.functions.invoke(
          'search-trials', 
          { 
            body: { 
              extractedFacts: extractedFacts, 
              filters: filters 
            } 
          }
        );
  
        if (searchError) {
          throw searchError;
        }
  
        console.log("Raw trials received:", trialsData);
        // Ensure trialsData is an array even if API returns null/undefined
        const currentRawTrials = Array.isArray(trialsData) ? trialsData : []; 
        setRawTrials(currentRawTrials);

        if (currentRawTrials.length === 0) {
            console.log("No trials found matching criteria.");
            setProcessingStep('complete'); // Or idle, depending on desired flow
            return; // Stop if no trials
        }

        // Step 2: Rank Trials
        setProcessingStep('ranking');
        console.log("Invoking rank-summarize-trials function...");
        const { data: rankedData, error: rankError } = await supabaseBrowserClient.functions.invoke(
          'rank-summarize-trials', 
          { 
            body: { 
              extractedFacts: extractedFacts, 
              trials: currentRawTrials // Use the fetched trials
            } 
          }
        );
  
        if (rankError) {
          throw rankError;
        }
  
        console.log("Ranked trials received:", rankedData);
         // Ensure rankedData is an array
        const currentRankedTrials = Array.isArray(rankedData) ? rankedData : [];
        setRankedTrials(currentRankedTrials);
        setProcessingStep('complete');
  
      } catch (error: any) {
        console.error("Error during search/rank:", error);
        setErrorMessage(error.message || 'An error occurred during trial search or ranking.');
        setProcessingStep('error');
      }
  };

  // Handler for filter changes
  const handleFiltersChange = (newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  // Initial loading state while client-side check runs
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // If loading is done and still no user (should have been redirected, but as fallback)
  if (!user) {
     // This part might not be strictly necessary due to useEffect redirect, but acts as a safeguard
     console.log("Render check: No user found after loading, redirecting...");
     // Can't use `redirect` directly here as it's client-side rendering phase now
     // The useEffect should handle the redirect.
     // Optionally return null or a message, but redirect is preferred.
     return null; 
  }

  // Render the main page content if user is authenticated
  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8 relative">
      
      {/* User/Logout block positioned absolutely */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-4 z-10">
        <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
        <LogoutButton />
      </div>

      {/* Centered Header Content */}
      <header className="text-center pt-4 pb-4">
        <h1 className="text-3xl font-bold">TrialMatch</h1>
        <p className="text-muted-foreground">
          Find clinical trials based on patient CCD data.
        </p>
      </header>

      {/* Workflow Status/Error Alert */}
      {processingStep === 'error' && errorMessage && (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {/* Could add alerts for other steps too, e.g., extracting, searching... */}

      <div className="w-full">
        <div className="space-y-6">
          {/* 1. Upload */}
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Patient Data</CardTitle>
            </CardHeader>
            <CardContent>
              <UploadData onParseSuccess={handleParseSuccess} />
            </CardContent>
          </Card>

          {/* 2. Review Facts (conditionally shown) */}
          {(processingStep === 'parsed' || processingStep === 'extracting' || extractedFacts || (processingStep === 'error' && errorMessage)) && (
            <Card>
              <CardHeader>
                <CardTitle>2. Review Extracted Facts</CardTitle>
              </CardHeader>
              <CardContent className="min-h-[100px]"> {/* Added min height for consistency */}
                {/* Content depends on the current step */} 
                {processingStep === 'parsed' && !errorMessage && (
                  <div className="flex flex-col items-center space-y-2">
                    <Button onClick={handleExtractFacts}>
                      Extract Facts using AI
                    </Button>
                  </div>
                )}
                {processingStep === 'extracting' && (
                  <p className="text-sm text-muted-foreground flex items-center">
                    {/* Add a spinner icon here later */}
                    Extracting facts using Gemini...
                  </p>
                )}
                {/* Show facts review whenever facts exist (modified condition) */}
                {extractedFacts && (
                   <FactsReview facts={extractedFacts} />
                )}
                {/* Placeholder only shown initially or if extraction fails immediately */}
                {!extractedFacts && (processingStep === 'idle' || processingStep === 'parsed') && (
                   <p className="text-sm text-muted-foreground">Facts extracted by Gemini will appear here after successful upload and parse.</p>
                )}
                {/* Error message specific to extraction */}
                {processingStep === 'error' && errorMessage && !extractedFacts && (
                  <p className="text-sm text-destructive">Error during fact extraction: {errorMessage}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 3. Filters (conditionally shown) */}
          {extractedFacts && (
            <Card>
              <CardHeader>
                 <CardTitle>3. Filters</CardTitle>
              </CardHeader>
              <CardContent>
                 <FilterControls filters={filters} onFiltersChange={handleFiltersChange} />
              </CardContent>
            </Card>
          )}

          {/* Find Trials Button (conditionally shown) */}
          {extractedFacts && (
            <Button 
              onClick={handleSearchAndRank} 
              disabled={processingStep === 'searching' || processingStep === 'ranking'} 
              className="w-full"
            >
              {processingStep === 'searching' ? 'Searching...' : processingStep === 'ranking' ? 'Ranking...' : 'Find Matching Trials'}
            </Button>
          )}

          {/* Progress Bar (conditionally shown during search/rank) */}
          {(processingStep === 'searching' || processingStep === 'ranking') && (
            <Progress value={50} className="w-full h-2 animate-pulse" /> // Use value/pulse for indeterminate feel
          )}

          {/* 4. Matching Trials (conditionally shown after completion) */}
          {processingStep === 'complete' && (
            <Card>
              <CardHeader>
                <CardTitle>4. Matching Trials</CardTitle>
              </CardHeader>
              <CardContent>
                 <ResultsTable data={rankedTrials} /> 
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer removed */}

    </div> /* Closes the main container div */
  );
}
