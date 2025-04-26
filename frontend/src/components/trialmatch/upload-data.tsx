'use client';

import { useState, ChangeEvent, DragEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, CheckCircle2 } from 'lucide-react';

type ParseStatus = 'idle' | 'parsing' | 'success' | 'error';

interface UploadDataProps {
  onParseSuccess: (data: Record<string, unknown>) => void;
}

export function UploadData({ onParseSuccess }: UploadDataProps) {
  const supabase = createClient();
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ParseStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  /* ---------- helpers ---------- */

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setSelectedFile(f ?? null);
    setPastedText('');
    setStatus('idle');
    setError(null);
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPastedText(e.target.value);
    setSelectedFile(null);
    setStatus('idle');
    setError(null);
  };

  /* ---------- drag-and-drop ---------- */

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setSelectedFile(f);
    setPastedText('');
    setStatus('idle');
    setError(null);
  };

  /* ---------- main action ---------- */

  const handleParse = async () => {
    setStatus('parsing');
    setError(null);

    try {
      /* read data -------------------------------------------------------- */
      let raw = '';
      let isJson = false;

      if (selectedFile) {
        isJson = selectedFile.type === 'application/json';
        raw = await selectedFile.text();
      } else if (pastedText.trim()) {
        raw = pastedText.trim();
        isJson = raw.startsWith('{') || raw.startsWith('[');
      } else {
        throw new Error('No file selected or text pasted.');
      }

      if (!raw) throw new Error('Empty content. Provide valid XML or JSON.');

      /* build payload ---------------------------------------------------- */
      const payload = isJson
        ? JSON.parse(raw)          // let SDK stringify it later
        : { xml: raw };            // wrap XML so payload is still JSON

      /* invoke function -------------------------------------------------- */
      // ⚠️  DO NOT add Content-Type header – supabase-js adds it & length.
      console.log("parse-ccd payload:", payload);
      const { data, error } = await supabase.functions.invoke('parse-ccd', {
        body: payload,
      });

      console.log("parse-ccd response:", data);

      if (error) throw error;

      setStatus('success');
      onParseSuccess(data);
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error');
      setStatus('error');
      console.error(err);
    }
  };

  /* ---------- UI ------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* drag area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center ${
          dragActive ? 'border-primary bg-muted' : 'border-border'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
          <div className="mb-2 text-sm text-muted-foreground">
            {selectedFile
              ? `Selected: ${selectedFile.name}`
              : 'Drag & drop your CCD XML or FHIR JSON file here, or click to select'}
          </div>
          <Input
            id="file-upload"
            type="file"
            className="sr-only"
            onChange={handleFileChange}
            accept=".xml,application/xml,text/xml,.json,application/json"
          />
          {!selectedFile && (
            <span className="text-primary font-medium">Browse files</span>
          )}
        </Label>
      </div>

      <div className="text-center text-sm text-muted-foreground">OR</div>

      {/* textarea with fixed height */}
      <div>
        <Label htmlFor="text-paste">Paste FHIR JSON or CCD XML content</Label>
        <Textarea
          id="text-paste"
          placeholder="Paste your JSON or XML here..."
          value={pastedText}
          onChange={handleTextChange}
          className="mt-1 h-[300px]"
        />
      </div>

      {/* action button */}
      <Button
        onClick={handleParse}
        disabled={status === 'parsing' || (!selectedFile && !pastedText)}
        className="w-full"
      >
        {status === 'parsing' ? 'Parsing…' : 'Parse Data'}
      </Button>

      {/* alerts */}
      {status === 'error' && error && (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Parsing Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status === 'success' && (
        <Alert variant="default">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Parsing Successful</AlertTitle>
          <AlertDescription>
            Patient data parsed. Check the facts below.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
