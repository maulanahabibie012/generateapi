import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { generateKatalonScript } from './utils/katalonGenerator';
import { parseTxtFile } from './utils/txtParser';

function App() {
  const [curlInput, setCurlInput] = useState('');
  const [responseInput, setResponseInput] = useState('');
  const [testCaseId, setTestCaseId] = useState('TC01');
  const [testCaseKey, setTestCaseKey] = useState('DGCR-TXXXXX');
  const [testCaseKeyDependency, setTestCaseKeyDependency] = useState('None');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [output, setOutput] = useState('');
  const [meta, setMeta] = useState(null);
  const [errors, setErrors] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const handleGenerate = () => {
    if (!curlInput.trim()) {
      setErrors(['Please provide a cURL command.']);
      setOutput('');
      setMeta(null);
      return;
    }

    const result = generateKatalonScript({
      curl: curlInput,
      responseJson: responseInput.trim() || '{}',
      testCaseId: testCaseId || 'TC01',
      testCaseKey: testCaseKey || 'DGCR-TXXXXX',
      testCaseKeyDependency: testCaseKeyDependency || 'None',
      expectedStatusCode: expectedStatus || 200,
    });

    setOutput(result.script);
    setMeta({
      method: result.method,
      url: result.url,
      headerCount: result.headerCount,
      assertionCount: result.assertionCount,
    });
    setErrors(result.errors);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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
    setCurlInput('');
    setResponseInput('');
    setTestCaseId('TC01');
    setTestCaseKey('DGCR-TXXXXX');
    setTestCaseKeyDependency('None');
    setExpectedStatus('200');
    setOutput('');
    setMeta(null);
    setErrors([]);
  };

  const handleZipUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';

    if (!file.name.endsWith('.zip')) {
      setErrors(['Please upload a ZIP file. RAR files are not supported in the browser.']);
      return;
    }

    setIsProcessing(true);
    setErrors([]);
    setOutput('');
    setMeta(null);

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);

      const txtFiles = Object.keys(contents.files)
        .filter((name) => name.endsWith('.txt') && !contents.files[name].dir)
        .sort();

      if (txtFiles.length === 0) {
        setErrors(['No .txt files found in the ZIP archive.']);
        setIsProcessing(false);
        return;
      }

      const allScripts = [];
      const allErrors = [];
      let totalHeaders = 0;
      let totalAssertions = 0;

      for (let i = 0; i < txtFiles.length; i++) {
        const fileName = txtFiles[i];
        const fileContent = await contents.files[fileName].async('string');
        const { curl, responseJson } = parseTxtFile(fileContent);

        if (!curl.trim()) {
          allErrors.push(`${fileName}: No cURL command found`);
          continue;
        }

        const tcId = `TC${String(i + 1).padStart(2, '0')}`;
        const result = generateKatalonScript({
          curl,
          responseJson: responseJson || '{}',
          testCaseId: tcId,
          testCaseKey: testCaseKey || 'DGCR-TXXXXX',
          testCaseKeyDependency: testCaseKeyDependency || 'None',
          expectedStatusCode: expectedStatus || 200,
        });

        allScripts.push(`// ========== ${fileName} (${tcId}) ==========\n${result.script}`);
        totalHeaders += result.headerCount;
        totalAssertions += result.assertionCount;

        if (result.errors.length > 0) {
          allErrors.push(...result.errors.map((e) => `${fileName}: ${e}`));
        }
      }

      setOutput(allScripts.join('\n\n'));
      setMeta({
        method: 'BATCH',
        url: `${txtFiles.length} files processed`,
        headerCount: totalHeaders,
        assertionCount: totalAssertions,
      });
      setErrors(allErrors);
    } catch (err) {
      setErrors([`Failed to process ZIP file: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            K
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Katalon API Script Generator</h1>
            <p className="text-xs text-gray-400">Convert cURL + Response to Katalon Studio Groovy Script</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Settings Row */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label htmlFor="testCaseId" className="block text-xs font-medium text-gray-400 mb-1">
              Test Case ID
            </label>
            <input
              id="testCaseId"
              type="text"
              value={testCaseId}
              onChange={(e) => setTestCaseId(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
              placeholder="TC01"
            />
          </div>
          <div>
            <label htmlFor="testCaseKey" className="block text-xs font-medium text-gray-400 mb-1">
              Test Case Key
            </label>
            <input
              id="testCaseKey"
              type="text"
              value={testCaseKey}
              onChange={(e) => setTestCaseKey(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              placeholder="DGCR-TXXXXX"
            />
          </div>
          <div>
            <label htmlFor="testCaseKeyDependency" className="block text-xs font-medium text-gray-400 mb-1">
              Dependency Test Case Key
            </label>
            <input
              id="testCaseKeyDependency"
              type="text"
              value={testCaseKeyDependency}
              onChange={(e) => setTestCaseKeyDependency(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
              placeholder="None"
            />
          </div>
          <div>
            <label htmlFor="expectedStatus" className="block text-xs font-medium text-gray-400 mb-1">
              Expected Status Code
            </label>
            <input
              id="expectedStatus"
              type="text"
              value={expectedStatus}
              onChange={(e) => setExpectedStatus(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-24"
              placeholder="200"
            />
          </div>
        </div>

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* cURL Input */}
          <div>
            <label htmlFor="curlInput" className="block text-sm font-medium text-gray-300 mb-2">
              cURL Command
            </label>
            <textarea
              id="curlInput"
              value={curlInput}
              onChange={(e) => setCurlInput(e.target.value)}
              className="w-full h-64 bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm font-mono text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
              placeholder={`curl -X GET 'https://api.example.com/endpoint' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer token123'`}
            />
          </div>

          {/* Response Input */}
          <div>
            <label htmlFor="responseInput" className="block text-sm font-medium text-gray-300 mb-2">
              Example API Response (JSON)
            </label>
            <textarea
              id="responseInput"
              value={responseInput}
              onChange={(e) => setResponseInput(e.target.value)}
              className="w-full h-64 bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm font-mono text-gray-200 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
              placeholder={`{\n  "meta": {\n    "status_code": "00000",\n    "status_desc": "Success"\n  },\n  "data": { ... }\n}`}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={handleGenerate}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Generate Script
          </button>
          <button
            onClick={handleClear}
            className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Clear All
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            {isProcessing ? 'Processing...' : 'Upload ZIP File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleZipUpload}
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
                <span className="bg-gray-800 px-2 py-1 rounded">Method: <span className="text-indigo-400 font-medium">{meta.method}</span></span>
                <span className="bg-gray-800 px-2 py-1 rounded">Headers: <span className="text-indigo-400 font-medium">{meta.headerCount}</span></span>
                <span className="bg-gray-800 px-2 py-1 rounded">Assertions: <span className="text-indigo-400 font-medium">{meta.assertionCount}</span></span>
              </div>
            )}

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Generated Katalon Script (Groovy)</label>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
              <pre className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-sm font-mono text-green-300 overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre">
                {output}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-500">
          Katalon API Script Generator &mdash; Built with React + Vite + Tailwind CSS
        </div>
      </footer>
    </div>
  );
}

export default App;
