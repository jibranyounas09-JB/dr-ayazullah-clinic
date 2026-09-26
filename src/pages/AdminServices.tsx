import React, { useState, useEffect } from "react";
import { clsx } from "clsx";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, query, orderBy } from "firebase/firestore";

export default function AdminServices() {
  const [services, setServices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [icon, setIcon] = useState("accessibility_new");

  useEffect(() => {
    const q = query(collection(db, "services"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const svcs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServices(svcs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'services');
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (svc: any) => {
    setIsEditing(true);
    setCurrentId(svc.id);
    setTitle(svc.title);
    setDescription(svc.description);
    setPrice(svc.price);
    setIcon(svc.icon || "accessibility_new");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentId(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setIcon("accessibility_new");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentId) {
        await setDoc(doc(db, "services", currentId), {
          title, description, price, icon
        }, { merge: true });
      } else {
        await addDoc(collection(db, "services"), {
          title, description, price, icon, order: services.length
        });
      }
      handleCancel();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'services');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "services", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'services');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-on-surface-variant font-label-md">Loading services...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Therapy Disciplines</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Manage the clinical programs offered on the public booking page.</p>
        </div>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Discipline
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-surface rounded-xl shadow-sm border border-surface-container p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="font-headline-sm font-bold">{currentId ? "Edit Discipline" : "New Discipline"}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-label-sm font-semibold">Title</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder="e.g. Spine & Disc Decompression" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="font-label-sm font-semibold">Description</label>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief clinical description..." className="w-full p-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors resize-none"></textarea>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Price Display</label>
              <input required value={price} onChange={e => setPrice(e.target.value)} type="text" placeholder="e.g. PKR 4,500" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Material Icon Name</label>
              <input required value={icon} onChange={e => setIcon(e.target.value)} type="text" placeholder="e.g. accessibility_new" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors font-mono text-sm" />
            </div>
            <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2 mt-2 border-t border-surface-container">
              <button type="button" onClick={handleCancel} className="h-10 px-4 rounded-lg font-label-md font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">Cancel</button>
              <button type="submit" className="h-10 px-6 rounded-lg bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors">Save Discipline</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.length === 0 ? (
          <div className="col-span-full py-12 text-center text-on-surface-variant flex flex-col items-center border border-dashed border-outline-variant rounded-xl">
             <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">healing</span>
             <p className="font-label-md">No therapy disciplines configured.</p>
             <p className="font-body-sm opacity-80 mt-1 mb-4">Click "Add Discipline" to create your first offering, or load the defaults.</p>
             <div className="flex gap-3">
               <button onClick={() => setIsEditing(true)} className="h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors">
                 Add Discipline
               </button>
               <button onClick={async () => {
                 const defaults = [
                   { title: "Spine & Disc Restoration", description: "Non-surgical decompression for sciatica, herniated discs, and chronic lumbar facet strain. Regain structural alignment.", price: "PKR 4,500", icon: "accessibility_new", order: 0 },
                   { title: "Sports injury rehabilitation", description: "ACL/PCL tear protocols, rotator cuff impingement resolution, and biomechanical return-to-play screening.", price: "PKR 4,000", icon: "sprint", order: 1 },
                   { title: "Dry Needling & Myofascial pain treatment", description: "Targeted intramuscular trigger point deactivation for tension headache relief, spasms, and deep fascia relaxation.", price: "PKR 3,500", icon: "pin_invoke", order: 2 }
                 ];
                 for (const def of defaults) {
                   await addDoc(collection(db, "services"), def);
                 }
               }} className="h-10 px-4 rounded-lg border border-primary text-primary font-label-md font-bold hover:bg-primary-container/10 transition-colors">
                 Load Defaults
               </button>
             </div>
          </div>
        ) : (
          services.sort((a, b) => (a.order || 0) - (b.order || 0)).map((svc) => (
            <div key={svc.id} className="bg-surface rounded-xl border border-surface-container p-5 flex flex-col hover:shadow-md transition-all group">
               <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">{svc.icon}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(svc)} className="w-8 h-8 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors" title="Edit">
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onClick={() => handleDelete(svc.id)} className="w-8 h-8 rounded-full hover:bg-error/10 text-error flex items-center justify-center transition-colors" title="Delete">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
               </div>
               <h3 className="font-label-lg font-bold text-on-surface mb-1">{svc.title}</h3>
               <p className="font-body-sm text-on-surface-variant line-clamp-3 mb-4 flex-1">{svc.description}</p>
               <div className="font-label-md font-bold text-primary mt-auto">
                 {svc.price}
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
