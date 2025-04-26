// Shared type definitions for the TrialMatch application

// --- Data Structures ---

export interface ExtractedFactCondition {
  term: string;
  icd10Code?: string;
}

export interface ExtractedFacts {
  age?: number;
  gender?: string;
  conditions?: ExtractedFactCondition[];
  medications?: string[];
  zipCode?: string;
  immunizations?: Array<{
    name: string;
    date?: string;
    status?: string;
  }>;
  // Add other fields as needed
}

export interface SearchFilters {
  recruitingStatus?: 'RECRUITING' | 'ACTIVE_NOT_RECRUITING' | 'COMPLETED' | 'ANY';
  travelRadiusMiles?: number;
  phase?: Array<'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4'>;
  conditionKeyword?: string;
}

// Mirroring structure returned by ClinicalTrials.gov v2 API (simplified)
export interface ClinicalTrialProtocolSection {
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
}

export interface ClinicalTrial {
  protocolSection: ClinicalTrialProtocolSection;
}

// Structure returned by rank-summarize-trials function
export interface RankedTrialData {
  nctId: string;
  matchPercentage: number;
  summaryNote: string;
  // Include original trial data if needed for display
  originalTrial?: ClinicalTrial;
}

// --- Component/Workflow State ---

export type ProcessingStep = 'idle' | 'parsing' | 'extracting' | 'searching' | 'ranking' | 'complete' | 'error'; 