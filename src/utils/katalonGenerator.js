import { parseCurl } from './curlParser';
import { generateAssertions } from './responseParser';

/**
 * Generate a Katalon Studio Groovy test method from a cURL command and a
 * sample JSON response.
 *
 * Uses two different templates:
 * - WITH body  (POST/PUT/PATCH): new template with body variable, Counter, result_get_all_message
 * - WITHOUT body (GET/DELETE):   original template with result variable
 */
export function generateKatalonScript({
  curl,
  responseJson,
  testCaseId = 'TC01',
  testCaseKeyDependency = 'None',
  testCaseKey = 'DGCR-TXXXXX',
  testCycleKeyVar = 'testCycleKey',
  requestObjectFolder = 'Object Repository/API Objects - General',
  expectedStatusCode = 200,
}) {
  const errors = [];

  const { method, url, headers, body } = parseCurl(curl);

  // Use placeholder URL if extraction failed
  const finalUrl = url || 'https://api.example.com/TODO_ENDPOINT';
  if (!url) {
    errors.push('Could not detect URL from the cURL command — using placeholder.');
  }

  const requestObjectPath = `${requestObjectFolder}/${method} Request`;
  const statusCode = Number(expectedStatusCode) || 200;

  let script;

  if (body) {
    // ── Template WITH body ──────────────────────────────────────────────────
    const { assertions, error: respError } = generateAssertions(responseJson, {
      rootVar: 'result_get_all_message',
      useToString: false,
      quoteStyle: 'double',
    });
    if (respError) errors.push(respError);

    const headersLines = Object.entries(headers)
      .map(
        ([k, v]) =>
          `\t\t\t\t\thttpHeaderProperties.add(new TestObjectProperty("${escapeJavaString(k)}", ConditionType.EQUALS, '${escapeGroovySingle(v)}'))`
      )
      .join('\n\t\t\t\t\t\n');

    const headersBlock = headersLines || `\t\t\t\t\t// No headers detected from the cURL command`;

    const assertionsBlock =
      assertions.length > 0
        ? assertions.map((a) => `\t\t\t\t\t${a}`).join('\n\t\t\t\t\t\n')
        : `\t\t\t\t\t// No status fields detected in the response example`;

    script = `def ${testCaseId}(TestCaseKeyDepedency, TestCaseKey, TestCycleKey) {
\tWebUI.comment('Memulai eksekusi test case id ${testCaseId} dan test case key '+TestCaseKey)
\tdef startExecutionDateTime = CustomKeywords.'webKeywords.CustomKeywords.getDate'()
\t
\tdef endExecutionDateTime, setExecutionResult, actualExecutionStatus, message, DepedencyTestCaseAction, RetestAction, strPathScreenShot
\t
\tdef arrpathScreenShot = []
\t
\tif(GlobalVariable.debug) {
\t\tDepedencyTestCaseAction = false
\t\tRetestAction = true
\t\tTestCaseKey = GlobalVariable.tcKeyDummy
\t\tTestCycleKey = GlobalVariable.cycleKeyDummy
\t} else {
\t\tDepedencyTestCaseAction = RetestAction = false
\t\tDepedencyTestCaseAction = CustomKeywords.'webKeywords.CustomKeywords.DepedencyTestCaseAction'(TestCaseKeyDepedency, TestCaseKey, TestCycleKey, startExecutionDateTime, environment, executedBy, jiraSendReport)
\t\tRetestAction = CustomKeywords.'webKeywords.CustomKeywords.RetestAction'(TestCaseKey, TestCycleKey)
\t}
\t
\tif(DepedencyTestCaseAction == false)
\t{
\t\tif(RetestAction == true) {
\t\t\tdef Counter = 0
\t\t\ttry {
\t\t\t\t
\t\t\t\tWebUI.delay(2)
\t\t\t\t
\t\t\t\tString body = '${escapeGroovySingle(body)}'
\t\t\t\t
\t\t\t\tRequestObject object = findTestObject('${escapeGroovySingle(requestObjectPath)}', [('body') : body])
\t\t\t\t
\t\t\t\tobject.setRestUrl('${escapeGroovySingle(finalUrl)}')
\t\t\t\t
\t\t\t\t'Add Header'
\t\t\t\t
\t\t\t\tList<TestObjectProperty> httpHeaderProperties = new ArrayList<>()
\t\t\t\t
${headersBlock}
\t\t\t\t
\t\t\t\tobject.setHttpHeaderProperties(httpHeaderProperties)
\t\t\t\t
\t\t\t\tdef response = WS.sendRequest(object)
\t\t\t\t
\t\t\t\tprintln response.getResponseText()
\t\t\t\t
\t\t\t\tdef slurper_get_all_message = new groovy.json.JsonSlurper()
\t\t\t\t
\t\t\t\tdef result_get_all_message = slurper_get_all_message.parseText(response.getResponseBodyContent())
\t\t\t\t
\t\t\t\tprintln result_get_all_message.status_desc
\t\t\t\t
\t\t\t\tWS.verifyResponseStatusCode(response, ${statusCode})
\t\t\t\t
${assertionsBlock}
\t\t\t\t
\t\t\t\tif((TestCaseKey != 'dummy') && (TestCycleKey != 'dummy') && (jiraSendReport)) {
\t\t\t\t\tmessage = result_get_all_message
\t\t\t\t\tdef setPass = CustomKeywords.'webKeywords.CustomKeywords.setPass'(startExecutionDateTime, TestCaseKey, TestCycleKey, arrpathScreenShot, message, environment, executedBy)
\t\t\t\t\tsetExecutionResult = setPass
\t\t\t\t}
\t\t\t} catch (Exception e) {
\t\t\t\t
\t\t\t\tif((TestCaseKey != 'dummy') && (TestCycleKey != 'dummy') && (jiraSendReport)) {
\t\t\t\t\tmessage = e.toString()
\t\t\t\t\tdef setFail = CustomKeywords.'webKeywords.CustomKeywords.setFail'(startExecutionDateTime, TestCaseKey, TestCycleKey, arrpathScreenShot, message, environment, executedBy)
\t\t\t\t\tsetExecutionResult = setFail
\t\t\t\t}
\t\t\t}
\t\t}
\t\t
\t}
}

${testCaseId}('${escapeGroovySingle(testCaseKeyDependency)}', '${escapeGroovySingle(testCaseKey)}', ${testCycleKeyVar})`;

  } else {
    // ── Template WITHOUT body ───────────────────────────────────────────────
    const { assertions, error: respError } = generateAssertions(responseJson, {
      rootVar: 'result',
      useToString: true,
      quoteStyle: 'single',
    });
    if (respError) errors.push(respError);

    const headersLines = Object.entries(headers)
      .map(
        ([k, v]) =>
          `\t\t\t\thttpHeaderProperties.add(new TestObjectProperty("${escapeJavaString(k)}", ConditionType.EQUALS, '${escapeGroovySingle(v)}'))`
      )
      .join('\n');

    const headersBlock = headersLines || `\t\t\t\t// No headers detected from the cURL command`;

    const assertionsBlock =
      assertions.length > 0
        ? assertions.map((a) => `\t\t\t\t${a}`).join('\n')
        : `\t\t\t\t// No status fields detected in the response example`;

    script = `def ${testCaseId}(TestCaseKeyDepedency, TestCaseKey, TestCycleKey) {
\tWebUI.comment('Memulai eksekusi test case id ${testCaseId} dan test case key ' + TestCaseKey)
\tdef startExecutionDateTime = CustomKeywords.'webKeywords.CustomKeywords.getDate'()
\tdef endExecutionDateTime, setExecutionResult, actualExecutionStatus, message, DepedencyTestCaseAction, RetestAction, strPathScreenShot
\tdef arrpathScreenShot = []

\tif (GlobalVariable.debug) {
\t\tDepedencyTestCaseAction = false; RetestAction = true
\t\tTestCaseKey = GlobalVariable.tcKeyDummy; TestCycleKey = GlobalVariable.cycleKeyDummy
\t} else {
\t\tDepedencyTestCaseAction = RetestAction = false
\t\tDepedencyTestCaseAction = CustomKeywords.'webKeywords.CustomKeywords.DepedencyTestCaseAction'(TestCaseKeyDepedency, TestCaseKey, TestCycleKey, startExecutionDateTime, environment, executedBy, jiraSendReport)
\t\tRetestAction = CustomKeywords.'webKeywords.CustomKeywords.RetestAction'(TestCaseKey, TestCycleKey)
\t}

\tif (DepedencyTestCaseAction == false) {
\t\tif (RetestAction == true) {
\t\t\ttry {
\t\t\t\tWebUI.delay(2)
\t\t\t\tRequestObject object = findTestObject('${escapeGroovySingle(requestObjectPath)}')
\t\t\t\tString url = '${escapeGroovySingle(finalUrl)}'
\t\t\t\tobject.setRestUrl(url)
\t\t\t\tList<TestObjectProperty> httpHeaderProperties = new ArrayList<>()
${headersBlock}
\t\t\t\tobject.setHttpHeaderProperties(httpHeaderProperties)
\t\t\t\tdef response = WS.sendRequest(object)
\t\t\t\tprintln response.getResponseText()
\t\t\t\tdef slurper = new groovy.json.JsonSlurper()
\t\t\t\tdef result = slurper.parseText(response.getResponseBodyContent())
\t\t\t\tprintln result
\t\t\t\tWS.verifyResponseStatusCode(response, ${statusCode})
${assertionsBlock}
\t\t\t\tif ((TestCaseKey != 'dummy') && (TestCycleKey != 'dummy') && (jiraSendReport)) {
\t\t\t\t\tmessage = result
\t\t\t\t\tdef setPass = CustomKeywords.'webKeywords.CustomKeywords.setPass'(startExecutionDateTime, TestCaseKey, TestCycleKey, arrpathScreenShot, message, environment, executedBy)
\t\t\t\t\tsetExecutionResult = setPass
\t\t\t\t}
\t\t\t} catch (Exception e) {
\t\t\t\tif ((TestCaseKey != 'dummy') && (TestCycleKey != 'dummy') && (jiraSendReport)) {
\t\t\t\t\tmessage = e.toString()
\t\t\t\t\tdef setFail = CustomKeywords.'webKeywords.CustomKeywords.setFail'(startExecutionDateTime, TestCaseKey, TestCycleKey, arrpathScreenShot, message, environment, executedBy)
\t\t\t\t\tsetExecutionResult = setFail
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}

${testCaseId}('${escapeGroovySingle(testCaseKeyDependency)}', '${escapeGroovySingle(testCaseKey)}', ${testCycleKeyVar})`;
  }

  return {
    script,
    method,
    url: finalUrl,
    headerCount: Object.keys(headers).length,
    assertionCount: 0,
    errors,
  };
}

function escapeGroovySingle(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeJavaString(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
