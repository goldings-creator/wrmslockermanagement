import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
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

const MaintenanceView = ({ logs, onUpdate }) => {
  const pending = logs.filter(l => l.status === 'pending');
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-rose-50 border border-rose-100 p-10 rounded-[2.5rem] text-center">
        <Ban className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-3xl font-black text-rose-900 tracking-tighter">{pending.length} Broken Lockers</h2>
        <p className="text-rose-600 font-medium">Maintenance requests.</p>
      </div>
      <div className="grid gap-4">
        {logs.filter(l => l.status === 'pending').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(log => (
          <div key={log.id} className="bg-white p-6 rounded-[1.5rem] border border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-5">
               <div className="bg-rose-100 w-14 h-14 rounded-2xl flex items-center justify-center text-rose-600 font-black">#{log.lockerNumber}</div>
               <div>
                  <p className="font-black text-slate-900">{log.issue}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase">{new Date(log.createdAt).toLocaleDateString()}</p>
               </div>
            </div>
            <button onClick={() => onUpdate(log.id, { status: 'resolved' })} className="px-6 py-3 rounded-2xl text-xs font-black uppercase bg-emerald-600 text-white">Fixed</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [user, setUser] = useState(null);
  const [lockers, setLockers] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [activeSet, setActiveSet] = useState(4); 
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState('inventory');
  
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isUnusableModalOpen, setIsUnusableModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  
  const [activeLockerForAssign, setActiveLockerForAssign] = useState(null);
  const [activeLockerForStatus, setActiveLockerForStatus] = useState(null);
  const [viewingCombination, setViewingCombination] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    signInAnonymously(auth).catch(err => notify("Login Error: Check Firebase Rules", "error"));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const lockersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lockers');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');

    onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setActiveSet(docSnap.data().activeSet || 4);
    });

    onSnapshot(query(lockersRef), (snapshot) => {
      setLockers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => notify("Database Locked: Update your Security Rules", "error"));

    onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const updateGlobalComboSet = async (newSet) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { activeSet: newSet }, { merge: true });
      notify(`Global Set switched to #${newSet}`);
    } catch (e) { notify("Update failed: Check permissions", "error"); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rows = event.target.result.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
        setTotalToUpload(rows.length);
        let count = 0;
        for (const row of rows) {
          const p = row.split(',').map(s => s?.trim());
          if (p[0]) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'lockers'), {
              lockerNumber: p[0], studentName: p[1] || "", 
              combination1: p[2] || "0-0-0", combination2: p[3] || "0-0-0", 
              combination3: p[4] || "0-0-0", combination4: p[5] || "0-0-0", 
              combination5: p[6] || "0-0-0", location: p[7] || "Hall", 
              lastModified: new Date().toISOString()
            });
            count++;
            setProgress(count);
          }
        }
        notify(`Imported ${count} lockers!`);
        setImportModalOpen(false);
      } catch (err) { notify("Import failed", "error"); }
      setIsUploading(false);
    };
    reader.readAsText(file);
  };

  const filteredLockers = useMemo(() => {
    return lockers
      .filter(l => l.lockerNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || l.studentName?.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.lockerNumber.localeCompare(b.lockerNumber, undefined, {numeric: true}));
  }, [lockers, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-40 p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-xs">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Inventory</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${view === 'maintenance' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Broken</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 items-center mr-4">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-400'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => setImportModalOpen(true)} className="p-2 text-slate-400 border rounded-xl hover:bg-slate-50"><FileUp size={20}/></button>
          <button onClick={() => notify("Adding individual lockers coming soon...")} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <StatCard label="Total" value={lockers.length} color="blue" />
          <StatCard label="Empty" value={lockers.filter(l => !l.studentName).length} color="emerald" />
          <StatCard label="Broken" value={maintenanceLogs.filter(l => l.status === 'pending').length} color="rose" />
          <StatCard label="Active Set" value={`#${activeSet}`} color="blue" />
        </div>

        {view === 'inventory' ? (
          <>
            <div className="relative mb-10">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
              <input type="text" placeholder="Search Number or Student..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm text-lg font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredLockers.map(l => (
                <div key={l.id} className={`bg-white border rounded-[2rem] p-6 group relative shadow-sm transition-all hover:shadow-md ${l.studentName ? 'border-blue-100 bg-blue-50/10' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-2xl font-black font-mono tracking-tighter">#{l.lockerNumber}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><MapPin size={10}/> {l.location || "Hall"}</div>
                    </div>
                    <button onClick={() => { if(window.confirm('Delete?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))}} className="p-2 opacity-0 group-hover:opacity-100 text-red-200 hover:text-red-500 transition-opacity"><Trash2 size={16}/></button>
                  </div>
                  
                  <div className="flex items-center justify-between mb-5">
                    <div className={`truncate font-bold text-sm ${l.studentName ? 'text-slate-900' : 'text-slate-300 italic'}`}>{l.studentName || "Available"}</div>
                    {l.studentName ? 
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id), {studentName: ""})} className="text-slate-200 hover:text-red-500"><UserMinus size={20}/></button> :
                      <button onClick={() => {setActiveLockerForAssign(l); setIsAssignModalOpen(true);}} className="text-emerald-400 hover:text-emerald-600"><UserPlus size={20}/></button>
                    }
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100 shadow-inner">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-lg bg-slate-800 text-[10px] flex items-center justify-center text-white font-black">{activeSet}</div>
                       <div className="font-mono font-black text-sm tracking-[0.25em] text-slate-700">{viewingCombination === l.id ? (l[`combination${activeSet}`] || "0-0-0") : "••-••-••"}</div>
                    </div>
                    <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm">Reveal</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
           <MaintenanceView logs={maintenanceLogs} onUpdate={(id, data) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id), data)} />
        )}
      </main>

      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-center shadow-2xl">
            <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6"><FileUp size={40}/></div>
            <h2 className="text-3xl font-black mb-2 tracking-tighter">Bulk Upload</h2>
            <div className="space-y-4">
              <input type="file" accept=".csv" onChange={handleCSVImport} className="block w-full text-xs text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-slate-100 file:text-slate-600" />
              {isUploading && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={24}/>
                  <div className="text-xs font-black uppercase text-slate-400">Uploading {progress} of {totalToUpload}</div>
                </div>
              )}
            </div>
            <button onClick={() => setImportModalOpen(false)} className="mt-8 text-slate-300 font-black text-xs uppercase">Close</button>
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
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center">
              <h2 className="text-2xl font-black mb-8 tracking-tighter">Assign #{activeLockerForAssign?.lockerNumber}</h2>
              <input name="studentName" required autoFocus className="w-full p-5 bg-slate-50 border rounded-2xl text-xl font-black text-center mb-8" placeholder="Student Name" />
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black">Confirm</button>
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
};

// --- RENDER LOGIC ---
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
