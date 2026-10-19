---
name: testflight-upload
description: Create a signed production iOS archive, export an App Store IPA, upload it to TestFlight, and verify Apple's processing status. Use for native iOS TestFlight builds and uploads, including signing recovery and resuming a successful archive export.
---

# TestFlight upload

Deliver a verified Release IPA and a TestFlight build with an accurately reported processing state. Reuse the project's build system and credentials; this workflow does not change its listing or ship an App Store release.

## Establish the target

- Inspect repository instructions and existing release lanes. Discover the bundle ID, Apple team, scheme, project/workspace, version, and build number. For XcodeGen, edit the source YAML and regenerate instead of editing generated project files.
- Check existing TestFlight builds before choosing a build number. Keep the marketing version unless the task requires changing it. If the current number already exists or an earlier upload was accepted, reconcile its state before incrementing or uploading again.
- Reuse the project's `.asc-config.json` or existing API-key setup. Never print private key contents or JWTs. Derive team and project identifiers from actual configuration, not from this skill's past usage.
- Use available project build tooling. XcodeBuildMCP is suitable for build discovery and checks; Fastlane `build_app` provides archive/export and `upload_to_testflight` provides delivery. Read installed command help when adapting options; avoid an unnecessary tool upgrade.
- A request to build and upload authorizes those actions and routine signing setup. A build-only request does not authorize upload. Do not add testers, send invitations, submit for external beta review, or release the app unless requested. Existing authorization does not need another conversational confirmation.

## Build and export

Prefer working project lanes. If absent, adapt [assets/Testflight.rb](assets/Testflight.rb), merging/importing only the required lanes into the existing `fastlane/Fastfile`. Do not replace unrelated lanes. The template uses `.asc-config.json` fields:

| Field | Purpose |
|---|---|
| `bundleId`, `keyId`, `issuerId`, `keyPath` | Existing App Store Connect authentication |
| `teamId`, `scheme` | Actual project signing team and shared app scheme |
| `projectPath` or `workspacePath` | Exactly one, relative to repository root or absolute |
| `profileName` | Existing App Store distribution profile name; optional default is bundle ID plus ` AppStore` |

Keep `.asc-config.json`, archives, IPAs, provisioning profiles and signing key exports out of version control. The template writes under `build-production/`; ensure that directory is ignored. Certificates/private keys should only be stored in an appropriate local keychain or protected signing directory.

1. Run the project's relevant validation. Reuse already passing tests when no further behavior changed; do not launch a simulator merely to export an archive.
2. Build the shared app scheme with **Release**, generic iOS device destination, distribution export, and automatic archive provisioning where appropriate. Keep the selected version/build number during export (`manageAppVersionAndBuildNumber: false`).
3. If archive succeeds but export fails, preserve it. Use `skip_build_archive: true` or `fastlane ios tf_build export_only:true` rather than rebuilding unchanged source.
4. Verify the exported IPA: intended bundle/version/build, iPhoneOS platform (not simulator), expected resources/locales, valid distribution signature, `get-task-allow=false`, and expected export-compliance declaration. Honor an explicitly requested encryption value; otherwise determine the correct value from the app rather than defaulting every app to false. The relevant Boolean key is `ITSAppUsesNonExemptEncryption`; check the built plist, not just project text.

## Signing recovery

Use the actual error to choose a correction:

- **Duplicate `-authenticationKeyPath`:** Fastlane may append `xcargs` to export commands as well as `export_xcargs`. Pass the authentication flags once, in `xcargs`. Build the argument list with Ruby `Shellwords`; never interpolate unescaped paths into a shell command.
- **Cloud signing permission error / no matching profiles:** Check local signing identities outside a sandbox that hides the keychain. Reuse a matching Apple Distribution certificate/private key and App Store profile. If missing, the template's `tf_signing` uses the configured API key to obtain them. Do not revoke other certificates to free quota. If Apple denies issuance or the private key cannot be used, report the specific account/keychain blocker.
- **Automatic export still chooses cloud signing despite a local certificate:** Use explicit manual export options: `signingStyle: manual`, `signingCertificate: Apple Distribution`, and `provisioningProfiles` mapping the exact bundle ID to the installed distribution profile. Verify profile team, application identifier, expiry, and non-debug entitlement before retrying export.
- **Fastlane says both `adhoc` and `development` are enabled when both were supplied as false:** Omit both options for an App Store profile; some Fastlane versions treat presence as a conflict.
- **Signature check reports trust/entitlement errors only in a restricted sandbox:** Retry the read-only verification with system-keychain access before treating the artifact as corrupt. If it still fails, resolve signing rather than uploading.
- **Keychain access needs a password or approval:** Let the user complete the secure system prompt; do not request their login password in chat or put it in a command.

Retry after a concrete correction. If the same signing error survives that correction and no new actionable evidence exists, stop the failing operation and report what is required. Do not cycle through identical exports or revoke unrelated signing assets.

## Upload and confirm

- Upload only the verified IPA. The template uses API-key authentication, `skip_waiting_for_build_processing: true`, `skip_submission: true`, and `distribute_external: false`, then relies on explicit status verification. Omit release notes, group changes, and notifications unless requested.
- Once Apple accepts the upload, do not resend the same binary just because it is not listed immediately. Check at sensible intervals (roughly 30–60 seconds), with progress updates while waiting.
- Use [scripts/testflight-status.mjs](scripts/testflight-status.mjs):

  ```sh
  node /path/to/testflight-upload/scripts/testflight-status.mjs /path/to/project
  node /path/to/testflight-upload/scripts/testflight-status.mjs /path/to/project 1.0.0 2
  ```

  The first command lists recent builds for preflight. The second checks an exact version/build. Output contains build IDs, processing state, encryption value and internal/external beta state. Exit 0 for an exact VALID build, 2 while absent/processing, 1 for failed/invalid or API errors. It performs read-only API calls.

- Success evidence: matching version/build, Apple `processingState=VALID`, and the relevant beta state. `READY_FOR_BETA_TESTING` means eligible for internal testing; it does not prove tester-group assignment. `READY_FOR_BETA_SUBMISSION` means external review has not been submitted.
- If processing becomes INVALID/FAILED, investigate Apple's error before creating a replacement. If Apple keeps processing beyond a reasonable observation window, report the accepted upload as processing; do not claim readiness or reupload blindly.
- Save a local receipt with app/build IDs, version/build, IPA path and checksum, signature/resource checks, encryption flag and final Apple states. Conclude with version/build and TestFlight link; distinguish internal readiness from external review or App Store publication.
