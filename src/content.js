let isButtonInjected = false;

async function fetchBrowserHistory() {
    try {
        if (!chrome.runtime?.id) {
            throw new Error('Extension context invalidated');
        }

        // First check permission
        const permissionResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'checkHistoryPermission' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        if (!permissionResponse.hasPermission) {
            throw new Error('History permission not granted');
        }

        // Get history through background script
        const historyResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'getHistory' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        return historyResponse.history || [];

    } catch (error) {
        console.log('Browser history error:', error);
        if (error.message === 'Extension context invalidated') {
            chrome.runtime.reload();
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchBrowserHistory();
        }
        return [];
    }
}

function injectQueryExpansionButton() {
    if (isButtonInjected && document.querySelector('.llm-query-expand')) {
        return;
    }

    console.log('Attempting to inject query expansion button...');
    
    const searchBar = document.querySelector('textarea[name="q"], input[name="q"]');
    if (!searchBar) {
        console.log('❌ Search bar not found');
        return;
    }

    const existingButton = document.querySelector('.llm-query-expand');
    if (existingButton) {
        existingButton.remove();
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
    
    button.addEventListener('click', handleButtonClick);
    
    const searchWrapper = searchBar.closest('.RNNXgb') || searchBar.closest('form');
    if (searchWrapper) {
        searchBar.insertAdjacentElement('afterend', button);
        console.log('✅ Button added after search bar');
        isButtonInjected = true;
    }
}

async function handleButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const button = e.target;
    const searchBar = document.querySelector('textarea[name="q"], input[name="q"]');
    
    if (!searchBar) {
        console.error('Search bar not found');
        return;
    }
    
    const query = searchBar.value;
    if (!query) {
        console.log('❌ No query found');
        return;
    }

    button.textContent = '⌛ Processing...';
    button.disabled = true;

    try {
        const historyItems = await fetchBrowserHistory();
        const userLocation = await getLocation();
        
        console.log('Sending request with location:', userLocation);
        
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'expandQuery',
                    query: query,
                    browserHistory: historyItems,
                    location: userLocation
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
        
        if (response.error) {
            console.error('Error from background script:', response.error);
        } else if (response.expansions) {
            console.log('Query expansions:', response.expansions);
            searchBar.value = response.expansions;
            searchBar.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } catch (error) {
        console.error('Error in click handler:', error);
    } finally {
        button.textContent = 'AI Query Expand';
        button.disabled = false;
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
        
        // Define pageText using the extractPageContent function
        const pageText = extractPageContent();
        
        // Show loading state
        button.innerText = '⌛ Loading...';
        button.disabled = true;
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getRelatedTopics',
                pageText: pageText  // Now pageText is properly defined
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

// Update this function to properly display the suggestions
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
    
    // Create the HTML for suggestions
    const topicsHtml = suggestions.map(topic => `
        <div style="margin: 8px 0;">
            <a href="${topic.searchUrl}" 
               target="_blank" 
               style="text-decoration: none; color: #1a0dab;">
                ${topic.text}
            </a>
        </div>
    `).join('');
    
    container.innerHTML = `
        <h3 style="margin-top: 0;">Related Topics</h3>
        <div>${topicsHtml}</div>
    `;
}

// Add this to your existing initialization code
if (window.location.hostname !== 'www.google.com') {
    injectSuggestionsButton();
}

// Add this message listener alongside your other code
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getLocation') {
        // Set a timeout for the entire operation
        const timeoutId = setTimeout(() => {
            console.warn('Location request timed out');
            sendResponse({ location: '' });
        }, 10000); // 10 second timeout

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'Accept-Language': 'en-US',
                            },
                            referrerPolicy: 'no-referrer'
                        }
                    );
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    // Format the location to be more concise
                    const formattedLocation = formatLocation(data.address);
                    
                    clearTimeout(timeoutId);
                    console.log('Location formatted:', formattedLocation);
                    sendResponse({ location: formattedLocation });
                } catch (error) {
                    clearTimeout(timeoutId);
                    console.error('Geocoding error:', {
                        message: error.message,
                        stack: error.stack
                    });
                    sendResponse({ location: '' });
                }
            },
            (error) => {
                clearTimeout(timeoutId);
                const errorMessage = getGeolocationErrorMessage(error);
                console.error('Geolocation error:', errorMessage);
                sendResponse({ location: '' });
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 300000 // Cache location for 5 minutes
            }
        );
        return true;
    }
});

// Helper function to format location
function formatLocation(address) {
    if (!address) return 'Unknown Location';
    
    const parts = [];
    
    // Add city/town/suburb
    if (address.city) parts.push(address.city);
    else if (address.town) parts.push(address.town);
    else if (address.suburb) parts.push(address.suburb);
    
    // Add state/province
    if (address.state) parts.push(address.state);
    
    // Add country
    if (address.country) parts.push(address.country);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown Location';
}

// Helper function for geolocation errors
function getGeolocationErrorMessage(error) {
    switch(error.code) {
        case error.PERMISSION_DENIED:
            return 'Location access denied by user';
        case error.POSITION_UNAVAILABLE:
            return 'Location information unavailable';
        case error.TIMEOUT:
            return 'Location request timed out';
        default:
            return `Unknown error: ${error.message}`;
    }
}

// Add retry logic for failed requests
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            
            // If rate limited, wait and retry
            if (response.status === 429) {
                const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
            if (i === maxRetries - 1) throw error; // Last retry failed
            console.warn(`Retry ${i + 1}/${maxRetries} failed:`, error);
        }
    }
}

function displayRelatedTopics(topics) {
    const topicsContainer = document.getElementById('related-topics');
    if (!topicsContainer) return;

    // Clear any existing topics
    topicsContainer.innerHTML = '';

    // Create a list to hold the topics
    const topicsList = document.createElement('ul');
    topicsList.style.listStyle = 'none';
    topicsList.style.padding = '0';

    // Create a link for each topic
    topics.forEach(topic => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = topic.searchUrl;
        link.textContent = topic.text;
        link.target = "_blank";  // Opens in new tab
        link.style.textDecoration = 'none';
        link.style.color = '#1a0dab';  // Google-like link color
        
        li.style.margin = '8px 0';
        li.appendChild(link);
        topicsList.appendChild(li);
    });

    topicsContainer.appendChild(topicsList);
}

// Add this function to safely extract page text
function getPageText() {
    return document.body.innerText || 
           document.body.textContent || 
           '';
}

// When making the request to the background script, use the getPageText function
chrome.runtime.sendMessage({
    action: 'summarizeContent',
    pageText: getPageText(),  // Use the extracted text
    title: document.title
}, response => {
    // Handle response
});

// FIX: Replace with this version that uses the page content
chrome.runtime.sendMessage({ 
    action: 'getRelatedTopics', 
    pageText: getPageText(),  // Use the function to get the text
    title: document.title 
}, response => {
    if (response.success && response.topics) {
        displayRelatedTopics(response.topics);
    }
});

async function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.log('Geolocation not supported');
            resolve('');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    console.log('Got coordinates:', { latitude, longitude });
                    
                    // Use OpenStreetMap's Nominatim service with proper headers
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
                        {
                            headers: {
                                'User-Agent': 'Chrome Extension (your-extension@example.com)',
                                'Accept-Language': 'en-US,en'
                            }
                        }
                    );
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    console.log('Location data received:', data);
                    
                    // Format the location data
                    const location = formatLocation(data.address);
                    console.log('Formatted location:', location);
                    
                    resolve(location);
                } catch (error) {
                    console.error('Error getting location:', error);
                    resolve('');
                }
            },
            (error) => {
                console.error('Geolocation error:', getGeolocationErrorMessage(error));
                resolve('');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 300000 // 5 minutes
            }
        );
    });
}