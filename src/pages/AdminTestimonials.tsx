import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, query, orderBy } from "firebase/firestore";

export default function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [platform, setPlatform] = useState("youtube");

  useEffect(() => {
    const q = query(collection(db, "testimonials"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTestimonials(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'testimonials');
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEdit = (item: any) => {
    setIsEditing(true);
    setCurrentId(item.id);
    setTitle(item.title || "");
    setVideoUrl(item.videoUrl || "");
    setPlatform(item.platform || "youtube");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentId(null);
    setTitle("");
    setVideoUrl("");
    setPlatform("youtube");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentId) {
        await setDoc(doc(db, "testimonials", currentId), {
          title, videoUrl, platform
        }, { merge: true });
      } else {
        await addDoc(collection(db, "testimonials"), {
          title, videoUrl, platform, timestamp: new Date().toISOString()
        });
      }
      handleCancel();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'testimonials');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "testimonials", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'testimonials');
    }
  };

  // Helper to extract YouTube ID
  const getYoutubeEmbedUrl = (url: string) => {
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("youtube.com/watch")) {
      videoId = new URLSearchParams(url.split("?")[1]).get("v") || "";
    } else if (url.includes("youtube.com/embed/")) {
      videoId = url.split("embed/")[1]?.split("?")[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  if (isLoading) {
    return <div className="p-8 text-center text-on-surface-variant font-label-md">Loading video testimonials...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Video Testimonials</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Add YouTube or direct video links to feature patient success stories.</p>
        </div>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">video_call</span>
            Add Video
          </button>
        )}
      </div>

      {isEditing && (
        <div className="bg-surface rounded-xl shadow-sm border border-surface-container p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="font-headline-sm font-bold">{currentId ? "Edit Video" : "New Video"}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm font-semibold">Video Caption / Patient Name</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder="e.g. John's recovery from back pain" className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold">Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors">
                  <option value="youtube">YouTube (Recommended)</option>
                  <option value="direct">Direct Video Link (.mp4, etc)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-label-sm font-semibold">Video URL</label>
                <input required value={videoUrl} onChange={e => setVideoUrl(e.target.value)} type="text" placeholder={platform === "youtube" ? "https://youtube.com/watch?v=..." : "https://example.com/video.mp4"} className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 mt-2 border-t border-surface-container">
              <button type="button" onClick={handleCancel} className="h-10 px-4 rounded-lg font-label-md font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">Cancel</button>
              <button type="submit" className="h-10 px-6 rounded-lg bg-primary text-on-primary font-label-md font-bold shadow-sm hover:bg-primary-container transition-colors">Save Video</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {testimonials.length === 0 ? (
          <div className="col-span-full py-12 text-center text-on-surface-variant flex flex-col items-center border border-dashed border-outline-variant rounded-xl">
             <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">smart_display</span>
             <p className="font-label-md">No videos added yet.</p>
             <p className="font-body-sm opacity-80 mt-1">Click "Add Video" to showcase patient success stories.</p>
          </div>
        ) : (
          testimonials.map((item) => (
            <div key={item.id} className="bg-surface rounded-xl border border-surface-container overflow-hidden flex flex-col hover:shadow-md transition-all group">
               <div className="aspect-video w-full bg-surface-container-lowest relative">
                 {item.platform === "youtube" ? (
                   <iframe 
                     src={getYoutubeEmbedUrl(item.videoUrl)} 
                     className="w-full h-full absolute top-0 left-0" 
                     frameBorder="0" 
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                     allowFullScreen
                   ></iframe>
                 ) : (
                   <video src={item.videoUrl} controls className="w-full h-full object-cover" />
                 )}
               </div>
               <div className="p-4 flex flex-col h-full">
                 <h3 className="font-label-lg font-bold text-on-surface line-clamp-2">{item.title}</h3>
                 <div className="mt-auto pt-4 flex items-center justify-between">
                   <p className="font-body-sm text-on-surface-variant capitalize opacity-80 flex items-center gap-1">
                     <span className="material-symbols-outlined text-[16px]">{item.platform === 'youtube' ? 'smart_display' : 'movie'}</span>
                     {item.platform}
                   </p>
                   <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(item)} className="w-8 h-8 rounded-md hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors" title="Edit">
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-md hover:bg-error/10 text-error flex items-center justify-center transition-colors" title="Delete">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                   </div>
                 </div>
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
