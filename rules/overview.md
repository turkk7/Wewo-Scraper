# Google Maps Data Scraper - Chrome Extension

## Overview
This Chrome Extension allows users to extract business data from Google Maps efficiently. Users can search for businesses (e.g., "Beauty Salon in Jeddah"), then extract details such as name, address, phone number, email, website, rating, and review count. The extracted data can be downloaded as a CSV file.

## Features
- **Business Search Integration:** Works with Google Maps search results.
- **Customizable Data Selection:** Users can choose which fields to extract.
- **Extraction Limit:** Allows users to specify the number of businesses to extract (20-100).
- **Progress Indicator:** Displays extraction progress with real-time count.
- **CSV Export:** Downloads extracted data in CSV format.

## User Flow
### 1. User Searches for a Business on Google Maps
- The user navigates to [Google Maps](https://www.google.com/maps).
- They search for a business category (e.g., "Beauty Salon in Jeddah").

### 2. Open Chrome Extension
- The user clicks the extension icon in the Chrome toolbar.
- The extension popup UI appears.

### 3. Select Extraction Options
- User selects the number of businesses to extract (20-100).
- Checkboxes allow the user to choose the data fields to extract:
  - Business Name
  - Address
  - Phone Number
  - Email
  - Website
  - Rating
  - Review Count

### 4. Start Extraction
- The user clicks the "Start Extraction" button.
- The extension begins scraping data in the background.
- A progress bar and counter display real-time updates.

### 5. Download Extracted Data
- Once extraction is complete, a "Download CSV" button appears.
- The user clicks to download the extracted data as a CSV file.

## Technical Details
### **1. Content Script**
- Injects JavaScript into the Google Maps page to read DOM elements.
- Extracts business data from the search results.

### **2. Background Script**
- Manages communication between the content script and popup UI.
- Handles data storage and processing.

### **3. Popup UI**
- Displays user controls and extraction status.
- Provides a download button for CSV export.

### **4. Permissions**
- Requires `activeTab` permission to access Google Maps.
- Uses `downloads` permission to save CSV files.

## Data Extraction Logic
1. Locate business listings in the search results.
2. Extract text content for selected fields.
3. Format data into a structured JSON object.
4. Convert JSON to CSV format.
5. Provide the CSV file for download.

## Future Enhancements
- **Pagination Handling:** Extend scraping across multiple pages.
- **Auto Scroll:** Automatically load more results before extraction.
- **Cloud Storage Integration:** Save extracted data to Google Drive.

## Conclusion
This Chrome Extension provides an efficient way to extract business data from Google Maps with a simple user interface and CSV export functionality.

