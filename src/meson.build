app_resource = gnome.compile_resources(app_id + '.src',
  app_id + '.src.gresource.xml',
  source_dir: '.',
  gresource_bundle: true,
  install: true,
  install_dir : pkgdatadir)

app_launcher = configure_file(
  output : app_id,
  input : app_id + '.in',
  configuration: app_configuration)
install_data(app_launcher,
  install_dir: get_option('bindir'),
  install_mode: 'rwxr-xr-x'
)
