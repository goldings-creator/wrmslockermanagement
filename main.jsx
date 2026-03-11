import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Lock, Unlock, User, UserPlus, UserMinus, Hash, Plus, Trash2, FileUp, 
  AlertCircle, CheckCircle2, Settings, Database, Wrench, Clock, 
  CheckCircle, AlertTriangle, History, X, MapPin, Layers, ChevronDown, Loader2, Ban,
  GraduationCap, School, Printer, Contact, IdCard, Upload
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

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const appId = 'wrms-locker-system';

const LOCATIONS = ["All Locations", "2nd Floor", "Lower Level", "Main Hall", "Science Wing"];

// --- UI Components ---

const StatCard = ({ label, value, color }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden transition-all hover:shadow-md print:hidden">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
    <div className={`absolute bottom-0 left-0 w-full h-1 ${color === 'blue' ? 'bg-blue-500' : color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
  </div>
);

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [lockers, setLockers] = useState([]);
  const [students, setStudents] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);
  const [activeSet, setActiveSet] = useState(4); 
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [view, setView] = useState('inventory');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState('lockers'); 
  const [isUnusableModalOpen, setIsUnusableModalOpen] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalToUpload, setTotalToUpload] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  
  const [activeLockerForAssign, setActiveLockerForAssign] = useState(null);
  const [activeLockerForStatus, setActiveLockerForStatus] = useState(null);
  const [viewingCombination, setViewingCombination] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error", err);
      } finally {
        setIsAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const lockersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lockers');
    const studentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setActiveSet(docSnap.data().activeSet || 4);
    });

    const unsubLockers = onSnapshot(query(lockersRef), (snapshot) => {
      setLockers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => notify("Database Connection Issue", "error"));

    const unsubStudents = onSnapshot(query(studentsRef), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubLogs = onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubSettings();
      unsubLockers();
      unsubStudents();
      unsubLogs();
    };
  }, [user]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const updateGlobalComboSet = async (newSet) => {
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
      await setDoc(settingsRef, { activeSet: newSet }, { merge: true });
      notify(`Global Set switched to #${newSet}`);
    } catch (e) { notify("Update failed: Check permissions", "error"); }
  };

  const startCSVImport = async () => {
    if (!selectedFile || !user) return;
    setIsUploading(true);
    setProgress(0);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
        setTotalToUpload(rows.length);
        let count = 0;
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', importType);
        
        for (const row of rows) {
          const p = row.split(',').map(s => s?.trim());
          if (p[0]) {
            if (importType === 'lockers') {
              await addDoc(colRef, {
                lockerNumber: p[0], studentName: p[1] || "", 
                combination1: p[2] || "0-0-0", combination2: p[3] || "0-0-0", 
                combination3: p[4] || "0-0-0", combination4: p[5] || "0-0-0", 
                combination5: p[6] || "0-0-0", location: p[7] || "Main Hall", 
                lastModified: new Date().toISOString()
              });
            } else {
              await addDoc(colRef, {
                name: p[0], grade: p[1] || "N/A", homeroom: p[2] || "N/A", studentId: p[3] || "N/A",
                lastModified: new Date().toISOString()
              });
            }
            count++;
            setProgress(count);
          }
        }
        notify(`Imported ${count} items!`);
        setImportModalOpen(false);
        setSelectedFile(null);
      } catch (err) { notify("Import failed", "error"); }
      setIsUploading(false);
    };
    reader.readAsText(selectedFile);
  };

  const currentStudentDetails = useMemo(() => students.find(s => s.id === selectedStudentId), [students, selectedStudentId]);

  const filteredLockers = useMemo(() => {
    return lockers
      .filter(l => {
        const matchesSearch = (l.lockerNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (l.studentName || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLocation = locationFilter === "All Locations" || l.location === locationFilter;
        return matchesSearch && matchesLocation;
      })
      .sort((a, b) => (a.lockerNumber || "").localeCompare(b.lockerNumber || "", undefined, {numeric: true}));
  }, [lockers, searchTerm, locationFilter]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase">WRMS</h1>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 animate-pulse">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 print:bg-white print:pb-0">
      
      {/* Hidden layout for Print Reports */}
      <div className="hidden print:block p-10">
        <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Locker Report</h1>
        <p className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-10 border-b-4 border-slate-900 pb-4">
          Location: {locationFilter} • Combo Set: #{activeSet} • {new Date().toLocaleDateString()}
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-left">
              <th className="p-4 text-[10px] font-black uppercase">Locker #</th>
              <th className="p-4 text-[10px] font-black uppercase">Student</th>
              <th className="p-4 text-[10px] font-black uppercase">Wing</th>
              <th className="p-4 text-[10px] font-black uppercase text-blue-600">Active Code</th>
            </tr>
          </thead>
          <tbody>
            {filteredLockers.map(l => (
              <tr key={l.id} className="border-b border-slate-200">
                <td className="p-4 font-mono font-black text-xl">#{l.lockerNumber}</td>
                <td className="p-4 font-bold">{l.studentName || "UNASSIGNED"}</td>
                <td className="p-4 text-xs font-black uppercase text-slate-400">{l.location}</td>
                <td className="p-4 font-mono font-black text-blue-600">{l[`combination${activeSet}`] || "0-0-0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <header className="bg-white border-b sticky top-0 z-40 p-4 flex justify-between items-center shadow-sm print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-xs shadow-md">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Inventory</button>
            <button onClick={() => setView('students')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'students' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Students</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${view === 'maintenance' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Broken</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 items-center mr-4 border-r pr-4 border-slate-200">
            <span className="text-[10px] font-black text-slate-400 mr-2 tracking-widest uppercase text-[9px]">Set:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-200 text-slate-400'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => { setImportType('lockers'); setImportModalOpen(true); }} className="p-2 text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm" title="Import Data"><FileUp size={20}/></button>
          <button onClick={() => window.print()} className="p-2 text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm" title="Print Report"><Printer size={20}/></button>
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100 active:scale-95 transition-transform hover:bg-blue-700">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 print:hidden">
        {view === 'inventory' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <StatCard label="Total Lockers" value={lockers.length} color="blue" />
              <StatCard label="Empty" value={lockers.filter(l => !l.studentName).length} color="emerald" />
              <StatCard label="Broken" value={maintenanceLogs.filter(l => l.status === 'pending').length} color="rose" />
              <StatCard label="Active Set" value={`#${activeSet}`} color="blue" />
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-10">
              <div className="relative flex-grow">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input type="text" placeholder="Search Locker or Student..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm text-lg font-medium focus:ring-4 focus:ring-blue-50 transition-all placeholder:text-slate-300" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative min-w-[220px]">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full pl-11 pr-10 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm appearance-none font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors">
                  {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredLockers.map(l => (
                <div key={l.id} className={`bg-white border rounded-[2rem] p-6 group relative shadow-sm transition-all hover:shadow-md ${l.studentName ? 'border-blue-100 bg-blue-50/10' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-2xl font-black font-mono tracking-tighter">#{l.lockerNumber}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mt-1 tracking-widest"><MapPin size={10}/> {l.location || "Hall"}</div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => { setActiveLockerForStatus(l); setIsUnusableModalOpen(true); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors" title="Mark Broken"><Ban size={16}/></button>
                       <button onClick={() => { if(window.confirm('Delete locker?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))}} className="p-2 text-slate-200 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16}/></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`truncate font-bold text-sm ${l.studentName ? 'text-slate-900' : 'text-slate-300 italic'}`}>{l.studentName || "Available"}</div>
                    {l.studentName ? 
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id), {studentName: ""})} className="text-slate-200 hover:text-red-500 transition-colors"><UserMinus size={20}/></button> :
                      <button onClick={() => {setActiveLockerForAssign(l); setIsAssignModalOpen(true);}} className="text-emerald-400 hover:text-emerald-600 transition-colors"><UserPlus size={20}/></button>
                    }
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100 shadow-inner">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-lg bg-slate-800 text-[10px] flex items-center justify-center text-white font-black">{activeSet}</div>
                       <div className="font-mono font-black text-sm tracking-[0.25em] text-slate-700">{viewingCombination === l.id ? (l[`combination${activeSet}`] || "0-0-0") : "••-••-••"}</div>
                    </div>
                    <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform border border-slate-200/50">Reveal</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {view === 'students' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] p-12 shadow-xl border border-slate-200 mb-8 text-center relative overflow-hidden">
              <h2 className="text-4xl font-black mb-1 tracking-tighter text-slate-800">Student Directory</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-12">Search student info or upload a new school list</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="relative">
                  <User className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                  <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="w-full pl-16 pr-10 py-6 bg-slate-50 border border-slate-200 rounded-[1.5rem] outline-none shadow-inner appearance-none font-black text-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <option value="">Select a student...</option>
                    {[...students].sort((a,b) => (a.name || "").localeCompare(b.name || "")).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
                </div>
                
                <button 
                  onClick={() => { setImportType('students'); setImportModalOpen(true); }}
                  className="bg-blue-600 text-white rounded-[1.5rem] flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 py-6 border-b-4 border-blue-800"
                >
                  <Upload size={18} /> Upload Student CSV
                </button>
              </div>

              {currentStudentDetails ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in zoom-in duration-200 text-left">
                  <div className="bg-blue-50/50 p-8 rounded-[2rem] border border-blue-100 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2 block">Grade Level</span>
                    <p className="text-3xl font-black text-blue-900">{currentStudentDetails.grade || "N/A"}</p>
                  </div>
                  <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 block">Homeroom</span>
                    <p className="text-3xl font-black text-emerald-900">{currentStudentDetails.homeroom || "N/A"}</p>
                  </div>
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Student ID</span>
                    <p className="text-3xl font-black text-slate-600">{currentStudentDetails.studentId || "N/A"}</p>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center border-4 border-dashed border-slate-50 rounded-[3rem] bg-slate-50/30">
                   <IdCard className="mx-auto text-slate-200 mb-4" size={80} />
                   <p className="text-slate-300 font-bold uppercase text-[11px] tracking-[0.3em]">Student details will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'maintenance' && (
          <div className="grid gap-4 animate-in fade-in duration-300">
             {maintenanceLogs.filter(l => l.status === 'pending').map(log => (
               <div key={log.id} className="bg-white p-8 rounded-[2rem] border border-slate-200 flex justify-between items-center shadow-sm">
                  <div>
                    <h3 className="font-black text-xl text-slate-900 tracking-tighter uppercase text-rose-600">Locker #{log.lockerNumber}</h3>
                    <p className="text-slate-500 font-bold text-lg">"{log.issue}"</p>
                  </div>
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', log.id), { status: 'resolved' })} className="bg-emerald-600 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 transition-all active:scale-95">Mark Fixed</button>
               </div>
             ))}
             {maintenanceLogs.filter(l => l.status === 'pending').length === 0 && <div className="p-20 text-center text-slate-300 italic font-black uppercase tracking-tighter text-2xl opacity-50 flex flex-col items-center gap-4">
                <CheckCircle size={64} className="text-emerald-200" />
                No Active Maintenance Issues
             </div>}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white p-12 rounded-[3rem] w-full max-w-md text-center shadow-2xl border border-slate-100">
            <div className="bg-blue-50 w-24 h-24 rounded-[2rem] flex items-center justify-center text-blue-600 mx-auto mb-8 shadow-inner"><Upload size={48}/></div>
            <h2 className="text-4xl font-black mb-2 tracking-tighter text-slate-800">CSV Importer</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10">Select data type and pick file</p>
            
            <div className="space-y-8">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl shadow-inner border border-slate-200/50">
                 <button onClick={() => setImportType('lockers')} className={`flex-1 py-3 text-[11px] font-black uppercase rounded-xl transition-all ${importType === 'lockers' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Locker Data</button>
                 <button onClick={() => setImportType('students')} className={`flex-1 py-3 text-[11px] font-black uppercase rounded-xl transition-all ${importType === 'students' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Student List</button>
              </div>
              
              <div className="border-4 border-dashed border-slate-200 rounded-[2rem] p-12 bg-slate-50/50 relative hover:border-blue-300 transition-colors">
                <input type="file" accept=".csv" onChange={(e) => setSelectedFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                {selectedFile ? (
                  <div className="text-emerald-600 font-black text-sm uppercase tracking-widest">
                    <CheckCircle className="mx-auto mb-2" size={32} /> {selectedFile.name}
                  </div>
                ) : (
                  <div className="text-slate-300 font-black text-xs uppercase tracking-widest">Click to pick file</div>
                )}
              </div>

              {selectedFile && (
                <button 
                  onClick={startCSVImport}
                  disabled={isUploading}
                  className="w-full bg-blue-600 text-white rounded-2xl py-6 font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="animate-spin" size={18}/> : <Upload size={18}/>}
                  {isUploading ? `Processing ${progress} / ${totalToUpload}` : "Finalize Upload"}
                </button>
              )}
            </div>
            
            <button onClick={() => { setImportModalOpen(false); setSelectedFile(null); }} className="mt-10 text-slate-300 font-black text-xs uppercase tracking-[0.3em] hover:text-slate-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Manual Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in duration-200">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            const data = {
              lockerNumber: f.get('lockerNumber'), studentName: f.get('studentName') || "", location: f.get('location') || "Main Hall",
              combination1: f.get('combination1') || "0-0-0", combination2: f.get('combination2') || "0-0-0", 
              combination3: f.get('combination3') || "0-0-0", combination4: f.get('combination4') || "0-0-0", 
              combination5: f.get('combination5') || "0-0-0", lastModified: new Date().toISOString()
            };
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'lockers'), data);
            setIsModalOpen(false);
            notify("Locker created");
          }} className="bg-white p-12 rounded-[3rem] w-full max-w-xl shadow-2xl border border-slate-100">
             <h2 className="text-4xl font-black mb-10 tracking-tighter text-slate-800 text-left uppercase">New Locker</h2>
             <div className="grid grid-cols-2 gap-8 mb-8 text-left">
                <div>
                   <label className="block text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Locker #</label>
                   <input name="lockerNumber" required className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-2xl outline-none focus:border-blue-300 shadow-inner" placeholder="101" />
                </div>
                <div>
                   <label className="block text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Location</label>
                   <select name="location" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 appearance-none outline-none focus:border-blue-300 shadow-inner">
                    {LOCATIONS.filter(l => l !== "All Locations").map(loc => <option key={loc} value={loc}>{loc}</option>)}
                   </select>
                </div>
             </div>
             <label className="block text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest text-left">Combination Codes (Sets 1-5)</label>
             <div className="grid grid-cols-5 gap-3 mb-10">
                {[1,2,3,4,5].map(n => (
                  <div key={n} className="text-center">
                    <div className="text-[8px] font-black text-slate-300 mb-1">SET {n}</div>
                    <input name={`combination${n}`} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-mono text-[10px] text-center font-bold outline-none focus:border-blue-200 shadow-sm" placeholder="0-0-0" />
                  </div>
                ))}
             </div>
             <div className="flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-600 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase shadow-xl hover:bg-blue-700 active:scale-95 transition-all">Create Record</button>
             </div>
          </form>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const name = new FormData(e.target).get('studentName');
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', activeLockerForAssign.id), { studentName: name });
             setIsAssignModalOpen(false);
             notify(`Assigned to ${name}`);
           }} className="bg-white p-12 rounded-[3rem] w-full max-w-md shadow-2xl text-center animate-in zoom-in duration-200 border border-slate-100">
              <h2 className="text-3xl font-black mb-8 tracking-tighter text-slate-800 uppercase text-center">Assign #{activeLockerForAssign?.lockerNumber}</h2>
              <input name="studentName" required autoFocus className="w-full p-6 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-center mb-10 outline-none focus:border-blue-300 shadow-inner placeholder:text-slate-200" placeholder="Full Name" />
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 py-5 text-slate-300 font-black text-xs uppercase tracking-widest">Cancel</button>
                <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700">Confirm</button>
              </div>
           </form>
        </div>
      )}

      {isUnusableModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const issue = new FormData(e.target).get('issue');
             await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'maintenance'), {
               lockerId: activeLockerForStatus.id, lockerNumber: activeLockerForStatus.lockerNumber, issue, status: 'pending', createdAt: new Date().toISOString()
             });
             setIsUnusableModalOpen(false);
             notify("Report submitted");
           }} className="bg-white p-12 rounded-[3rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-200 border border-slate-100 text-center">
              <h2 className="text-3xl font-black mb-4 tracking-tighter text-rose-600 uppercase">Mark Broken</h2>
              <p className="text-slate-400 text-sm mb-8 font-medium italic uppercase tracking-widest">Locker #{activeLockerForStatus?.lockerNumber}</p>
              <textarea name="issue" required placeholder="What is wrong with this locker?" className="w-full p-6 bg-slate-50 border border-slate-200 rounded-2xl font-medium min-h-[150px] mb-10 shadow-inner outline-none focus:border-rose-200 transition-all" />
              <div className="flex gap-4">
                 <button type="button" onClick={() => setIsUnusableModalOpen(false)} className="flex-1 py-5 text-slate-400 font-black uppercase text-xs">Cancel</button>
                 <button type="submit" className="flex-1 py-5 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95">Submit</button>
              </div>
           </form>
        </div>
      )}

      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-10 py-5 rounded-[1.5rem] shadow-2xl z-[200] font-black text-xs uppercase tracking-[0.3em] text-white transition-all animate-bounce ${notification.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
