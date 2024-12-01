importScripts('model.js');

async function queryLLM(prompt, context) {
    console.log('🔍 QueryLLM called with:', { prompt, context });

    const queryExpansion = await queryModel(prompt, context.browserHistory, context.location);

    return queryExpansion;
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
    console.log('🔍 Background Script Active:', request.action, {
        requestKeys: Object.keys(request),
        timestamp: new Date().toISOString()
    });

    // Permission check handler
    if (request.action === 'checkHistoryPermission') {
        chrome.permissions.contains({
            permissions: ['history']
        }, (hasPermission) => {
            sendResponse({ hasPermission });
        });
        return true;
    }

    // History fetch handler
    if (request.action === 'getHistory') {
        chrome.history.search({
            text: '',
            maxResults: 100,
            startTime: Date.now() - (7 * 24 * 60 * 60 * 1000)  // Last 7 days
        }, (historyItems) => {
            sendResponse({
                history: historyItems.map(item => ({
                    url: item.url,
                    title: item.title,
                    lastVisitTime: item.lastVisitTime
                }))
            });
        });
        return true;
    }

    // Query expansion handler
    if (request.action === 'expandQuery') {
        (async () => {
            try {
                // Send message to active tab to get location
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const location = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { action: 'getLocation' }, (response) => {
                        resolve(response?.location || '');
                    });
                });

                console.log('Sending to queryLLM:', {
                    query: request.query,
                    context: {
                        location,
                        browserHistory: request.browserHistory
                    }
                });
                
                const queryExpansion = await queryLLM(
                    request.query,
                    {
                        location,
                        browserHistory: request.browserHistory
                    }
                );
                console.log('Query expansion result:', queryExpansion);
                sendResponse({ expansions: queryExpansion });
            } catch (error) {
                console.error('Error in query expansion:', error);
                sendResponse({ error: error.message });
            }
        })();
        return true;
    }

    // Always return true for async response handling
    return true;
});