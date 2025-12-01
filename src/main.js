#!/usr/bin/env -S gjs -m
// -*- mode: js -*-

import GLib from 'gi://GLib';
import System from 'system';

// Set up package info - use defaults for development if meson hasn't substituted
const APP_ID = '@APP_ID@'.startsWith('@') ? 'io.github.wchest.Speakd' : '@APP_ID@';
const VERSION = '@VERSION@'.startsWith('@') ? '0.1.0-dev' : '@VERSION@';
const PKGDATADIR = '@PKGDATADIR@'.startsWith('@') ? GLib.get_current_dir() : '@PKGDATADIR@';

// Add pkgdatadir to search path
imports.searchPath.unshift(PKGDATADIR);

GLib.set_prgname(APP_ID);
GLib.set_application_name('Speakd');

const { SpeakdApplication } = await import('./application.js');

const app = new SpeakdApplication({
    application_id: APP_ID,
    version: VERSION,
});

const exitCode = app.run([System.programInvocationName, ...System.programArgs]);
System.exit(exitCode);
