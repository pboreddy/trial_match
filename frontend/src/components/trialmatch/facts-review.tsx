'use client';

import { ExtractedFacts } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge"; // Use Badge for conditions/meds
import { Card, CardContent } from "@/components/ui/card"; // Use Card for structure

interface FactsReviewProps {
  facts: ExtractedFacts | null;
  // Add onFactsChange prop later if editing is needed
}

// Helper to display simple key-value pairs
const FactItem = ({ label, value }: { label: string; value: string | number | undefined | null }) => (
  <div className="grid grid-cols-3 items-center gap-2">
    <Label className="text-sm font-medium text-muted-foreground col-span-1">{label}</Label>
    <div className="col-span-2 text-sm">
      {value !== undefined && value !== null && value !== '' ? String(value) : <span className="italic text-muted-foreground">N/A</span>}
    </div>
  </div>
);

export function FactsReview({ facts }: FactsReviewProps) {
  if (!facts) {
    return (
      <p className="text-sm text-muted-foreground">
        Facts extracted by Gemini will appear here after successful upload and parse.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FactItem label="Age" value={facts.age} />
      <FactItem label="Gender" value={facts.gender} />
      <FactItem label="Zip Code" value={facts.zipCode} />

      <div>
        <Label className="text-sm font-medium text-muted-foreground block mb-1">Conditions</Label>
        <div className="flex flex-wrap gap-1">
          {facts.conditions && facts.conditions.length > 0 ? (
            facts.conditions.map((cond, index) => (
              <Badge key={index} variant="secondary">
                {cond.term}{cond.icd10Code ? ` (${cond.icd10Code})` : ''}
              </Badge>
            ))
          ) : (
            <span className="text-sm italic text-muted-foreground">N/A</span>
          )}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-muted-foreground block mb-1">Medications</Label>
        <div className="flex flex-wrap gap-1">
          {facts.medications && facts.medications.length > 0 ? (
            facts.medications.map((med, index) => (
              <Badge key={index} variant="outline">{med}</Badge>
            ))
          ) : (
            <span className="text-sm italic text-muted-foreground">N/A</span>
          )}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-muted-foreground block mb-1">Immunizations</Label>
        <div className="flex flex-wrap gap-1">
          {facts.immunizations && facts.immunizations.length > 0 ? (
            facts.immunizations.map((imm, index) => (
              <Badge key={index} variant="outline" className="bg-green-50">
                {imm.name}
                {imm.date ? ` (${imm.date})` : ''}
                {imm.status ? ` - ${imm.status}` : ''}
              </Badge>
            ))
          ) : (
            <span className="text-sm italic text-muted-foreground">N/A</span>
          )}
        </div>
      </div>
      {/* Add editing controls later if needed */}
    </div>
  );
} 