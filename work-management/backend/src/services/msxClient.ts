import { execSync } from 'child_process';

const D365_RESOURCE = 'https://microsoftsales.crm.dynamics.com';
// Microsoft's main corporate tenant — required by the microsoftsales D365 org.
// MSX Helper uses this same tenant ID (discovered from app.asar).
const D365_TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenInfo {
  accessToken: string;
  expiresOn: string;       // ISO string
  userId: string;
  minutesRemaining: number;
}

export interface MsxAccount {
  accountid: string;
  name: string;
  websiteurl: string | null;
  msdyn_tpid: number;
}

export interface MsxOpportunity {
  opportunityid: string;
  name: string;
  description: string | null;
  statecode: number;
  estimatedclosedate: string | null;
}

export interface MsxActivity {
  activityid: string;
  subject: string;
  activitytypecode: string;
  statecode: number;
  scheduledstart: string | null;
  actualend: string | null;
}

export interface MsxOppWithActivities extends MsxOpportunity {
  activities: MsxActivity[];
}

export interface MsxAccountResult {
  tpid: number;
  account: MsxAccount | null;
  opportunities: MsxOppWithActivities[];
  error?: string;
}

// ─── Status mappings ─────────────────────────────────────────────────────────

/** D365 opportunity statecode → local status */
export function mapOppStatus(statecode: number): string {
  switch (statecode) {
    case 1:  return 'Committed';
    case 2:  return 'Not Active';
    default: return 'Active';      // 0 = Open
  }
}

/** D365 activity statecode → local status */
export function mapActivityStatus(statecode: number): string {
  switch (statecode) {
    case 1:  return 'Completed';
    case 2:  return 'Blocked';
    default: return 'To Do';       // 0 = Open
  }
}

/** D365 activitytypecode → local activity type */
export function mapActivityType(code: string): string {
  switch (code) {
    case 'email':
    case 'phonecall':
    case 'appointment':
    case 'teams_meeting':
      return 'Meeting';
    default:
      return 'Other';
  }
}

// ─── Token ────────────────────────────────────────────────────────────────────

/**
 * Gets a D365 bearer token via Azure CLI.
 * Requires `az login` to have been run and az to be in PATH.
 */
export function getD365Token(): TokenInfo {
  let raw: string;
  try {
    raw = execSync(
      `az account get-access-token --resource ${D365_RESOURCE} --tenant ${D365_TENANT} --output json`,
      { encoding: 'utf-8', timeout: 15000 }
    );
  } catch (err: any) {
    throw new Error(
      `Azure CLI token generation failed. Make sure you are logged in via "az login".\n${err.message}`
    );
  }

  const parsed = JSON.parse(raw);
  const expiresOn: string = parsed.expiresOn ?? parsed.expires_on ?? '';
  const expiryDate = new Date(expiresOn);
  const minutesRemaining = Math.max(0, Math.round((expiryDate.getTime() - Date.now()) / 60000));

  // Decode the JWT payload (middle segment) to get the user's email.
  // The az CLI output has no userId field — the email lives in the token itself
  // under the 'unique_name' or 'upn' claim.
  let userId = '';
  try {
    const payloadB64 = parsed.accessToken.split('.')[1];
    const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');
    const claims = JSON.parse(payloadJson);
    userId = claims.unique_name ?? claims.upn ?? claims.email ?? claims.preferred_username ?? '';
  } catch {
    // Non-fatal — token still works, we just won't show the email
  }

  return {
    accessToken: parsed.accessToken,
    expiresOn,
    userId,
    minutesRemaining,
  };
}


