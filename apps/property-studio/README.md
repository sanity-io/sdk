# Property Studio Migration

This directory contains schema types and a data migration script for your property management system.

## Quick Start

1. **Install dependencies:**

   ```bash
   cd apps/property-studio
   npm install
   ```

2. **Get a Sanity API token:**

   - Go to [manage.sanity.io](https://manage.sanity.io)
   - Select your project (ID: `9wmez61s`)
   - Navigate to API → Tokens
   - Create a new token with **Write** permissions

3. **Run the migration:**

   ```bash
   npx tsx migrate-data.ts 9wmez61s production YOUR_API_TOKEN
   ```

   Replace `YOUR_API_TOKEN` with the token you created in step 2.

## What Gets Migrated

The script will create:

- **3 brokers** (Sarah Johnson, Mike Chen, David Rodriguez)
- **5 properties** with full details (address, rent, bedrooms, bathrooms, location)
- **28 maintenance tasks** distributed across properties
- **5 maintenance schedules** linking everything together

## Schema Types Created

- **Property**: Address, broker, status, rent, bedrooms, bathrooms, geopoint location, tenant
- **Broker**: Name, email, phone, license number, active status
- **Maintenance Task**: Task description, completion status, priority level, notes
- **Maintenance Schedule**: Property reference, maintenance type, scheduled date, assigned broker, tasks

## Location Data

Properties use Sanity's built-in `geopoint` type for location data:

```javascript
location: {
  _type: "geopoint",
  lat: 40.7128,
  lng: -74.006
}
```

## Troubleshooting

- **"Cannot find module '@sanity/client'"**: Run `npm install` first
- **"Project not found"**: Check your project ID
- **"Unauthorized"**: Check your API token has write permissions
- **"Dataset not found"**: Make sure the dataset exists (default is `production`)

The script includes detailed logging showing exactly what's being created.
