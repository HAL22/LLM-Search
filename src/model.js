async function queryModel(prompt, context) {
    // Log the incoming context
    console.log('QueryModel received context:', context);
    
    // Validate and sanitize location
    const sanitizedLocation = context?.location || 'Unknown Location';
    
    // Check if the prompt likely needs location context
    const locationKeywords = ['near', 'around', 'nearby', 'local', 'closest', 'restaurant', 'shop', 'store', 'weather'];
    const isLocationRelevant = locationKeywords.some(keyword => 
        prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    const systemPrompt = `You are an intelligent search assistant that helps users refine their search queries.
You have access to ${isLocationRelevant ? `the user's location ("${sanitizedLocation}") and ` : ''}their browser history.
Your task is to:
1. Understand the user's search intent
${isLocationRelevant ? '2. Consider their location for local context\n' : ''}${isLocationRelevant ? '3' : '2'}. Generate a clear, specific, and well-structured search query.`;

    const userPrompt = `Please help me refine this search query: "${prompt}"
${isLocationRelevant ? `Consider my location (${sanitizedLocation}) and ` : ''}make the search more relevant.
Return only the refined search query without any explanations or brackets.`;

    const session = await ai.languageModel.create({
        systemPrompt: systemPrompt
    });

    const answer = await session.prompt(userPrompt);

    return answer;
}

async function suggestTopicsModel(prompt) {
    try {
        console.log('Content received by model:', prompt.slice(0, 200) + '...');
        
        // First, clean and prepare the input
        const cleanContent = sanitizeInput(prompt);
        
        // Create a more controlled prompt
        const systemPrompt = `You are an AI assistant that analyzes webpage content.
IMPORTANT: Always respond in English only.
Analyze the content and suggest 5 topics that summarize the key points.
Return ONLY a comma-separated list of English topics.
Example format: First Topic, Second Topic, Third Topic, Fourth Topic, Fifth Topic`;

        const session = await ai.languageModel.create({
            systemPrompt: systemPrompt
        });

        // Create a more controlled user prompt
        const userPrompt = `Review this content and list 5 main topics in English:
${cleanContent.slice(0, 1000)}

IMPORTANT: Respond ONLY with comma-separated English topics.`;

        let answer = await session.prompt(userPrompt);
        console.log('Raw model response:', answer);

        // If we get a response in an unexpected format, try one more time with a simpler prompt
        if (!isValidEnglishResponse(answer)) {
            console.log('First attempt failed, trying simplified prompt...');
            answer = await session.prompt("List 5 English topics, separated by commas.");
        }

        // Clean and validate the response
        const cleanedResponse = cleanModelResponse(answer);
        console.log('Cleaned response:', cleanedResponse);

        if (cleanedResponse) {
            return cleanedResponse;
        }

        console.log('Using default topics due to invalid response');
        return getDefaultTopics();

    } catch (error) {
        console.error('Error in suggestTopicsModel:', error);
        if (error.message.includes('untested language')) {
            console.log('Language error detected, using default topics');
            return getDefaultTopics();
        }
        return getDefaultTopics();
    }
}

// Helper function to validate English response
function isValidEnglishResponse(response) {
    if (!response || typeof response !== 'string') return false;
    
    // Only allow English letters, numbers, spaces, and commas
    const englishPattern = /^[a-zA-Z0-9\s,]+$/;
    
    // Check basic format
    const topics = response.split(',').map(t => t.trim());
    
    return englishPattern.test(response) && topics.length >= 3;
}

// Helper function to clean model response
function cleanModelResponse(response) {
    if (!response) return null;
    
    try {
        // Remove any non-English characters
        let cleaned = response.replace(/[^a-zA-Z0-9,\s]/g, ' ');
        
        // Split by common delimiters and clean
        let topics = cleaned.split(/[,\n]/)
            .map(topic => topic.trim())
            .filter(topic => topic.length > 0 && /^[a-zA-Z0-9\s]+$/.test(topic))
            .slice(0, 5);  // Take only first 5

        // Validate we have enough topics
        if (topics.length === 5) {
            return topics.join(', ');
        }
        
        return null;
    } catch (error) {
        console.error('Error cleaning response:', error);
        return null;
    }
}

// Helper function to sanitize input
function sanitizeInput(text) {
    if (!text) return '';
    
    // Remove HTML tags
    text = text.replace(/<[^>]*>/g, ' ');
    
    // Remove special characters but keep basic punctuation
    text = text.replace(/[^\w\s.,?!-]/g, ' ');
    
    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit length
    const maxLength = 2000;
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// Function to get default topics
function getDefaultTopics() {
    const defaultSets = [
        "Main Points, Key Features, Overview, Details, Summary",
        "Introduction, Content, Examples, Applications, References",
        "Basic Concepts, Core Ideas, Implementation, Usage, Resources",
        "Getting Started, Key Topics, Best Practices, Tips, Guide",
        "Overview, Fundamentals, Examples, Methods, Related Topics"
    ];
    
    return defaultSets[Math.floor(Math.random() * defaultSets.length)];
}

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (!text) return '';
    text = text.trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

// Helper function to get a relevant fallback topic based on existing topics
function getRelevantFallbackTopic(existingTopics) {
    const commonPairs = {
        'history': ['timeline', 'origins', 'development', 'evolution'],
        'technology': ['applications', 'innovations', 'advances', 'future'],
        'food': ['recipes', 'cuisine', 'ingredients', 'cooking'],
        'science': ['research', 'discoveries', 'methods', 'theories'],
        'art': ['techniques', 'styles', 'artists', 'movements'],
        'business': ['strategy', 'management', 'marketing', 'growth'],
        'education': ['learning', 'teaching', 'curriculum', 'methods'],
        'sports': ['training', 'competition', 'equipment', 'rules'],
        'health': ['wellness', 'prevention', 'treatment', 'care'],
        'culture': ['traditions', 'customs', 'practices', 'heritage']
    };

    // Look for related topics based on existing ones
    for (const topic of existingTopics) {
        const lowerTopic = topic.toLowerCase();
        for (const [key, values] of Object.entries(commonPairs)) {
            if (lowerTopic.includes(key)) {
                // Find a value that's not already in the topics
                const unusedValue = values.find(v => 
                    !existingTopics.some(t => 
                        t.toLowerCase().includes(v.toLowerCase())
                    )
                );
                if (unusedValue) return unusedValue;
            }
        }
    }

    // If no related topics found, return a general topic
    const generalTopics = [
        'Overview', 'Key Features', 'Applications',
        'Benefits', 'Examples', 'Resources'
    ];
    
    return generalTopics.find(t => 
        !existingTopics.some(et => 
            et.toLowerCase() === t.toLowerCase()
        )
    ) || 'Related Topics';
}

// Helper function to clean input
function cleanInput(text) {
    if (!text) return '';
    
    // Remove non-English characters and simplify
    return text
        .replace(/[^a-zA-Z\s]/g, ' ')  // Keep only English letters and spaces
        .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
        .trim()
        .slice(0, 1000);               // Limit length
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

async function summaryModel(content) {
    try {
        console.log('Starting summary generation for content length:', content?.length);

        // Validate content
        if (!content || typeof content !== 'string') {
            throw new Error('No meaningful content found for summarization.');
        }

        // Clean and prepare the content
        const cleanContent = sanitizeContent(content);
        
        if (cleanContent.length < 100) {
            throw new Error('Content too short for meaningful summarization');
        }

        const systemPrompt = `You are a helpful assistant that creates concise summaries.
        Create a brief, informative summary of the provided content in 2-3 sentences.
        Focus on the main points and key information.`;

        const session = await ai.languageModel.create({
            systemPrompt: systemPrompt,
            temperature: 0.3, // Lower temperature for more consistent output
            maxTokens: 150    // Limit summary length
        });

        const userPrompt = `Please summarize this content: "${truncateContent(cleanContent, 2000)}"`;
        
        const summary = await session.prompt(userPrompt);
        console.log('Generated summary length:', summary?.length);

        if (!summary || summary.length < 10) {
            throw new Error('No meaningful summary generated');
        }

        return summary;

    } catch (error) {
        console.error('Error in summaryModel:', error);
        throw error;
    }
}

// Helper function to clean and sanitize content
function sanitizeContent(content) {
    if (!content) return '';

    // Remove script and style elements
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    
    // Remove HTML tags
    content = content.replace(/<[^>]+>/g, ' ');
    
    // Remove special characters and extra spaces
    content = content.replace(/[^\w\s.,!?-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

    // Remove very common UI elements text
    content = content.replace(/cookie policy|accept cookies|privacy policy|terms of use/gi, '');
    
    // Remove URLs
    content = content.replace(/https?:\/\/[^\s]+/g, '');
    
    return content;
}

// Helper function to truncate content
function truncateContent(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    
    // Try to truncate at a sentence boundary
    const truncated = text.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > maxLength * 0.8) {
        return truncated.slice(0, lastPeriod + 1);
    }
    
    return truncated + '...';
}

// Helper function to extract main content
function extractMainContent(content) {
    // Remove headers and footers (common UI elements)
    const lines = content.split('\n');
    let mainContent = lines.filter(line => {
        const lower = line.toLowerCase();
        return !lower.includes('cookie') &&
               !lower.includes('privacy') &&
               !lower.includes('terms') &&
               !lower.includes('copyright') &&
               line.trim().length > 30; // Minimum line length
    }).join('\n');

    return mainContent;
}



