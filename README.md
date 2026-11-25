# Classroom Quiz Competition Scoreboard (Offline-First)

An offline-first live quiz competition scoreboard designed with a clean, traditional classroom aesthetic inspired by Classroomscreen.

## Features

- **100% Offline**: Zero internet, cloud, CDN, or external API dependencies. Uses local SQLite (`node:sqlite`), local WebSockets (`socket.io`), local system fonts, and locally generated `.wav` audio files.
- **Two Synchronized Interfaces**:
  - **Admin Control Panel** (`/`): Manage teams, scores (`+5/+10/+20/+50`, `-5/-10/-20`, custom points), undo/redo, rounds, question numbers, timestamp-based countdown timer, sound/animation settings, and CSV export.
  - **Presentation Mode** (`/?mode=presentation`): Distraction-free, 16:9 projector-ready display with large timer, animated score updates, overtaking highlights, round completion overlay, and winner announcement with confetti.
- **Accurate Timestamp-Based Timer**: No drift; preserves remaining time across pause/resume and server restarts. Includes `3 → 2 → 1 → GO!` starting countdown and warning stages (amber at 30s, red at 10s, pulsing at 5s/2s, ticking at 3s, `TIME'S UP!` at 0s).
- **Local Multi-Screen Support**:
  - **Single Laptop (Electron)**: Run `npm run electron:start` and click **Open Presentation** to launch a second window you can drag to an external projector.
  - **Multiple Devices (LAN)**: Run `npm start` and open the displayed LAN URL (`http://<your-ip>:3847/?mode=presentation`) on any projector-connected laptop or tablet on the same local network.

## Quick Start

```bash
# Install dependencies
npm install

# Build the frontend and start the local server
npm start

# Or launch as an Electron desktop app
npm run electron:start

# Run automated backend tests
npm test
```
