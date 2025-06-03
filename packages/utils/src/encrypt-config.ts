#!/usr/bin/env node
import { readFileSync } from 'fs';
import { minifyConfig, crushJson, compressData, encryptData, Settings } from './index';

const path = process.argv[2];
if (!path) {
  console.error('Usage: encrypt-config <path-to-json>');
  process.exit(1);
}

try {
  const file = readFileSync(path, 'utf-8');
  const minified = minifyConfig(JSON.parse(file));
  const crushed = crushJson(JSON.stringify(minified));
  const compressed = compressData(crushed);

  let output: string;
  if (!Settings.SECRET_KEY) {
    output = `B-${encodeURIComponent(compressed.toString('base64'))}`;
  } else {
    const { iv, data } = encryptData(compressed);
    output = `E2-${encodeURIComponent(iv)}-${encodeURIComponent(data)}`;
  }
  console.log(output);
} catch (err: any) {
  console.error('Failed to encrypt configuration:', err.message);
  process.exit(1);
}
