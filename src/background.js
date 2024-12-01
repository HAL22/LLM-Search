importScripts('model.js');

const summaryCache = new Map();
const requestQueue = [];
let isProcessing = false;

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

    // Summary handler
    if (request.action === 'getSummary') {
        (async () => {
            try {
                // Check cache first
                if (summaryCache.has(request.url)) {
                    console.log('Returning cached summary for:', request.url);
                    sendResponse({ summary: summaryCache.get(request.url), success: true });
                    return;
                }

                console.log('Fetching content for:', request.url);
                const response = await fetch(request.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const text = await response.text();
                
                // Enhanced content cleaning and reduction
                let content = text
                    // Remove scripts, styles, and other non-content elements
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
                    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
                    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
                    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
                    // Remove HTML comments
                    .replace(/<!--[\s\S]*?-->/g, '')
                    // Remove remaining HTML tags
                    .replace(/<[^>]+>/g, ' ')
                    // Remove special characters and extra whitespace
                    .replace(/&[a-z]+;/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                // Extract the most relevant content
                const paragraphs = content
                    .split(/[.!?]+/)
                    .filter(sentence => {
                        // Filter out short sentences and likely navigation/menu items
                        return sentence.length > 40 && 
                               sentence.length < 300 && 
                               !sentence.includes('cookie') &&
                               !sentence.includes('menu') &&
                               !sentence.includes('search');
                    })
                    .slice(0, 5) // Take only first 5 meaningful sentences
                    .join('. ');

                // Limit content length to 1000 characters
                content = paragraphs.slice(0, 1000);
                
                console.log('Processed content length:', content.length);
                
                // Get summary using the model
                console.log('Requesting summary from model...');
                const summary = await summaryModel(content);
                
                if (!summary) {
                    throw new Error('No summary generated');
                }

                // Cache the result
                summaryCache.set(request.url, summary);
                
                // Cleanup old cache entries after 5 minutes
                setTimeout(() => summaryCache.delete(request.url), 5 * 60 * 1000);
                
                sendResponse({ summary, success: true });
            } catch (error) {
                console.error('Error processing URL:', url, error);
                sendResponse({ 
                    error: error.message, 
                    success: false,
                    summary: 'Unable to generate summary due to: ' + error.message
                });
            }
        })();
        return true;
    }

    // Always return true for async response handling
    return true;
});

// Process queue function
async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;
    
    isProcessing = true;
    const { url, sendResponse } = requestQueue.shift();

    try {
        // Check cache first
        if (summaryCache.has(url)) {
            console.log('Returning cached summary for:', url);
            sendResponse({ summary: summaryCache.get(url), success: true });
            isProcessing = false;
            processQueue(); // Process next in queue
            return;
        }

        console.log('Fetching content for:', url);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        
        // Basic content cleaning
        let content = text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 5000);
        
        const summary = await summaryModel(content);
        
        if (!summary) {
            throw new Error('No summary generated');
        }

        // Cache the result
        summaryCache.set(url, summary);
        
        // Cleanup old cache entries after 5 minutes
        setTimeout(() => summaryCache.delete(url), 5 * 60 * 1000);
        
        sendResponse({ summary, success: true });
    } catch (error) {
        console.error('Error processing URL:', url, error);
        sendResponse({ 
            error: error.message, 
            success: false,
            summary: 'Unable to generate summary due to: ' + error.message
        });
    }
    
    isProcessing = false;
    processQueue(); // Process next in queue
}