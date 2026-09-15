/**
 * Organization-workspace selection shared by client and server. The chosen
 * organization lives in a cookie written by the topbar OrgSwitcher; server
 * components read it via getSelectedOrgId() from org-server.ts. Missing cookie
 * = "all my organizations".
 */
export const ORG_COOKIE = "organize.org";