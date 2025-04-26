'use client';

import { useState, ChangeEvent, DragEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

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
        <Label htmlFor="file-upload" className="cursor-pointer">
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

      {/* textarea */}
      <div>
        <Label htmlFor="text-paste">Paste FHIR JSON or CCD XML content</Label>
        <Textarea
          id="text-paste"
          placeholder="Paste your JSON or XML here..."
          rows={8}
          value={pastedText}
          onChange={handleTextChange}
          className="mt-1"
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
          <Terminal className="h-4 w-4" />
          <AlertTitle>Parsing Successful</AlertTitle>
          <AlertDescription>
            Patient data parsed. Check the facts below.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// 'use client';

// import { useState, ChangeEvent, DragEvent } from 'react';
// import { createClient } from '@/lib/supabase/client';
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// import { Terminal } from "lucide-react"; // For alert icon

// type ParseStatus = 'idle' | 'parsing' | 'success' | 'error';

// interface UploadDataProps {
//   onParseSuccess: (data: Record<string, unknown>) => void;
//   // Add other props as needed, e.g., onParseError
// }

// export function UploadData({ onParseSuccess }: UploadDataProps) {
//   const supabase = createClient();
//   const [pastedText, setPastedText] = useState<string>('');
//   const [selectedFile, setSelectedFile] = useState<File | null>(null);
//   const [status, setStatus] = useState<ParseStatus>('idle');
//   const [error, setError] = useState<string | null>(null);
//   const [dragActive, setDragActive] = useState(false);

//   const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
//     if (event.target.files && event.target.files[0]) {
//       setSelectedFile(event.target.files[0]);
//       setPastedText(''); // Clear pasted text if file is selected
//       setStatus('idle');
//       setError(null);
//     }
//   };

//   const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
//     setPastedText(event.target.value);
//     setSelectedFile(null); // Clear file if text is pasted
//     setStatus('idle');
//     setError(null);
//   };

//   // Handle drag events
//   const handleDrag = (e: DragEvent) => {
//     e.preventDefault();
//     e.stopPropagation();
//     if (e.type === "dragenter" || e.type === "dragover") {
//       setDragActive(true);
//     } else if (e.type === "dragleave") {
//       setDragActive(false);
//     }
//   };

//   // Handle dropped files
//   const handleDrop = (e: DragEvent) => {
//     e.preventDefault();
//     e.stopPropagation();
//     setDragActive(false);
//     if (e.dataTransfer.files && e.dataTransfer.files[0]) {
//       setSelectedFile(e.dataTransfer.files[0]);
//       setPastedText(''); // Clear pasted text
//       setStatus('idle');
//       setError(null);
//       // You might want to trigger parse automatically here or just select the file
//     }
//   };

//   const handleParse = async () => {
//     setStatus('parsing');
//     setError(null);
//     let fileContent: string | ArrayBuffer | null = null;
//     let contentType: string | null = null;
//     let isJson = false;

//     try {
//       if (selectedFile) {
//         contentType = selectedFile.type;
//         if (contentType === 'application/json') {
//           isJson = true;
//           fileContent = await selectedFile.text(); // Read as text first for JSON parsing
//         } else if (contentType === 'application/xml' || contentType === 'text/xml') {
//           fileContent = await selectedFile.text();
//         } else {
//           throw new Error(`Unsupported file type: ${contentType}. Please upload XML or JSON.`);
//         }
//       } else if (pastedText) {
//         // Try to auto-detect content type from pasted text
//         const trimmedText = pastedText.trim();
//         if (trimmedText.startsWith('<') && trimmedText.endsWith('>')) {
//           contentType = 'application/xml';
//           fileContent = pastedText;
//         } else if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
//           contentType = 'application/json';
//           isJson = true;
//           fileContent = pastedText;
//         } else {
//           throw new Error('Could not auto-detect content type from pasted text. Please ensure it is valid XML or JSON.');
//         }
//       } else {
//         throw new Error('No file selected or text pasted.');
//       }

//       // Prepare body based on content type
//       let requestBody: string;
//       if (isJson) {
//           try {
//               // Parse to validate but then stringify to send
//               const parsedJson = JSON.parse(fileContent as string);
//               requestBody = JSON.stringify(parsedJson);
//           } catch (jsonError: unknown) {
//               const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
//               throw new Error(`Invalid JSON format: ${message}`);
//           }
//       } else {
//           requestBody = fileContent as string;
//       }

//       console.log(`Invoking parse-ccd with Content-Type: ${contentType}`);
//       // ---- START DEBUG LOG ----
//       console.log("DEBUG: Request Body Type:", typeof requestBody);
//       console.log("DEBUG: Request Body Length:", requestBody.length);
//       console.log("DEBUG: Request Body Snippet:", requestBody.substring(0, 100) + '...');
//       console.log("DEBUG: Content-Type Header being sent:", contentType);
//       // ---- END DEBUG LOG ----

//       // Ensure the body is non-empty
//       if (!requestBody || requestBody.trim() === '') {
//         throw new Error('Empty content detected. Please provide valid XML or JSON data.');
//       }

//       console.log("Attempting to invoke parse-ccd with length:", requestBody.length);
      
//       // Use Supabase's approach to sending data (it handles JSON encoding)
//       // Based on: https://stackoverflow.com/questions/74696640/supabase-edge-function-says-no-body-was-passed
//       const { data, error: invokeError } = await supabase.functions.invoke('parse-ccd', {
//         // Don't stringify - let Supabase handle it
//         body: isJson 
//           ? JSON.parse(requestBody) // For JSON, parse first so Supabase encodes properly
//           : requestBody, // For XML, send as text
//         headers: {
//           'Content-Type': contentType || 'text/plain',
//         },
//       });

//       if (invokeError) {
//         throw invokeError;
//       }

//       console.log('parse-ccd success:', data);
//       setStatus('success');
//       onParseSuccess(data); // Pass data to parent

//     } catch (err: any) {
//       console.error('Error parsing data:', err);
//       // Check if the error from Supabase function has a specific structure
//       const errorMessage = err?.message || (typeof err === 'object' && err !== null && 'error' in err ? err.error : 'An unknown error occurred during parsing.');
//       setError(String(errorMessage)); // Ensure error is a string
//       setStatus('error');
//     }
//   };

//   return (
//     <div className="space-y-4">
//       <div 
//         className={`border-2 border-dashed rounded-lg p-6 text-center ${dragActive ? 'border-primary bg-muted' : 'border-border'}`}
//         onDragEnter={handleDrag}
//         onDragLeave={handleDrag}
//         onDragOver={handleDrag}
//         onDrop={handleDrop}
//       >
//         <Label htmlFor="file-upload" className="cursor-pointer">
//           <div className="mb-2 text-sm text-muted-foreground">
//             {selectedFile 
//               ? `Selected: ${selectedFile.name}` 
//               : "Drag & drop your CCD XML or FHIR JSON file here, or click to select"}
//           </div>
//           <Input 
//             id="file-upload" 
//             type="file" 
//             className="sr-only" // Hide default input, use label for interaction 
//             onChange={handleFileChange} 
//             accept=".xml, application/xml, text/xml, .json, application/json" 
//           />
//            {!selectedFile && <span className="text-primary font-medium">Browse files</span>}
//         </Label>
//       </div>

//       <div className="text-center text-sm text-muted-foreground">OR</div>

//       <div>
//         <Label htmlFor="text-paste">Paste FHIR JSON or CCD XML content</Label>
//         <Textarea
//           id="text-paste"
//           placeholder="Paste your JSON or XML here..."
//           rows={8}
//           value={pastedText}
//           onChange={handleTextChange}
//           className="mt-1"
//         />
//       </div>

//       <Button 
//         onClick={handleParse} 
//         disabled={status === 'parsing' || (!selectedFile && !pastedText)}
//         className="w-full"
//       >
//         {status === 'parsing' ? 'Parsing...' : 'Parse Data'}
//       </Button>

//       {status === 'error' && error && (
//         <Alert variant="destructive">
//           <Terminal className="h-4 w-4" />
//           <AlertTitle>Parsing Failed</AlertTitle>
//           <AlertDescription>{error}</AlertDescription>
//         </Alert>
//       )}
//       {status === 'success' && (
//          <Alert variant="default"> 
//            <Terminal className="h-4 w-4" />
//            <AlertTitle>Parsing Successful</AlertTitle>
//            <AlertDescription>Patient data parsed. Check the facts below.</AlertDescription>
//          </Alert>
//       )}

//     </div>
//   );
// }
