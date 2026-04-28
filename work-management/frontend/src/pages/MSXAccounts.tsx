import { useState, useCallback, useEffect } from 'react';
import { ExternalLink, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const FV = '@OData.Community.Display.V1.FormattedValue';

const ACCOUNT_SELECT = [
  'accountid',
  'name',
  'accountnumber',
  'address1_city',
  'address1_stateorprovince',
  'address1_country',
  'msp_mstopparentid',
  '_ownerid_value',
  '_parentaccountid_value',
].join(',');

export default function MSXAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const getHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const tokenData = await api.msx.tokenStatus().catch(() => null);
    if (!tokenData?.valid) return null;
    return {
      Authorization: `Bearer ${tokenData.accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.maxpagesize=500,odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    };
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getHeaders();
      if (!headers) {
        setError("No valid MSX token. Run 'az login' in a terminal to sign in.");
        return;
      }

      // Use D365's built-in "My Team Accounts" saved query — same view shown in MSX UI.
      // Look it up by name (returnedtypecode 1 = account).
      const sqRes = await fetch(
        `${D365_BASE}/savedqueries?$filter=name eq 'My Team Accounts' and returnedtypecode eq 'account'&$select=savedqueryid&$top=1`,
        { headers },
      );
      if (!sqRes.ok) {
        const e = await sqRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `savedqueries lookup failed: HTTP ${sqRes.status}`);
      }
      const sqJson = await sqRes.json();
      const savedQueryId = sqJson.value?.[0]?.savedqueryid;
      if (!savedQueryId) {
        throw new Error("Could not find the 'My Team Accounts' saved query in MSX.");
      }

      const r = await fetch(
        `${D365_BASE}/accounts?savedQuery=${savedQueryId}&$select=${ACCOUNT_SELECT}&$top=500`,
        { headers },
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${r.status}`);
      }
      const json = await r.json();
      setAccounts(json.value ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.accountnumber?.toLowerCase().includes(q) ||
      String(a.msp_mstopparentid ?? '').includes(q)
    );
  });

  function openInMSX(accountId: string) {
    const url = `https://microsoftsales.crm.dynamics.com/main.aspx?etn=account&pagetype=entityrecord&id=${accountId}`;
    const el = window as any;
    if (el.electronAPI?.openExternal) {
      el.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  const subtitle = loading
    ? 'Loading…'
    : accounts.length > 0
    ? `${filtered.length}${filtered.length !== accounts.length ? ` of ${accounts.length}` : ''} account${filtered.length !== 1 ? 's' : ''}`
    : 'My Team Accounts from MSX';

  return (
    <div>
      <PageHeader
        title="MSX Accounts"
        subtitle={subtitle}
        action={
          <button
            onClick={loadAccounts}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && accounts.length === 0 ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Search bar */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search by name, account ID, or TPID…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    {['Account Name', 'Account ID', 'Owner', 'City', 'State', 'Country', 'TPID', ''].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
                        {accounts.length === 0
                          ? 'No accounts found for your team in MSX.'
                          : 'No accounts match your search.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(a => (
                      <tr
                        key={a.accountid}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 max-w-56 truncate">
                          {a.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">
                          {a.accountnumber ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {a[`_ownerid_value${FV}`] ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {a.address1_city ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                          {a.address1_stateorprovince ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                          {a.address1_country ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">
                          {a.msp_mstopparentid ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openInMSX(a.accountid)}
                            title="Open in MSX"
                            className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
