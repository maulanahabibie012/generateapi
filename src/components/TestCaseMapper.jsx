import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

function TestCaseMapper() {
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrors(['Please upload an Excel file (.xlsx or .xls)']);
      return;
    }

    if (!inputText.trim()) {
      setErrors(['Please provide input text with TCID format before uploading Excel file']);
      return;
    }

    setIsProcessing(true);
    setErrors([]);
    setOutput('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Find column indices
      const headerRow = jsonData[0];
      const testCaseIdColIndex = headerRow.findIndex(h =>
        h && h.toString().toLowerCase().includes('test case id')
      );
      const testCaseKeyColIndex = headerRow.findIndex(h => {
        const headerLower = h && h.toString().toLowerCase();
        return headerLower && (
          headerLower.includes('test case.key') ||
          headerLower.includes('test case key')
        );
      });

      if (testCaseIdColIndex === -1 || testCaseKeyColIndex === -1) {
        setErrors(['Could not find "Test Case ID" or "Test Case.Key" columns in Excel file']);
        setIsProcessing(false);
        return;
      }

      // Build mapping: TCID -> TestCaseKey
      const mapping = {};
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const tcid = row[testCaseIdColIndex];
        const key = row[testCaseKeyColIndex];
        if (tcid && key) {
          mapping[tcid.toString().trim()] = key.toString().trim();
        }
      }

      // Process input text
      const lines = inputText.split('\n');
      const outputLines = [];
      const allErrors = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          outputLines.push('');
          continue;
        }

        // Match pattern: TCID(dependency, DGCR-TXXXXX, TestCycleKey)
        const match = trimmed.match(/^(\w+)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
        
        if (!match) {
          outputLines.push(trimmed);
          allErrors.push(`Line "${trimmed}" does not match expected format: TCID(dependency, DGCR-TXXXXX, TestCycleKey)`);
          continue;
        }

        const [, tcid, dependency, oldKey, testCycleKey] = match;
        
        if (mapping[tcid]) {
          const newKey = mapping[tcid];
          const newLine = `${tcid}(${dependency}, ${newKey}, ${testCycleKey})`;
          outputLines.push(newLine);
        } else {
          outputLines.push(trimmed);
          allErrors.push(`TCID "${tcid}" not found in Excel file`);
        }
      }

      setOutput(outputLines.join('\n'));
      setErrors(allErrors);
    } catch (err) {
      setErrors([`Failed to process Excel file: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = output;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutput('');
    setErrors([]);
  };

  return (
    <div>
      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
        <p className="text-sm text-blue-300 mb-2">
          <strong>Format Input:</strong> <code className="bg-blue-900/50 px-1 rounded">TCID(dependency, DGCR-TXXXXX, TestCycleKey)</code>
        </p>
        <p className="text-sm text-blue-300">
          <strong>Excel Format:</strong> Kolom "Test Case.Test Case ID" dan "Test Case.Key" akan digunakan untuk mapping
        </p>
      </div>

      {/* Input Section */}
      <div className="mb-6">
        <label htmlFor="inputText" className="block text-sm font-medium text-gray-300 mb-2">
          Input Text (Format: TCID(dependency, DGCR-TXXXXX, TestCycleKey))
        </label>
        <textarea
          id="inputText"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full h-64 bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm font-mono text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
          placeholder={`TC01(None, DGCR-T00001, testCycleKey)\nTC02(TC01, DGCR-T00002, testCycleKey)\nTC03(TC02, DGCR-T00003, testCycleKey)`}
        />
      </div>

      {/* Upload Button */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || !inputText.trim()}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          {isProcessing ? 'Processing...' : 'Upload Excel & Map'}
        </button>
        <button
          onClick={handleClear}
          className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          Clear All
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleExcelUpload}
          disabled={isProcessing}
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-300">⚠ {err}</p>
          ))}
        </div>
      )}

      {/* Output Section */}
      {output && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Mapped Output
            </label>
            <button
              onClick={handleCopy}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
          <textarea
            readOnly
            value={output}
            className="w-full h-64 bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm font-mono text-green-300 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  );
}

export default TestCaseMapper;
