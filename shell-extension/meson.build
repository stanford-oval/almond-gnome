shell_extension_dir = join_paths(get_option('prefix'), get_option('datadir'), 'gnome-shell/extensions/almond@almond.stanford.edu')

install_data(
  files('extension.js'),
  files('convenience.js'),
  files('metadata.json'),
  files('stylesheet.css'),

  install_dir: shell_extension_dir
)

common_dir = join_paths(shell_extension_dir, 'common')
install_data(
  files('../src/common/chatmodel.js'),
  files('../src/common/config.js'),
  files('../src/common/serviceproxy.js'),
  files('../src/common/util.js'),

  install_dir: common_dir
)
