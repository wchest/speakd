#!/usr/bin/env -S gjs -m
// -*- mode: js -*-

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

// Set up package info - use defaults for development if meson hasn't substituted
const APP_ID = '@APP_ID@'.startsWith('@') ? 'io.github.wchest.Speakd' : '@APP_ID@';
const VERSION = '@VERSION@'.startsWith('@') ? '0.1.0-dev' : '@VERSION@';

// For development mode, find the src directory relative to this script
let PKGDATADIR;
if ('@PKGDATADIR@'.startsWith('@')) {
    // Development mode - find src directory
    const scriptPath = GLib.path_get_dirname(System.programInvocationName);
    if (scriptPath.endsWith('src')) {
        PKGDATADIR = scriptPath;
    } else {
        // Running from project root or elsewhere, check for src/
        const srcDir = GLib.build_filenamev([GLib.get_current_dir(), 'src']);
        if (GLib.file_test(srcDir, GLib.FileTest.IS_DIR)) {
            PKGDATADIR = srcDir;
        } else {
            PKGDATADIR = GLib.get_current_dir();
        }
    }
} else {
    PKGDATADIR = '@PKGDATADIR@';
}

// Add pkgdatadir to search path (for legacy imports)
imports.searchPath.unshift(PKGDATADIR);

GLib.set_prgname(APP_ID);
GLib.set_application_name('Speakd');

// Import application from pkgdatadir using file:// URL
const appFile = Gio.File.new_for_path(GLib.build_filenamev([PKGDATADIR, 'application.js']));
const { SpeakdApplication } = await import(appFile.get_uri());

const app = new SpeakdApplication({
    application_id: APP_ID,
    version: VERSION,
});

const exitCode = app.run([System.programInvocationName, ...System.programArgs]);
System.exit(exitCode);
