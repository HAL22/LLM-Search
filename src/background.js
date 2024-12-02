importScripts('model.js');

const summaryCache = new Map();
const requestQueue = [];
let isProcessing = false;
let currentSummaryRequest = null;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Add retry configuration
const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 1000
};

async function queryLLM(prompt, context) {
    console.log('🔍 QueryLLM called with:', { prompt, context });

    const queryExpansion = await queryModel(prompt, {
        location: context.location,
        browserHistory: context.browserHistory
    });

    return queryExpansion;
}

async function suggestionLLM(pageContent) {
    console.log('Starting suggestionLLM with content length:', pageContent?.length);

    // Input validation
    if (!pageContent || typeof pageContent !== 'string' || pageContent.length < 50) {
        throw new Error('Invalid or insufficient content provided');
    }

    // Truncate content if too long
    const maxLength = 5000;
    const truncatedContent = pageContent.length > maxLength 
        ? pageContent.slice(0, maxLength) 
        : pageContent;

    let lastError = null;
    
    // Retry loop
    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`Attempt ${attempt} of ${RETRY_CONFIG.MAX_RETRIES}`);

            // Your existing model call here
            const response = await chrome.runtime.sendMessage({
                action: 'processContent',
                content: truncatedContent
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to process content');
            }

            return response.suggestions;

        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt} failed:`, error);

            // If it's not the last attempt, wait before retrying
            if (attempt < RETRY_CONFIG.MAX_RETRIES) {
                const delay = RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // If we get here, all retries failed
    console.error('All retry attempts failed');
    throw new Error('Failed to generate suggestions after multiple attempts');
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
        const { minutes, maxItems } = request.params;
        const millisecondsPerMinute = 60 * 1000;
        const startTime = new Date().getTime() - (minutes * millisecondsPerMinute);

        chrome.history.search({
            text: '',            // Empty string to get all history
            startTime: startTime,
            maxResults: maxItems
        }, (history) => {
            const processedHistory = history.map(item => ({
                title: item.title,
                url: item.url,
                visitCount: item.visitCount
            }));
            sendResponse({ history: processedHistory });
        });

        // Required for async response
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
        handleRelatedTopics(request.pageText)
            .then(response => sendResponse(response))
            .catch(error => {
                console.error('Error in message handler:', error);
                sendResponse({
                    success: false,
                    error: getUserFriendlyError(error)
                });
            });
        return true; // Keep message channel open
    }

    // Summary handler
    if (request.action === 'getSummary') {
        handleSummaryRequest(request.url)
            .then(response => sendResponse(response))
            .catch(error => {
                console.error('Error handling summary request:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep the message channel open
    }

    // Query model handler
    if (request.action === 'queryModel') {
        console.log('Received query model request:', request);
        
        // Handle the query expansion
        queryModel(request.prompt, request.context)
            .then(response => {
                console.log('Query model response:', response);
                sendResponse(response);
            })
            .catch(error => {
                console.error('Error in query model:', error);
                sendResponse(null);
            });
            
        return true; // Required for async response
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

async function processUrl(url, sendResponse) {
    try {
        console.log('🔄 Processing URL:', url);
        
        // Check cache first
        if (summaryCache.has(url)) {
            console.log('📦 Returning cached summary for:', url);
            sendResponse({ summary: summaryCache.get(url), success: true });
            return;
        }

        // Fetch the content
        console.log('🌐 Fetching content...');
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        console.log('📝 Content fetched, length:', text.length);
        
        // Basic content cleaning
        let content = text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 5000);

        console.log('🤖 Generating summary...');
        const summary = await retryOperation(() => summaryModel(content));

        if (!summary) {
            throw new Error('No summary generated');
        }

        console.log('✅ Summary generated successfully');
        // Cache the result
        summaryCache.set(url, summary);
        
        // Cleanup old cache entries after 5 minutes
        setTimeout(() => summaryCache.delete(url), 5 * 60 * 1000);
        
        sendResponse({ summary, success: true });
    } catch (error) {
        console.error('❌ Error processing URL:', url, error);
        
        let errorMessage;
        let details = error.message;

        if (error.name === 'InvalidStateError') {
            errorMessage = 'Unable to process this page at the moment. Please try again later.';
        } else if (error.message.includes('untested language')) {
            errorMessage = 'This page contains unsupported language content.';
        } else if (error.message.includes('HTTP error')) {
            errorMessage = 'Unable to access the page. Please check if the URL is accessible.';
        } else if (error.message.includes('NetworkError')) {
            errorMessage = 'Network error occurred. Please check your internet connection.';
        } else {
            errorMessage = 'An error occurred while processing the page.';
        }
        
        sendResponse({ 
            success: false, 
            error: errorMessage,
            details: details
        });
    }
}

// Generic retry operation function
async function retryOperation(operation, maxRetries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
            
            if (attempt === maxRetries) {
                throw error; // If this was our last attempt, throw the error
            }
            
            // Wait before retrying (with exponential backoff)
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Update the error handling in the getSummary function
async function getSummary(url) {
    try {
        // Check cache first
        const cachedSummary = await getCachedSummary(url);
        if (cachedSummary) {
            console.log('📋 Returning cached summary for:', url);
            return { success: true, summary: cachedSummary };
        }

        console.log('🌐 Fetching content for:', url);
        const content = await fetchPageContent(url);
        
        // Detect language before attempting summary
        const detectedLanguage = await detectLanguage(content);
        
        // List of supported languages (update this list based on your model's capabilities)
        const supportedLanguages = ['en', 'es', 'fr', 'de', 'it']; // example list
        
        if (!supportedLanguages.includes(detectedLanguage)) {
            console.log('🌍 Unsupported language detected:', detectedLanguage);
            return {
                success: false,
                error: 'This content is in an unsupported language. Currently, only English, Spanish, French, German, and Italian are supported.'
            };
        }

        console.log('🤖 Generating summary...');
        const summary = await generateSummary(content);
        
        // Cache the successful summary
        await cacheSummary(url, summary);
        
        return { success: true, summary };

    } catch (error) {
        console.error('❌ Error in getSummary:', error);
        
        // Handle specific error types
        if (error.message.includes('untested language') || 
            error.message.includes('NotSupportedError')) {
            return {
                success: false,
                error: 'This content appears to be in an unsupported language. Currently, only English, Spanish, French, German, and Italian are supported.'
            };
        }
        
        return {
            success: false,
            error: 'Failed to generate summary. Please try again later.'
        };
    }
}

// Add language detection function
async function detectLanguage(text) {
    try {
        // You can use various methods to detect language
        // Here's a simple example using the first few hundred characters
        const sampleText = text.slice(0, 500);
        
        // You might want to use a language detection library here
        // For now, we'll assume English if we can't detect the language
        // You can replace this with a proper language detection library
        
        // Example using browser's built-in language detection (if available)
        if (chrome.i18n && chrome.i18n.detectLanguage) {
            const result = await new Promise(resolve => {
                chrome.i18n.detectLanguage(sampleText, resolve);
            });
            return result.languages[0]?.language || 'en';
        }
        
        return 'en'; // Default to English if detection fails
    } catch (error) {
        console.error('Error detecting language:', error);
        return 'en'; // Default to English on error
    }
}

// Add helper functions for suggestion handling
function formatSuggestions(suggestions) {
    try {
        // First ensure we're working with a string
        const suggestionsStr = typeof suggestions === 'string' ? 
            suggestions : 
            suggestions.toString();

        // Split and clean the suggestions
        const topicsList = suggestionsStr
            .split(',')
            .map(topic => topic.trim())
            .filter(topic => topic.length > 0);

        // Format suggestions into list with Google search links
        return topicsList.map(topic => ({
            text: topic,
            searchUrl: `https://www.google.com/search?q=${encodeURIComponent(topic)}`
        }));
    } catch (error) {
        console.error('Error formatting suggestions:', error);
        throw new Error('Failed to format suggestions');
    }
}

function handleSuggestionError(error) {
    if (error.message.includes('untested language')) {
        return 'This content appears to be in an unsupported language. Currently, only English, Spanish, French, German, and Italian are supported.';
    }
    if (error.message.includes('NotReadableError')) {
        return 'The service is temporarily unavailable. Please try again in a moment.';
    }
    if (error.message.includes('bad response')) {
        return 'Unable to process the content at this time. Please try again later.';
    }
    return 'Failed to generate suggestions. Please try again later.';
}

// Add retry operation function
async function retryOperation(operation, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);

            // Don't retry for certain errors
            if (error.message.includes('untested language')) {
                throw error;
            }

            if (attempt === maxRetries) {
                throw lastError;
            }

            // Wait before retrying (with exponential backoff)
            const delay = initialDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function handleSummaryRequest(url) {
    try {
        // Add your summary generation logic here
        // This is a placeholder that returns a dummy summary
        const summary = `This is a summary of the content at ${url}. 
                        Add your actual summary generation logic here.`;
        
        return {
            success: true,
            summary: summary
        };
    } catch (error) {
        console.error('Error generating summary:', error);
        return {
            success: false,
            error: 'Failed to generate summary'
        };
    }
}

// Helper function to get user-friendly error messages
function getUserFriendlyError(error) {
    const errorMessages = {
        'Invalid or insufficient content': 'The page content is too short to generate suggestions.',
        'No suggestions generated': 'Unable to generate suggestions at this time.',
        'No valid suggestions generated': 'Unable to process suggestions.',
        'Failed to generate suggestions': 'The service is temporarily unavailable.',
        'untested language': 'This feature is currently only available for English content.',
        'Invalid response format or language': 'Unable to generate valid suggestions. Please try again.',
    };

    // Check for known error messages
    for (const [key, message] of Object.entries(errorMessages)) {
        if (error.message.includes(key)) {
            return message;
        }
    }

    // Default error message
    return 'An unexpected error occurred. Please try again later.';
}

// Add helper function to validate and clean content
function validateAndCleanContent(content) {
    if (!content) return null;
    
    // Remove excessive whitespace
    content = content.trim().replace(/\s+/g, ' ');
    
    // Remove any script or style content
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove HTML tags
    content = content.replace(/<[^>]+>/g, ' ');
    
    // Clean up any resulting multiple spaces
    content = content.replace(/\s+/g, ' ').trim();
    
    return content;
}

// Add the handler function
async function handleRelatedTopics(pageText) {
    try {
        // Clean and simplify input
        const cleanContent = cleanInput(pageText);
        
        // Get suggestions (now with fallback)
        const suggestions = await suggestTopicsModel(cleanContent);
        
        // Format the suggestions
        const formattedSuggestions = suggestions.split(',')
            .map(topic => topic.trim())
            .filter(topic => topic.length > 0)
            .map(topic => ({
                text: topic,
                searchUrl: `https://www.google.com/search?q=${encodeURIComponent(topic)}`
            }));

        return {
            success: true,
            topics: formattedSuggestions
        };

    } catch (error) {
        console.error('Error generating suggestions:', error);
        // Use default topics
        const defaultTopics = getDefaultTopics().split(',')
            .map(topic => topic.trim())
            .map(topic => ({
                text: topic,
                searchUrl: `https://www.google.com/search?q=${encodeURIComponent(topic)}`
            }));
            
        return {
            success: true,
            topics: defaultTopics
        };
    }
}

// Add helper function for user-friendly errors
function getUserFriendlyError(error) {
    const errorMessages = {
        'Invalid or insufficient content': 'The page content is too short to generate suggestions.',
        'No suggestions generated': 'Unable to generate suggestions at this time.',
        'No valid suggestions generated': 'Unable to process suggestions.',
        'Failed to generate suggestions': 'The service is temporarily unavailable.'
    };

    // Check for known error messages
    for (const [key, message] of Object.entries(errorMessages)) {
        if (error.message.includes(key)) {
            return message;
        }
    }

    // Default error message
    return 'An unexpected error occurred. Please try again later.';
}

// Add a function to sanitize the input text
function sanitizeInput(text) {
    if (!text) return '';
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    
    // Remove special characters but keep basic punctuation
    text = text.replace(/[^\w\s.,?!-]/g, ' ');
    
    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit length
    const maxLength = 5000;
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}
