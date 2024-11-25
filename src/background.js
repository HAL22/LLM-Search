const API_ENDPOINT = 'https://your-llm-api-endpoint.com/generate';

async function queryLLM(prompt, context) {
  console.log('QueryLLM called with:', { prompt, context });
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return "This is a test response for: " + prompt;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'expandQuery') {
    // Handle the async operation
    (async () => {
      try {
        const queryExpansion = await queryLLM(
          request.query,
          {
            location: request.location,
            browserHistory: request.browserHistory
          }
        );
        console.log('Query expansion result:', queryExpansion);
        sendResponse({ expansions: queryExpansion });
      } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ error: error.message });
      }
    })();
    
    // Must return true to indicate async response
    return true;
  }

  if (request.action === 'getRelatedTopics') {
    (async () => {
      try {
        const relatedTopics = await queryLLM(
          'Generate related search topics based on this text:', 
          { pageContent: request.pageText }
        );
        sendResponse({ topics: relatedTopics });
      } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  return true;
});