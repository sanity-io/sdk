// import { defineIntent } from "@sanity/sdk";

// some .cjs and esm issues with the old CLI, but we do have this helper
// export default defineIntent({

export default {
  id: 'completeAllTasks',
  action: 'edit',
  title: 'Complete All Maintenance Tasks',
  filters: [
    {
      types: ['property', 'maintenanceSchedule'],
    },
  ],
  description: 'Bulk complete all tasks for a maintenance schedule without loading the main app',
}
