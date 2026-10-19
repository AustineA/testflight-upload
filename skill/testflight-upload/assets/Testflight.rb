require 'json'
require 'shellwords'

# Copy to fastlane/Testflight.rb and import it from the existing Fastfile.
def tf_config
  root = File.expand_path('..', __dir__)
  [root, JSON.parse(File.read(File.join(root, '.asc-config.json')))]
end

def tf_key(config)
  app_store_connect_api_key(
    key_id: config.fetch('keyId'), issuer_id: config.fetch('issuerId'),
    key_filepath: File.expand_path(config.fetch('keyPath')),
    duration: 1200, in_house: false
  )
end

platform :ios do
  lane :tf_signing do
    root, config = tf_config
    key = tf_key(config)
    output = File.join(root, 'build-production/signing')
    get_certificates(api_key: key, development: false, generate_apple_certs: true,
                     output_path: output)
    get_provisioning_profile(
      api_key: key, app_identifier: config.fetch('bundleId'),
      provisioning_name: config.fetch('profileName', "#{config.fetch('bundleId')} AppStore"),
      output_path: output
    )
  end

  lane :tf_build do |options|
    root, config = tf_config
    project, workspace = config['projectPath'], config['workspacePath']
    UI.user_error!('Configure exactly one projectPath or workspacePath') if (!!project == !!workspace)
    source = project ? { project: File.expand_path(project, root) } : { workspace: File.expand_path(workspace, root) }
    auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', File.expand_path(config.fetch('keyPath')),
            '-authenticationKeyID', config.fetch('keyId'), '-authenticationKeyIssuerID', config.fetch('issuerId')].shelljoin
    build_app(**source,
      scheme: config.fetch('scheme'), configuration: 'Release',
      clean: !options[:export_only], skip_build_archive: !!options[:export_only],
      archive_path: File.join(root, 'build-production/App.xcarchive'),
      output_directory: File.join(root, 'build-production'), output_name: 'App.ipa',
      derived_data_path: File.join(root, 'build-production/DerivedData'),
      buildlog_path: File.join(root, 'build-production/logs'),
      export_method: 'app-store', export_team_id: config.fetch('teamId'),
      export_options: {
        signingStyle: 'manual', signingCertificate: 'Apple Distribution',
        provisioningProfiles: { config.fetch('bundleId') => config.fetch('profileName', "#{config.fetch('bundleId')} AppStore") },
        manageAppVersionAndBuildNumber: false
      },
      xcargs: auth
    )
  end

  lane :tf_upload do
    root, config = tf_config
    upload_to_testflight(
      api_key: tf_key(config), app_identifier: config.fetch('bundleId'),
      ipa: File.join(root, 'build-production/App.ipa'),
      skip_waiting_for_build_processing: true, skip_submission: true,
      distribute_external: false
    )
  end
end
