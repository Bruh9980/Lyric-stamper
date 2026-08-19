# Timed Lyrics Editor

## Overview
Timed Lyrics Editor is a web application designed to facilitate the editing and synchronization of song lyrics with audio tracks. The tool allows users to input lyrics, timestamp them, and export them in the LRC format. It features a clean and responsive design, making it suitable for both desktop and mobile devices.

## Features
- Audio waveform visualization using Wavesurfer.js
- Custom audio controls for play/pause and seeking
- Tabbed navigation for easy access to different functionalities:
  - **Lyrics**: Input and edit raw lyrics
  - **Syncer**: Timestamp lyrics and manage synchronization
  - **Preview**: View lyrics with timestamps in real-time
  - **Metadata**: Add metsadata for LRC files
  - **Download**: Download the finalized LRC file
  - **Settings & Help**: Access documentation and keyboard shortcuts

## Project Structure
```
timed-lyrics-editor
├── index.html        # Main structure of the web application
├── styles.css        # Styles for the application
├── script.js         # JavaScript functionality
├── assets            # Directory for audio files
│   └── audio         # Audio files for testing
├── libs              # Directory for external libraries
│   └── wavesurfer/   # Wavesurfer.js library (CDN in production)
├── README.md         # Project documentation
└── .gitignore        # Files to ignore in version control
```

## Setup Instructions
1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd timed-lyrics-editor
   ```
3. Open `index.html` in your web browser to run the application.

## Usage Guidelines
- Use the **Lyrics** tab to paste or type your lyrics.
- Navigate to the **Syncer** tab to timestamp your lyrics using the provided shortcuts.
- Preview your work in the **Preview** tab to ensure everything is synchronized correctly.
- Fill in the **Metadata** tab to add necessary information for your LRC file.
- Once completed, use the **Download** tab to export your lyrics as an LRC file.

## Contributing
Feedback and contributions are welcome! Please feel free to submit issues or pull requests.

## License
This project is licensed under the MIT License. See the LICENSE file for details.
