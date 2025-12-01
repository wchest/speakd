# Vox - Claude Code Quick Start Guide

## Session 1: Project Bootstrap

### Goal
Get a minimal GTK4/libadwaita app running that:
- Launches with a window
- Has proper meson build system
- Includes GitHub Actions CI
- Can be run locally for development

---

## Project Setup Commands

Run these first to set up the development environment:

```bash
# Install dependencies (Ubuntu 22.04+)
sudo apt update && sudo apt install -y \
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
    ninja-build \
    git

# Create project directory
mkdir -p ~/Projects/vox
cd ~/Projects/vox
git init
```

---

## File Structure to Create

```
vox/
├── src/
│   ├── main.js
│   ├── application.js
│   ├── window.js
│   └── meson.build
├── data/
│   ├── io.github.wchest.Vox.desktop.in
│   ├── io.github.wchest.Vox.metainfo.xml.in
│   ├── io.github.wchest.Vox.gschema.xml
│   ├── io.github.wchest.Vox.svg
│   └── meson.build
├── .github/
│   └── workflows/
│       └── ci.yml
├── meson.build
├── meson_options.txt
├── LICENSE
└── README.md
```

---

## Key Files Content

### 1. Root meson.build

```meson
project('vox',
  version: '0.1.0',
  license: 'MIT',
  meson_version: '>= 0.59.0',
)

gnome = import('gnome')

# Dependencies
dependency('gjs-1.0', version: '>= 1.72.0')
dependency('gtk4', version: '>= 4.6.0')
dependency('libadwaita-1', version: '>= 1.2.0')

# App ID - UPDATE THIS
app_id = 'io.github.wchest.Vox'

# Directories
prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')
pkgdatadir = datadir / meson.project_name()

# Subdirectories
subdir('data')
subdir('src')

gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
  update_desktop_database: true,
)
```

### 2. src/meson.build

```meson
# Configure the launcher script
configure_file(
  input: 'main.js',
  output: 'vox',
  configuration: {
    'APP_ID': app_id,
    'VERSION': meson.project_version(),
    'PKGDATADIR': pkgdatadir,
    'GJS': find_program('gjs').full_path(),
  },
  install: true,
  install_dir: bindir,
)

# Install source files
sources = files(
  'application.js',
  'window.js',
)

install_data(sources, install_dir: pkgdatadir)
```

### 3. src/main.js (launcher script)

```javascript
#!/usr/bin/env -S @GJS@ -m
// -*- mode: js -*-

import GLib from 'gi://GLib';
import { programInvocationName, programArgs } from 'system';

// Set up package info
const APP_ID = '@APP_ID@';
const VERSION = '@VERSION@';
const PKGDATADIR = '@PKGDATADIR@';

// Add pkgdatadir to search path
imports.searchPath.unshift(PKGDATADIR);

GLib.set_prgname(APP_ID);
GLib.set_application_name('Vox');

const { VoxApplication } = await import('./application.js');

const app = new VoxApplication({
    application_id: APP_ID,
    version: VERSION,
});

const exitCode = app.run([programInvocationName, ...programArgs]);
System.exit(exitCode);
```

### 4. src/application.js

```javascript
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { VoxWindow } from './window.js';

export const VoxApplication = GObject.registerClass(
class VoxApplication extends Adw.Application {
    
    constructor(params = {}) {
        super(params);
        
        this._version = params.version || '0.0.0';
        
        // Add actions
        const quitAction = new Gio.SimpleAction({ name: 'quit' });
        quitAction.connect('activate', () => this.quit());
        this.add_action(quitAction);
        this.set_accels_for_action('app.quit', ['<Control>q']);
        
        const aboutAction = new Gio.SimpleAction({ name: 'about' });
        aboutAction.connect('activate', () => this._showAbout());
        this.add_action(aboutAction);
    }
    
    vfunc_activate() {
        let window = this.active_window;
        
        if (!window) {
            window = new VoxWindow({ application: this });
        }
        
        window.present();
    }
    
    _showAbout() {
        const dialog = new Adw.AboutDialog({
            application_name: 'Vox',
            application_icon: this.application_id,
            developer_name: 'Will',
            version: this._version,
            website: 'https://github.com/wchest/vox',
            issue_url: 'https://github.com/wchest/vox/issues',
            license_type: Gtk.License.MIT_X11,
            developers: ['Will'],
        });
        
        dialog.present(this.active_window);
    }
});
```

### 5. src/window.js

```javascript
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export const VoxWindow = GObject.registerClass(
class VoxWindow extends Adw.ApplicationWindow {
    
    constructor(params = {}) {
        super(params);
        
        this.set_default_size(400, 500);
        this.set_title('Vox');
        
        // Create header bar
        const headerBar = new Adw.HeaderBar();
        
        // Menu button
        const menuButton = new Gtk.MenuButton({
            icon_name: 'open-menu-symbolic',
            menu_model: this._createMenu(),
        });
        headerBar.pack_end(menuButton);
        
        // Main content
        const statusPage = new Adw.StatusPage({
            icon_name: 'audio-input-microphone-symbolic',
            title: 'Vox',
            description: 'Voice dictation for Linux',
        });
        
        const startButton = new Gtk.Button({
            label: 'Start Listening',
            halign: Gtk.Align.CENTER,
            css_classes: ['suggested-action', 'pill'],
        });
        startButton.connect('clicked', () => {
            console.log('Start listening clicked');
        });
        
        statusPage.set_child(startButton);
        
        // Main layout
        const toolbarView = new Adw.ToolbarView();
        toolbarView.add_top_bar(headerBar);
        toolbarView.set_content(statusPage);
        
        this.set_content(toolbarView);
    }
    
    _createMenu() {
        const menu = new Gio.Menu();
        menu.append('Preferences', 'app.preferences');
        menu.append('Keyboard Shortcuts', 'win.show-help-overlay');
        menu.append('About Vox', 'app.about');
        menu.append('Quit', 'app.quit');
        return menu;
    }
});
```

### 6. data/meson.build

```meson
# Desktop file
desktop_conf = configuration_data()
desktop_conf.set('APP_ID', app_id)

configure_file(
  input: app_id + '.desktop.in',
  output: app_id + '.desktop',
  configuration: desktop_conf,
  install: true,
  install_dir: datadir / 'applications',
)

# AppStream metadata
metainfo_conf = configuration_data()
metainfo_conf.set('APP_ID', app_id)

configure_file(
  input: app_id + '.metainfo.xml.in',
  output: app_id + '.metainfo.xml',
  configuration: metainfo_conf,
  install: true,
  install_dir: datadir / 'metainfo',
)

# GSettings schema
install_data(
  app_id + '.gschema.xml',
  install_dir: datadir / 'glib-2.0' / 'schemas',
)

# Icons
install_data(
  app_id + '.svg',
  install_dir: datadir / 'icons' / 'hicolor' / 'scalable' / 'apps',
)
```

### 7. data/io.github.wchest.Vox.desktop.in

```ini
[Desktop Entry]
Name=Vox
Comment=Voice dictation for Linux
Exec=vox
Icon=@APP_ID@
Terminal=false
Type=Application
Categories=Utility;Accessibility;
Keywords=voice;dictation;speech;transcription;
StartupNotify=true
```

### 8. data/io.github.wchest.Vox.gschema.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="io.github.wchest.Vox" path="/io/github/wchest/Vox/">
    
    <key name="api-key" type="s">
      <default>''</default>
      <summary>Deepgram API key</summary>
    </key>
    
    <key name="listening-mode" type="s">
      <default>'always-on'</default>
      <choices>
        <choice value='always-on'/>
        <choice value='push-to-talk'/>
        <choice value='toggle'/>
      </choices>
      <summary>Listening mode</summary>
    </key>
    
    <key name="output-mode" type="s">
      <default>'clipboard'</default>
      <choices>
        <choice value='clipboard'/>
        <choice value='insert'/>
        <choice value='both'/>
      </choices>
      <summary>Output mode</summary>
    </key>
    
    <key name="vad-threshold" type="d">
      <default>0.5</default>
      <range min="0.1" max="0.9"/>
      <summary>VAD sensitivity</summary>
    </key>
    
    <key name="silence-duration" type="i">
      <default>1500</default>
      <range min="500" max="5000"/>
      <summary>Silence duration before finalizing (ms)</summary>
    </key>
    
    <key name="input-device" type="s">
      <default>''</default>
      <summary>Selected input device</summary>
    </key>
    
  </schema>
</schemalist>
```

### 9. data/io.github.wchest.Vox.metainfo.xml.in

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>@APP_ID@</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  
  <name>Vox</name>
  <summary>Voice dictation for Linux</summary>
  <description>
    <p>
      Vox is a native Linux voice dictation application that uses
      Deepgram's streaming API for fast, accurate transcription.
    </p>
    <p>Features:</p>
    <ul>
      <li>Always-on listening with intelligent turn detection</li>
      <li>Direct text injection at cursor position</li>
      <li>Modern GNOME-native interface</li>
      <li>Configurable VAD sensitivity</li>
    </ul>
  </description>
  
  <launchable type="desktop-id">@APP_ID@.desktop</launchable>
  
  <url type="homepage">https://github.com/wchest/vox</url>
  <url type="bugtracker">https://github.com/wchest/vox/issues</url>
  
  <developer id="io.github.wchest">
    <name>Will</name>
  </developer>
  
  <content_rating type="oars-1.1" />
  
  <releases>
    <release version="0.1.0" date="2024-01-01">
      <description>
        <p>Initial release</p>
      </description>
    </release>
  </releases>
</component>
```

### 10. data/io.github.wchest.Vox.svg (placeholder icon)

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3584e4"/>
      <stop offset="100%" style="stop-color:#1c71d8"/>
    </linearGradient>
  </defs>
  
  <!-- Background circle -->
  <circle cx="64" cy="64" r="60" fill="url(#bg)"/>
  
  <!-- Microphone body -->
  <rect x="48" y="28" width="32" height="48" rx="16" fill="white"/>
  
  <!-- Microphone stand -->
  <path d="M64 76 L64 96" stroke="white" stroke-width="6" stroke-linecap="round"/>
  <path d="M48 96 L80 96" stroke="white" stroke-width="6" stroke-linecap="round"/>
  
  <!-- Microphone holder arc -->
  <path d="M40 56 Q40 84 64 84 Q88 84 88 56" 
        stroke="white" stroke-width="6" fill="none" stroke-linecap="round"/>
  
  <!-- Sound waves -->
  <path d="M96 48 Q104 64 96 80" stroke="white" stroke-width="4" fill="none" opacity="0.6" stroke-linecap="round"/>
  <path d="M104 40 Q116 64 104 88" stroke="white" stroke-width="4" fill="none" opacity="0.4" stroke-linecap="round"/>
</svg>
```

### 11. .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-24.04
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            gjs \
            libgtk-4-dev \
            libadwaita-1-dev \
            libgstreamer1.0-dev \
            libgstreamer-plugins-base1.0-dev \
            gir1.2-gtk-4.0 \
            gir1.2-adw-1 \
            meson \
            ninja-build
      
      - name: Build
        run: |
          meson setup build
          meson compile -C build
      
      - name: Validate desktop file
        run: |
          desktop-file-validate build/data/*.desktop || true
      
      - name: Validate AppStream metadata
        run: |
          appstreamcli validate build/data/*.metainfo.xml || true

  flatpak:
    runs-on: ubuntu-24.04
    container:
      image: bilelmoussaoui/flatpak-github-actions:gnome-46
      options: --privileged
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: flatpak/flatpak-github-actions/flatpak-builder@v6
        with:
          bundle: vox.flatpak
          manifest-path: flatpak/io.github.wchest.Vox.yaml
          cache-key: flatpak-builder-${{ github.sha }}
```

### 12. LICENSE

```
MIT License

Copyright (c) 2024 Will

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 13. README.md

```markdown
# Vox 🎤

Voice dictation for Linux, powered by Deepgram.

![CI](https://github.com/wchest/vox/actions/workflows/ci.yml/badge.svg)

## Features

- **Always-on listening** with intelligent voice activity detection
- **Fast transcription** using Deepgram's streaming API
- **Direct text injection** at cursor position (Wayland)
- **Native GNOME interface** with libadwaita
- **Configurable** VAD sensitivity and output modes

## Installation

### Flatpak (Recommended)

```bash
flatpak install io.github.wchest.Vox
```

### From Source

```bash
# Install dependencies
sudo apt install gjs libgtk-4-dev libadwaita-1-dev meson

# Build
meson setup build
meson compile -C build

# Install
sudo meson install -C build
```

## Usage

1. Get a free Deepgram API key at [console.deepgram.com](https://console.deepgram.com)
2. Launch Vox and enter your API key
3. Select your microphone
4. Start speaking!

## Configuration

Settings are stored in GSettings under `io.github.wchest.Vox`.

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
./build/src/vox

# With debugging
GJS_DEBUG_OUTPUT=stderr ./build/src/vox
```

## License

MIT License - see [LICENSE](LICENSE)
```

---

## Build & Run Commands

```bash
# After creating all files:
cd ~/Projects/vox

# Build
meson setup build
meson compile -C build

# Run (during development)
./build/src/vox

# Install system-wide
sudo meson install -C build

# Uninstall
sudo ninja -C build uninstall
```

---

## Verification Checklist

After Session 1, verify:

- [ ] `meson setup build` completes without errors
- [ ] `meson compile -C build` succeeds
- [ ] `./build/src/vox` launches a window
- [ ] Window has Adwaita styling (rounded corners, proper header bar)
- [ ] "Start Listening" button appears
- [ ] About dialog shows correct info
- [ ] Ctrl+Q quits the app

---

## Notes for Claude Code

When starting the Claude Code session, say:

> I'm building Vox, a voice dictation app for Linux. I have a planning guide with the full architecture.
>
> For this session, I want to bootstrap the project:
> - GTK4 + libadwaita via GJS
> - Meson build system
> - GitHub Actions CI
> - Just get a window to launch
>
> App ID: io.github.[wchest].Vox
> 
> Here's the quick-start guide with the file contents: [paste this file or upload it]

---

## Next Session Preview

**Session 2: Settings & UI**
- Create `PreferencesDialog` 
- Implement API key input with validation
- Add settings service wrapping GSettings
- Create audio device dropdown (non-functional placeholder)
