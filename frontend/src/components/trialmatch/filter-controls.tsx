'use client';

import { SearchFilters } from '@/lib/types'; // Import from shared types file
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface FilterControlsProps {
  filters: SearchFilters;
  onFiltersChange: (newFilters: Partial<SearchFilters>) => void;
}

export function FilterControls({ filters, onFiltersChange }: FilterControlsProps) {

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, valueAsNumber } = event.target;
    const newValue = event.target.type === 'number' ? (isNaN(valueAsNumber) ? undefined : valueAsNumber) : value;
    onFiltersChange({ [name]: newValue });
  };

  const handleSelectChange = (name: keyof SearchFilters) => (value: string) => {
    onFiltersChange({ [name]: value });
  };

  const handleRadioChange = (name: keyof SearchFilters) => (value: string) => {
    onFiltersChange({ [name]: value });
  };

  return (
    <div className="space-y-4">
      {/* Condition Keyword */}
      <div>
        <Label htmlFor="conditionKeyword">Condition Keyword (Optional)</Label>
        <Input
          id="conditionKeyword"
          name="conditionKeyword"
          type="text"
          placeholder="e.g., Melanoma, Type 2 Diabetes"
          value={filters.conditionKeyword || ''}
          onChange={handleInputChange}
          className="mt-1"
        />
      </div>

      {/* Recruiting Status */}
      <div>
         <Label>Recruiting Status</Label>
         <RadioGroup 
            name="recruitingStatus"
            value={filters.recruitingStatus || 'RECRUITING'} 
            onValueChange={handleRadioChange('recruitingStatus')} 
            className="mt-1 flex space-x-4"
         >
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="RECRUITING" id="status-recruiting" />
                <Label htmlFor="status-recruiting">Recruiting</Label>
            </div>
            <div className="flex items-center space-x-2">
                <RadioGroupItem value="ANY" id="status-any" />
                <Label htmlFor="status-any">Any</Label>
            </div>
             {/* Add other statuses if needed */}
         </RadioGroup>
      </div>

      {/* Travel Radius */}
      <div>
        <Label htmlFor="travelRadiusMiles">Max Travel Radius (miles)</Label>
        <Input
          id="travelRadiusMiles"
          name="travelRadiusMiles"
          type="number"
          placeholder="e.g., 50"
          value={filters.travelRadiusMiles || ''}
          onChange={handleInputChange}
          min="0"
          className="mt-1"
        />
      </div>

      {/* Phases (Simplified single select for now) */}
       <div>
         <Label htmlFor="phase">Trial Phase</Label>
         <Select 
             name="phase" 
             value={filters.phase?.[0] || 'ANY'} // Handle single phase selection
             onValueChange={(value) => onFiltersChange({ phase: value === 'ANY' ? undefined : [value as any] })}
         >
           <SelectTrigger id="phase" className="mt-1">
             <SelectValue placeholder="Select Phase" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="ANY">Any Phase</SelectItem>
             <SelectItem value="PHASE_1">Phase 1</SelectItem>
             <SelectItem value="PHASE_2">Phase 2</SelectItem>
             <SelectItem value="PHASE_3">Phase 3</SelectItem>
             <SelectItem value="PHASE_4">Phase 4</SelectItem>
             {/* Add Not Applicable, etc. if needed */}
           </SelectContent>
         </Select>
       </div>

    </div>
  );
} 