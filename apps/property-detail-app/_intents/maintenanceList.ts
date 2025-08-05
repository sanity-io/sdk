// import { defineIntent } from "@sanity/sdk";

// some .cjs and esm issues with the old CLI, but we do have this helper
// export default defineIntent({

export default {
  id: 'maintenanceList',
  action: 'edit',
  title: 'Maintenance List',
  filters: [
    {
      types: ['property'],
    },
  ],
  description: 'View and update the maintenance list for a property',
}
