#!/usr/bin/env node
require('dotenv').config();
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { validateProductionEnv } = require('../src/config/envValidate');

const result = validateProductionEnv();

console.log('SafeAlert NG — production environment check\n');
for (const w of result.warnings) console.log('WARN:', w);
for (const e of result.errors) console.log('ERROR:', e);

if (result.ok) {
  console.log('\nOK: Ready for production deploy');
  process.exit(0);
}

console.log('\nFAIL: Fix errors before deploy');
process.exit(1);
