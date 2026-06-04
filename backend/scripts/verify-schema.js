const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REQUIRED_TABLES = [
  // Core tables
  'users',
  'sessions',
  
  // Signal tables
  'behavioral_signals',
  'emotional_signals',
  'knowledge_signals',
  'context_signals',
  'outcome_signals',
  
  // Brain tables
  'concepts',
  'concept_relationships',
  'knowledge_graph',
  'brain_state',
  'insights',
  
  // Canvas integration
  'canvas_courses',
  'canvas_assignments',
  'canvas_submissions',
  'canvas_grades',
  
  // Agent tables
  'agent_logs',
  'agent_responses',
  
  // Blockchain tables
  'blockchain_events',
  'data_proofs',
];

async function verifySchema() {
  console.log('🔍 Verifying database schema...\n');

  try {
    // Get all tables
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (error) {
      console.error('❌ Failed to fetch tables:', error);
      process.exit(1);
    }

    const existingTables = new Set(tables.map(t => t.table_name));
    let allPresent = true;

    console.log('📋 Checking required tables:\n');
    for (const table of REQUIRED_TABLES) {
      if (existingTables.has(table)) {
        console.log(`✅ ${table}`);
      } else {
        console.log(`❌ ${table} - MISSING`);
        allPresent = false;
      }
    }

    console.log('\n' + '='.repeat(50));
    if (allPresent) {
      console.log('✨ All required tables present!');
      process.exit(0);
    } else {
      console.log('⚠️  Some tables are missing. Run migrations.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifySchema();
