# Testflight Upload

Create a signed iOS archive, export an App Store IPA, upload it to TestFlight and verify Apple's processing status

## Included skills

- `testflight-upload`

## Installation

```bash
npx github:AustineA/testflight-upload
```

This installs the skills separately at:

```text
~/.agents/skills/testflight-upload/
```

It then symlinks them into detected Claude Code, Codex, Cursor, Windsurf, Antigravity, Trae, and Amp installations.

Other commands:

```bash
npx github:AustineA/testflight-upload update
npx github:AustineA/testflight-upload status
npx github:AustineA/testflight-upload uninstall
```

### Updating

```bash
npx github:AustineA/testflight-upload update
```

It compares the latest commit on GitHub with the one recorded at install time. If yours is older, it clones the latest version and installs it. The installed copy is replaced, not merged, so files removed from a skill don't linger. Restart your agent afterwards.

## Requirements

- macOS with Xcode, and an Apple Developer account
- An App Store Connect API key (`.asc-config.json` in the project: keyId, issuerId, keyPath, teamId)
- fastlane (`brew install fastlane`) and Node.js 18+

## Usage

After installation, ask your agent: Upload <path-to-ios-app> to TestFlight.

## Package structure

```text
bin/
  install.mjs
skill/
  testflight-upload/
    SKILL.md
package.json
```

## License

MIT
