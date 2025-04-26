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

  const handleParseSuccess = async (data: Record<string, unknown>) => {
    console.log("Parsed data received:", data);
    setInitialParsedData(data);
    setExtractedFacts(null); // Reset downstream data
    setRawTrials([]);
    setRankedTrials([]);
    setErrorMessage(null);
    setProcessingStep('extracting'); // Move to next step

    try {
      console.log("Invoking extract-facts function...");
      const { data: facts, error: extractError } = await supabaseBrowserClient.functions.invoke(
        'extract-facts', 
        { body: data } // Send the parsed data to the function
      );

      if (extractError) {
        throw extractError;
      }

      console.log("Extracted facts received:", facts);
      setExtractedFacts(facts);
      setProcessingStep('idle'); // Ready for search trigger

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
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <header className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">TrialMatch</h1>
            <p className="text-muted-foreground">
              Find clinical trials based on patient CCD data.
            </p>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <LogoutButton />
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column / Main Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Patient Data</CardTitle>
            </CardHeader>
            <CardContent>
              <UploadData onParseSuccess={handleParseSuccess} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Review Extracted Facts</CardTitle>
            </CardHeader>
            <CardContent>
              {processingStep === 'extracting' && <p className="text-sm text-muted-foreground">Extracting facts using Gemini...</p>}
              <FactsReview facts={extractedFacts} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column / Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>3. Filters</CardTitle>
            </CardHeader>
            <CardContent>
               <FilterControls filters={filters} onFiltersChange={handleFiltersChange} />
            </CardContent>
          </Card>

          {/* 4. Trigger Search */}
           <Button 
             onClick={handleSearchAndRank}
             disabled={!extractedFacts || processingStep === 'searching' || processingStep === 'ranking' || processingStep === 'extracting'}
             className="w-full"
           >
             {processingStep === 'searching' ? 'Searching...' : 
              processingStep === 'ranking' ? 'Ranking...' : 'Find Matching Trials'}
           </Button>
        </div>
      </div>

      {/* Results Area (Below Grid) */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>5. Matching Trials</CardTitle>
          </CardHeader>
          <CardContent>
            {processingStep === 'searching' && <p className="text-sm text-muted-foreground">Searching ClinicalTrials.gov...</p>}
            {processingStep === 'ranking' && <p className="text-sm text-muted-foreground">Ranking results with Gemini...</p>}
            {processingStep === 'complete' && rankedTrials.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No trials found matching the criteria.</p>} 
            {(processingStep === 'complete' || rankedTrials.length > 0) && rankedTrials.length > 0 ? (
                <ResultsTable data={rankedTrials} />
            ) : (
                <p className="text-sm text-center text-muted-foreground py-4">
                    {processingStep !== 'searching' && processingStep !== 'ranking' && processingStep !== 'complete' && "Ranked clinical trial results will appear here after searching."}
                </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* HIPAA Banner */}
      <footer className="mt-12 text-center text-sm text-destructive font-semibold">
        <p>DEMO ONLY - NOT HIPAA COMPLIANT FOR PRODUCTION USE</p>
      </footer>
    </div>
  );
}
