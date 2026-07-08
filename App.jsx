import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp, MapPin,
  Calendar, AlertTriangle, ShieldAlert, CalendarClock, Plus, X,
  Search, Trash2, Pencil, LogOut, ChevronDown, Banknote,
  Phone, MessageCircle, ArrowLeft, ShieldCheck, CreditCard,
} from 'lucide-react';
import { storage } from './storage.js';

const STORAGE_KEY = 'textile-credit-data';

const C = {
  bg: '#F9FAFB',
  sidebarBg: '#FFFFFF',
  border: '#E5E7EB',
  text: '#1F2937',
  textSoft: '#6B7280',
  textMute: '#9CA3AF',
  cardBg: '#FFFFFF',
};

const ACCENTS = {
  green: { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  red: { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  amber: { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  blue: { text: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  neutral: { text: '#1F2937', bg: '#FFFFFF', border: '#E5E7EB' },
};

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€' };

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'invoices', label: 'Invoices', icon: FileText },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'outstanding', label: 'Outstanding', icon: TrendingUp },
  { key: 'visits', label: 'Visits', icon: MapPin },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function formatMoney(n, symbol) {
  const sign = n < 0 ? '-' : '';
  return sign + symbol + Math.abs(Math.round(n)).toLocaleString('en-IN');
}
function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const emptyData = () => ({
  business: { name: 'My Business', currency: 'INR' },
  customers: [],
  invoices: [],
  payments: [],
  visits: [],
});

export default function TextileCreditApp() {
  const [data, setData] = useState(emptyData());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [page, setPage] = useState('dashboard');
  const [loggedOut, setLoggedOut] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData({ ...emptyData(), ...parsed });
        }
      } catch (e) {
        // no data yet
      }
      setLoading(false);
    })();
  }, []);

  async function persist(newData) {
    setData(newData);
    try {
      const result = await storage.set(STORAGE_KEY, JSON.stringify(newData), false);
      setSaveError(result ? '' : "Couldn't save changes.");
    } catch (e) {
      setSaveError("Couldn't save changes. Try again.");
    }
  }

  const symbol = CURRENCY_SYMBOLS[data.business.currency] || '₹';

  // ---- derived stats ----
  const customerStats = useMemo(() => {
    const today = todayStr();
    const map = {};
    for (const c of data.customers) {
      const invoiced = data.invoices.filter(i => i.customerId === c.id).reduce((s, i) => s + i.amount, 0);
      const paid = data.payments.filter(p => p.customerId === c.id).reduce((s, p) => s + p.amount, 0);
      const outstanding = Math.max(invoiced - paid, 0);
      const hasOverdue = outstanding > 0 && data.invoices.some(i => i.customerId === c.id && i.dueDate < today);
      const dueToday = outstanding > 0 && data.invoices.some(i => i.customerId === c.id && i.dueDate === today);
      const overLimit = c.creditLimit > 0 && outstanding > c.creditLimit;
      map[c.id] = { invoiced, paid, outstanding, hasOverdue, dueToday, overLimit };
    }
    return map;
  }, [data]);

  const dashboardStats = useMemo(() => {
    const today = todayStr();
    const todaysCollection = data.payments.filter(p => p.date === today).reduce((s, p) => s + p.amount, 0);
    let totalOutstanding = 0, overdueOutstanding = 0, customersDueToday = 0, overCreditLimit = 0;
    for (const c of data.customers) {
      const st = customerStats[c.id];
      totalOutstanding += st.outstanding;
      if (st.hasOverdue) overdueOutstanding += st.outstanding;
      if (st.dueToday) customersDueToday += 1;
      if (st.overLimit) overCreditLimit += 1;
    }
    return {
      todaysCollection, totalOutstanding, overdueOutstanding, customersDueToday,
      overCreditLimit, customersAssigned: data.customers.length,
      totalInvoices: data.invoices.length, paymentsRecorded: data.payments.length,
    };
  }, [data, customerStats]);

  const activities = useMemo(() => {
    const nameOf = id => data.customers.find(c => c.id === id)?.name || 'Unknown';
    const invActs = data.invoices.map(i => ({
      id: 'inv-' + i.id, createdAt: i.createdAt, amount: i.amount, kind: 'invoice',
      title: `Invoice ${i.number} created`, subtitle: `${nameOf(i.customerId)} · ${formatDateTime(i.createdAt)}`,
    }));
    const payActs = data.payments.map(p => ({
      id: 'pay-' + p.id, createdAt: p.createdAt, amount: p.amount, kind: 'payment',
      title: `Payment received (${p.method})`, subtitle: `${nameOf(p.customerId)} · ${formatDateTime(p.createdAt)}`,
    }));
    return [...invActs, ...payActs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  }, [data]);

  // ---- mutations ----
  function saveCustomer(customer) {
    const exists = data.customers.some(c => c.id === customer.id);
    const customers = exists
      ? data.customers.map(c => c.id === customer.id ? customer : c)
      : [...data.customers, customer];
    persist({ ...data, customers });
    setShowAddCustomer(false);
    setEditCustomer(null);
  }
  function addInvoice(inv) {
    persist({ ...data, invoices: [...data.invoices, inv] });
    setShowAddInvoice(false);
  }
  function addPayment(p) {
    persist({ ...data, payments: [...data.payments, p] });
    setShowAddPayment(false);
  }
  function addVisit(v) {
    persist({ ...data, visits: [...data.visits, v] });
    setShowAddVisit(false);
  }
  function performDelete() {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    if (type === 'customer') {
      persist({
        ...data,
        customers: data.customers.filter(c => c.id !== id),
        invoices: data.invoices.filter(i => i.customerId !== id),
        payments: data.payments.filter(p => p.customerId !== id),
        visits: data.visits.filter(v => v.customerId !== id),
      });
    } else if (type === 'invoice') {
      persist({ ...data, invoices: data.invoices.filter(i => i.id !== id) });
    } else if (type === 'payment') {
      persist({ ...data, payments: data.payments.filter(p => p.id !== id) });
    } else if (type === 'visit') {
      persist({ ...data, visits: data.visits.filter(v => v.id !== id) });
    }
    setConfirmDelete(null);
  }
  function resetAllData() {
    persist(emptyData());
    setConfirmReset(false);
    setPage('dashboard');
  }
  function saveBusiness(business) {
    persist({ ...data, business });
    setShowSettings(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSoft, fontFamily: 'Inter, system-ui, sans-serif' }}>
        Loading…
      </div>
    );
  }

  if (loggedOut) {
    return (
      <div style={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'Inter, system-ui, sans-serif', color: C.text }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>You're logged out</div>
        <div style={{ fontSize: 13, color: C.textSoft }}>Your data is safe — sign back in to continue.</div>
        <button onClick={() => setLoggedOut(false)} style={primaryBtn()}>Log back in</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif', color: C.text, fontSize: 14 }}>
      <Style />

      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, background: C.sidebarBg, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', padding: '20px 0' }}>
        <div style={{ padding: '0 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{data.business.name}</div>
          <div style={{ fontSize: 12, color: C.textMute }}>Collection & Outstanding</div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 12px' }}>
          {NAV.map(item => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                  border: 'none', background: active ? ACCENTS.blue.bg : 'transparent',
                  color: active ? ACCENTS.blue.text : C.textSoft, cursor: 'pointer',
                  fontSize: 14, fontWeight: active ? 600 : 500, textAlign: 'left',
                }}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '16px 20px 0', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{data.business.name}</div>
          <div style={{ fontSize: 12, color: C.textMute, marginBottom: 10 }}>Admin</div>

          <button onClick={() => setShowSettings(true)} style={{ ...linkBtn(), marginBottom: 6 }}>
            Business settings
          </button>
          <button onClick={() => setLoggedOut(true)} style={{ ...linkBtn(), display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={14} /> Logout
          </button>
          <button onClick={() => setConfirmReset(true)} style={{ ...linkBtn(), color: ACCENTS.red.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={14} /> Delete account
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, padding: 24 }}>
        {saveError && (
          <div style={{ background: ACCENTS.red.bg, color: ACCENTS.red.text, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>
            {saveError}
          </div>
        )}

        {page === 'dashboard' && (
          <DashboardPage data={data} stats={dashboardStats} activities={activities} symbol={symbol} businessName={data.business.name} />
        )}
        {page === 'customers' && (
          <CustomersPage
            data={data} customerStats={customerStats} symbol={symbol} search={search} setSearch={setSearch}
            onAdd={() => setShowAddCustomer(true)}
            onView={c => { setSelectedCustomerId(c.id); setPage('customerDetail'); }}
            onEdit={c => setEditCustomer(c)}
            onDelete={c => setConfirmDelete({ type: 'customer', id: c.id, label: `customer "${c.name}"` })}
          />
        )}
        {page === 'customerDetail' && data.customers.some(c => c.id === selectedCustomerId) && (
          <CustomerDetailPage
            customer={data.customers.find(c => c.id === selectedCustomerId)}
            data={data} customerStats={customerStats} symbol={symbol}
            onBack={() => setPage('customers')}
            onAddInvoice={() => setShowAddInvoice(selectedCustomerId)}
            onAddPayment={() => setShowAddPayment(selectedCustomerId)}
            onEdit={c => setEditCustomer(c)}
            onDeleteInvoice={inv => setConfirmDelete({ type: 'invoice', id: inv.id, label: `invoice ${inv.number}` })}
            onDeletePayment={p => setConfirmDelete({ type: 'payment', id: p.id, label: 'this payment' })}
          />
        )}
        {page === 'invoices' && (
          <InvoicesPage
            data={data} customerStats={customerStats} symbol={symbol}
            onAdd={() => setShowAddInvoice(true)}
            onDelete={inv => setConfirmDelete({ type: 'invoice', id: inv.id, label: `invoice ${inv.number}` })}
          />
        )}
        {page === 'payments' && (
          <PaymentsPage
            data={data} symbol={symbol}
            onAdd={() => setShowAddPayment(true)}
            onDelete={p => setConfirmDelete({ type: 'payment', id: p.id, label: 'this payment' })}
          />
        )}
        {page === 'outstanding' && (
          <OutstandingPage data={data} customerStats={customerStats} symbol={symbol} />
        )}
        {page === 'visits' && (
          <VisitsPage
            data={data}
            onAdd={() => setShowAddVisit(true)}
            onDelete={v => setConfirmDelete({ type: 'visit', id: v.id, label: 'this visit' })}
          />
        )}
      </div>

      {showAddCustomer && (
        <CustomerModal onClose={() => setShowAddCustomer(false)} onSave={saveCustomer} />
      )}
      {editCustomer && (
        <CustomerModal customer={editCustomer} onClose={() => setEditCustomer(null)} onSave={saveCustomer} />
      )}
      {showAddInvoice && (
        <InvoiceModal
          customers={typeof showAddInvoice === 'string' ? data.customers.filter(c => c.id === showAddInvoice) : data.customers}
          nextNumber={`INV-${1000 + data.invoices.length + 1}`}
          onClose={() => setShowAddInvoice(false)}
          onSave={addInvoice}
        />
      )}
      {showAddPayment && (
        <PaymentModal
          customers={typeof showAddPayment === 'string' ? data.customers.filter(c => c.id === showAddPayment) : data.customers}
          onClose={() => setShowAddPayment(false)}
          onSave={addPayment}
        />
      )}
      {showAddVisit && (
        <VisitModal customers={data.customers} onClose={() => setShowAddVisit(false)} onSave={addVisit} />
      )}
      {showSettings && (
        <SettingsModal business={data.business} onClose={() => setShowSettings(false)} onSave={saveBusiness} />
      )}
      {confirmDelete && (
        <ConfirmModal
          text={`Delete ${confirmDelete.label}? This cannot be undone.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={performDelete}
        />
      )}
      {confirmReset && (
        <ConfirmModal
          text="This deletes all customers, invoices, payments and visits stored in this app. This cannot be undone."
          confirmLabel="Delete everything"
          onCancel={() => setConfirmReset(false)}
          onConfirm={resetAllData}
        />
      )}
    </div>
  );
}

// ---------------- Pages ----------------

function DashboardPage({ stats, activities, symbol, businessName }) {
  const cards = [
    { label: "Today's collection", value: formatMoney(stats.todaysCollection, symbol), icon: Banknote, accent: 'green' },
    { label: 'Total outstanding', value: formatMoney(stats.totalOutstanding, symbol), icon: TrendingUp, accent: 'blue' },
    { label: 'Overdue outstanding', value: formatMoney(stats.overdueOutstanding, symbol), icon: AlertTriangle, accent: 'red' },
    { label: 'Customers due today', value: stats.customersDueToday, icon: CalendarClock, accent: 'amber' },
    { label: 'Over credit limit', value: stats.overCreditLimit, icon: ShieldAlert, accent: 'red' },
    { label: 'Customers assigned', value: stats.customersAssigned, icon: Users, accent: 'neutral' },
    { label: 'Total invoices', value: stats.totalInvoices, icon: FileText, accent: 'neutral' },
    { label: 'Payments recorded', value: stats.paymentsRecorded, icon: Wallet, accent: 'neutral' },
  ];
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Welcome back, {businessName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cards.map((c, i) => <StatCard key={i} {...c} />)}
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Last 10 activities</div>
        {activities.length === 0 ? (
          <EmptyState text="No activity yet. Create an invoice or record a payment to see it here." />
        ) : (
          activities.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: C.textMute }}>{a.subtitle}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: a.kind === 'payment' ? ACCENTS.green.text : C.text, fontVariantNumeric: 'tabular-nums' }}>
                {symbol}{a.amount.toLocaleString('en-IN')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  const a = ACCENTS[accent];
  return (
    <div style={{ background: a.bg, border: `1px solid ${a.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: a.text, textTransform: 'uppercase' }}>{label}</div>
        <Icon size={16} color={a.text} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent === 'neutral' ? C.text : a.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function CustomersPage({ data, customerStats, symbol, search, setSearch, onAdd, onView, onEdit, onDelete }) {
  const filtered = data.customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)
  );
  return (
    <div>
      <PageHeader title="Customers" onAdd={onAdd} addLabel="Add customer" />
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone" />
      {filtered.length === 0 ? (
        <EmptyState text={data.customers.length === 0 ? 'No customers yet. Add your first customer to get started.' : 'No customers match your search.'} />
      ) : (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {filtered.map((c, i) => {
            const st = customerStats[c.id];
            return (
              <div
                key={c.id}
                onClick={() => onView(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: C.textMute }}>{c.phone || '—'}{c.creditLimit > 0 ? ` · Limit ${formatMoney(c.creditLimit, symbol)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, color: st.outstanding > 0 ? ACCENTS.red.text : ACCENTS.green.text, fontVariantNumeric: 'tabular-nums' }}>
                    {st.outstanding > 0 ? formatMoney(st.outstanding, symbol) : 'Clear'}
                  </div>
                  {st.overLimit && <div style={{ fontSize: 11, color: ACCENTS.red.text }}>Over limit</div>}
                </div>
                <button onClick={e => { e.stopPropagation(); onEdit(c); }} style={iconBtn()} aria-label="Edit"><Pencil size={15} /></button>
                <button onClick={e => { e.stopPropagation(); onDelete(c); }} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerDetailPage({ customer, data, customerStats, symbol, onBack, onAddInvoice, onAddPayment, onEdit, onDeleteInvoice, onDeletePayment }) {
  const [tab, setTab] = useState('ledger');
  const st = customerStats[customer.id];
  const availableCredit = customer.creditLimit > 0 ? Math.max(customer.creditLimit - st.outstanding, 0) : null;

  const myInvoices = data.invoices.filter(i => i.customerId === customer.id).sort((a, b) => b.createdAt - a.createdAt);
  const myPayments = data.payments.filter(p => p.customerId === customer.id).sort((a, b) => b.createdAt - a.createdAt);
  const lastInvoice = myInvoices[0];
  const lastPayment = myPayments[0];

  const ledgerRows = useMemo(() => {
    const entries = [
      ...myInvoices.map(i => ({ id: 'inv-' + i.id, date: i.dueDate, createdAt: i.createdAt, ref: i.number, kind: 'invoice', debit: i.amount, credit: 0 })),
      ...myPayments.map(p => ({ id: 'pay-' + p.id, date: p.date, createdAt: p.createdAt, ref: p.method, kind: 'payment', debit: 0, credit: p.amount })),
    ].sort((a, b) => a.createdAt - b.createdAt);
    let balance = 0;
    return entries.map(e => {
      balance += e.debit - e.credit;
      return { ...e, balance };
    }).reverse();
  }, [myInvoices, myPayments]);

  const digits = (customer.phone || '').replace(/\D/g, '');
  const waMessage = st.outstanding > 0
    ? `Hi ${customer.name}, this is a reminder that ${symbol}${Math.round(st.outstanding).toLocaleString('en-IN')} is outstanding on your account. Please let us know when we can expect payment. Thank you!`
    : `Hi ${customer.name}, just checking in — your account is fully settled. Thank you!`;

  return (
    <div>
      <button onClick={onBack} style={{ ...linkBtn(), display: 'flex', alignItems: 'center', gap: 6, width: 'auto', marginBottom: 14 }}>
        <ArrowLeft size={15} /> Back to customers
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{customer.name}</div>
          <div style={{ fontSize: 13, color: C.textMute }}>{customer.phone || 'No phone on file'}{customer.address ? ` · ${customer.address}` : ''}</div>
        </div>
        <button onClick={() => onEdit(customer)} style={iconBtn()} aria-label="Edit customer"><Pencil size={16} /></button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <a href={digits ? `tel:${digits}` : undefined} style={{ ...darkBtn(!digits), textDecoration: 'none' }}>
          <Phone size={15} /> Call
        </a>
        <a
          href={digits ? `https://wa.me/${digits}?text=${encodeURIComponent(waMessage)}` : undefined}
          target="_blank" rel="noopener noreferrer"
          style={{ ...darkBtn(!digits), textDecoration: 'none' }}
        >
          <MessageCircle size={15} /> WhatsApp reminder
        </a>
        <a
          href={customer.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}` : undefined}
          target="_blank" rel="noopener noreferrer"
          style={{ ...darkBtn(!customer.address), textDecoration: 'none' }}
        >
          <MapPin size={15} /> Maps
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Outstanding" value={formatMoney(st.outstanding, symbol)} icon={TrendingUp} accent={st.outstanding > 0 ? 'red' : 'green'} />
        {availableCredit !== null && <StatCard label="Available credit" value={formatMoney(availableCredit, symbol)} icon={ShieldCheck} accent="green" />}
        <StatCard label="Credit limit" value={customer.creditLimit > 0 ? formatMoney(customer.creditLimit, symbol) : 'No limit'} icon={CreditCard} accent="neutral" />
        <StatCard label="Overdue" value={formatMoney(st.hasOverdue ? st.outstanding : 0, symbol)} icon={AlertTriangle} accent={st.hasOverdue ? 'red' : 'neutral'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <InfoCard title="Last invoice">
          {lastInvoice ? `${lastInvoice.number} · ${formatMoney(lastInvoice.amount, symbol)} · due ${formatDate(lastInvoice.dueDate)}` : 'No invoices yet'}
        </InfoCard>
        <InfoCard title="Last payment">
          {lastPayment ? `${formatMoney(lastPayment.amount, symbol)} · ${lastPayment.method} · ${formatDate(lastPayment.date)}` : 'No payments yet'}
        </InfoCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <button onClick={onAddInvoice} style={{ ...primaryBtn(false), justifyContent: 'center' }}><Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Add invoice</button>
        <button onClick={onAddPayment} style={{ ...primaryBtn(false), justifyContent: 'center', background: ACCENTS.green.text }}><Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} />Add payment</button>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#111827', borderRadius: 8, padding: 4, marginBottom: 12 }}>
        {['ledger', 'invoices', 'payments'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#111827' : '#D1D5DB',
              fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'ledger' && (
        ledgerRows.length === 0 ? <EmptyState text="No transactions yet." /> : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', fontSize: 13 }}>
            <div style={{ display: 'flex', padding: '8px 16px', color: C.textMute, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              <div style={{ flex: 1 }}>Date</div><div style={{ flex: 1 }}>Ref</div>
              <div style={{ width: 90, textAlign: 'right' }}>Amount</div><div style={{ width: 100, textAlign: 'right' }}>Balance</div>
            </div>
            {ledgerRows.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
                <div style={{ flex: 1 }}>{formatDate(r.date)}</div>
                <div style={{ flex: 1, textTransform: r.kind === 'payment' ? 'capitalize' : 'none' }}>{r.ref}</div>
                <div style={{ width: 90, textAlign: 'right', color: r.kind === 'invoice' ? ACCENTS.red.text : ACCENTS.green.text, fontVariantNumeric: 'tabular-nums' }}>
                  {r.kind === 'invoice' ? '+' : '-'}{formatMoney(r.debit || r.credit, symbol)}
                </div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.balance, symbol)}</div>
              </div>
            ))}
          </div>
        )
      )}
      {tab === 'invoices' && (
        myInvoices.length === 0 ? <EmptyState text="No invoices yet." /> : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {myInvoices.map((inv, i) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ flex: 1 }}>{inv.number}<div style={{ fontSize: 12, color: C.textMute }}>Due {formatDate(inv.dueDate)}</div></div>
                <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(inv.amount, symbol)}</div>
                <button onClick={() => onDeleteInvoice(inv)} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )
      )}
      {tab === 'payments' && (
        myPayments.length === 0 ? <EmptyState text="No payments yet." /> : (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {myPayments.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ flex: 1, textTransform: 'capitalize' }}>{p.method}<div style={{ fontSize: 12, color: C.textMute, textTransform: 'none' }}>{formatDate(p.date)}</div></div>
                <div style={{ fontWeight: 600, color: ACCENTS.green.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount, symbol)}</div>
                <button onClick={() => onDeletePayment(p)} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textMute, textTransform: 'uppercase', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function darkBtn(disabled) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none',
    background: disabled ? '#D1D5DB' : '#111827', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', pointerEvents: disabled ? 'none' : 'auto',
  };
}

function InvoicesPage({ data, customerStats, symbol, onAdd, onDelete }) {
  const nameOf = id => data.customers.find(c => c.id === id)?.name || 'Unknown';
  const today = todayStr();
  const sorted = data.invoices.slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <PageHeader title="Invoices" onAdd={onAdd} addLabel="Create invoice" disabled={data.customers.length === 0} />
      {data.customers.length === 0 && <EmptyState text="Add a customer first, then create invoices for them." />}
      {data.customers.length > 0 && sorted.length === 0 && <EmptyState text="No invoices yet." />}
      {sorted.length > 0 && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {sorted.map((inv, i) => {
            const st = customerStats[inv.customerId];
            const overdue = inv.dueDate < today && st.outstanding > 0;
            const status = st.outstanding === 0 ? 'Paid' : overdue ? 'Overdue' : 'Unpaid';
            const statusColor = status === 'Paid' ? ACCENTS.green : status === 'Overdue' ? ACCENTS.red : ACCENTS.amber;
            return (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{inv.number} <span style={{ color: C.textMute, fontWeight: 400 }}>· {nameOf(inv.customerId)}</span></div>
                  <div style={{ fontSize: 12, color: C.textMute }}>Due {formatDate(inv.dueDate)}</div>
                </div>
                <Badge accent={statusColor}>{status}</Badge>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(inv.amount, symbol)}</div>
                <button onClick={() => onDelete(inv)} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaymentsPage({ data, symbol, onAdd, onDelete }) {
  const nameOf = id => data.customers.find(c => c.id === id)?.name || 'Unknown';
  const sorted = data.payments.slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <PageHeader title="Payments" onAdd={onAdd} addLabel="Record payment" disabled={data.customers.length === 0} />
      {data.customers.length === 0 && <EmptyState text="Add a customer first, then record payments." />}
      {data.customers.length > 0 && sorted.length === 0 && <EmptyState text="No payments recorded yet." />}
      {sorted.length > 0 && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{nameOf(p.customerId)}</div>
                <div style={{ fontSize: 12, color: C.textMute, textTransform: 'capitalize' }}>{p.method} · {formatDate(p.date)}</div>
              </div>
              <div style={{ fontWeight: 600, color: ACCENTS.green.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount, symbol)}</div>
              <button onClick={() => onDelete(p)} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutstandingPage({ data, customerStats, symbol }) {
  const rows = data.customers
    .map(c => ({ c, st: customerStats[c.id] }))
    .filter(r => r.st.outstanding > 0)
    .sort((a, b) => b.st.outstanding - a.st.outstanding);
  return (
    <div>
      <PageHeader title="Outstanding" />
      {rows.length === 0 ? (
        <EmptyState text="Nobody owes anything right now." />
      ) : (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{r.c.name}</div>
                <div style={{ fontSize: 12, color: C.textMute }}>Invoiced {formatMoney(r.st.invoiced, symbol)} · Paid {formatMoney(r.st.paid, symbol)}</div>
              </div>
              {r.st.hasOverdue && <Badge accent={ACCENTS.red}>Overdue</Badge>}
              {r.st.overLimit && <Badge accent={ACCENTS.red}>Over limit</Badge>}
              <div style={{ width: 100, textAlign: 'right', fontWeight: 700, color: ACCENTS.red.text, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.st.outstanding, symbol)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitsPage({ data, onAdd, onDelete }) {
  const nameOf = id => data.customers.find(c => c.id === id)?.name || 'Unknown';
  const sorted = data.visits.slice().sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <PageHeader title="Visits" onAdd={onAdd} addLabel="Log visit" disabled={data.customers.length === 0} />
      {data.customers.length === 0 && <EmptyState text="Add a customer first, then log visits." />}
      {data.customers.length > 0 && sorted.length === 0 && <EmptyState text="No visits logged yet." />}
      {sorted.length > 0 && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {sorted.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{nameOf(v.customerId)}</div>
                <div style={{ fontSize: 12, color: C.textMute }}>{formatDate(v.date)}{v.note ? ` · ${v.note}` : ''}</div>
              </div>
              <button onClick={() => onDelete(v)} style={{ ...iconBtn(), color: ACCENTS.red.text }} aria-label="Delete"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Shared bits ----------------

function PageHeader({ title, onAdd, addLabel, disabled }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
      {onAdd && (
        <button onClick={onAdd} disabled={disabled} style={primaryBtn(disabled)}>
          <Plus size={15} style={{ marginRight: 5, verticalAlign: -2 }} />{addLabel}
        </button>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', marginBottom: 16, maxWidth: 320 }}>
      <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: C.textMute }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...inputStyle(), paddingLeft: 32 }} />
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 20px', color: C.textMute, background: C.cardBg, border: `1px dashed ${C.border}`, borderRadius: 10, fontSize: 14 }}>
      {text}
    </div>
  );
}

function Badge({ accent, children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: accent.bg, color: accent.text, border: `1px solid ${accent.border}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function primaryBtn(disabled) {
  return {
    display: 'flex', alignItems: 'center', padding: '9px 14px', borderRadius: 8, border: 'none',
    background: disabled ? '#D1D5DB' : '#111827', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
  };
}
function linkBtn() {
  return { background: 'transparent', border: 'none', color: C.textSoft, fontSize: 13, cursor: 'pointer', padding: '4px 0', textAlign: 'left', width: '100%' };
}
function iconBtn() {
  return { background: 'transparent', border: 'none', color: C.textMute, cursor: 'pointer', padding: 6, display: 'flex', flexShrink: 0 };
}
function inputStyle() {
  return { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', color: C.text, outline: 'none' };
}
function labelStyle() {
  return { fontSize: 12, fontWeight: 600, color: C.textSoft, marginBottom: 4, display: 'block' };
}

function ModalShell({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 380, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textMute }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave }) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [creditLimit, setCreditLimit] = useState(customer?.creditLimit || '');
  const valid = name.trim().length > 0;
  return (
    <ModalShell title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle()}>Name</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Address</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address (optional)" style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Credit limit</label><input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="0 = no limit" style={inputStyle()} /></div>
        <button
          disabled={!valid}
          onClick={() => valid && onSave({
            id: customer?.id || uid(), name: name.trim(), phone: phone.trim(), address: address.trim(),
            creditLimit: Number(creditLimit) || 0, createdAt: customer?.createdAt || Date.now(),
          })}
          style={{ ...primaryBtn(!valid), justifyContent: 'center', marginTop: 4 }}
        >
          Save
        </button>
      </div>
    </ModalShell>
  );
}

function InvoiceModal({ customers, nextNumber, onClose, onSave }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [number, setNumber] = useState(nextNumber);
  const [amount, setAmount] = useState('');
  const defaultDue = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [dueDate, setDueDate] = useState(defaultDue);
  const valid = customerId && Number(amount) > 0 && number.trim();
  return (
    <ModalShell title="Create invoice" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle()}>Customer</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle()}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle()}>Invoice number</label><input value={number} onChange={e => setNumber(e.target.value)} style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Due date</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle()} /></div>
        <button
          disabled={!valid}
          onClick={() => valid && onSave({ id: uid(), customerId, number: number.trim(), amount: Number(amount), dueDate, createdAt: Date.now() })}
          style={{ ...primaryBtn(!valid), justifyContent: 'center', marginTop: 4 }}
        >
          Create
        </button>
      </div>
    </ModalShell>
  );
}

function PaymentModal({ customers, onClose, onSave }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(todayStr());
  const valid = customerId && Number(amount) > 0;
  return (
    <ModalShell title="Record payment" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle()}>Customer</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle()}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle()}>Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)} style={inputStyle()}>
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
        <div><label style={labelStyle()}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle()} /></div>
        <button
          disabled={!valid}
          onClick={() => valid && onSave({ id: uid(), customerId, amount: Number(amount), method, date, createdAt: Date.now() })}
          style={{ ...primaryBtn(!valid), justifyContent: 'center', marginTop: 4 }}
        >
          Save payment
        </button>
      </div>
    </ModalShell>
  );
}

function VisitModal({ customers, onClose, onSave }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id || '');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const valid = !!customerId;
  return (
    <ModalShell title="Log visit" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle()}>Customer</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={inputStyle()}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle()}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="What happened during the visit?" style={inputStyle()} /></div>
        <button
          disabled={!valid}
          onClick={() => valid && onSave({ id: uid(), customerId, date, note: note.trim(), createdAt: Date.now() })}
          style={{ ...primaryBtn(!valid), justifyContent: 'center', marginTop: 4 }}
        >
          Save visit
        </button>
      </div>
    </ModalShell>
  );
}

function SettingsModal({ business, onClose, onSave }) {
  const [name, setName] = useState(business.name);
  const [currency, setCurrency] = useState(business.currency);
  return (
    <ModalShell title="Business settings" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle()}>Business name</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle()} /></div>
        <div><label style={labelStyle()}>Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle()}>
            <option value="INR">Indian Rupee (₹)</option>
            <option value="USD">US Dollar ($)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </div>
        <button onClick={() => onSave({ name: name.trim() || 'My Business', currency })} style={{ ...primaryBtn(false), justifyContent: 'center', marginTop: 4 }}>
          Save
        </button>
      </div>
    </ModalShell>
  );
}

function ConfirmModal({ text, confirmLabel = 'Delete', onCancel, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 340, width: '100%' }}>
        <div style={{ fontSize: 14, marginBottom: 16, color: C.text }}>{text}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: ACCENTS.red.text, color: '#fff', cursor: 'pointer', fontSize: 14 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      input:focus, select:focus { border-color: #2563EB !important; }
      button:disabled { opacity: 0.6; }
    `}</style>
  );
}
