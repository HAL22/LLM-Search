# SearchWhisper 🔍✨

Your AI companion that whispers smarter search suggestions. SearchWhisper enhances your Google searches by intelligently expanding queries based on your location and browsing context.

## Features

### 🔍 AI Query Expansion
- Intelligently expands your search queries using AI
- Takes into account:
  - Current location context
  - Recent browsing history
  - Original search intent
- Helps discover more relevant search results

### 🌍 Location-Aware
- Automatically includes geographical context
- Uses Nominatim (OpenStreetMap) for location services
- Caches location data for 5 minutes to minimize API calls
- Privacy-focused with no API key requirements

### 📚 Browsing History Context
- Incorporates your recent browsing history (last 30 minutes)
- Uses your recent interests to improve search relevance
- All processing happens locally for privacy

### 🔄 Dynamic Updates
- Works seamlessly with Google's dynamic search interface
- Automatically adapts to page changes
- Responsive design that doesn't interfere with search functionality

## Privacy
- No data is stored on external servers
- Location data is cached locally and refreshed every 5 minutes
- Browsing history is only accessed temporarily for search context
- All AI processing happens through your specified endpoint

## Usage
1. Enter a search query in Google
2. Click the "🔍 AI Expand" button below the search box
3. The AI will enhance your query based on context
4. Results will automatically update with the expanded query

## Requirements
- Chrome browser
- Required permissions:
  - Geolocation
  - Browser history
  - Active tab

# SearchWhisper - Testing Instructions 🔍✨

## Overview
SearchWhisper enhances your Google searches with two AI-powered features:
1. **AI Query Expansion**: Intelligently expands your search with contextual information
2. **Related Topics**: Suggests related search topics based on your query

## Quick Setup (2-3 minutes)
1. Clone the repository:
   ```bash
   git clone git@github.com:HAL22/LLM-Search.git
   ```

2. Install in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the project directory

## Test Feature 1: AI Query Expansion (2-3 minutes)
1. Go to Google.com
2. Type "restaurants"
3. Look for "🔍 AI Expand" button below search box
4. Click to see enhanced query with:
   - Location context
   - Recent browsing context
   - Smarter search terms

## Test Feature 2: Related Topics (2-3 minutes)
1. Type any search query
2. Click "🔍 Related Topics" button
3. View suggested related searches
4. Click any suggestion to start a new search

## What to Expect
- Both buttons appear below search box
- AI Expand: Enhances current query
- Related Topics: Shows new search suggestions
- Smooth transitions between searches

## Privacy Features
- All processing is local
- Location cached for 5 minutes
- Uses last 30 minutes of history
- No external data storage

## Troubleshooting
- Refresh page if buttons don't appear
- Check permissions if features don't work
- Location and history access are optional

## Requirements
- Chrome browser
- Internet connection
- Permissions:
  - Location (optional)
  - History (optional)
  - Active tab

## Contact
Issues or questions:
- Email: thethelafaltein@gmail.com
- GitHub: https://github.com/HAL22/LLM-Search
