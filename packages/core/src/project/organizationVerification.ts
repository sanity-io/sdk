/**
 * Error message returned by the organization verification
 * @public
 */
export interface OrganizationVerificationResult {
  error: string | null
}

/**
 * Compares a project's actual organization ID with the expected organization ID.
 * @public
 */
export function compareProjectOrganization(
  projectId: string,
  projectOrganizationId: string | null | undefined,
  currentDashboardOrgId: string,
): OrganizationVerificationResult {
  if (projectOrganizationId !== currentDashboardOrgId) {
    return {
      error:
        `Project ${projectId} belongs to Organization ${projectOrganizationId ?? 'unknown'}, ` +
        `but the Dashboard has Organization ${currentDashboardOrgId} selected`,
    }
  }
  return {error: null}
}
