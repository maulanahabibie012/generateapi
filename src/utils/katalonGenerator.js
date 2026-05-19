import { parseCurl } from './curlParser';
import { generateAssertions } from './responseParser';

/**
 * Generate a Katalon Studio Groovy test method from a cURL command and a
 * sample JSON response, following the predefined Telkomsel-style template.
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

  const { assertions, error: respError } = generateAssertions(responseJson);
  if (respError) errors.push(respError);

  const requestObjectPath = `${requestObjectFolder}/${method} Request`;

  const headersCode = Object.entries(headers)
    .map(
      ([k, v]) =>
        `\t\t\t\thttpHeaderProperties.add(new TestObjectProperty("${escapeJavaString(
          k
        )}", ConditionType.EQUALS, '${escapeGroovySingle(v)}'))`
    )
    .join('\n');

  const headersBlock =
    headersCode ||
    `\t\t\t\t// No headers detected from the cURL command`;

  const bodyBlock = body
    ? `\n\t\t\t\tobject.setBodyContent(new com.kms.katalon.core.testobject.impl.HttpTextBodyContent('${escapeGroovySingle(
        body
      )}', 'UTF-8', 'application/json'))`
    : '';

  const assertionsBlock =
    assertions.length > 0
      ? assertions.map((a) => `\t\t\t\t${a}`).join('\n')
      : `\t\t\t\t// No scalar fields detected in the response example`;

  const script = `def ${testCaseId}(TestCaseKeyDepedency, TestCaseKey, TestCycleKey) {
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
\t\t\t\tobject.setHttpHeaderProperties(httpHeaderProperties)${bodyBlock}
\t\t\t\tdef response = WS.sendRequest(object)
\t\t\t\tprintln response.getResponseText()
\t\t\t\tdef slurper = new groovy.json.JsonSlurper()
\t\t\t\tdef result = slurper.parseText(response.getResponseBodyContent())
\t\t\t\tprintln result
\t\t\t\tWS.verifyResponseStatusCode(response, ${Number(expectedStatusCode) || 200})
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

  return {
    script,
    method,
    url: finalUrl,
    headerCount: Object.keys(headers).length,
    assertionCount: assertions.length,
    errors,
  };
}

function escapeGroovySingle(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeJavaString(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
