# Speakd

Voice dictation for Linux, powered by Deepgram.

![CI](https://github.com/wchest/speakd/actions/workflows/ci.yml/badge.svg)

## Features

- **Always-on listening** with intelligent voice activity detection
- **Fast transcription** using Deepgram's streaming API
- **Direct text injection** at cursor position (Wayland)
- **Native GNOME interface** with libadwaita
- **Configurable** VAD sensitivity and output modes

## Installation

### From Source

```bash
# Install dependencies (Ubuntu 22.04+)
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
    wtype \
    wl-clipboard \
    meson \
    ninja-build

# Build
meson setup build
meson compile -C build

# Install
sudo meson install -C build
```

## Usage

1. Get a free Deepgram API key at [console.deepgram.com](https://console.deepgram.com)
2. Launch Speakd and enter your API key
3. Select your microphone
4. Start speaking!

## Configuration

Settings are stored in GSettings under `io.github.wchest.Speakd`.

| Setting | Description | Default |
|---------|-------------|---------|
| `listening-mode` | always-on, push-to-talk, toggle | always-on |
| `output-mode` | clipboard, insert, both | clipboard |
| `vad-threshold` | VAD sensitivity (0.1-0.9) | 0.5 |
| `silence-duration` | Silence before finalizing (ms) | 1500 |

## Development

```bash
# Run locally
meson setup build
meson compile -C build
./build/src/speakd

# With debugging
GJS_DEBUG_OUTPUT=stderr ./build/src/speakd
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Q` | Quit |

## License

MIT License - see [LICENSE](LICENSE)
