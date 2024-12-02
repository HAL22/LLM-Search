console.log('Content script loaded!');

// Add this function to handle query expansion
async function handleQueryExpand(e) {
    e.preventDefault();
    const searchBox = document.querySelector('textarea[name="q"]') || document.querySelector('input[name="q"]');
    if (!searchBox) return;

    const query = searchBox.value;
    if (!query) return;

    const button = e.target;
    button.disabled = true;
    button.innerHTML = '⌛';

    try {
        console.log('Sending query for expansion:', query);
        const response = await chrome.runtime.sendMessage({
            action: 'queryModel',
            prompt: query,
            context: {
                location: await getCurrentLocation()
            }
        });

        console.log('Received expanded query:', response);

        if (response) {
            searchBox.value = response;
            searchBox.focus();
            // Optionally trigger a search
            const searchForm = searchBox.closest('form');
            if (searchForm) searchForm.submit();
        }
    } catch (error) {
        console.error('Error expanding query:', error);
    } finally {
        button.disabled = false;
        button.innerHTML = '🔍+';
    }
}

// Add the location helper function
async function getCurrentLocation() {
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        // Use Nominatim API instead (free, no API key required)
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'Chrome Extension (contact@yourdomain.com)' // Replace with your contact
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.display_name || 'Unknown Location';
    } catch (error) {
        console.error('Error getting location:', error);
        return 'Unknown Location';
    }
}

// Function to add buttons based on page type
function addButtons() {
    console.log('Current hostname:', window.location.hostname);
    
    if (window.location.hostname.includes('google.com')) {
        console.log('On Google - adding query expand button');
        addQueryExpandButton();
    } else {
        console.log('Not on Google - adding related topics button');
        addRelatedTopicsButton();
    }
}

// Your existing query expand button code
function addQueryExpandButton() {
    console.log('Attempting to add query expand button...');
    
    // Try multiple selectors to find the search box
    const searchBoxSelectors = [
        'input[name="q"]:not([type="hidden"])',
        'input[type="text"][aria-label="Search"]',
        'input[type="search"]',
        'textarea[name="q"]',
        '.gLFyf'
    ];

    let searchBox = null;
    for (const selector of searchBoxSelectors) {
        searchBox = document.querySelector(selector);
        if (searchBox) {
            console.log('Found search box with selector:', selector);
            break;
        }
    }

    if (!searchBox) {
        console.log('Search box not found with any selector');
        return;
    }

    // Check if button already exists
    if (document.getElementById('ai-query-expand')) {
        console.log('Query expand button already exists');
        return;
    }

    // Create the expand button
    const button = document.createElement('button');
    button.id = 'ai-query-expand';
    button.className = 'ai-query-button';
    
    // Use a more descriptive button content with icon and text
    button.innerHTML = `
        <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 16px;">🔍</span>
            <span style="font-size: 13px;">AI Expand</span>
        </div>
    `;
    button.title = 'Enhance your search with AI';
    
    // Enhanced button styling
    button.style.cssText = `
        position: absolute;
        right: 45px;
        top: 50%;
        transform: translateY(-50%);
        padding: 6px 12px;
        background: #f8f9fa;
        border: 1px solid #dadce0;
        border-radius: 20px;
        cursor: pointer;
        font-size: 14px;
        z-index: 1000;
        color: #1a73e8;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    // Enhanced hover effects
    button.onmouseover = () => {
        button.style.backgroundColor = '#e8f0fe';
        button.style.borderColor = '#1a73e8';
        button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
        button.style.transform = 'translateY(-50%) scale(1.02)';
    };
    
    button.onmouseout = () => {
        button.style.backgroundColor = '#f8f9fa';
        button.style.borderColor = '#dadce0';
        button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        button.style.transform = 'translateY(-50%) scale(1)';
    };

    // Add active state
    button.onmousedown = () => {
        button.style.backgroundColor = '#e8f0fe';
        button.style.transform = 'translateY(-50%) scale(0.98)';
    };

    button.onmouseup = () => {
        button.style.backgroundColor = '#f8f9fa';
        button.style.transform = 'translateY(-50%) scale(1)';
    };

    // Update loading state styling
    const setLoadingState = (isLoading) => {
        if (isLoading) {
            button.innerHTML = `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 16px;">⌛</span>
                    <span style="font-size: 13px;">Enhancing...</span>
                </div>
            `;
            button.style.backgroundColor = '#e8f0fe';
            button.style.color = '#1a73e8';
            button.disabled = true;
            button.style.cursor = 'wait';
        } else {
            button.innerHTML = `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 16px;">🔍</span>
                    <span style="font-size: 13px;">AI Expand</span>
                </div>
            `;
            button.style.backgroundColor = '#f8f9fa';
            button.style.color = '#1a73e8';
            button.disabled = false;
            button.style.cursor = 'pointer';
        }
    };

    // Update click handler to use loading state
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        const searchBox = document.querySelector('textarea[name="q"]') || document.querySelector('input[name="q"]');
        if (!searchBox) return;

        const query = searchBox.value;
        if (!query) return;

        setLoadingState(true);

        try {
            console.log('Sending query for expansion:', query);
            const response = await chrome.runtime.sendMessage({
                action: 'queryModel',
                prompt: query,
                context: {
                    location: await getCurrentLocation()
                }
            });

            console.log('Received expanded query:', response);

            if (response) {
                searchBox.value = response;
                searchBox.focus();
                // Optionally trigger a search
                const searchForm = searchBox.closest('form');
                if (searchForm) searchForm.submit();
            }
        } catch (error) {
            console.error('Error expanding query:', error);
        } finally {
            setLoadingState(false);
        }
    });

    const searchWrapper = searchBox.closest('div');
    if (searchWrapper) {
        searchWrapper.style.position = 'relative';
        searchWrapper.appendChild(button);
        console.log('Button added successfully');
    }
}

// Add the related topics button with improved UI
function addRelatedTopicsButton() {
    console.log('Attempting to add related topics button');
    
    // Check if button already exists
    if (document.getElementById('getRelatedTopics')) {
        console.log('Related topics button already exists');
        return;
    }

    const button = document.createElement('button');
    button.id = 'getRelatedTopics';
    button.className = 'feature-button';
    
    // Create icon and text elements
    const buttonContent = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🎯</span>
            <span>Related Topics</span>
        </div>
    `;
    
    button.innerHTML = buttonContent;
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 50px;
        cursor: pointer;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 14px;
        color: #333;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 140px;
        opacity: 0.9;
    `;

    // Add hover effects
    button.onmouseover = () => {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        button.style.opacity = '1';
        button.style.borderColor = '#1a73e8';
    };
    
    button.onmouseout = () => {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        button.style.opacity = '0.9';
        button.style.borderColor = '#e0e0e0';
    };

    // Add click handler
    button.addEventListener('click', handleRelatedTopicsClick);

    // Add to document
    document.body.appendChild(button);
    console.log('Related topics button added successfully');
}

// Initialize features
function initializeFeatures() {
    console.log('Initializing features...');
    addButtons();
}

// Add immediate execution
console.log('Content script loaded');
initializeFeatures();

// Add event listeners for dynamic page changes
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded event fired');
    initializeFeatures();
});

window.addEventListener('load', () => {
    console.log('Load event fired');
    initializeFeatures();
});

// Add observer for dynamic content
const observer = new MutationObserver((mutations) => {
    console.log('DOM mutation observed');
    addButtons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Add this function for handling related topics clicks
async function handleRelatedTopicsClick(e) {
    e.preventDefault();
    const button = e.target.closest('#getRelatedTopics');
    if (!button) return;

    try {
        // Show loading state
        const originalContent = button.innerHTML;
        button.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">⌛</span>
                <span>Analyzing...</span>
            </div>
        `;
        button.disabled = true;

        // Get page content
        const pageText = document.body.innerText;

        // Send message to background script
        const response = await chrome.runtime.sendMessage({
            action: 'getRelatedTopics',
            pageText: pageText
        });

        console.log('Received response:', response);

        if (response.success && response.topics) {
            displayTopics(response.topics);
        } else {
            console.error('Error:', response.error);
            alert('Could not generate related topics. Please try again.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred. Please try again.');
    } finally {
        // Reset button state
        button.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🎯</span>
                <span>Related Topics</span>
            </div>
        `;
        button.disabled = false;
    }
}

// Add the function to display topics
function displayTopics(topics) {
    // Remove existing topics container if it exists
    const existingContainer = document.getElementById('related-topics-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create container for topics
    const container = document.createElement('div');
    container.id = 'related-topics-container';
    container.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 16px;
        z-index: 999998;
        max-width: 300px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    `;

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #eee;
    `;
    header.innerHTML = `
        <span style="font-weight: bold; color: #333;">Related Topics</span>
        <button style="border: none; background: none; cursor: pointer; font-size: 18px; color: #666;">&times;</button>
    `;
    
    // Add close functionality
    header.querySelector('button').onclick = () => container.remove();

    // Add topics list
    const list = document.createElement('div');
    list.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    topics.forEach(topic => {
        const topicElement = document.createElement('a');
        topicElement.href = topic.searchUrl;
        topicElement.target = '_blank';
        topicElement.style.cssText = `
            color: #1a73e8;
            text-decoration: none;
            padding: 8px 12px;
            border-radius: 6px;
            background: #f8f9fa;
            transition: all 0.2s ease;
        `;
        topicElement.onmouseover = () => {
            topicElement.style.background = '#e8f0fe';
        };
        topicElement.onmouseout = () => {
            topicElement.style.background = '#f8f9fa';
        };
        topicElement.textContent = topic.text;
        list.appendChild(topicElement);
    });

    container.appendChild(header);
    container.appendChild(list);
    document.body.appendChild(container);
}




