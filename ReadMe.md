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

## Installation
[Add installation instructions here]

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
