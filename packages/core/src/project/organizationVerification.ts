/**
 * Error message returned by the organization verification
 * @public
 */
export interface OrgVerificationResult {
  error: string | null
}

/**
 * Compares a project's actual organization ID with the expected organization ID.
 * @public
 */
export function compareProjectOrganization(
  projectId: string,
  projectOrganizationId: string | null | undefined,
  appOrganizationId: string,
): OrgVerificationResult {
  if (projectOrganizationId !== appOrganizationId) {
    return {
      error:
        `Project ${projectId} belongs to Organization ${projectOrganizationId ?? 'unknown'}, ` +
        `but the app is configured for Organization ${appOrganizationId}`,
    }
  }
  return {error: null}
}
