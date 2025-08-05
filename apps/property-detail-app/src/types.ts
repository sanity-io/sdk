export interface MaintenanceSchedule {
  _id: string
  maintenanceType: string
  scheduledDate: string
  status: string
  notes?: string
  assignedBroker: {name: string}
  tasks: Array<{_ref: string; _key: string; _type: string}>
}
