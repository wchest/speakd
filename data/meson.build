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

# Icons (PNG at various sizes for crisp display)
icon_sizes = ['48', '64', '128', '256', '512']
foreach size : icon_sizes
  install_data(
    'icons' / 'hicolor' / size + 'x' + size / 'apps' / app_id + '.png',
    install_dir: datadir / 'icons' / 'hicolor' / size + 'x' + size / 'apps',
  )
endforeach
