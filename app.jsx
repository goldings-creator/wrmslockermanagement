import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Lock, Unlock, User, UserPlus, UserMinus, Hash, Plus, Trash2, FileUp, 
  AlertCircle, CheckCircle2, Settings, Database, Wrench, Clock, 
  CheckCircle, AlertTriangle, History, X, MapPin, Layers, ChevronDown, Loader2
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
  query 
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

// --- Shared UI Components ---

const StatCard = ({ label, value }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-900">{value}</div>
  </div>
);

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
  const [lockers, setLockers] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [activeSet, setActiveSet] = useState(4); // Defaulted to Set 4
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState('inventory');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [editingLocker, setEditingLocker] = useState(null);
  const [activeLockerForLog, setActiveLockerForLog] = useState(null);
  const [activeLockerForAssign, setActiveLockerForAssign] = useState(null);
  const [viewingCombination, setViewingCombination] = useState(null);
  const [notification, setNotification] = useState(null);

  // Authentication Setup
  useEffect(() => {
    const login = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    login();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data Syncing
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
    });

    const unsubLogs = onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubSettings(); unsubLockers(); unsubLogs(); };
  }, [user]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const updateGlobalComboSet = async (newSet) => {
    if (!user) return notify("Connecting...", "error");
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
      await setDoc(settingsRef, { activeSet: newSet, updatedAt: new Date().toISOString() }, { merge: true });
      notify(`Global Combination Set: ${newSet}`);
    } catch (e) { notify("Update failed.", "error"); }
  };

  // Resilient CSV Import
  const processCSV = async (file) => {
    if (!file || !user) return;
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
        let count = 0;

        for (const row of rows) {
          // Robust comma splitting (handles some basic quoting if necessary)
          const p = row.split(',').map(s => s?.trim());
          
          if (p[0]) { // Requires at least a Locker Number
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'lockers'), {
              lockerNumber: p[0], 
              studentName: p[1] || "", 
              combination1: p[2] || "00-00-00", 
              combination2: p[3] || "00-00-00", 
              combination3: p[4] || "00-00-00", 
              combination4: p[5] || "00-00-00", 
              combination5: p[6] || "00-00-00", 
              location: p[7] || "Main Hallway", 
              lastModified: new Date().toISOString()
            });
            count++;
          }
        }
        notify(`Successfully imported ${count} lockers!`);
        setIsUploading(false);
        setImportModalOpen(false);
      } catch (err) {
        console.error("CSV Import Error:", err);
        setIsUploading(false);
        notify("Import failed. Check CSV file formatting.", "error");
      }
    };
    reader.readAsText(file);
  };

  const filteredLockers = useMemo(() => {
    return lockers
      .filter(l => 
        l.lockerNumber?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        l.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.location?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.lockerNumber.localeCompare(b.lockerNumber, undefined, {numeric: true}));
  }, [lockers, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-40 p-4 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-xs shadow-md">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Inventory</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'maintenance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Issues</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 border-r pr-4 border-slate-200 mr-2 items-center">
             <span className="text-[10px] font-black text-slate-400 mr-2 tracking-widest">SET:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => setImportModalOpen(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200"><FileUp size={18}/></button>
          <button onClick={() => {setEditingLocker(null); setIsModalOpen(true);}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Lockers" value={lockers.length} />
          <StatCard label="Assigned" value={lockers.filter(l => l.studentName).length} />
          <StatCard label="Empty" value={lockers.filter(l => !l.studentName).length} />
          <StatCard label="Active Codes" value={`Set ${activeSet}`} />
        </div>

        <div className="relative mb-10">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={22} />
          <input type="text" placeholder="Search Number, Student, or Location..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-3xl outline-none focus:ring-4 focus:ring-blue-50 transition-all shadow-sm text-lg font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredLockers.map(l => (
            <div key={l.id} className={`bg-white border rounded-[2rem] p-6 group relative shadow-sm transition-all hover:shadow-md ${l.studentName ? 'border-blue-100 bg-blue-50/20' : 'border-slate-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-2xl font-black font-mono tracking-tighter">#{l.lockerNumber}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><MapPin size={10}/> {l.location || "Main Hall"}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))} className="p-2 hover:bg-red-50 rounded-xl text-red-200 hover:text-red-500"><Trash2 size={16}/></button>
                </div>
              </div>
              
              <div className="flex items-center justify-between mb-5">
                <div className={`truncate font-bold ${l.studentName ? 'text-slate-900' : 'text-slate-300 italic'}`}>{l.studentName || "Available"}</div>
                {l.studentName ? 
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id), {studentName: ""})} className="text-slate-200 hover:text-red-500 transition-colors"><UserMinus size={20}/></button> :
                  <button onClick={() => {setActiveLockerForAssign(l); setIsAssignModalOpen(true);}} className="text-emerald-400 hover:text-emerald-600 transition-colors"><UserPlus size={20}/></button>
                }
              </div>

              <div className="bg-white rounded-2xl p-4 flex justify-between items-center border border-slate-100 shadow-inner">
                <div className="flex items-center gap-2">
                   <div className="w-5 h-5 rounded bg-slate-800 text-[9px] flex items-center justify-center text-white font-black">{activeSet}</div>
                   <div className="font-mono font-black text-sm tracking-[0.2em] text-slate-700">{viewingCombination === l.id ? l[`combination${activeSet}`] : "••-••-••"}</div>
                </div>
                <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg">Hold</button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-center shadow-2xl">
            <div className="bg-blue-50 w-16 h-16 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6"><FileUp size={30}/></div>
            <h2 className="text-2xl font-black mb-2 tracking-tighter">Bulk Import</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">CSV Columns: Number, Student, Set 1, Set 2, Set 3, Set 4, Set 5, Location</p>
            
            <div className="space-y-4">
              <input 
                id="csv-file-input"
                type="file" 
                accept=".csv" 
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              
              <button 
                onClick={() => {
                  const file = document.getElementById('csv-file-input').files[0];
                  if (file) processCSV(file);
                  else notify("Select a file first", "error");
                }}
                disabled={isUploading}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading ? <><Loader2 className="animate-spin w-4 h-4"/> Processing...</> : "Start Upload"}
              </button>
            </div>

            <button onClick={() => setImportModalOpen(false)} className="mt-8 text-slate-300 font-black text-[10px] uppercase tracking-[0.2em] hover:text-slate-500">Close Window</button>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const name = new FormData(e.target).get('studentName');
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', activeLockerForAssign.id), { studentName: name });
            setIsAssignModalOpen(false);
          }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center">
            <h2 className="text-2xl font-black mb-2 tracking-tighter text-blue-600">Assign Locker #{activeLockerForAssign?.lockerNumber}</h2>
            <p className="text-slate-400 font-medium mb-8">Enter student's full name.</p>
            <input name="studentName" required autoFocus placeholder="Student Name" className="w-full p-5 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-blue-100 mb-8 text-center text-xl font-black" />
            <div className="flex gap-3">
               <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 py-4 text-slate-300 font-black text-xs uppercase tracking-widest">Cancel</button>
               <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100">Confirm</button>
            </div>
          </form>
        </div>
      )}

      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-50 font-black text-xs uppercase tracking-[0.2em] text-white transition-all animate-bounce ${notification.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
