#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export async function collectStatus(get, bundleId, version, buildNumber) {
  const apps = await get(`v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = apps.data.find(a => a.attributes.bundleId === bundleId);
  if (!app) throw new Error(`No App Store Connect app matches ${bundleId}`);
  const exact = version !== undefined && buildNumber !== undefined;
  let path = `v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=${exact ? 100 : 10}`;
  if (exact) path += `&filter[version]=${encodeURIComponent(buildNumber)}`;
  const results = [];
  do {
    const response = await get(path);
    for (const build of response.data) {
      const release = await get(`v1/builds/${build.id}/preReleaseVersion`);
      if (exact && (release.data.attributes.version !== version || build.attributes.version !== buildNumber)) continue;
      let beta;
      try {
        beta = (await get(`v1/builds/${build.id}/buildBetaDetail`)).data?.attributes;
      } catch (error) {
        if (error.status !== 404 || build.attributes.processingState === 'VALID') throw error;
      }
      results.push({
        id: build.id, version: release.data.attributes.version, buildNumber: build.attributes.version,
        uploadedDate: build.attributes.uploadedDate, processingState: build.attributes.processingState,
        usesNonExemptEncryption: build.attributes.usesNonExemptEncryption,
        expired: build.attributes.expired,
        internalBuildState: beta?.internalBuildState ?? null,
        externalBuildState: beta?.externalBuildState ?? null
      });
    }
    path = exact && !results.length ? response.links?.next : null;
  } while (path);
  const failed = results.some(b => ['FAILED', 'INVALID'].includes(b.processingState) || b.expired);
  const pending = exact && (!results.length || results.some(b => b.processingState !== 'VALID'));
  return {
    exitCode: failed ? 1 : pending ? 2 : 0,
    report: { checkedAt: new Date().toISOString(), appId: app.id, bundleId,
      testflightUrl: `https://appstoreconnect.apple.com/apps/${app.id}/testflight/ios`, builds: results }
  };
}

async function main() {
  const [projectRoot, version, buildNumber, ...extra] = process.argv.slice(2);
  if (!projectRoot || Boolean(version) !== Boolean(buildNumber) || extra.length) {
    throw new Error('Usage: node testflight-status.mjs /project/root [version build-number]');
  }
  const config = JSON.parse(readFileSync(join(resolve(projectRoot), '.asc-config.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const input = `${encode({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })}.${encode({ iss: config.issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`;
  const signer = createSign('SHA256');
  signer.update(input);
  const keyPath = config.keyPath.replace(/^~(?=\/|$)/, homedir());
  const signature = signer.sign({ key: readFileSync(resolve(projectRoot, keyPath)), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  async function get(path) {
    const url = new URL(path, 'https://api.appstoreconnect.apple.com/');
    if (url.origin !== 'https://api.appstoreconnect.apple.com') throw new Error('Unexpected API pagination origin');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input}.${signature}` }, signal: AbortSignal.timeout(30000)
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error(`App Store Connect ${response.status}: ${body.errors?.map(e => e.detail || e.title).join('; ') || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }
  const result = await collectStatus(get, config.bundleId, version, buildNumber);
  console.log(JSON.stringify(result.report, null, 2));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
