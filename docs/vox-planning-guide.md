# Vox - Voice Dictation for Linux
## Technical & Product Planning Guide

**Version:** 1.0  
**Target Platform:** Ubuntu 22.04+, GNOME/Wayland  
**License:** MIT (recommended for open source)  
**Repository:** github.com/[your-org]/vox

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [User Experience](#2-user-experience)
3. [Technical Architecture](#3-technical-architecture)
4. [Component Deep Dives](#4-component-deep-dives)
5. [Implementation Guide](#5-implementation-guide)
6. [Packaging & Distribution](#6-packaging--distribution)
7. [Claude Code Session Guide](#7-claude-code-session-guide)
8. [API Reference](#8-api-reference)
9. [Testing Strategy](#9-testing-strategy)
10. [Future Roadmap](#10-future-roadmap)

---

## 1. Product Vision

### 1.1 Problem Statement

Linux users lack a native, well-integrated voice dictation solution. Existing options are either:
- Windows/Mac only (Dragon, Apple Dictation)
- Browser-based (limited integration)
- Complex to set up (Whisper + custom scripts)
- Poor turn detection (cutting off speech mid-sentence)

### 1.2 Solution

**Vox** is a native Linux voice dictation application that:
- Lives in the system tray, always ready
- Uses Deepgram's streaming API for fast, accurate transcription
- Employs local VAD for intelligent turn detection
- Injects text directly at cursor position or copies to clipboard
- Looks native on GNOME with libadwaita styling

### 1.3 Target Users

| User Type | Needs | Vox Solution |
|-----------|-------|--------------|
| **Writers/Bloggers** | Fast drafting, hands-free | Always-on mode, direct text injection |
| **Developers** | Quick comments, documentation | Clipboard mode, configurable hotkeys |
| **Accessibility Users** | Primary input method | Reliable turn detection, minimal UI |
| **Power Users** | Customization, efficiency | Configurable VAD, multiple modes |

### 1.4 Success Metrics

- Transcription latency < 500ms
- Turn detection accuracy > 95% (no premature cutoffs)
- First-time setup < 2 minutes
- System resource usage < 100MB RAM idle, < 5% CPU when listening

---

## 2. User Experience

### 2.1 First Run Flow

```
┌─────────────────────────────────────────────────────┐
│                  Welcome to Vox                     │
│                                                     │
│  Voice dictation for Linux, powered by Deepgram    │
│                                                     │
│  To get started, you'll need:                      │
│  • A Deepgram API key (free tier available)        │
│  • A microphone                                     │
│                                                     │
│  [Get API Key →]              [I have a key]       │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              Enter Your API Key                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ ••••••••••••••••••••••••••••••••••••••••••   │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Your key is stored locally and never shared.      │
│                                                     │
│                              [Verify & Continue]   │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              Select Your Microphone                 │
│                                                     │
│  ○ Built-in Microphone                             │
│  ● Blue Yeti USB                          [Test]   │
│  ○ Webcam Microphone                               │
│                                                     │
│  Level: ████████░░░░░░░░░░░░ (Good)               │
│                                                     │
│                                        [Continue]   │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                 You're All Set!                     │
│                                                     │
│  Vox is now running in your system tray.           │
│                                                     │
│  🎤 Speak to dictate text                          │
│  📋 Text will be copied to clipboard               │
│                                                     │
│  Tip: Use Super+Shift+V to toggle listening        │
│                                                     │
│  [Open Settings]                    [Start Using]   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Main Window

```
┌─────────────────────────────────────────────────────────────────┐
│  Vox                                               [─] [□] [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         🎤                                      │
│                                                                 │
│                    Listening...                                 │
│              ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ The quick brown fox jumps over the lazy dog.              │ │
│  │                                                           │ │
│  │ _                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Mode: Always On          Output: Clipboard + Insert           │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  This session: 2.4 minutes transcribed (~$0.006)               │
│                                                                 │
│              [⏸ Pause]        [⚙ Settings]        [📋 Copy]    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 System Tray States

| State | Icon | Tooltip | Menu Options |
|-------|------|---------|--------------|
| **Idle** | 🎤 (gray) | "Vox - Click to start" | Start Listening, Settings, Quit |
| **Listening** | 🎤 (blue) | "Vox - Listening..." | Pause, Settings, Quit |
| **Transcribing** | 🎤 (green, pulsing) | "Vox - Transcribing..." | Pause, Settings, Quit |
| **Paused** | 🎤 (orange) | "Vox - Paused" | Resume, Settings, Quit |
| **Error** | 🎤 (red) | "Vox - Connection error" | Retry, Settings, Quit |

### 2.4 Settings Window

```
┌─────────────────────────────────────────────────────────────────┐
│  Preferences                                       [─] [□] [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ General │ Audio │ Output │ Advanced │ About │           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  GENERAL                                                        │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Start on login                                    [Toggle ON]  │
│  Start minimized to tray                           [Toggle ON]  │
│                                                                 │
│  Listening Mode                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ● Always On - Transcribe whenever speech is detected     │  │
│  │ ○ Push-to-Talk - Only transcribe when hotkey is held     │  │
│  │ ○ Toggle - Press hotkey to start/stop listening          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Global Hotkey                          [Super + Shift + V]     │
│                                                                 │
│  DEEPGRAM                                                       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  API Key                    [••••••••••••••••••••] [Change]     │
│  Status: ✓ Connected                                            │
│                                                                 │
│  Usage This Month                                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ████████████░░░░░░░░░░░░░░░░░░░░  12.4 / 60 minutes     │  │
│  │ Estimated cost: $0.03                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Super+Shift+V` | Toggle listening (configurable) |
| `Super+Shift+P` | Pause/Resume |
| `Escape` | Cancel current transcription |
| `Super+Shift+C` | Copy last transcription |

---

## 3. Technical Architecture

### 3.1 System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              VOX APPLICATION                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         PRESENTATION LAYER                            │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │ MainWindow  │  │ Preferences │  │ SystemTray  │  │  Indicator  │  │ │
│  │  │   (GTK4)    │  │  (Adwaita)  │  │  (AppInd.)  │  │   Status    │  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │ │
│  └─────────┼────────────────┼────────────────┼────────────────┼─────────┘ │
│            │                │                │                │           │
│  ┌─────────▼────────────────▼────────────────▼────────────────▼─────────┐ │
│  │                        APPLICATION LAYER                              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐   │ │
│  │  │                    VoxController (main.js)                     │   │ │
│  │  │  • State management (idle/listening/transcribing/paused)      │   │ │
│  │  │  • Event coordination                                          │   │ │
│  │  │  • Error handling & recovery                                   │   │ │
│  │  └───────────────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│            │                │                │                │           │
│  ┌─────────▼────────────────▼────────────────▼────────────────▼─────────┐ │
│  │                         SERVICE LAYER                                 │ │
│  │                                                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │ │
│  │  │  AudioService   │  │   VADService    │  │ TranscriptionService│   │ │
│  │  │                 │  │                 │  │                     │   │ │
│  │  │ • Device enum   │  │ • Speech detect │  │ • Deepgram WS       │   │ │
│  │  │ • Audio capture │  │ • Silence timer │  │ • Reconnection      │   │ │
│  │  │ • Level metering│  │ • Threshold cfg │  │ • Error handling    │   │ │
│  │  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘   │ │
│  │           │                    │                      │              │ │
│  │  ┌────────▼────────┐  ┌────────▼────────┐  ┌──────────▼──────────┐   │ │
│  │  │  OutputService  │  │ SettingsService │  │   UsageService      │   │ │
│  │  │                 │  │                 │  │                     │   │ │
│  │  │ • Clipboard     │  │ • GSettings     │  │ • Track minutes     │   │ │
│  │  │ • Text inject   │  │ • Config file   │  │ • Cost estimation   │   │ │
│  │  │ • Mode handling │  │ • Validation    │  │ • Monthly reset     │   │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────┐
│     SYSTEM INTERFACES         │  │          EXTERNAL SERVICES            │
│                               │  │                                       │
│  • PipeWire (audio)           │  │  • Deepgram Streaming API             │
│  • wtype/ydotool (input)      │  │    wss://api.deepgram.com/v1/listen   │
│  • wl-copy (clipboard)        │  │                                       │
│  • D-Bus (hotkeys, tray)      │  │  • (Future) Whisper.cpp local         │
│  • GSettings (config)         │  │                                       │
└───────────────────────────────┘  └───────────────────────────────────────┘
```

### 3.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AUDIO PROCESSING PIPELINE                      │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│Microphone│───▶│ PipeWire │───▶│   VAD    │───▶│ Deepgram │───▶│  Output  │
│          │    │ Capture  │    │ Filter   │    │ WebSocket│    │ Handler  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │               │               │               │
                     ▼               ▼               ▼               ▼
               ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
               │ 16kHz    │   │ Speech:  │   │ Partial  │   │ Clipboard│
               │ 16-bit   │   │ Send to  │   │ results  │   │    or    │
               │ Mono PCM │   │ Deepgram │   │ + Final  │   │  wtype   │
               └──────────┘   │          │   │ transcript│  └──────────┘
                              │ Silence: │   └──────────┘
                              │ Buffer   │
                              │ locally  │
                              └──────────┘

TIMING EXAMPLE:
═══════════════════════════════════════════════════════════════════════════
Time:     0ms        200ms       500ms      1000ms      1500ms      2000ms
          │           │           │           │           │           │
Audio:    "Hello, my name is John and I live in New York"
          │███████████████████████████████████████████████│
          │                                               │
VAD:      │ SPEECH ────────────────────────────────────── │ SILENCE ──│
          │                                               │           │
Deepgram: │──────────────────────────────────────────────▶│           │
          │ Partial: "Hello"                              │           │
          │ Partial: "Hello my"                           │           │
          │ Partial: "Hello my name is"                   │           │
          │ Partial: "Hello my name is John"              │           │
          │                                    Final: "Hello, my name is │
          │                                    John and I live in       │
          │                                    New York."               │
                                                          │           │
Output:                                                   │──────────▶│
                                                          Text injected
                                                          after 500ms
                                                          silence
═══════════════════════════════════════════════════════════════════════════
```

### 3.3 State Machine

```
                              ┌─────────────┐
                              │             │
                    ┌────────▶│    IDLE     │◀────────┐
                    │         │             │         │
                    │         └──────┬──────┘         │
                    │                │                │
                    │         User starts or          │
                    │         auto-start on login     │
                    │                │                │
                    │                ▼                │
              User pauses     ┌─────────────┐        │
              or error        │             │        │
                    │    ┌───▶│  LISTENING  │───┐    │
                    │    │    │             │   │    │
                    │    │    └──────┬──────┘   │    │
                    │    │           │          │    │
                    │    │    VAD detects       │    │
                    │    │    speech            │    │
                    │    │           │          │    │ User stops
                    │    │           ▼          │    │
              ┌─────┴────┴──┐ ┌─────────────┐  │    │
              │             │ │             │  │    │
              │   PAUSED    │ │TRANSCRIBING │──┼────┘
              │             │ │             │  │
              └─────────────┘ └──────┬──────┘  │
                    ▲                │         │
                    │         Final result     │
                    │         received or      │
                    │         silence timeout  │
                    │                │         │
                    │                ▼         │
                    │         ┌─────────────┐  │
                    │         │             │  │
                    └─────────│  OUTPUTTING │──┘
                              │             │
                              └─────────────┘
                                     │
                              Text sent to
                              clipboard/wtype
                                     │
                              Returns to
                              LISTENING
```

---

## 4. Component Deep Dives

### 4.1 Audio Capture (GStreamer + PipeWire)

#### Pipeline Design
```javascript
// GStreamer pipeline for audio capture
const PIPELINE = `
  pipewiresrc name=src !
  audioconvert !
  audioresample !
  audio/x-raw,format=S16LE,rate=16000,channels=1 !
  appsink name=sink emit-signals=true max-buffers=10 drop=false
`;
```

#### Device Enumeration
```javascript
// Using GStreamer device monitor
import Gst from 'gi://Gst';

function enumerateAudioDevices() {
    const monitor = new Gst.DeviceMonitor();
    monitor.add_filter('Audio/Source', null);
    monitor.start();
    
    const devices = [];
    let device;
    while ((device = monitor.get_devices().pop())) {
        devices.push({
            name: device.get_display_name(),
            id: device.get_properties().get_string('node.name'),
            isDefault: device.get_properties().get_string('is-default') === 'true'
        });
    }
    
    monitor.stop();
    return devices;
}
```

#### Audio Format for Deepgram
```
Format: Linear16 (signed 16-bit little-endian PCM)
Sample Rate: 16000 Hz
Channels: 1 (mono)
Encoding: linear16
```

### 4.2 Voice Activity Detection (VAD)

#### Option A: WebRTC VAD (Simpler, Good Enough)
```javascript
// Using WebRTC VAD via native addon or WASM
const VAD_MODES = {
    QUALITY: 0,      // Most aggressive, fewer false positives
    LOW_BITRATE: 1,
    AGGRESSIVE: 2,
    VERY_AGGRESSIVE: 3  // Least aggressive, catches more speech
};

class WebRTCVAD {
    constructor(mode = VAD_MODES.AGGRESSIVE, sampleRate = 16000) {
        this.mode = mode;
        this.sampleRate = sampleRate;
        this.frameSize = sampleRate * 30 / 1000; // 30ms frames
    }
    
    isSpeech(audioFrame) {
        // Returns true if frame contains speech
        // Frame must be 10, 20, or 30ms of audio
    }
}
```

#### Option B: Silero VAD (More Accurate, Recommended)
```javascript
// Silero VAD via ONNX Runtime
import Onnx from 'onnxruntime-node'; // or WASM version

class SileroVAD {
    constructor() {
        this.model = null;
        this.sampleRate = 16000;
        this.windowSize = 512; // ~32ms at 16kHz
        this.threshold = 0.5;
        this.minSilenceDuration = 500; // ms
        this.speechPadding = 300; // ms
        
        // Internal state
        this._h = null;
        this._c = null;
    }
    
    async load() {
        this.model = await Onnx.InferenceSession.create(
            '/path/to/silero_vad.onnx'
        );
        this.resetState();
    }
    
    resetState() {
        // Reset LSTM hidden states
        this._h = new Float32Array(2 * 64).fill(0);
        this._c = new Float32Array(2 * 64).fill(0);
    }
    
    async process(audioChunk) {
        // Returns { isSpeech: boolean, probability: number }
        const input = new Float32Array(audioChunk);
        
        const feeds = {
            input: new Onnx.Tensor('float32', input, [1, input.length]),
            h: new Onnx.Tensor('float32', this._h, [2, 1, 64]),
            c: new Onnx.Tensor('float32', this._c, [2, 1, 64]),
            sr: new Onnx.Tensor('int64', [this.sampleRate], [1])
        };
        
        const result = await this.model.run(feeds);
        
        this._h = result.hn.data;
        this._c = result.cn.data;
        
        const probability = result.output.data[0];
        return {
            isSpeech: probability > this.threshold,
            probability
        };
    }
}
```

#### VAD + Silence Detection Logic
```javascript
class VADController {
    constructor(vad, options = {}) {
        this.vad = vad;
        this.silenceThreshold = options.silenceThreshold || 1500; // ms
        this.minSpeechDuration = options.minSpeechDuration || 250; // ms
        
        this.state = 'idle'; // idle | speaking | silence
        this.speechStart = null;
        this.silenceStart = null;
        
        this.onSpeechStart = null;
        this.onSpeechEnd = null;
    }
    
    async processFrame(audioFrame, timestamp) {
        const { isSpeech, probability } = await this.vad.process(audioFrame);
        
        switch (this.state) {
            case 'idle':
                if (isSpeech) {
                    this.speechStart = timestamp;
                    this.state = 'speaking';
                }
                break;
                
            case 'speaking':
                if (!isSpeech) {
                    this.silenceStart = timestamp;
                    this.state = 'silence';
                }
                // Keep streaming audio to Deepgram
                break;
                
            case 'silence':
                if (isSpeech) {
                    // Speech resumed before timeout
                    this.silenceStart = null;
                    this.state = 'speaking';
                } else {
                    const silenceDuration = timestamp - this.silenceStart;
                    if (silenceDuration >= this.silenceThreshold) {
                        // End of utterance
                        const speechDuration = this.silenceStart - this.speechStart;
                        if (speechDuration >= this.minSpeechDuration) {
                            this.onSpeechEnd?.({
                                start: this.speechStart,
                                end: this.silenceStart,
                                duration: speechDuration
                            });
                        }
                        this.state = 'idle';
                        this.speechStart = null;
                        this.silenceStart = null;
                    }
                }
                break;
        }
        
        return { state: this.state, isSpeech, probability };
    }
}
```

### 4.3 Deepgram Integration

#### WebSocket Connection
```javascript
class DeepgramService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.ws = null;
        this.isConnected = false;
        
        // Callbacks
        this.onTranscript = null;
        this.onError = null;
        this.onClose = null;
        
        // Configuration
        this.config = {
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            punctuate: true,
            interim_results: true,
            endpointing: 500,        // ms of silence to finalize
            utterance_end_ms: 1500,  // backup utterance end
            vad_events: true,
            encoding: 'linear16',
            sample_rate: 16000,
            channels: 1
        };
    }
    
    buildUrl() {
        const params = new URLSearchParams(this.config);
        return `wss://api.deepgram.com/v1/listen?${params}`;
    }
    
    connect() {
        return new Promise((resolve, reject) => {
            const url = this.buildUrl();
            
            this.ws = new WebSocket(url, {
                headers: {
                    'Authorization': `Token ${this.apiKey}`
                }
            });
            
            this.ws.onopen = () => {
                this.isConnected = true;
                resolve();
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            };
            
            this.ws.onerror = (error) => {
                this.onError?.(error);
                reject(error);
            };
            
            this.ws.onclose = (event) => {
                this.isConnected = false;
                this.onClose?.(event);
            };
        });
    }
    
    handleMessage(data) {
        if (data.type === 'Results') {
            const result = data.channel.alternatives[0];
            const transcript = result.transcript;
            
            if (transcript) {
                this.onTranscript?.({
                    text: transcript,
                    confidence: result.confidence,
                    isFinal: data.is_final,
                    speechFinal: data.speech_final,
                    words: result.words
                });
            }
        } else if (data.type === 'UtteranceEnd') {
            this.onTranscript?.({
                type: 'utterance_end'
            });
        }
    }
    
    sendAudio(audioBuffer) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(audioBuffer);
        }
    }
    
    finalize() {
        // Send empty buffer to signal end of audio
        if (this.isConnected) {
            this.ws.send(new Uint8Array(0));
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}
```

#### Reconnection Strategy
```javascript
class ReconnectingDeepgram extends DeepgramService {
    constructor(apiKey, options = {}) {
        super(apiKey);
        
        this.maxRetries = options.maxRetries || 5;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        
        this.retryCount = 0;
        this.pendingAudio = [];
    }
    
    async connectWithRetry() {
        while (this.retryCount < this.maxRetries) {
            try {
                await this.connect();
                this.retryCount = 0;
                
                // Send any buffered audio
                while (this.pendingAudio.length > 0) {
                    this.sendAudio(this.pendingAudio.shift());
                }
                
                return;
            } catch (error) {
                this.retryCount++;
                const delay = Math.min(
                    this.baseDelay * Math.pow(2, this.retryCount),
                    this.maxDelay
                );
                
                console.warn(`Connection failed, retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        
        throw new Error('Max retries exceeded');
    }
    
    sendAudio(audioBuffer) {
        if (!this.isConnected) {
            // Buffer audio during reconnection
            this.pendingAudio.push(audioBuffer);
            if (this.pendingAudio.length > 100) {
                this.pendingAudio.shift(); // Drop oldest
            }
            return;
        }
        
        super.sendAudio(audioBuffer);
    }
}
```

### 4.4 Text Output

#### Clipboard (Primary, Always Works)
```javascript
import Gdk from 'gi://Gdk';

class ClipboardService {
    constructor() {
        this.clipboard = Gdk.Display.get_default().get_clipboard();
    }
    
    async copy(text) {
        // Using GDK clipboard API
        this.clipboard.set(text);
    }
    
    // Alternative: using wl-copy for reliability
    async copyViaCli(text) {
        const { execAsync } = await import('resource:///org/gnome/gjs/modules/system.js');
        
        const proc = new Gio.Subprocess({
            argv: ['wl-copy', '--', text],
            flags: Gio.SubprocessFlags.NONE
        });
        
        await proc.wait_async(null);
    }
}
```

#### Text Injection (Wayland)
```javascript
import Gio from 'gi://Gio';

class TextInjectionService {
    constructor() {
        this.method = 'wtype'; // or 'ydotool'
    }
    
    async typeText(text) {
        try {
            // wtype is Wayland-native and doesn't require root
            await this.executeCommand(['wtype', '--', text]);
        } catch (error) {
            console.warn('wtype failed, falling back to clipboard');
            throw error;
        }
    }
    
    async typeTextWithDelay(text, delayMs = 10) {
        // For more reliable typing, especially with special characters
        await this.executeCommand(['wtype', '-d', delayMs.toString(), '--', text]);
    }
    
    async executeCommand(argv) {
        const proc = new Gio.Subprocess({
            argv,
            flags: Gio.SubprocessFlags.NONE
        });
        
        const success = await new Promise((resolve) => {
            proc.wait_async(null, (proc, result) => {
                resolve(proc.wait_finish(result));
            });
        });
        
        if (!success) {
            throw new Error(`Command failed: ${argv.join(' ')}`);
        }
    }
}
```

#### Output Controller (Combining Both)
```javascript
class OutputController {
    constructor(settings) {
        this.settings = settings;
        this.clipboard = new ClipboardService();
        this.injection = new TextInjectionService();
    }
    
    async output(text) {
        const mode = this.settings.get_string('output-mode');
        
        const promises = [];
        
        if (mode === 'clipboard' || mode === 'both') {
            promises.push(
                this.clipboard.copy(text).catch(e => {
                    console.error('Clipboard failed:', e);
                })
            );
        }
        
        if (mode === 'insert' || mode === 'both') {
            promises.push(
                this.injection.typeText(text).catch(e => {
                    console.warn('Text injection failed, using clipboard only');
                    if (mode === 'insert') {
                        return this.clipboard.copy(text);
                    }
                })
            );
        }
        
        await Promise.all(promises);
    }
}
```

### 4.5 Settings Management

#### GSettings Schema
```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.example.Vox" path="/org/example/Vox/">
    
    <!-- General -->
    <key name="start-on-login" type="b">
      <default>false</default>
      <summary>Start on login</summary>
    </key>
    
    <key name="start-minimized" type="b">
      <default>true</default>
      <summary>Start minimized to system tray</summary>
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
    
    <key name="global-hotkey" type="s">
      <default>'&lt;Super&gt;&lt;Shift&gt;v'</default>
      <summary>Global keyboard shortcut</summary>
    </key>
    
    <!-- Audio -->
    <key name="input-device" type="s">
      <default>''</default>
      <summary>Selected input device (empty for default)</summary>
    </key>
    
    <key name="vad-threshold" type="d">
      <default>0.5</default>
      <range min="0.1" max="0.9"/>
      <summary>VAD sensitivity threshold</summary>
    </key>
    
    <key name="silence-duration" type="i">
      <default>1500</default>
      <range min="500" max="5000"/>
      <summary>Silence duration before finalizing (ms)</summary>
    </key>
    
    <!-- Output -->
    <key name="output-mode" type="s">
      <default>'clipboard'</default>
      <choices>
        <choice value='clipboard'/>
        <choice value='insert'/>
        <choice value='both'/>
      </choices>
      <summary>Output mode</summary>
    </key>
    
    <!-- Deepgram -->
    <key name="api-key" type="s">
      <default>''</default>
      <summary>Deepgram API key (stored locally)</summary>
    </key>
    
    <key name="deepgram-model" type="s">
      <default>'nova-2'</default>
      <summary>Deepgram model</summary>
    </key>
    
    <!-- Usage Tracking -->
    <key name="usage-minutes" type="d">
      <default>0.0</default>
      <summary>Minutes transcribed this month</summary>
    </key>
    
    <key name="usage-reset-date" type="s">
      <default>''</default>
      <summary>Date when usage was last reset</summary>
    </key>
    
  </schema>
</schemalist>
```

---

## 5. Implementation Guide

### 5.1 Project Setup

#### Directory Structure
```
vox/
├── src/
│   ├── main.js                    # Application entry point
│   ├── application.js             # GtkApplication subclass
│   ├── window.js                  # Main window UI
│   ├── preferences.js             # Preferences dialog
│   ├── services/
│   │   ├── audioService.js        # GStreamer audio capture
│   │   ├── vadService.js          # Voice activity detection
│   │   ├── deepgramService.js     # Deepgram WebSocket client
│   │   ├── outputService.js       # Clipboard + text injection
│   │   ├── settingsService.js     # GSettings wrapper
│   │   └── usageService.js        # Usage tracking
│   ├── controllers/
│   │   └── transcriptionController.js  # Main orchestration
│   ├── ui/
│   │   ├── mainWindow.blp         # Blueprint UI definition
│   │   ├── preferences.blp        # Preferences UI
│   │   └── widgets/
│   │       ├── audioLevelBar.js   # Audio level visualization
│   │       └── transcriptView.js  # Transcript display
│   └── utils/
│       ├── constants.js           # App constants
│       └── logger.js              # Logging utility
├── data/
│   ├── org.example.Vox.gschema.xml    # GSettings schema
│   ├── org.example.Vox.desktop        # Desktop entry
│   ├── org.example.Vox.metainfo.xml   # AppStream metadata
│   ├── org.example.Vox.svg            # App icon
│   └── icons/
│       ├── hicolor/
│       │   ├── scalable/apps/org.example.Vox.svg
│       │   └── symbolic/apps/org.example.Vox-symbolic.svg
│       └── status/
│           ├── vox-idle-symbolic.svg
│           ├── vox-listening-symbolic.svg
│           ├── vox-transcribing-symbolic.svg
│           └── vox-paused-symbolic.svg
├── models/
│   └── silero_vad.onnx            # VAD model (downloaded during build)
├── po/                             # Translations (future)
│   └── POTFILES.in
├── flatpak/
│   └── org.example.Vox.yaml       # Flatpak manifest
├── debian/                         # Debian packaging
│   ├── control
│   ├── rules
│   └── ...
├── meson.build                     # Build system
├── meson_options.txt               # Build options
├── README.md
├── LICENSE
└── .github/
    └── workflows/
        ├── ci.yml                  # CI/CD pipeline
        └── release.yml             # Release automation
```

### 5.2 Build System (Meson)

```meson
# meson.build
project('vox',
  version: '0.1.0',
  license: 'MIT',
  meson_version: '>= 0.59.0'
)

gnome = import('gnome')
i18n = import('i18n')

# Dependencies
gjs_dep = dependency('gjs-1.0', version: '>= 1.72.0')
gtk4_dep = dependency('gtk4', version: '>= 4.6.0')
libadwaita_dep = dependency('libadwaita-1', version: '>= 1.2.0')
gstreamer_dep = dependency('gstreamer-1.0')

# Application ID
app_id = 'org.example.Vox'

# Directories
prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')
pkgdatadir = datadir / meson.project_name()

# Configuration
conf = configuration_data()
conf.set_quoted('APP_ID', app_id)
conf.set_quoted('VERSION', meson.project_version())
conf.set_quoted('PKGDATADIR', pkgdatadir)
conf.set_quoted('LOCALEDIR', datadir / 'locale')

# Subdirectories
subdir('src')
subdir('data')

# Post-install
gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
  update_desktop_database: true,
)
```

### 5.3 Application Entry Point

```javascript
// src/main.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { VoxApplication } from './application.js';

// Initialize libraries
pkg.initFormat();
GLib.set_prgname('vox');
GLib.set_application_name('Vox');

// Run application
const app = new VoxApplication();
const exitCode = app.run([System.programInvocationName, ...ARGV]);
System.exit(exitCode);
```

```javascript
// src/application.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

import { VoxWindow } from './window.js';
import { PreferencesDialog } from './preferences.js';
import { TranscriptionController } from './controllers/transcriptionController.js';
import { SettingsService } from './services/settingsService.js';

export class VoxApplication extends Adw.Application {
    static {
        GObject.registerClass(this);
    }
    
    constructor() {
        super({
            application_id: 'org.example.Vox',
            flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
        });
        
        this._settings = new SettingsService();
        this._controller = null;
    }
    
    vfunc_startup() {
        super.vfunc_startup();
        
        // Create actions
        this._createActions();
        
        // Initialize transcription controller
        this._controller = new TranscriptionController(this._settings);
        
        // Load CSS
        this._loadStyles();
    }
    
    vfunc_activate() {
        let window = this.active_window;
        
        if (!window) {
            window = new VoxWindow({
                application: this,
                controller: this._controller,
                settings: this._settings,
            });
        }
        
        // Start minimized if configured
        if (this._settings.get_boolean('start-minimized')) {
            // Just show indicator, don't present window
            this._showIndicator();
        } else {
            window.present();
        }
    }
    
    _createActions() {
        // Quit action
        const quitAction = new Gio.SimpleAction({ name: 'quit' });
        quitAction.connect('activate', () => this.quit());
        this.add_action(quitAction);
        this.set_accels_for_action('app.quit', ['<Control>q']);
        
        // Preferences action
        const prefsAction = new Gio.SimpleAction({ name: 'preferences' });
        prefsAction.connect('activate', () => this._showPreferences());
        this.add_action(prefsAction);
        this.set_accels_for_action('app.preferences', ['<Control>comma']);
        
        // Toggle listening
        const toggleAction = new Gio.SimpleAction({ name: 'toggle-listening' });
        toggleAction.connect('activate', () => this._controller.toggle());
        this.add_action(toggleAction);
        
        // Pause/Resume
        const pauseAction = new Gio.SimpleAction({ name: 'pause' });
        pauseAction.connect('activate', () => this._controller.pause());
        this.add_action(pauseAction);
    }
    
    _showPreferences() {
        const dialog = new PreferencesDialog({
            transient_for: this.active_window,
            settings: this._settings,
        });
        dialog.present();
    }
    
    _showIndicator() {
        // System tray implementation depends on desktop environment
        // Using libappindicator3 or StatusNotifierItem
    }
    
    _loadStyles() {
        const provider = new Gtk.CssProvider();
        provider.load_from_resource('/org/example/Vox/style.css');
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }
}
```

### 5.4 Main Window

```javascript
// src/window.js
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';

export class VoxWindow extends Adw.ApplicationWindow {
    static {
        GObject.registerClass({
            Template: 'resource:///org/example/Vox/ui/window.ui',
            InternalChildren: [
                'statusLabel',
                'audioLevelBar',
                'transcriptView',
                'pauseButton',
                'copyButton',
                'usageLabel',
            ],
        }, this);
    }
    
    constructor({ controller, settings, ...params }) {
        super(params);
        
        this._controller = controller;
        this._settings = settings;
        
        this._setupBindings();
        this._connectSignals();
    }
    
    _setupBindings() {
        // Bind UI elements to controller state
        this._controller.connect('state-changed', (_, state) => {
            this._updateStatusUI(state);
        });
        
        this._controller.connect('transcript', (_, text, isFinal) => {
            this._updateTranscript(text, isFinal);
        });
        
        this._controller.connect('audio-level', (_, level) => {
            this._audioLevelBar.set_fraction(level);
        });
    }
    
    _updateStatusUI(state) {
        const statusMessages = {
            'idle': 'Click to start listening',
            'listening': 'Listening...',
            'transcribing': 'Transcribing...',
            'paused': 'Paused',
            'error': 'Connection error',
        };
        
        this._statusLabel.set_label(statusMessages[state] || 'Unknown');
        
        // Update button states
        this._pauseButton.set_sensitive(state !== 'idle' && state !== 'error');
        this._pauseButton.set_label(state === 'paused' ? 'Resume' : 'Pause');
    }
    
    _updateTranscript(text, isFinal) {
        const buffer = this._transcriptView.get_buffer();
        
        if (isFinal) {
            // Append final text
            const end = buffer.get_end_iter();
            buffer.insert(end, text + '\n', -1);
        } else {
            // Show interim results (could highlight differently)
            // For simplicity, we'll just update the last line
        }
    }
    
    _connectSignals() {
        this._pauseButton.connect('clicked', () => {
            this._controller.togglePause();
        });
        
        this._copyButton.connect('clicked', () => {
            const buffer = this._transcriptView.get_buffer();
            const text = buffer.get_text(
                buffer.get_start_iter(),
                buffer.get_end_iter(),
                false
            );
            this._copyToClipboard(text);
        });
    }
    
    _copyToClipboard(text) {
        const clipboard = this.get_display().get_clipboard();
        clipboard.set(text);
        
        // Show toast notification
        const toast = new Adw.Toast({
            title: 'Copied to clipboard',
            timeout: 2,
        });
        this.add_toast(toast);
    }
}
```

### 5.5 Transcription Controller

```javascript
// src/controllers/transcriptionController.js
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import { AudioService } from '../services/audioService.js';
import { VADService } from '../services/vadService.js';
import { DeepgramService } from '../services/deepgramService.js';
import { OutputService } from '../services/outputService.js';
import { UsageService } from '../services/usageService.js';

export class TranscriptionController extends GObject.Object {
    static {
        GObject.registerClass({
            Signals: {
                'state-changed': { param_types: [GObject.TYPE_STRING] },
                'transcript': { param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN] },
                'audio-level': { param_types: [GObject.TYPE_DOUBLE] },
                'error': { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }
    
    constructor(settings) {
        super();
        
        this._settings = settings;
        this._state = 'idle';
        this._currentTranscript = '';
        
        // Initialize services
        this._audio = new AudioService(settings);
        this._vad = new VADService(settings);
        this._deepgram = null;
        this._output = new OutputService(settings);
        this._usage = new UsageService(settings);
        
        this._setupServices();
    }
    
    async _setupServices() {
        // Load VAD model
        await this._vad.initialize();
        
        // Connect audio service signals
        this._audio.connect('audio-data', (_, buffer) => {
            this._processAudio(buffer);
        });
        
        this._audio.connect('audio-level', (_, level) => {
            this.emit('audio-level', level);
        });
    }
    
    async start() {
        if (this._state !== 'idle' && this._state !== 'paused') {
            return;
        }
        
        try {
            // Start audio capture
            await this._audio.start();
            
            // Create Deepgram connection
            this._deepgram = new DeepgramService(
                this._settings.get_string('api-key')
            );
            
            this._deepgram.onTranscript = (result) => {
                this._handleTranscript(result);
            };
            
            this._deepgram.onError = (error) => {
                this._handleError(error);
            };
            
            await this._deepgram.connect();
            
            this._setState('listening');
        } catch (error) {
            this._handleError(error);
        }
    }
    
    stop() {
        this._audio.stop();
        this._deepgram?.disconnect();
        this._deepgram = null;
        this._setState('idle');
    }
    
    pause() {
        if (this._state === 'listening' || this._state === 'transcribing') {
            this._audio.pause();
            this._setState('paused');
        }
    }
    
    resume() {
        if (this._state === 'paused') {
            this._audio.resume();
            this._setState('listening');
        }
    }
    
    toggle() {
        if (this._state === 'idle') {
            this.start();
        } else {
            this.stop();
        }
    }
    
    togglePause() {
        if (this._state === 'paused') {
            this.resume();
        } else {
            this.pause();
        }
    }
    
    async _processAudio(buffer) {
        // Run VAD on audio chunk
        const vadResult = await this._vad.process(buffer);
        
        if (vadResult.isSpeech) {
            // Send to Deepgram
            if (this._state === 'listening') {
                this._setState('transcribing');
            }
            this._deepgram?.sendAudio(buffer);
            this._usage.trackAudio(buffer.length);
        } else if (vadResult.speechEnded) {
            // Finalize transcription
            this._deepgram?.finalize();
        }
    }
    
    _handleTranscript(result) {
        if (result.type === 'utterance_end') {
            // Output final transcript
            if (this._currentTranscript.trim()) {
                this._outputTranscript(this._currentTranscript);
            }
            this._currentTranscript = '';
            this._setState('listening');
            return;
        }
        
        if (result.isFinal) {
            this._currentTranscript += result.text + ' ';
            
            if (result.speechFinal) {
                // Natural end of speech detected by Deepgram
                this._outputTranscript(this._currentTranscript.trim());
                this._currentTranscript = '';
                this._setState('listening');
            }
        }
        
        // Emit transcript for UI
        const displayText = this._currentTranscript + (result.isFinal ? '' : result.text);
        this.emit('transcript', displayText, result.isFinal && result.speechFinal);
    }
    
    async _outputTranscript(text) {
        try {
            await this._output.output(text);
            
            // Track usage
            const durationSec = this._usage.finishUtterance();
            console.log(`Transcribed ${durationSec.toFixed(1)}s of audio`);
        } catch (error) {
            console.error('Output failed:', error);
            // Fallback to clipboard
            await this._output.copyToClipboard(text);
        }
    }
    
    _handleError(error) {
        console.error('Transcription error:', error);
        this._setState('error');
        this.emit('error', error.message);
        
        // Attempt reconnection after delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            if (this._state === 'error') {
                this.start();
            }
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _setState(state) {
        if (this._state !== state) {
            this._state = state;
            this.emit('state-changed', state);
        }
    }
    
    get state() {
        return this._state;
    }
}
```

---

## 6. Packaging & Distribution

### 6.1 Flatpak Manifest

```yaml
# flatpak/org.example.Vox.yaml
app-id: org.example.Vox
runtime: org.gnome.Platform
runtime-version: '45'
sdk: org.gnome.Sdk
command: vox

finish-args:
  # Display access
  - --share=ipc
  - --socket=fallback-x11
  - --socket=wayland
  
  # Audio access (PipeWire)
  - --socket=pulseaudio
  
  # Network for Deepgram API
  - --share=network
  
  # For wtype text injection
  - --socket=session-bus
  - --talk-name=org.freedesktop.portal.Fcitx
  
  # For system tray
  - --talk-name=org.kde.StatusNotifierWatcher
  - --talk-name=org.freedesktop.Notifications
  
  # Settings storage
  - --filesystem=xdg-config/vox:create
  
  # For clipboard
  - --env=WAYLAND_DISPLAY=wayland-0

modules:
  # wtype for Wayland text injection
  - name: wtype
    buildsystem: meson
    sources:
      - type: git
        url: https://github.com/atx/wtype.git
        tag: v0.4
    
  # Silero VAD model
  - name: silero-vad-model
    buildsystem: simple
    build-commands:
      - install -Dm644 silero_vad.onnx /app/share/vox/models/silero_vad.onnx
    sources:
      - type: file
        url: https://github.com/snakers4/silero-vad/raw/master/files/silero_vad.onnx
        sha256: [checksum]
        dest-filename: silero_vad.onnx

  # Main application
  - name: vox
    buildsystem: meson
    sources:
      - type: dir
        path: ..
    config-opts:
      - -Dflatpak=true
```

### 6.2 Debian Packaging

```
# debian/control
Source: vox
Section: utils
Priority: optional
Maintainer: Will <will@techchange.org>
Build-Depends:
    debhelper-compat (= 13),
    meson (>= 0.59),
    libgjs-dev (>= 1.72),
    libgtk-4-dev (>= 4.6),
    libadwaita-1-dev (>= 1.2),
    libgstreamer1.0-dev,
    gir1.2-gstreamer-1.0
Standards-Version: 4.6.0
Homepage: https://github.com/your-org/vox
Rules-Requires-Root: no

Package: vox
Architecture: any
Depends:
    ${shlibs:Depends},
    ${misc:Depends},
    gjs (>= 1.72),
    gir1.2-gtk-4.0,
    gir1.2-adw-1,
    gir1.2-gst-plugins-base-1.0,
    gstreamer1.0-pipewire,
    wtype
Recommends:
    pipewire-audio
Description: Voice dictation for Linux
 Vox is a native Linux voice dictation application that
 uses Deepgram's streaming API for fast, accurate transcription.
 .
 Features:
  - Always-on listening with intelligent turn detection
  - Direct text injection at cursor position
  - Modern GNOME-native interface
  - Configurable VAD sensitivity
```

```makefile
# debian/rules
#!/usr/bin/make -f

%:
	dh $@ --buildsystem=meson

override_dh_auto_configure:
	dh_auto_configure -- -Dflatpak=false
```

### 6.3 GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    container: ghcr.io/pablolec/gnome-sdk:45
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install dependencies
        run: |
          apt-get update
          apt-get install -y gjs libgtk-4-dev libadwaita-1-dev
          
      - name: Build
        run: |
          meson setup build
          meson compile -C build
          
      - name: Test
        run: meson test -C build

  flatpak:
    runs-on: ubuntu-latest
    container: bilelmoussaoui/flatpak-github-actions:gnome-45
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: flatpak/flatpak-github-actions/flatpak-builder@v6
        with:
          manifest-path: flatpak/org.example.Vox.yaml
          bundle: vox.flatpak
```

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Flatpak
        # ... flatpak build steps
        
      - name: Build Debian package
        run: |
          dpkg-buildpackage -us -uc
          
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            ../vox_*.deb
            vox.flatpak
```

---

## 7. Claude Code Session Guide

### 7.1 Recommended Build Order

When working with Claude Code, build the application in this order:

#### Phase 1: Bootstrap (Session 1)
```
1. Create project structure
2. Set up meson.build
3. Create basic application.js and main.js
4. Create minimal window.js with libadwaita
5. Test that app launches
```

#### Phase 2: Settings & UI (Session 2)
```
1. Create GSettings schema
2. Implement settingsService.js
3. Build preferences dialog
4. Add API key input and validation
```

#### Phase 3: Audio Capture (Session 3)
```
1. Implement audioService.js with GStreamer
2. Add device enumeration
3. Add audio level metering
4. Test audio capture works
```

#### Phase 4: VAD (Session 4)
```
1. Implement simple energy-based VAD first
2. Add speech/silence state machine
3. (Optional) Integrate Silero VAD
4. Test turn detection
```

#### Phase 5: Deepgram Integration (Session 5)
```
1. Implement deepgramService.js
2. Add WebSocket connection
3. Handle transcription results
4. Add reconnection logic
```

#### Phase 6: Output (Session 6)
```
1. Implement clipboard output
2. Implement wtype text injection
3. Create outputService.js combining both
4. Test end-to-end flow
```

#### Phase 7: Polish (Session 7)
```
1. Add system tray indicator
2. Implement global hotkeys
3. Add usage tracking
4. Error handling & UX improvements
```

#### Phase 8: Packaging (Session 8)
```
1. Create Flatpak manifest
2. Create Debian packaging
3. Test installation
4. Write README and documentation
```

### 7.2 Claude Code Hints

When working with Claude Code, use these prompts:

**Starting a new session:**
```
I'm building Vox, a voice dictation app for Linux. Here's the planning doc: [paste relevant section]

Current status: [what's done]
Goal for this session: [specific deliverable]
```

**For GJS/GTK4 code:**
```
Use GJS imports style (gi://), GObject.registerClass for classes, 
and Blueprint files for UI where appropriate. Target GNOME 45+.
```

**For debugging:**
```
Run with: GJS_DEBUG=1 gjs -m src/main.js
Log with: console.log() or GLib.log_structured()
```

**For testing Deepgram connection:**
```
Test WebSocket connection with:
wscat -H "Authorization: Token YOUR_KEY" \
  "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000"
```

### 7.3 Key Dependencies to Install

```bash
# Ubuntu 22.04+
sudo apt install \
    gjs \
    libgtk-4-dev \
    libadwaita-1-dev \
    libgstreamer1.0-dev \
    gstreamer1.0-pipewire \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    wtype \
    wl-clipboard \
    meson \
    ninja-build

# For Flatpak development
sudo apt install flatpak-builder
flatpak install org.gnome.Platform//45 org.gnome.Sdk//45
```

---

## 8. API Reference

### 8.1 Deepgram Streaming API

**Endpoint:** `wss://api.deepgram.com/v1/listen`

**Query Parameters:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| `encoding` | `linear16` | Audio format |
| `sample_rate` | `16000` | Sample rate in Hz |
| `channels` | `1` | Mono audio |
| `model` | `nova-2` | Deepgram model |
| `language` | `en-US` | Language code |
| `punctuate` | `true` | Add punctuation |
| `smart_format` | `true` | Smart formatting |
| `interim_results` | `true` | Get partial results |
| `endpointing` | `500` | Silence for end of speech (ms) |
| `utterance_end_ms` | `1500` | Backup utterance end (ms) |
| `vad_events` | `true` | VAD event messages |

**Response Types:**
```typescript
// Transcription result
{
    type: "Results",
    channel: {
        alternatives: [{
            transcript: string,
            confidence: number,
            words: [{
                word: string,
                start: number,
                end: number,
                confidence: number
            }]
        }]
    },
    is_final: boolean,
    speech_final: boolean
}

// Utterance end event
{
    type: "UtteranceEnd"
}
```

### 8.2 Pricing (as of 2024)

| Model | Price per minute |
|-------|------------------|
| Nova-2 | $0.0043 |
| Nova | $0.0043 |
| Enhanced | $0.0145 |
| Base | $0.0048 |

**Free tier:** 200 minutes/month for new accounts

---

## 9. Testing Strategy

### 9.1 Unit Tests

```javascript
// tests/vadService.test.js
import { VADService } from '../src/services/vadService.js';

describe('VADService', () => {
    let vad;
    
    beforeEach(async () => {
        vad = new VADService({ get_double: () => 0.5 });
        await vad.initialize();
    });
    
    test('detects speech in audio', async () => {
        const speechAudio = loadTestAudio('speech.raw');
        const result = await vad.process(speechAudio);
        expect(result.isSpeech).toBe(true);
    });
    
    test('detects silence', async () => {
        const silentAudio = new Int16Array(512).fill(0);
        const result = await vad.process(silentAudio);
        expect(result.isSpeech).toBe(false);
    });
});
```

### 9.2 Integration Tests

```javascript
// tests/transcription.integration.test.js
describe('TranscriptionController', () => {
    test('transcribes audio end-to-end', async () => {
        const controller = new TranscriptionController(mockSettings);
        
        const transcripts = [];
        controller.connect('transcript', (_, text, isFinal) => {
            if (isFinal) transcripts.push(text);
        });
        
        await controller.start();
        
        // Simulate audio input
        const audioFile = loadTestAudio('test-utterance.raw');
        controller._processAudio(audioFile);
        
        // Wait for processing
        await new Promise(r => setTimeout(r, 3000));
        
        expect(transcripts.length).toBeGreaterThan(0);
        expect(transcripts[0].toLowerCase()).toContain('test');
        
        controller.stop();
    });
});
```

### 9.3 Manual Testing Checklist

- [ ] First run wizard completes
- [ ] API key validation works
- [ ] Microphone selection lists devices
- [ ] Audio level meter responds to voice
- [ ] Transcription appears in real-time
- [ ] Final transcription is accurate
- [ ] Clipboard copy works
- [ ] Text injection works (Wayland)
- [ ] System tray icon updates state
- [ ] Global hotkey toggles listening
- [ ] Settings persist after restart
- [ ] Usage tracking updates
- [ ] Reconnection after network loss

---

## 10. Future Roadmap

### Version 0.2
- [ ] Push-to-talk mode
- [ ] Custom hotkey configuration
- [ ] Multiple language support
- [ ] Transcript history

### Version 0.3
- [ ] Whisper.cpp offline fallback
- [ ] Custom vocabulary/hot words
- [ ] Voice commands ("new line", "period")
- [ ] Flathub submission

### Version 0.4
- [ ] Alternative STT backends (Azure, Google, Whisper)
- [ ] Speaker diarization
- [ ] Export transcripts
- [ ] Accessibility improvements

### Version 1.0
- [ ] Stable API for extensions
- [ ] Comprehensive documentation
- [ ] Translation support
- [ ] Performance optimization

---

## Quick Reference

### Key Files to Create First
1. `meson.build` - Build system
2. `src/main.js` - Entry point
3. `src/application.js` - GtkApplication
4. `data/org.example.Vox.gschema.xml` - Settings
5. `data/org.example.Vox.desktop` - Desktop entry

### Important GJS Imports
```javascript
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gst from 'gi://Gst';
import Gdk from 'gi://Gdk?version=4.0';
```

### Run During Development
```bash
# Build
meson setup build
meson compile -C build

# Run
./build/src/vox

# Or with debugging
GJS_DEBUG_OUTPUT=stderr GJS_DEBUG_TOPICS="JS ERROR;JS LOG" ./build/src/vox
```

---

*Document version: 1.0*
*Last updated: [Current Date]*
*Ready for Claude Code development sessions*
