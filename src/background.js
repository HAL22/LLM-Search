importScripts('model.js');

async function queryLLM(prompt, context) {
    console.log('🔍 QueryLLM called with:', { prompt, context });

    const queryExpansion = await queryModel(prompt, {
        location: context.location,
        browserHistory: context.browserHistory
    });

    return queryExpansion;
}

async function suggestionLLM(pageContent) {
    console.log('🤖 SuggestionLLM called with content length:', pageContent.length);

    const suggestion = await suggestTopicsModel(pageContent);
    
    // Ensure we're working with a string response
    if (typeof suggestion === 'object') {
        return suggestion.join(', ');
    }
    
    return suggestion;
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
                const location = request.location;
                console.log('Background received location:', location); // Debug log
                
                const queryExpansion = await queryLLM(
                    request.query,
                    {
                        location: location,
                        browserHistory: request.browserHistory || []
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

    // Suggestion handler
    if (request.action === 'getSuggestions') {
        (async () => {
            try {
                console.log('Starting suggestion processing for content length:', request.pageContent?.length);
                const suggestions = await suggestionLLM(request.pageContent);
                console.log('Suggestion results:', suggestions);
                if (!suggestions) {
                    throw new Error('No suggestions received from model');
                }
                sendResponse({ suggestions, success: true });
            } catch (error) {
                console.error('Error getting suggestions:', error);
                sendResponse({ error: error.message, success: false });
            }
        })();
        return true;
    }

    // Related topics handler
    if (request.action === 'getRelatedTopics') {
        (async () => {
            try {
                console.log('Starting suggestion processing for content length:', request.pageText?.length);
                const suggestions = await suggestionLLM(request.pageText);
                console.log('Suggestion results:', suggestions);
                if (!suggestions) {
                    throw new Error('No suggestions received from model');
                }
                
                // First ensure we're working with a string and split it
                const suggestionsStr = typeof suggestions === 'string' ? suggestions : suggestions.toString();
                const topicsList = suggestionsStr.split(',').map(topic => topic.trim());
                
                // Format suggestions into list with Google search links
                const formattedTopics = topicsList.map(topic => ({
                    text: topic,
                    searchUrl: `https://www.google.com/search?q=${encodeURIComponent(topic)}`
                }));
                
                sendResponse({ topics: formattedTopics, success: true });
            } catch (error) {
                console.error('Error getting suggestions:', error);
                sendResponse({ error: error.message, success: false });
            }
        })();
        return true;
    }

    // Always return true for async response handling
    return true;
});