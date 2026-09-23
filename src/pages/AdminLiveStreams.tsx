import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, orderBy } from "firebase/firestore";
import { clsx } from "clsx";

export default function AdminLiveStreams() {
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [platform, setPlatform] = useState("instagram");
  
  useEffect(() => {
    const q = query(collection(db, "liveStreams"), orderBy("date", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStreams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liveStreams');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !date || !time) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, "liveStreams", editingId), {
          topic,
          date,
          time,
          platform
        });
      } else {
        await addDoc(collection(db, "liveStreams"), {
          topic,
          date,
          time,
          platform
        });
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'liveStreams');
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setTopic(item.topic || "");
    setDate(item.date || "");
    setTime(item.time || "");
    setPlatform(item.platform || "instagram");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setTopic("");
    setDate("");
    setTime("");
    setPlatform("instagram");
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "liveStreams", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'liveStreams');
    }
  };

  const getPlatformIcon = (plat: string) => {
    switch (plat) {
      case 'instagram': return 'photo_camera';
      case 'tiktok': return 'smart_display';
      case 'facebook': return 'groups';
      default: return 'smart_display';
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-on-surface-variant font-label-md">Loading streams...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Live Stream CMS</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Schedule your upcoming live streams. These will automatically appear on the Community page with a countdown timer.</p>
      </div>

      <div className="bg-surface rounded-xl p-6 shadow-sm border border-surface-container">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-4">{editingId ? 'Edit Scheduled Stream' : 'Schedule New Stream'}</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block font-label-sm text-on-surface-variant mb-1">Event Topic</label>
            <input required value={topic} onChange={e => setTopic(e.target.value)} type="text" placeholder="e.g. Back Pain Q&A Session" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-sm text-on-surface-variant mb-1">Date</label>
              <input required value={date} onChange={e => setDate(e.target.value)} type="date" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block font-label-sm text-on-surface-variant mb-1">Time</label>
              <input required value={time} onChange={e => setTime(e.target.value)} type="time" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
          </div>

          <div>
            <label className="block font-label-sm text-on-surface-variant mb-1">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors">
              <option value="instagram">Instagram Live</option>
              <option value="tiktok">TikTok Live</option>
              <option value="facebook">Facebook Private Group</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-6 h-10 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-label-md font-bold transition-colors">
              {editingId ? 'Update Stream' : 'Schedule Stream'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="px-6 h-10 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-lg font-label-md transition-colors">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Scheduled Streams</h2>
        
        {streams.length === 0 ? (
          <div className="bg-surface-container-lowest border border-surface-container border-dashed rounded-xl p-8 text-center text-on-surface-variant font-label-md">
            No live streams scheduled yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {streams.map((item) => (
              <div key={item.id} className="bg-surface border border-surface-container rounded-xl p-4 shadow-sm flex flex-col gap-2 relative group">
                <div className="flex justify-between items-start gap-2">
                   <h3 className="font-label-lg font-bold text-on-surface line-clamp-2 pr-8">{item.topic}</h3>
                   <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-4 bg-surface p-1 rounded-md shadow-sm border border-surface-container">
                      <button onClick={() => handleEdit(item)} className="w-7 h-7 rounded hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors" title="Edit">
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="w-7 h-7 rounded hover:bg-error/10 text-error flex items-center justify-center transition-colors" title="Delete">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                   </div>
                </div>
                
                <div className="flex flex-col gap-1 mt-auto pt-2 text-on-surface-variant font-body-sm">
                   <div className="flex items-center gap-2">
                     <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                     <span>{item.date} at {item.time}</span>
                   </div>
                   <div className="flex items-center gap-2 capitalize">
                     <span className="material-symbols-outlined text-[16px]">{getPlatformIcon(item.platform)}</span>
                     <span>{item.platform}</span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
