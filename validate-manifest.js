#!/usr/bin/env node

/**
 * Foundry VTT Module Manifest Validator
 * Validates module.json against Foundry VTT requirements
 */

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'packages', 'foundry-module', 'module.json');
const sharedConstantsPath = path.join(__dirname, 'shared', 'src', 'constants.ts');

console.log('🔍 Validating Foundry Module Manifest...\n');

// Required fields according to Foundry VTT documentation
const requiredFields = ['id', 'title', 'description', 'version', 'compatibility', 'authors'];

const recommendedFields = ['url', 'bugs', 'changelog', 'readme', 'license', 'manifest', 'download'];

const unsupportedFields = [
  'keywords', // Not supported in Foundry VTT manifests
];

try {
  // Read and parse manifest
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);

  console.log(`📋 Module: ${manifest.title} (${manifest.id})`);
  console.log(`📦 Version: ${manifest.version}`);
  console.log(
    `🎯 Compatibility: ${manifest.compatibility.minimum}-${manifest.compatibility.maximum}\n`
  );

  let errors = [];
  let warnings = [];

  // Check required fields
  console.log('✅ Required Fields:');
  requiredFields.forEach(field => {
    if (manifest[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
      console.log(`   ❌ ${field}: MISSING`);
    } else {
      console.log(`   ✅ ${field}: OK`);
    }
  });

  console.log('\n📋 Recommended Fields:');
  recommendedFields.forEach(field => {
    if (manifest[field] === undefined) {
      warnings.push(`Missing recommended field: ${field}`);
      console.log(`   ⚠️  ${field}: MISSING`);
    } else {
      console.log(`   ✅ ${field}: OK`);
    }
  });

  // Validate specific field formats
  console.log('\n🔍 Field Validation:');

  // ID validation
  if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('ID should only contain lowercase letters, numbers, and hyphens');
    console.log('   ❌ id: Invalid format (should be lowercase, alphanumeric, hyphens only)');
  } else {
    console.log('   ✅ id: Valid format');
  }

  // Ensure manifest ID stays in sync with the codebase
  try {
    const sharedConstants = fs.readFileSync(sharedConstantsPath, 'utf8');
    const moduleIdMatch = sharedConstants.match(/MODULE_ID\s*=\s*'([^']+)'/);
    if (moduleIdMatch) {
      const expectedModuleId = moduleIdMatch[1];
      if (manifest.id !== expectedModuleId) {
        errors.push(
          `Manifest id ("${manifest.id}") must match shared MODULE_ID ("${expectedModuleId}") ` +
            'or the MCP backend will look in the wrong Foundry module folder.'
        );
        console.log('   ❌ id: Does not match shared MODULE_ID in shared/src/constants.ts');
      } else {
        console.log('   ✅ id: Matches shared MODULE_ID');
      }
    } else {
      warnings.push('Could not read MODULE_ID from shared/src/constants.ts for cross-check');
      console.log('   ⚠️  id: Unable to verify against shared MODULE_ID');
    }
  } catch (readError) {
    warnings.push(`Failed to verify MODULE_ID from shared constants: ${readError.message}`);
    console.log('   ⚠️  id: Unable to verify against shared MODULE_ID');
  }

  // Version validation
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    warnings.push('Version should follow semantic versioning (x.y.z)');
    console.log('   ⚠️  version: Should follow semantic versioning');
  } else {
    console.log('   ✅ version: Valid format');
  }

  // Compatibility validation
  if (manifest.compatibility) {
    const { minimum, verified, maximum } = manifest.compatibility;
    if (!minimum || !verified) {
      errors.push('Compatibility must include minimum and verified versions');
      console.log('   ❌ compatibility: Missing minimum or verified versions');
    } else {
      console.log('   ✅ compatibility: Valid');
    }
  }

  // URL validation
  const urlFields = ['url', 'bugs', 'changelog', 'readme', 'license', 'manifest', 'download'];
  urlFields.forEach(field => {
    if (manifest[field] && !manifest[field].startsWith('http')) {
      warnings.push(`${field} should be a valid HTTP/HTTPS URL`);
      console.log(`   ⚠️  ${field}: Should be HTTP/HTTPS URL`);
    } else if (manifest[field]) {
      console.log(`   ✅ ${field}: Valid URL`);
    }
  });

  // File existence validation
  console.log('\n📁 File Existence:');
  if (manifest.esmodules) {
    manifest.esmodules.forEach(file => {
      const filePath = path.join(__dirname, 'packages', 'foundry-module', file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}: EXISTS`);
      } else {
        errors.push(`Missing esmodule file: ${file}`);
        console.log(`   ❌ ${file}: MISSING`);
      }
    });
  }

  if (manifest.styles) {
    manifest.styles.forEach(file => {
      const filePath = path.join(__dirname, 'packages', 'foundry-module', file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}: EXISTS`);
      } else {
        errors.push(`Missing style file: ${file}`);
        console.log(`   ❌ ${file}: MISSING`);
      }
    });
  }

  if (manifest.languages) {
    manifest.languages.forEach(lang => {
      const filePath = path.join(__dirname, 'packages', 'foundry-module', lang.path);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${lang.path}: EXISTS`);
      } else {
        errors.push(`Missing language file: ${lang.path}`);
        console.log(`   ❌ ${lang.path}: MISSING`);
      }
    });
  }

  // Check for unsupported fields
  console.log('\n🚫 Unsupported Fields:');
  const manifestKeys = Object.keys(manifest);
  let hasUnsupported = false;
  unsupportedFields.forEach(field => {
    if (manifestKeys.includes(field)) {
      errors.push(`Unsupported field (will cause Foundry warnings): ${field}`);
      console.log(`   ❌ ${field}: UNSUPPORTED (remove this field)`);
      hasUnsupported = true;
    }
  });
  if (!hasUnsupported) {
    console.log('   ✅ No unsupported fields detected');
  }

  // Summary
  console.log('\n📊 Validation Summary:');
  console.log(`   ✅ Errors: ${errors.length}`);
  console.log(`   ⚠️  Warnings: ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n❌ ERRORS:');
    errors.forEach(error => console.log(`   • ${error}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  if (errors.length === 0) {
    console.log('\n🎉 Manifest validation PASSED! Ready for Foundry VTT.');
  } else {
    console.log('\n💥 Manifest validation FAILED! Fix errors before release.');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to validate manifest:', error.message);
  process.exit(1);
}
