#!/usr/bin/env node
/**
 * Sync venues from Dev Supabase to Prod Supabase
 * Usage: node scripts/sync-venues-to-prod.mjs
 */

import { createClient } from '@supabase/supabase-js';

const DEV_URL = 'https://jofuwykknxnhmvcholet.supabase.co';
const DEV_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZnV3eWtrbnhuaG12Y2hvbGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODA2ODksImV4cCI6MjA5NDI1NjY4OX0.m7FKbGYBgHNvB_cEKzgEGzQ2eR-K-ZK-mwcvLMJE1nQ';

const PROD_URL = 'https://almxurfdortlfqfpjaka.supabase.co';
const PROD_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PROD_SERVICE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY env var for prod');
  process.exit(1);
}

const devClient = createClient(DEV_URL, DEV_ANON);
const prodClient = createClient(PROD_URL, PROD_SERVICE_KEY);

async function syncTable(tableName, orderBy = 'name') {
  console.log(`\n📦 Syncing ${tableName}...`);
  
  // Read from dev
  const { data, error } = await devClient
    .from(tableName)
    .select('*')
    .order(orderBy);
    
  if (error) {
    console.error(`  ❌ Read error: ${error.message}`);
    return 0;
  }
  
  if (!data || data.length === 0) {
    console.log(`  ⚠️ No data in dev`);
    return 0;
  }
  
  console.log(`  📖 Read ${data.length} rows from dev`);
  
  // Insert in batches of 10
  const batchSize = 10;
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const { error: insertError } = await prodClient
      .from(tableName)
      .upsert(batch, { onConflict: 'id' });
      
    if (insertError) {
      console.error(`  ❌ Insert error (batch ${Math.floor(i/batchSize)+1}): ${insertError.message}`);
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✅ ${inserted}/${data.length}\r`);
    }
  }
  
  console.log(`  ✅ Inserted ${inserted}/${data.length} rows into prod`);
  return inserted;
}

async function main() {
  console.log('🔄 DTL Venue Data Sync: Dev → Prod');
  console.log('====================================');
  
  const results = {};
  
  // Sync venues first (parent table)
  results.venues = await syncTable('venues');
  
  // Sync promotions
  results.promotions = await syncTable('promotions', 'created_at');
  
  // Sync events
  results.events = await syncTable('events', 'created_at');
  
  console.log('\n====================================');
  console.log('📊 Sync Results:');
  for (const [table, count] of Object.entries(results)) {
    console.log(`  ${table}: ${count} rows`);
  }
  console.log('✅ Done!');
}

main().catch(console.error);
