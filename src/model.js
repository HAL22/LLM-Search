async function queryModel(prompt, context) {
    // Log the incoming context
    console.log('QueryModel received context:', context);
    
    // Validate and sanitize location
    const sanitizedLocation = context?.location || 'Unknown Location';
    console.log('Using location:', sanitizedLocation); // Debug log

    const systemPrompt = `You are an intelligent search assistant that helps users refine their search queries.
You have access to the user's location ("${sanitizedLocation}") and their browser history.
Your task is to:
1. Understand the user's search intent
2. Consider their location for local context
3. Use the browser history for better context
4. Generate a clear, specific, and well-structured search query.
Do not include placeholder text like [Unknown Location] in your response.
Instead, use the actual location provided.`;

    const userPrompt = `Please help me refine this search query: "${prompt}"
Consider my location (${sanitizedLocation}) and previous context to make the search more relevant.
Return only the refined search query without any explanations or brackets.`;

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

async function summaryModel(content) {
    const systemPrompt = `You are an intelligent search assistant that will summaries the content of a webpage.You will return a summary of the content,in a list of bullet points.`;

    const session = await ai.languageModel.create({
        systemPrompt: systemPrompt
    })

    const answer = await session.prompt(content);

    return answer;
}