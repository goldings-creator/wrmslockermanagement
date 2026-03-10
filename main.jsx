import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Lock, Unlock, User, UserPlus, UserMinus, Hash, Plus, Trash2, FileUp, 
  AlertCircle, CheckCircle2, Settings, Database, Wrench, Clock, 
  CheckCircle, AlertTriangle, History, X, MapPin, Layers, ChevronDown, Loader2, Ban
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  deleteDoc, 
  query,
  getDocs
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBX37YTsUcqLPsgT-6nT1Lt7myTerDJUcc",
  authDomain: "wrms-lockers.firebaseapp.com",
  projectId: "wrms-lockers",
  storageBucket: "wrms-lockers.firebasestorage.app",
  messagingSenderId: "870499565234",
  appId: "1:870499565234:web:31b19a27693bfd6c1313ab"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'wrms-locker-system';

// --- UI Components ---

const StatCard = ({ label, value, color }) => (
  <div className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden`}>
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-900">{value}</div>
    <div className={`absolute bottom-0 left-0 w-full h-1 ${color === 'blue' ? 'bg-blue-500' : color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
  </div>
);

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [lockers, setLockers] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [activeSet, setActiveSet] = useState(4); // Defaults to Set #4
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState('inventory');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isUnusableModalOpen, setIsUnusableModalOpen] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [errorLog, setErrorLog] = useState('');

  const [editingLocker, setEditingLocker] = useState(null);
  const [activeLockerForAssign, setActiveLockerForAssign] = useState(null);
  const [activeLockerForStatus, setActiveLockerForStatus] = useState(null);
  const [viewingCombination, setViewingCombination] = useState(null);
  const [notification, setNotification] = useState(null);

  // Initialize Auth
  useEffect(() => {
    const login = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Firebase Login Error", err);
      }
    };
    login();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const lockersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lockers');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setActiveSet(docSnap.data().activeSet || 4);
    });

    const unsubLockers = onSnapshot(query(lockersRef), (snapshot) => {
      setLockers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => notify("Database Connection Issue", "error"));

    const unsubLogs = onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubSettings(); unsubLockers(); unsubLogs(); };
  }, [user]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const updateGlobalComboSet = async (newSet) => {
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
      await setDoc(settingsRef, { activeSet: newSet }, { merge: true });
      notify(`Switching all to Set #${newSet}`);
    } catch (e) { notify("Update failed: Check permissions", "error"); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setIsUploading(true);
    setErrorLog('');
    setProgress(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
        setTotalToUpload(rows.length);
        
        let count = 0;
        for (const row of rows) {
          const p = row.split(',').map(s => s?.trim());
          if (p[0]) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'lockers'), {
              lockerNumber: p[0], studentName: p[1] || "", 
              combination1: p[2] || "00-00-00", combination2: p[3] || "00-00-00", 
              combination3: p[4] || "00-00-00", combination4: p[5] || "00-00-00", 
              combination5: p[6] || "00-00-00", location: p[7] || "Hall", 
              lastModified: new Date().toISOString()
            });
            count++;
            setProgress(count);
          }
        }
        notify(`Imported ${count} lockers!`);
        setImportModalOpen(false);
      } catch (err) {
        setErrorLog("Error during import");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const clearDatabase = async () => {
    if (!window.confirm("This will permanently delete ALL current lockers. Continue?")) return;
    setIsUploading(true);
    const snapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'lockers'));
    for (const d of snapshot.docs) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', d.id)); }
    setIsUploading(false);
    notify("Database Cleared");
  };

  const filteredLockers = useMemo(() => {
    return lockers
      .filter(l => 
        l.lockerNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        l.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.lockerNumber.localeCompare(b.lockerNumber, undefined, {numeric: true}));
  }, [lockers, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-40 p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-sm">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Inventory</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${view === 'maintenance' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Broken</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 border-r pr-4 border-slate-200 mr-2 items-center text-[9px] font-black text-slate-400">
            COMBO SET:
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => setImportModalOpen(true)} className="p-2 text-slate-400 border rounded-xl hover:bg-slate-50 transition-colors"><FileUp size={20}/></button>
          <button onClick={() => {setEditingLocker(null); setIsModalOpen(true);}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Total" value={lockers.length} color="blue" />
          <StatCard label="Empty" value={lockers.filter(l => !l.studentName).length} color="emerald" />
          <StatCard label="Issues" value={maintenanceLogs.filter(l => l.status === 'pending').length} color="rose" />
          <StatCard label="Active Set" value={`Set ${activeSet}`} color="blue" />
        </div>

        {view === 'inventory' ? (
          <>
            <div className="relative mb-10">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
              <input type="text" placeholder="Search Number or Name..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-blue-50 transition-all shadow-sm text-lg font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredLockers.map(l => {
                const isUnusable = maintenanceLogs.some(log => log.lockerId === l.id && log.status === 'pending');
                return (
                  <div key={l.id} className={`bg-white border rounded-[2rem] p-6 group relative shadow-sm transition-all hover:shadow-md ${isUnusable ? 'border-rose-200 bg-rose-50/20' : l.studentName ? 'border-blue-100 bg-blue-50/10' : 'border-slate-200'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black font-mono tracking-tighter">#{l.lockerNumber}</span>
                          {isUnusable && <span className="bg-rose-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Broken</span>}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><MapPin size={10}/> {l.location || "Hall"}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => { setActiveLockerForStatus(l); setIsUnusableModalOpen(true); }} className="p-2 text-slate-300 hover:text-rose-500"><Ban size={16}/></button>
                         <button onClick={() => { if(window.confirm('Delete locker?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))}} className="p-2 text-slate-200 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mb-5">
                      <div className={`truncate font-bold text-sm ${l.studentName ? 'text-slate-900' : 'text-slate-300 italic'}`}>{l.studentName || "Available"}</div>
                      {!isUnusable && (
                        l.studentName ? 
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id), {studentName: ""})} className="text-slate-200 hover:text-red-500"><UserMinus size={20}/></button> :
                        <button onClick={() => {setActiveLockerForAssign(l); setIsAssignModalOpen(true);}} className="text-emerald-400 hover:text-emerald-600"><UserPlus size={20}/></button>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100 shadow-inner">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-lg bg-slate-800 text-[10px] flex items-center justify-center text-white font-black">{activeSet}</div>
                         <div className="font-mono font-black text-sm tracking-[0.25em] text-slate-700">{viewingCombination === l.id ? (l[`combination${activeSet}`] || "00-00-00") : "••-••-••"}</div>
                      </div>
                      <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm">Reveal</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-20 text-center text-slate-400 font-bold italic">Maintenance Issues List is currently under construction...</div>
        )}
      </main>

      {/* Modals */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-center shadow-2xl">
            <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6"><FileUp size={40}/></div>
            <h2 className="text-3xl font-black mb-2 tracking-tighter">Bulk Upload</h2>
            <div className="space-y-4">
              <input type="file" accept=".csv" onChange={handleCSVImport} className="block w-full text-xs text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-slate-100 file:text-slate-600 cursor-pointer" />
              {isUploading && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={24}/>
                  <div className="text-xs font-black uppercase text-slate-400">Uploading {progress} of {totalToUpload}</div>
                  <div className="w-full h-2 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{width: `${(progress / totalToUpload) * 100}%`}}></div></div>
                </div>
              )}
              {!isUploading && <button onClick={clearDatabase} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200">Wipe Data First</button>}
            </div>
            <button onClick={() => setImportModalOpen(false)} className="mt-8 text-slate-300 font-black text-[10px] uppercase hover:text-slate-500">Close</button>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const name = new FormData(e.target).get('studentName');
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', activeLockerForAssign.id), { studentName: name });
             setIsAssignModalOpen(false);
             notify(`Assigned to ${name}`);
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center">
              <h2 className="text-3xl font-black mb-8 tracking-tighter">Assign #{activeLockerForAssign?.lockerNumber}</h2>
              <input name="studentName" required autoFocus className="w-full p-5 bg-slate-50 border rounded-2xl text-xl font-black text-center mb-8" placeholder="Student Name" />
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg">Confirm</button>
           </form>
        </div>
      )}

      {isUnusableModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const issue = new FormData(e.target).get('issue');
             await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'maintenance'), {
               lockerId: activeLockerForStatus.id, lockerNumber: activeLockerForStatus.lockerNumber, issue, status: 'pending', createdAt: new Date().toISOString()
             });
             setIsUnusableModalOpen(false);
             notify("Report submitted");
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
              <h2 className="text-3xl font-black mb-4 tracking-tighter text-center text-rose-600">Mark Broken</h2>
              <p className="text-slate-400 text-sm mb-6 text-center font-medium italic">#{activeLockerForStatus?.lockerNumber}</p>
              <textarea name="issue" required placeholder="What is wrong with this locker?" className="w-full p-5 bg-slate-50 border rounded-2xl font-medium min-h-[120px] mb-6 shadow-inner outline-none focus:border-rose-200" />
              <div className="flex gap-3">
                 <button type="button" onClick={() => setIsUnusableModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs">Cancel</button>
                 <button type="submit" className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg">Submit</button>
              </div>
           </form>
        </div>
      )}

      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-[200] font-black text-xs uppercase text-white transition-all animate-bounce ${notification.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}