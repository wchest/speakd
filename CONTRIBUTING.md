# Contributing to Speakd

Thanks for your interest in contributing to Speakd!

## Development Setup

### Prerequisites

- GJS (GNOME JavaScript)
- GTK 4 and libadwaita
- GStreamer 1.0
- meson and ninja (for building)

Install dependencies on Ubuntu/Debian:

```bash
sudo apt install \
    gjs \
    libgtk-4-dev \
    libadwaita-1-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    gstreamer1.0-pipewire \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gir1.2-gtk-4.0 \
    gir1.2-adw-1 \
    gir1.2-gst-plugins-base-1.0 \
    wl-clipboard \
    meson \
    ninja-build
```

### Running from Source

No build step required for development:

```bash
gjs -m src/main.js
```

### Project Structure

```
speakd/
├── src/
│   ├── main.js           # Entry point
│   ├── application.js    # GtkApplication subclass
│   ├── window.js         # Main window UI
│   ├── preferences.js    # Preferences dialog
│   └── services/
│       ├── audioService.js     # GStreamer audio capture
│       ├── deepgramService.js  # Deepgram WebSocket API
│       ├── outputService.js    # Clipboard/typing output
│       └── settingsService.js  # Settings management
├── data/
│   ├── icons/            # App icons (PNG at various sizes)
│   ├── *.desktop.in      # Desktop entry template
│   ├── *.metainfo.xml.in # AppStream metadata template
│   └── *.gschema.xml     # GSettings schema
└── meson.build           # Build configuration
```

## Making Changes

### Code Style

- Use ES6+ JavaScript features (classes, async/await, arrow functions)
- Use GObject for classes that need signals or properties
- Follow GNOME HIG for UI design
- Keep functions focused and small

### Testing

Test your changes by running the app:

```bash
# Normal run
gjs -m src/main.js

# With debug output
GJS_DEBUG_OUTPUT=stderr gjs -m src/main.js
```

### Commits

- Write clear, concise commit messages
- Reference issues where applicable (#123)
- Keep commits focused on single changes

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

## Reporting Issues

When reporting bugs, please include:

- Your Linux distribution and version
- Desktop environment (GNOME, KDE, etc.)
- Steps to reproduce the issue
- Any error messages from the console

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- What problem the feature would solve
- How you envision it working
- Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
