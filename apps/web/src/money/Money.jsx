import { useState } from 'react';
import { Download, Plus, Smartphone } from 'lucide-react';
import { apiBase } from '../api.js';
import { MoneyContext, useMoneyClient, useLoad } from './client.js';
import { monthKey } from './format.js';
import Overview from './Overview.jsx';
import Transactions from './Transactions.jsx';
import { TxnForm } from './TxnDrawer.jsx';
import Khata from './Khata.jsx';
import KhataContact from './KhataContact.jsx';
import Accounts from './Accounts.jsx';
import Reimbursements from './Reimbursements.jsx';
import Subscriptions from './Subscriptions.jsx';
import Insights from './Insights.jsx';
import Review from './Review.jsx';
import Trips from './Trips.jsx';
import './money.css';

export const moneyTabs = [
  { id: '', label: 'Overview' },
  { id: 'txns', label: 'Transactions' },
  { id: 'khata', label: 'Khata' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'reimburse', label: 'Reimburse' },
  { id: 'subs', label: 'Subscriptions' },
  { id: 'insights', label: 'Insights' },
  { id: 'trips', label: 'Trips' },
  { id: 'review', label: 'Review' },
];

function MoneyBody({ path, params, store, create }) {
  const [tab = '', detail] = path;
  const [adding, setAdding] = useState(create);
  const { data: overview } = useLoad(`/overview?month=${monthKey()}`);
  const counts = {
    review: overview?.reviewCount,
    khata: overview?.leftCount,
    reimburse: overview?.reimburse?.waitingCount,
  };
  const known = moneyTabs.some((entry) => entry.id === tab) ? tab : '';
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Money</span>
          <h1>Money</h1>
          <p>Spending, people, cards and trips in one place.</p>
        </div>
        <div className="page-actions">
          <a
            className="btn btn-quiet"
            href={`${apiBase()}/money/export.csv`}
            download
          >
            <Download size={16} aria-hidden="true" /> Export CSV
          </a>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAdding(true)}
          >
            <Plus size={17} aria-hidden="true" /> Add payment
          </button>
        </div>
      </div>
      <nav className="tabs" aria-label="Money sections">
        {moneyTabs.map((entry) => (
          <a
            key={entry.id || 'overview'}
            href={`#money${entry.id ? `/${entry.id}` : ''}`}
            aria-current={known === entry.id ? 'page' : undefined}
          >
            {entry.label}
            {counts[entry.id] > 0 && (
              <span
                className="tab-count"
                aria-label={`${counts[entry.id]} waiting`}
              >
                {counts[entry.id]}
              </span>
            )}
          </a>
        ))}
      </nav>
      <p className="web-note">
        <Smartphone size={15} aria-hidden="true" />
        Automatic capture of bank SMS works in the Android app. On the web, add
        payments by hand or import.
      </p>
      {known === '' && <Overview />}
      {known === 'txns' && (
        <Transactions initialQuery={params.get('q') ?? ''} />
      )}
      {known === 'khata' && (detail ? <KhataContact id={detail} /> : <Khata />)}
      {known === 'accounts' && <Accounts />}
      {known === 'reimburse' && <Reimbursements />}
      {known === 'subs' && <Subscriptions />}
      {known === 'insights' && <Insights />}
      {known === 'review' && <Review />}
      {known === 'trips' && <Trips store={store} />}
      {adding && <TxnForm onClose={() => setAdding(false)} />}
    </>
  );
}

export default function Money({
  path = [],
  params = new URLSearchParams(),
  store,
  create = false,
  onSessionExpired,
}) {
  const client = useMoneyClient(onSessionExpired);
  return (
    <MoneyContext.Provider value={client}>
      <MoneyBody path={path} params={params} store={store} create={create} />
    </MoneyContext.Provider>
  );
}
