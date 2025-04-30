import {describe, expect, it} from 'vitest'

import {compareProjectOrganization, type OrgVerificationResult} from './organizationVerification'

describe('compareProjectOrganization', () => {
  const projectId = 'proj-1'
  const expectedOrgId = 'org-abc'

  it('should return error null when project orgId matches expected orgId', () => {
    const projectOrgId = 'org-abc'
    const result = compareProjectOrganization(projectId, projectOrgId, expectedOrgId)
    expect(result).toEqual<OrgVerificationResult>({error: null})
  })

  it('should return an error message when project orgId does not match expected orgId', () => {
    const projectOrgId = 'org-xyz' // Mismatch
    const result = compareProjectOrganization(projectId, projectOrgId, expectedOrgId)
    expect(result.error).toContain('belongs to Organization org-xyz')
    expect(result.error).toContain('Dashboard has Organization org-abc selected')
  })

  it('should return an error message when project orgId is null', () => {
    const projectOrgId = null
    const result = compareProjectOrganization(projectId, projectOrgId, expectedOrgId)
    expect(result.error).toContain('belongs to Organization unknown')
    expect(result.error).toContain('Dashboard has Organization org-abc selected')
  })

  it('should return an error message when project orgId is undefined', () => {
    const projectOrgId = undefined
    const result = compareProjectOrganization(projectId, projectOrgId, expectedOrgId)
    expect(result.error).toContain('belongs to Organization unknown')
    expect(result.error).toContain('Dashboard has Organization org-abc selected')
  })
})
