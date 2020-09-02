project('almond-gnome', 'c',
  version: '1.99.0-beta.1',
  meson_version: '>= 0.48.0',
)

app_command = 'almond'
app_id = 'edu.stanford.Almond'

gnome = import('gnome')
intl = import('i18n')

config_h = configuration_data()
GETTEXT_PACKAGE = app_id
config_h.set_quoted('GETTEXT_PACKAGE', GETTEXT_PACKAGE)
config_h.set_quoted('LOCALEDIR', join_paths(get_option('prefix'), get_option('localedir')))
configure_file(
  output: 'config.h',
  configuration: config_h,
)
add_global_arguments([
  '-DHAVE_CONFIG_H',
  '-I' + meson.build_root(),
], language: 'c')

app_configuration = configuration_data()

app_configuration.set('GJS', find_program('gjs').path())
app_configuration.set('NODE', find_program('node').path())
app_configuration.set('PACKAGE_NAME', app_id)
app_configuration.set('PACKAGE_VERSION', meson.project_version())
app_configuration.set('prefix', get_option('prefix'))

pkgdatadir = join_paths(get_option('prefix'), get_option('datadir'), app_id)
pkglibdir = join_paths(get_option('prefix'), 'lib', app_id)
app_configuration.set('bindir', join_paths(get_option('prefix'), get_option('bindir')))
app_configuration.set('libdir', join_paths(get_option('prefix'), get_option('libdir')))
app_configuration.set('pkglibdir', pkglibdir)
app_configuration.set('pkgdatadir', pkgdatadir)

subdir('helpers')
subdir('src')
subdir('data')
subdir('po')
subdir('shell-extension')

# spawn our custom script for service directory (that copies and calls yarn)
custom_target('service',
  output: 'service',
  input: files('yarn.lock'),
  command: [files('meson/copy_service_to_builddir.py'), '@INPUT@', '@OUTPUT@'],
  console: true,
  build_always_stale: true,
  install: true,
  install_dir: pkglibdir)

meson.add_install_script('meson/meson_post_install.py')
