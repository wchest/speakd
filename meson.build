project('speakd',
  version: '0.1.0',
  license: 'MIT',
  meson_version: '>= 0.59.0',
)

gnome = import('gnome')

# Build dependencies (libraries)
dependency('gjs-1.0', version: '>= 1.72.0')
dependency('gtk4', version: '>= 4.6.0')
dependency('libadwaita-1', version: '>= 1.2.0')
dependency('gstreamer-1.0', version: '>= 1.20.0')
dependency('libsoup-3.0', version: '>= 3.0.0')

# Runtime dependencies (checked at build, required at runtime)
# - wl-clipboard: for clipboard operations on Wayland
# - wtype: for typing text at cursor on Wayland (optional)
# - gir1.2-ayatanaappindicator3: for system tray (optional)
wl_copy = find_program('wl-copy', required: false)
wtype = find_program('wtype', required: false)

if not wl_copy.found()
  warning('wl-copy not found - clipboard functionality may be limited')
endif
if not wtype.found()
  warning('wtype not found - "Type at Cursor" output mode will not work')
endif

# App ID
app_id = 'io.github.wchest.Speakd'

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
