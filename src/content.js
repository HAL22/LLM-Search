function injectQueryExpansionButton() {
    console.log('Attempting to inject query expansion button...');
    
    const searchBar = document.querySelector('textarea[name="q"], input[name="q"]');
    if (!searchBar) {
        console.log('❌ Search bar not found');
        return;
    }
    console.log('✅ Search bar found:', searchBar);

    if (document.querySelector('.llm-query-expand')) {
        console.log('Button already exists, skipping injection');
        return;
    }

    const button = document.createElement('button');
    button.textContent = 'AI Query Expand';
    button.classList.add('llm-query-expand');
    button.type = 'button';
    button.style.cssText = `
        margin-left: 10px;
        padding: 8px 16px;
        background-color: #4285f4;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        position: relative;
        z-index: 9999;
        display: inline-block !important;
    `;
    
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Button clicked!');
        const query = searchBar.value;
        console.log('Sending query:', query);
        
        if (!query) {
            console.log('❌ No query found');
            return;
        }

        try {
            // First, request history from background script
            const browserHistory = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: 'getHistory' },
                    function(response) {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response.history);
                        }
                    }
                );
            });

            // Then send the expand query request with the history
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'expandQuery',
                        query: query,
                        browserHistory: browserHistory,
                        location: window.location.href
                    },
                    function(response) {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    }
                );
            });
            
            console.log('Received response:', response);
            
            if (response.error) {
                console.error('Error from background script:', response.error);
            } else if (response.expansions) {
                console.log('Query expansions:', response.expansions);
                // Optionally update the search input
                searchBar.value = response.expansions;
            }
        } catch (error) {
            console.error('Error in message handling:', error);
        }
    });

    const searchWrapper = searchBar.closest('.RNNXgb') || searchBar.closest('form');
    if (searchWrapper) {
        searchBar.insertAdjacentElement('afterend', button);
        console.log('✅ Button added after search bar, parent:', searchWrapper);
        console.log('Button dimensions:', button.getBoundingClientRect());
    } else {
        console.log('❌ Could not find appropriate wrapper, falling back to direct parent');
        searchBar.parentNode.appendChild(button);
    }
}

// Log when the content script starts running
console.log('Content script initialized');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - attempting injection');
    injectQueryExpansionButton();
});

const observer = new MutationObserver((mutations) => {
    clearTimeout(window.injectionTimeout);
    window.injectionTimeout = setTimeout(() => {
        console.log('Debounced DOM mutation - attempting injection');
        injectQueryExpansionButton();
    }, 500);
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Add this function to extract text from the webpage
function extractPageContent() {
    // Get all text content while excluding script and style elements
    const bodyText = document.body.innerText;
    // Trim and limit the content to avoid too large requests
    return bodyText.slice(0, 5000).trim();
}

// Add this function to create and inject the suggestions UI
function injectSuggestionsButton() {
    if (document.getElementById('ai-suggestions-btn')) return;
    
    const button = document.createElement('button');
    button.id = 'ai-suggestions-btn';
    button.innerText = '🔍 Get Related Topics';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        padding: 10px;
        border-radius: 5px;
        border: 1px solid #ccc;
        background: white;
        cursor: pointer;
    `;
    
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const pageText = extractPageContent();
        
        // Show loading state
        button.innerText = '⌛ Loading...';
        button.disabled = true;
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getRelatedTopics',
                pageText: pageText
            });
            
            if (response.error) {
                console.error('Error:', response.error);
                return;
            }
            
            displaySuggestions(response.topics);
        } finally {
            button.innerText = '🔍 Get Related Topics';
            button.disabled = false;
        }
    });
    
    document.body.appendChild(button);
}

// Add this function to display the suggestions
function displaySuggestions(suggestions) {
    let container = document.getElementById('ai-suggestions-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ai-suggestions-container';
        container.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            width: 300px;
            max-height: 400px;
            overflow-y: auto;
            background: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            padding: 15px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <h3 style="margin-top: 0;">Related Topics</h3>
        <div>${suggestions}</div>
    `;
}

// Add this to your existing initialization code
if (window.location.hostname !== 'www.google.com') {
    injectSuggestionsButton();
}