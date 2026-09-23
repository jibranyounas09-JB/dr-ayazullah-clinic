import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

export default function AdminPatients() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apts = snapshot.docs.map(doc => doc.data());
      
      const patientMap = new Map();
      apts.forEach((apt: any) => {
        const key = apt.patientPhone;
        if (!key) return;
        
        if (!patientMap.has(key)) {
          patientMap.set(key, {
            name: apt.patientName,
            phone: apt.patientPhone,
            email: apt.patientEmail,
            totalAppointments: 0,
            totalSpent: 0,
            lastVisit: apt.date
          });
        }
        
        const p = patientMap.get(key);
        p.totalAppointments += 1;
        const feeNum = typeof apt.fee === 'number' 
          ? apt.fee 
          : (parseInt(String(apt.fee || '').replace(/[^0-9]/g, ''), 10) || 0);
        p.totalSpent += feeNum;
        
        p.lastVisit = apt.date;
      });
      
      setPatients(Array.from(patientMap.values()));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'appointments');
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const filtered = patients.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.phone?.includes(search)
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
         <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Patient Directory</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Centralized database of all registered clinic patients.</p>
        </div>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
        <div className="p-4 border-b border-surface-container bg-surface-container-lowest flex items-center justify-between gap-4">
           <div className="relative w-full max-w-md">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
             <input 
               type="text" 
               placeholder="Search patients by name or phone..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface-container-low text-on-surface font-body-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
             />
           </div>
           <span className="font-label-sm text-on-surface-variant hidden sm:block">Total Unique Patients: {patients.length}</span>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left font-body-sm text-body-sm text-on-surface whitespace-nowrap">
            <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-6 py-3 font-medium">Patient Info</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Total Visits</th>
                <th className="px-6 py-3 font-medium">Lifetime Value</th>
                <th className="px-6 py-3 font-medium">Last Appointment</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {filtered.length === 0 ? (
                 <tr>
                   <td colSpan={6} className="px-6 py-12 text-center text-on-surface-variant">
                     <div className="flex flex-col items-center gap-2">
                       <span className="material-symbols-outlined text-[32px] opacity-40">groups</span>
                       <span>No patients found.</span>
                     </div>
                   </td>
                 </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                          {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <span className="font-bold text-on-surface">{p.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{p.phone}</span>
                        {p.email && <span className="text-[11px] text-on-surface-variant">{p.email}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface-container font-bold text-on-surface">
                        {p.totalAppointments}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-on-surface">PKR {p.totalSpent.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-on-surface-variant">{p.lastVisit}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button className="text-primary hover:bg-primary/10 w-9 h-9 rounded-full flex items-center justify-center transition-colors inline-flex">
                         <span className="material-symbols-outlined text-[20px]">visibility</span>
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
