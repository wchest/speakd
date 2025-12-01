project('speakd',
  version: '0.1.0',
  license: 'MIT',
  meson_version: '>= 0.59.0',
)

gnome = import('gnome')

# Dependencies
dependency('gjs-1.0', version: '>= 1.72.0')
dependency('gtk4', version: '>= 4.6.0')
dependency('libadwaita-1', version: '>= 1.2.0')

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
