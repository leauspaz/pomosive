# Pomosive

An adaptive Pomodoro timer that learns from your focus patterns and adjusts work blocks accordingly.

## Features

- **Adaptive Work Blocks**: The timer adjusts session length based on your self-reported focus level
  - Distracted: halves the next block
  - Okay-ish: increases by 50%
  - Focused: doubles the block
  - Flow: doubles up to a 90 minute maximum

- **Smart Breaks**: Break duration is calculated from your work block length and focus rating
  - Focused and Flow states under thresholds skip breaks entirely
  - Longer blocks earn proportionally longer breaks

- **Overtime Tracking**: When a timer completes, it keeps running in overtime mode so you never lose track of time

- **Session History**: All sessions stored locally in your browser via IndexedDB

- **Data Export/Import**: Back up and restore your data in JSON, CSV, or Markdown format

- **Visual Stats**: Bar charts showing daily, weekly, and monthly focus patterns with rating breakdowns

- **PWA Support**: Install as a standalone app on mobile and desktop

- **Keyboard Shortcuts**:
  - Space: Play / Pause
  - R: Reset
  - S: Skip
  - 1-4: Rate session (when rating overlay is open)
  - D: Toggle dark mode
  - ?: Show keyboard shortcuts

## Focus Ratings

| Rating | Icon | Description |
|--------|------|-------------|
| Distracted | Frowning face | Mind wandered, hard to concentrate |
| Okay-ish | Neutral face | Got some things done, but not fully engaged |
| Focused | Target | In the zone, productive |
| Flow | Lightning bolt | Lost track of time, deep work |

## Adaptive Rules

- Minimum work block: 5 minutes
- Maximum single work block: 90 minutes
- Maximum daily work: 4 hours (forced long break after)
- 3 consecutive Distracted ratings suggest stopping for the day
- Over 3 hours of Flow time triggers burnout warning

## Hosting

This is a static site designed for GitHub Pages. Simply push all files to your repository and enable Pages in repository settings.

No build step required. All dependencies are loaded from CDN or self-contained.

## Data Storage

All data is stored locally in your browser:
- Session history: IndexedDB
- Settings and daily totals: localStorage

Data never leaves your device unless you explicitly export it.

## Browser Support

Requires a modern browser with support for:
- ES6 modules and classes
- IndexedDB
- Web Audio API (for optional sound)
- CSS custom properties

Tested on Chrome, Firefox, Safari, and Edge (latest versions).
