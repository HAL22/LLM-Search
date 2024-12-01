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

    // Create button container for better positioning
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'llm-expand-container';

    const button = document.createElement('button');
    button.innerHTML = `
        <span class="button-content">
            <svg class="expand-icon" width="20" height="20" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
            <span class="button-text">AI Expand</span>
        </span>
        <div class="expand-tooltip">Enhance your search query with AI suggestions</div>
    `;
    button.className = 'llm-query-expand';
    button.type = 'button';

    // Add loading state
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'expand-loading';
    loadingSpinner.style.display = 'none';
    button.appendChild(loadingSpinner);

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!searchBar.value.trim()) {
            showToast('Please enter a search query first');
            return;
        }

        // Show loading state
        button.classList.add('loading');
        loadingSpinner.style.display = 'block';
        button.querySelector('.button-content').style.opacity = '0.5';

        try {
            const historyItems = await fetchBrowserHistory();
            const userLocation = await getLocation();
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: 'expandQuery',
                        query: searchBar.value,
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
                showToast('Error: ' + response.error);
            } else if (response.expansions) {
                // Animate the text change
                await animateTextChange(searchBar, response.expansions);
                showToast('Query expanded successfully!');
            }
        } catch (error) {
            console.error('Error in click handler:', error);
            showToast('Failed to expand query');
        } finally {
            // Reset button state
            button.classList.remove('loading');
            loadingSpinner.style.display = 'none';
            button.querySelector('.button-content').style.opacity = '1';
        }
    });

    buttonContainer.appendChild(button);
    searchBar.parentElement.appendChild(buttonContainer);
    isButtonInjected = true;
}

// Add these helper functions
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'llm-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after animation
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function animateTextChange(searchBar, newText) {
    const originalText = searchBar.value;
    searchBar.style.transition = 'opacity 0.3s';
    searchBar.style.opacity = '0';
    
    await new Promise(resolve => setTimeout(resolve, 300));
    searchBar.value = newText;
    searchBar.style.opacity = '1';
    
    // Trigger input event for Google's UI
    searchBar.dispatchEvent(new Event('input', { bubbles: true }));
}

// Log when the content script starts running
console.log('Content script initialized');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - attempting injection');
    injectQueryExpansionButton();
    addSettingsButton();
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

// Add loading animation and improved styling
function createHoverPopup() {
    const popup = document.createElement('div');
    popup.id = 'link-hover-popup';
    popup.innerHTML = `
        <div class="popup-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Generating summary...</div>
        </div>
        <div class="popup-content"></div>
    `;
    document.body.appendChild(popup);
    return popup;
}

function addHoverListeners() {
    if (!window.location.href.includes('google.com/search')) return;

    const popup = createHoverPopup();
    let currentTimer = null;
    let currentLink = null;
    let hoverDelay = 300;
    let hideTimeout = null;

    const searchResults = document.querySelectorAll('div.g a[href]:not([href^="javascript:"]):not([href^="#"]), div.yuRUbf a[href], div.rc a[href]');
    
    searchResults.forEach(link => {
        link.addEventListener('mouseenter', async (e) => {
            const url = link.href;
            currentLink = url;
            
            // Position the popup
            const rect = link.getBoundingClientRect();
            const isRightHalf = rect.left > window.innerWidth / 2;
            
            popup.style.top = `${rect.bottom + window.scrollY + 10}px`;
            popup.style.left = isRightHalf ? 
                `${rect.left + window.scrollX - 300}px` : 
                `${rect.left + window.scrollX}px`;
            
            // Show loading state
            popup.style.display = 'block';
            popup.querySelector('.popup-loading').style.display = 'flex';
            popup.querySelector('.popup-content').style.display = 'none';

            currentTimer = setTimeout(async () => {
                try {
                    const response = await new Promise((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            action: 'getSummary',
                            url: url
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(response);
                            }
                        });
                    });

                    if (currentLink === url) {
                        const contentDiv = popup.querySelector('.popup-content');
                        if (response.success && response.summary) {
                            // Format the summary
                            const formattedSummary = formatSummary(response.summary);
                            
                            contentDiv.innerHTML = `
                                <div class="summary-content">
                                    ${formattedSummary}
                                </div>
                                <div class="popup-footer">
                                    <a href="${url}" target="_blank" class="visit-link">Visit Page →</a>
                                </div>
                            `;
                        } else {
                            throw new Error(response.error || 'Failed to generate summary');
                        }
                        popup.querySelector('.popup-loading').style.display = 'none';
                        contentDiv.style.display = 'block';
                    }
                } catch (error) {
                    console.error('Error fetching summary:', error);
                    if (currentLink === url) {
                        popup.querySelector('.popup-loading').style.display = 'none';
                        popup.querySelector('.popup-content').innerHTML = `
                            <div class="error-message">Unable to generate summary.</div>
                        `;
                        popup.querySelector('.popup-content').style.display = 'block';
                    }
                }
            }, hoverDelay);
        });

        // Improved mouse leave handling with delay
        link.addEventListener('mouseleave', () => {
            clearTimeout(currentTimer);
            currentTimer = null;
            
            // Add slight delay before hiding
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!popup.matches(':hover')) { // Only hide if not hovering over popup
                    currentLink = null;
                    popup.style.display = 'none';
                }
            }, 300);
        });
    });

    // Allow hovering over the popup itself
    popup.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
    });

    popup.addEventListener('mouseleave', () => {
        popup.style.display = 'none';
        currentLink = null;
    });
}

// Add this new function to handle summary formatting
function formatSummary(summary) {
    return summary
        // Convert asterisk bullet points to proper bullet points
        .split('*')
        .filter(line => line.trim().length > 0)
        .map(line => {
            line = line.trim();
            return `<div class="summary-bullet">${line}</div>`;
        })
        .join('')
        // Clean up any remaining asterisks
        .replace(/\*/g, '')
        // Ensure proper spacing
        .replace(/\s+/g, ' ')
        // Add proper bullet points
        .replace(/(<div class="summary-bullet">)/g, '$1• ');
}

// Add this debounce function near the top of your file
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Now the searchObserver will work properly
const searchObserver = new MutationObserver(debounce(() => {
    if (window.location.href.includes('google.com/search')) {
        addHoverListeners();
    }
}, 1000));

// Start observing if we're on a Google search page
if (window.location.href.includes('google.com/search')) {
    searchObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    addHoverListeners();
}

async function getRelatedTopics(pageContent) {
    try {
        // Add timeout to the request
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timed out')), 10000); // 10 second timeout
        });

        const suggestionPromise = new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { 
                    action: 'suggestTopics', 
                    content: pageContent.slice(0, 1000) // Limit content length
                },
                response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response.suggestions);
                    }
                }
            );
        });

        // Race between the timeout and the actual request
        const suggestions = await Promise.race([suggestionPromise, timeoutPromise]);
        return suggestions;

    } catch (error) {
        console.error('Error getting related topics:', error);
        return ['Unable to load related topics'];
    }
}

function createRelatedTopicsContainer() {
    const container = document.createElement('div');
    container.className = 'related-topics-container';
    container.innerHTML = `
        <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Related Topics</h3>
        <div class="topics-content">
            <div class="loading-spinner"></div>
            <div>Loading related topics...</div>
        </div>
    `;
    document.body.appendChild(container);
    return container;
}

async function updateRelatedTopics() {
    const container = document.querySelector('.related-topics-container') || createRelatedTopicsContainer();
    const contentDiv = container.querySelector('.topics-content');

    try {
        // Get the main content of the page
        const mainContent = document.body.innerText;
        
        // Show loading state
        contentDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <div>Loading related topics...</div>
        `;

        // Get related topics
        const topics = await getRelatedTopics(mainContent);

        if (!topics || topics.length === 0 || topics[0] === 'Unable to load related topics') {
            contentDiv.innerHTML = `
                <div class="error-message">
                    Unable to load related topics.
                    <button onclick="updateRelatedTopics()" class="retry-button">
                        Retry
                    </button>
                </div>
            `;
            return;
        }

        // Update the container with topics
        contentDiv.innerHTML = topics
            .map(topic => `
                <div class="topic-item" onclick="window.location.href='https://www.google.com/search?q=${encodeURIComponent(topic)}'">
                    ${topic}
                </div>
            `)
            .join('');

    } catch (error) {
        console.error('Error updating related topics:', error);
        contentDiv.innerHTML = `
            <div class="error-message">
                Error loading topics.
                <button onclick="updateRelatedTopics()" class="retry-button">
                    Retry
                </button>
            </div>
        `;
    }
}

// Update the createSettingsPanel function
function createSettingsPanel() {
    // First remove any existing panel
    const existingPanel = document.querySelector('.llm-settings-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.className = 'llm-settings-panel';
    panel.style.cssText = `
        position: fixed;
        right: -400px;
        top: 0;
        width: 350px;
        height: 100%;
        background: white;
        box-shadow: -2px 0 10px rgba(0,0,0,0.1);
        z-index: 2147483647;
        transition: right 0.3s ease;
        padding: 20px;
        overflow-y: auto;
    `;

    panel.innerHTML = `
        <div class="settings-header">
            <h2 style="margin: 0; font-size: 18px; color: #333;">Extension Settings</h2>
            <button class="close-settings" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
        </div>
        <div class="settings-content">
            <div class="settings-section">
                <h3 style="font-size: 14px; color: #666; margin: 0 0 12px 0;">Features</h3>
                <label class="settings-switch">
                    <input type="checkbox" id="enable-summaries" checked>
                    <span class="switch-slider"></span>
                    <span class="switch-label">Link Summaries</span>
                </label>
                <label class="settings-switch">
                    <input type="checkbox" id="enable-related" checked>
                    <span class="switch-slider"></span>
                    <span class="switch-label">Related Topics</span>
                </label>
            </div>
            <div class="settings-section">
                <h3 style="font-size: 14px; color: #666; margin: 0 0 12px 0;">Appearance</h3>
                <label class="settings-switch">
                    <input type="checkbox" id="dark-mode">
                    <span class="switch-slider"></span>
                    <span class="switch-label">Dark Mode</span>
                </label>
                <div class="settings-item" style="margin: 12px 0;">
                    <label for="hover-delay" style="display: block; margin-bottom: 6px; color: #666;">
                        Hover Delay (ms)
                    </label>
                    <input type="range" id="hover-delay" min="100" max="1000" step="100" value="300">
                    <span class="range-value">300ms</span>
                </div>
                <div class="settings-item" style="margin: 12px 0;">
                    <label for="font-size" style="display: block; margin-bottom: 6px; color: #666;">
                        Font Size
                    </label>
                    <select id="font-size" style="width: 100%; padding: 6px;">
                        <option value="small">Small</option>
                        <option value="medium" selected>Medium</option>
                        <option value="large">Large</option>
                    </select>
                </div>
            </div>
            <div class="settings-section">
                <h3 style="font-size: 14px; color: #666; margin: 0 0 12px 0;">Cache</h3>
                <button id="clear-cache" class="settings-button" style="background: #4285f4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Clear Cache
                </button>
                <div style="font-size: 12px; color: #666; margin-top: 8px;">
                    Summaries are cached for 5 minutes
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    return panel;
}

// Update the addSettingsButton function
function addSettingsButton() {
    const existingButton = document.querySelector('.llm-settings-button');
    if (existingButton) {
        existingButton.remove();
    }

    const button = document.createElement('button');
    button.className = 'llm-settings-button';
    button.style.cssText = `
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #4285f4;
        border: none;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
    `;

    button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" style="fill: white;">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
        </svg>
    `;

    button.addEventListener('click', () => {
        const panel = document.querySelector('.llm-settings-panel') || createSettingsPanel();
        panel.style.right = '0';
        initializeSettings();
    });

    document.body.appendChild(button);

    // Add click handler for close button
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-settings')) {
            const panel = document.querySelector('.llm-settings-panel');
            if (panel) {
                panel.style.right = '-400px';
            }
        }
    });
}

// Make sure to call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Adding settings button...');
    addSettingsButton();
});

// Also add it for immediate execution in case DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('Page already loaded, adding settings button...');
    addSettingsButton();
}

// Initialize settings
async function initializeSettings() {
    const settings = await getSettings();
    
    // Set initial values
    document.getElementById('enable-summaries').checked = settings.enableSummaries;
    document.getElementById('enable-related').checked = settings.enableRelated;
    document.getElementById('dark-mode').checked = settings.darkMode;
    document.getElementById('hover-delay').value = settings.hoverDelay;
    document.getElementById('font-size').value = settings.fontSize;
    
    // Add event listeners
    document.querySelector('.close-settings').addEventListener('click', () => {
        document.querySelector('.llm-settings-panel').classList.remove('show');
    });

    // Save settings on change
    document.querySelectorAll('.settings-content input, .settings-content select').forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Clear cache button
    document.getElementById('clear-cache').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearCache' });
        showToast('Cache cleared successfully');
    });

    // Update range value display
    document.getElementById('hover-delay').addEventListener('input', (e) => {
        e.target.nextElementSibling.textContent = `${e.target.value}ms`;
    });
}

// Get settings from storage
async function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            enableSummaries: true,
            enableRelated: true,
            darkMode: false,
            hoverDelay: 300,
            fontSize: 'medium'
        }, resolve);
    });
}

// Save settings
async function saveSettings() {
    const settings = {
        enableSummaries: document.getElementById('enable-summaries').checked,
        enableRelated: document.getElementById('enable-related').checked,
        darkMode: document.getElementById('dark-mode').checked,
        hoverDelay: parseInt(document.getElementById('hover-delay').value),
        fontSize: document.getElementById('font-size').value
    };

    await chrome.storage.sync.set(settings);
    applySettings(settings);
    showToast('Settings saved');
}

// Apply settings
function applySettings(settings) {
    // Apply dark mode
    document.documentElement.classList.toggle('dark-theme', settings.darkMode);
    
    // Apply font size
    document.documentElement.style.setProperty('--llm-font-size', 
        settings.fontSize === 'small' ? '12px' : 
        settings.fontSize === 'large' ? '16px' : '14px'
    );

    // Toggle features
    if (!settings.enableSummaries) {
        document.querySelectorAll('#link-hover-popup').forEach(el => el.remove());
    }
    if (!settings.enableRelated) {
        document.querySelectorAll('.related-topics-container').forEach(el => el.remove());
    }
}