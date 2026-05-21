import { useState, useRef } from 'react';
import { generateKatalonScript } from '../utils/katalonGenerator';
import { parseTxtFile } from '../utils/txtParser';

function BulkUpload() {
  const [testCaseKey, setTestCaseKey] = useState('DGCR-TXXXXX');
  const [testCaseKeyDependency, setTestCaseKeyDependency] = useState('None');
  const [startTcId, setStartTcId] = useState('TC01');
  const [output, setOutput] = useState('');
  const [errors, setErrors] = useState([]);
  const [meta, setMeta] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Parse Start TCID into prefix, starting number, and padding width
  const parseStartTcId = (value) => {
    const match = (value || 'TC01').match(/^([A-Za-z_]*)(\d+)$/);
    if (!match) {
      return { prefix: 'TC', startNum: 1, padWidth: 2 };
    }
    return {
      prefix: match[1] || 'TC',
      startNum: parseInt(match[2], 10),
      padWidth: match[2].length,
    };
  };

  const handleBulkUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Reset file input
    event.target.value = '';

    // Filter only .txt files (case-insensitive: .txt, .TXT, .Txt, etc.)
    const txtFiles = files
      .filter((f) => /\.txt$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (txtFiles.length === 0) {
      setErrors(['No .txt files selected. Please select .txt files.']);
      setOutput('');
      setMeta(null);
      return;
    }

    setIsProcessing(true);
    setErrors([]);
    setOutput('');
    setMeta(null);

    try {
      const allScripts = [];
      const functionCalls = [];
      const allErrors = [];
      let totalHeaders = 0;
      let totalAssertions = 0;
      let successCount = 0;

      const { prefix, startNum, padWidth } = parseStartTcId(startTcId);

      for (let i = 0; i < txtFiles.length; i++) {
        const file = txtFiles[i];
        const tcId = `${prefix}${String(startNum + i).padStart(padWidth, '0')}`;

        let fileContent = '';
        try {
          fileContent = await file.text();
        } catch (readErr) {
          allErrors.push(`${file.name}: Failed to read file — ${readErr.message}`);
        }

        const { curl, responseJson, expectedStatus } = parseTxtFile(fileContent);

        if (!curl.trim()) {
          allErrors.push(`${file.name}: cURL not detected — generated skeleton`);
        }

        const result = generateKatalonScript({
          curl: curl || `curl -X GET 'https://TODO_URL_FROM_${file.name}'`,
          responseJson: responseJson || '{}',
          testCaseId: tcId,
          testCaseKey: testCaseKey || 'DGCR-TXXXXX',
          testCaseKeyDependency: testCaseKeyDependency || 'None',
          expectedStatusCode: expectedStatus || 200,
        });

        // Store function call separately (at the end of each script)
        const scriptLines = result.script.split('\n');
        const lastLine = scriptLines[scriptLines.length - 1];
        if (lastLine && lastLine.includes(`${tcId}(`)) {
          functionCalls.push(lastLine);
          scriptLines.pop();
        }

        allScripts.push(`// ========== ${file.name} (${tcId}) — Status: ${expectedStatus || 200} ==========\n${scriptLines.join('\n')}`);
        totalHeaders += result.headerCount;
        totalAssertions += result.assertionCount;
        successCount++;

        if (result.errors.length > 0) {
          allErrors.push(...result.errors.map((e) => `${file.name}: ${e}`));
        }
      }

      // Combine: function calls first, then all function definitions
      const outputContent = functionCalls.join('\n\n') + '\n\n' + allScripts.join('\n\n');
      setOutput(outputContent);
      setMeta({
        fileCount: txtFiles.length,
        successCount,
        headerCount: totalHeaders,
        assertionCount: totalAssertions,
      });
      setErrors(allErrors);
    } catch (err) {
      setErrors([`Failed to process files: ${err.message}`]);
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
    setOutput('');
    setMeta(null);
    setErrors([]);
  };

  return (
    <div>
      {/* Settings Row */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label htmlFor="bulkTestCaseKey" className="block text-xs font-medium text-gray-400 mb-1">
            Test Case Key
          </label>
          <input
            id="bulkTestCaseKey"
            type="text"
            value={testCaseKey}
            onChange={(e) => setTestCaseKey(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
            placeholder="DGCR-TXXXXX"
          />
        </div>
        <div>
          <label htmlFor="bulkDependency" className="block text-xs font-medium text-gray-400 mb-1">
            Dependency Test Case Key
          </label>
          <input
            id="bulkDependency"
            type="text"
            value={testCaseKeyDependency}
            onChange={(e) => setTestCaseKeyDependency(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
            placeholder="None"
          />
        </div>
        <div>
          <label htmlFor="bulkStartTcId" className="block text-xs font-medium text-gray-400 mb-1">
            Start TCID
          </label>
          <input
            id="bulkStartTcId"
            type="text"
            value={startTcId}
            onChange={(e) => setStartTcId(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
            placeholder="TC01"
          />
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
        <p className="text-sm text-blue-300">
          ℹ Expected Status Code akan diambil dari setiap file setelah text <code className="bg-blue-900/50 px-1 rounded">RESPONSE</code> dan <code className="bg-blue-900/50 px-1 rounded">=====</code> (default: 200)
        </p>
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            if (dt.files.length > 0) {
              handleBulkUpload({ target: { files: dt.files } });
            }
          }}
          className="border-2 border-dashed border-gray-600 hover:border-indigo-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="text-gray-300 font-medium mb-1">
            {isProcessing ? 'Processing...' : 'Click or drag & drop TXT files here'}
          </p>
          <p className="text-xs text-gray-500">
            Select multiple .txt files. Each file = 1 cURL + 1 JSON response = 1 TC function.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.TXT"
          multiple
          className="hidden"
          onChange={handleBulkUpload}
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
          {/* Meta Info */}
          {meta && (
            <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-400">
              <span className="bg-gray-800 px-2 py-1 rounded">
                Files: <span className="text-indigo-400 font-medium">{meta.successCount}/{meta.fileCount}</span>
              </span>
              <span className="bg-gray-800 px-2 py-1 rounded">
                Headers: <span className="text-indigo-400 font-medium">{meta.headerCount}</span>
              </span>
              <span className="bg-gray-800 px-2 py-1 rounded">
                Assertions: <span className="text-indigo-400 font-medium">{meta.assertionCount}</span>
              </span>
            </div>
          )}

          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                Generated Katalon Scripts ({meta?.successCount || 0} functions)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Clear
                </button>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={output}
              className="w-full h-[500px] bg-gray-800 border border-gray-600 rounded-lg p-4 text-sm font-mono text-green-300 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default BulkUpload;
