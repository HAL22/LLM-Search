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
            // Send message and wait for response
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'expandQuery',
                        query: query
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