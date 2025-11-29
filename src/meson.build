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
  'preferences.js',
)

install_data(sources, install_dir: pkgdatadir)

# Install services
services = files(
  'services/settingsService.js',
  'services/audioService.js',
)

install_data(services, install_dir: pkgdatadir / 'services')
