#!/usr/bin/env -S gjs -m
import GLib from 'gi://GLib';
import Gst from 'gi://Gst';
import GstApp from 'gi://GstApp';

Gst.init(null);

const pipelineStr = `
    pulsesrc do-timestamp=true !
    audioconvert !
    audioresample !
    audio/x-raw,format=S16LE,rate=16000,channels=1 !
    appsink name=sink emit-signals=false sync=false max-buffers=0 drop=false
`;

const pipeline = Gst.parse_launch(pipelineStr);
const appsink = pipeline.get_by_name('sink');

console.log('Starting pipeline...');
const ret = pipeline.set_state(Gst.State.PLAYING);
console.log('State change result:', ret);

let sampleCount = 0;
let totalBytes = 0;
const startTime = Date.now();

// Poll for samples every 50ms
const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
    let sample;
    let samplesThisRound = 0;

    while ((sample = appsink.try_pull_sample(0)) !== null) {
        const buffer = sample.get_buffer();
        if (buffer) {
            const [success, mapInfo] = buffer.map(Gst.MapFlags.READ);
            if (success) {
                totalBytes += mapInfo.data.byteLength;
                samplesThisRound++;
                buffer.unmap(mapInfo);
            }
        }
        sampleCount++;
    }

    if (samplesThisRound > 0) {
        console.log(`Got ${samplesThisRound} samples, total: ${sampleCount}, bytes: ${totalBytes}`);
    }

    // Stop after 5 seconds
    if (Date.now() - startTime > 5000) {
        console.log(`\n=== SUMMARY ===`);
        console.log(`Total samples: ${sampleCount}`);
        console.log(`Total bytes: ${totalBytes}`);
        console.log(`Expected: ~160000 bytes (5 sec * 16000 samples/sec * 2 bytes/sample)`);
        pipeline.set_state(Gst.State.NULL);
        mainLoop.quit();
        return GLib.SOURCE_REMOVE;
    }

    return GLib.SOURCE_CONTINUE;
});

const mainLoop = GLib.MainLoop.new(null, false);
console.log('Running main loop for 5 seconds...');
mainLoop.run();
