import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAppointments(apts);
      setIsLoading(false);
    }, (error) => {
      console.error("Failed to stream appointments:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const pendingCount = appointments.filter(a => a.status === 'Pending').length;
  const completedCount = appointments.filter(a => a.status === 'Completed').length;
  
  // Calculate total unique patients using phone numbers as distinct identifier
  const uniquePatients = useMemo(() => {
    const phones = new Set(appointments.map(a => a.patientPhone).filter(Boolean));
    return phones.size;
  }, [appointments]);

  const parseFeeNumber = (fee: any): number => {
    if (typeof fee === 'number') return isNaN(fee) ? 0 : fee;
    if (!fee) return 0;
    const cleaned = String(fee).replace(/[^0-9]/g, '');
    return parseInt(cleaned, 10) || 0;
  };

  const totalRevenue = appointments.reduce((acc, curr) => {
    if (curr.status !== 'Completed') return acc;
    return acc + parseFeeNumber(curr.fee);
  }, 0);

  // --- Chart Data Preparation ---
  
  // 1. Revenue over time (by appointment date)
  const revenueData = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.filter(a => a.status === 'Completed').forEach(apt => {
      const fee = parseFeeNumber(apt.fee);
      const dateStr = apt.date || "Unknown";
      map[dateStr] = (map[dateStr] || 0) + fee;
    });
    return Object.entries(map)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14); // Last 14 active days
  }, [appointments]);

  // 2. Appointments by Category
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.forEach(apt => {
      const cat = apt.category || "Other";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [appointments]);

  // 3. Appointments by Status (Bar Chart)
  const statusData = [
    { name: 'Completed', count: completedCount, fill: '#005B99' },
    { name: 'Pending', count: pendingCount, fill: '#008C99' },
  ];

  const PIE_COLORS = ['#005B99', '#008C99', '#4DD0E1', '#003366', '#81D4FA', '#0277BD'];

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Dashboard Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-2">
          <span className="font-label-md text-on-surface-variant flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px]">groups</span> Total Patients</span>
          <span className="font-display-sm text-display-sm font-bold">{uniquePatients}</span>
        </div>
        <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-2">
          <span className="font-label-md text-on-surface-variant flex items-center gap-2"><span className="material-symbols-outlined text-secondary text-[20px]">pending_actions</span> Pending Approvals</span>
          <span className="font-display-sm text-display-sm font-bold">{pendingCount}</span>
        </div>
        <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-2">
          <span className="font-label-md text-on-surface-variant flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px]">check_circle</span> Confirmed</span>
          <span className="font-display-sm text-display-sm font-bold">{completedCount}</span>
        </div>
        <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-2">
          <span className="font-label-md text-on-surface-variant flex items-center gap-2"><span className="material-symbols-outlined text-tertiary text-[20px]">payments</span> Total Revenue</span>
          <span className="font-display-sm text-display-sm font-bold">PKR {totalRevenue.toLocaleString()}</span>
        </div>
      </div>

      {/* Internship & Academy Quick Manager Card */}
      <div className="bg-gradient-to-r from-primary/10 via-surface to-primary/5 p-5 rounded-2xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[26px]">school</span>
          </div>
          <div>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Clinical Internship &amp; Fellowship Academy Manager
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Publish new internship opportunities, manage clinical fellowship tracks, and review incoming candidate dossiers.
            </p>
          </div>
        </div>
        <Link
          to="/admin/internships"
          className="px-4 py-2 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 self-start sm:self-center"
        >
          <span>Manage Internships</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>

      {/* Analytics Charts */}
      {appointments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Revenue Over Time Chart */}
          <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-4">
            <h3 className="font-headline-sm text-on-surface font-bold">Revenue Trend (Last 14 Days)</h3>
            <div className="h-[250px] w-full">
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#005B99" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#005B99" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <YAxis 
                      width={80}
                      tick={{fontSize: 12, fill: '#64748b'}} 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={(val) => `Rs ${val.toLocaleString()}`} 
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: number) => [`PKR ${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#005B99" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-on-surface-variant font-label-md">
                  No completed revenue data yet.
                </div>
              )}
            </div>
          </div>

          {/* Appointments by Category */}
          <div className="bg-surface p-6 rounded-xl shadow-sm border border-surface-container flex flex-col gap-4">
            <h3 className="font-headline-sm text-on-surface font-bold">Services Popularity</h3>
            <div className="h-[250px] w-full flex items-center justify-center">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-on-surface-variant font-label-md">
                  No services data yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-surface-container flex justify-between items-center bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Recent Appointments</h2>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
              {appointments.length} Total
            </span>
          </div>
          <Link
            to="/admin/appointments"
            className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
          >
            <span>Manage in Appointments</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
        
        {appointments.length === 0 ? (
          <div className="p-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[48px] opacity-50">event_busy</span>
            <p>No appointments found in local storage.</p>
            <p className="text-[12px]">Go to the booking page and schedule a test appointment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm text-on-surface whitespace-nowrap">
              <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-3 font-medium">Patient</th>
                  <th className="px-6 py-3 font-medium">Date & Time</th>
                  <th className="px-6 py-3 font-medium">Program</th>
                  <th className="px-6 py-3 font-medium">Payment</th>
                  <th className="px-6 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {appointments.slice().reverse().map((apt, i) => {
                  const s = (apt.status || 'Pending').trim().toLowerCase();
                  const isCompleted = s === 'completed';
                  const isApproved = s === 'verified' || s === 'approved';
                  const isCancelled = s === 'cancelled' || s === 'canceled' || s === 'refund requested' || s === 'refunded' || s.includes('cancel');

                  return (
                    <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold">{apt.patientName || 'Patient'}</span>
                          <span className="text-[11px] text-on-surface-variant">{apt.patientPhone || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{apt.date}</span>
                          <span className="font-medium text-primary">{apt.time}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{apt.category}</span>
                          <span className="text-[11px] text-on-surface-variant">{apt.mode}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{apt.paymentMethod || 'Direct Transfer'}</span>
                          <span className="text-[11px] text-on-surface-variant font-mono">Ref: {apt.transactionId || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Completed
                          </span>
                        ) : isApproved ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            Approved
                          </span>
                        ) : isCancelled ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            Canceled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
