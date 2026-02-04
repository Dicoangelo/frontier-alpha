#!/usr/bin/env tsx
/**
 * Ken French Data Library Downloader
 *
 * Downloads and parses Fama-French factor data from:
 * https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
 *
 * Factors downloaded:
 * - FF3: Mkt-RF, SMB, HML (Market, Size, Value)
 * - FF5: + RMW, CMA (Profitability, Investment)
 * - Mom: Momentum factor
 *
 * Usage:
 *   npx tsx scripts/download-ken-french.ts
 *   npm run download-ken-french
 */

import { createClient } from '@supabase/supabase-js';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { parse } from 'csv-parse/sync';

// Ken French data URLs (CSV format in ZIP)
const DATA_SOURCES = {
  // Fama-French 5 Factors (Daily)
  FF5_DAILY: {
    url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_5_Factors_2x3_daily_CSV.zip',
    factors: ['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA'],
    startLine: 4,  // Skip header lines
  },
  // Momentum Factor (Daily)
  MOM_DAILY: {
    url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_daily_CSV.zip',
    factors: ['Mom'],
    startLine: 14,  // More header lines for momentum
  },
};

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is required');
  console.error('Set it in your .env file or export it before running this script');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Data directory for temporary files
const DATA_DIR = join(process.cwd(), 'data', 'ken-french');

interface FactorReturn {
  date: string;
  factor_name: string;
  return_value: number;
}

/**
 * Download file from URL
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const writeStream = createWriteStream(destPath);
  writeStream.write(Buffer.from(buffer));
  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  console.log(`Downloaded to: ${destPath}`);
}

/**
 * Extract ZIP file (Ken French uses simple ZIP with single CSV)
 */
async function extractZip(zipPath: string, destDir: string): Promise<string> {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Find the CSV file
  const csvEntry = entries.find(e => e.entryName.endsWith('.CSV') || e.entryName.endsWith('.csv'));
  if (!csvEntry) {
    throw new Error('No CSV file found in ZIP');
  }

  const csvPath = join(destDir, csvEntry.entryName);
  zip.extractEntryTo(csvEntry, destDir, false, true);
  console.log(`Extracted: ${csvPath}`);

  return csvPath;
}

/**
 * Parse Ken French CSV format
 * Format: YYYYMMDD, Mkt-RF, SMB, HML, RMW, CMA (space-separated, percent values)
 */
function parseKenFrenchCSV(
  content: string,
  factors: string[],
  startLine: number
): FactorReturn[] {
  const lines = content.split('\n');
  const returns: FactorReturn[] = [];

  let inDailySection = false;
  let lineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Ken French files have multiple sections - we want daily data
    // Look for the start of daily data (8-digit dates)
    if (/^\d{8}/.test(trimmed)) {
      inDailySection = true;
    }

    // Skip header lines
    if (!inDailySection) continue;
    if (lineCount < startLine - 1) {
      lineCount++;
      continue;
    }

    // Parse data line: YYYYMMDD, val1, val2, ...
    const parts = trimmed.split(/[,\s]+/).filter(p => p.length > 0);
    if (parts.length < factors.length + 1) continue;

    // Parse date (YYYYMMDD format)
    const dateStr = parts[0];
    if (!/^\d{8}$/.test(dateStr)) continue;

    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const date = `${year}-${month}-${day}`;

    // Skip future dates or invalid dates
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime()) || dateObj > new Date()) continue;

    // Parse factor returns (values are in percent, convert to decimal)
    for (let i = 0; i < factors.length; i++) {
      const value = parseFloat(parts[i + 1]);
      if (!isNaN(value)) {
        returns.push({
          date,
          factor_name: factors[i],
          return_value: value / 100,  // Convert percent to decimal
        });
      }
    }
  }

  return returns;
}

/**
 * Insert factor returns into Supabase
 */
async function insertFactorReturns(returns: FactorReturn[]): Promise<void> {
  console.log(`Inserting ${returns.length} factor returns into Supabase...`);

  // Insert in batches of 1000
  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < returns.length; i += batchSize) {
    const batch = returns.slice(i, i + batchSize);

    const { error } = await supabase
      .from('frontier_factor_returns')
      .upsert(
        batch.map(r => ({
          date: r.date,
          factor_name: r.factor_name,
          return_value: r.return_value,
        })),
        { onConflict: 'date,factor_name' }
      );

    if (error) {
      console.error(`Error inserting batch at ${i}:`, error);
      throw error;
    }

    inserted += batch.length;
    if (inserted % 10000 === 0) {
      console.log(`  Inserted ${inserted} / ${returns.length}`);
    }
  }

  console.log(`Successfully inserted ${inserted} factor returns`);
}

/**
 * Main download and import function
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Ken French Factor Data Downloader');
  console.log('='.repeat(60));
  console.log();

  // Create data directory
  await mkdir(DATA_DIR, { recursive: true });

  const allReturns: FactorReturn[] = [];

  for (const [name, source] of Object.entries(DATA_SOURCES)) {
    console.log(`\nProcessing: ${name}`);
    console.log('-'.repeat(40));

    try {
      // Download ZIP
      const zipPath = join(DATA_DIR, `${name}.zip`);
      await downloadFile(source.url, zipPath);

      // Extract CSV
      const csvPath = await extractZip(zipPath, DATA_DIR);

      // Read and parse CSV
      const { readFile } = await import('fs/promises');
      const content = await readFile(csvPath, 'utf-8');

      const returns = parseKenFrenchCSV(content, source.factors, source.startLine);
      console.log(`Parsed ${returns.length} factor returns for: ${source.factors.join(', ')}`);

      allReturns.push(...returns);

      // Cleanup temp files
      await unlink(zipPath).catch(() => {});
      await unlink(csvPath).catch(() => {});
    } catch (error) {
      console.error(`Error processing ${name}:`, error);
    }
  }

  // Insert all returns into Supabase
  if (allReturns.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Uploading to Supabase');
    console.log('='.repeat(60));

    await insertFactorReturns(allReturns);

    // Print summary
    const factorCounts: Record<string, number> = {};
    for (const r of allReturns) {
      factorCounts[r.factor_name] = (factorCounts[r.factor_name] || 0) + 1;
    }

    console.log('\nSummary:');
    console.log('-'.repeat(40));
    for (const [factor, count] of Object.entries(factorCounts)) {
      console.log(`  ${factor.padEnd(10)} ${count.toLocaleString()} days`);
    }

    // Find date range
    const dates = allReturns.map(r => r.date).sort();
    console.log(`\nDate range: ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`Total records: ${allReturns.length.toLocaleString()}`);
  }

  console.log('\nDone!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
