async function queryModel(prompt, history, location) {
    // Validate and sanitize location
    const sanitizedLocation = location?.trim() || 'Unknown Location';
    console.log('Location received:', location); // Debug log

    const systemPrompt = `You are an intelligent search assistant that helps users refine their search queries.
You have access to the user's location ("${sanitizedLocation}") and their browser history.
Your task is to:
1. Understand the user's search intent
2. Consider their location for local context (use "${sanitizedLocation}" directly, not [Your Location])
3. Use the browser history for better context
4. Generate a clear, specific, and well-structured search query

User's browser history:
${history}`;

    const userPrompt = `Please help me refine this search query: "${prompt}"
Consider my location and previous context to make the search more relevant.
Return only the refined search query without any explanations.`;

    const session = await ai.languageModel.create({
        systemPrompt: systemPrompt
    });

    const answer = await session.prompt(userPrompt);

    return answer;
}

async function suggestTopicsModel(prompt) {
    const systemPrompt = `You are an intelligent search assistant you will be given text from a webpage and you will suggest five related topics.
    You will return a list of related topics separated by commas.`;

    const session = await ai.languageModel.create({
        systemPrompt: systemPrompt
    })

    const answer = await session.prompt(prompt);

    return answer;
}