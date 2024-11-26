const API_ENDPOINT = 'https://your-llm-api-endpoint.com/generate';

async function queryLLM(prompt, context) {
  console.log('QueryLLM input:', { 
    prompt,
    context,
    historyLength: context.browserHistory?.length || 0
  });
  
  console.log('QueryLLM called with:', { prompt, context });
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  return "This is a test response for: " + prompt;
}

async function suggestionLLM(pageContent) {
    console.log('🤖 SuggestionLLM called with content length:', pageContent.length);
    
    // Mock response for testing - remove process.env check
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `1. First related topic about: ${pageContent.slice(0, 50)}...
2. Second related topic
3. Third related topic
4. Fourth related topic
5. Fifth related topic`;

    // Comment out the real implementation for now
    /*
    try {
        const response = await fetch(API_ENDPOINT...
    */
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Detailed request inspection
  console.log('🔍 Full request details:', {
    requestKeys: Object.keys(request),
    rawRequest: request,
    browserHistory: request.browserHistory,
    timestamp: new Date().toISOString()
  });
  
  console.warn('Background Script Active:', request.action);
  
  if (request.action === 'expandQuery') {
    (async () => {
      try {
        console.log('Sending to queryLLM:', {
          query: request.query,
          context: {
            location: request.location,
            browserHistory: request.browserHistory
          }
        });
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
        const relatedTopics = await suggestionLLM(request.pageText);
        sendResponse({ topics: relatedTopics });
      } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'getHistory') {
    chrome.history.search({
      text: '',
      maxResults: 10,
      startTime: Date.now() - (7 * 24 * 60 * 60 * 1000)
    }, (historyItems) => {
      sendResponse({
        history: historyItems.map(item => item.url)
      });
    });
    return true; // Required for async response
  }

  return true;
});