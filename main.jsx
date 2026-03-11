import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Lock, Unlock, User, UserPlus, UserMinus, Hash, Plus, Trash2, FileUp, 
  AlertCircle, CheckCircle2, Settings, Database, Wrench, Clock, 
  CheckCircle, AlertTriangle, History, X, MapPin, Layers, ChevronDown, Loader2, Ban,
  GraduationCap, IdCard, School
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

const LOCATIONS = ["All Locations", "2nd Floor", "Lower Level", "Main Hall", "Science Wing"];

// --- UI Components ---

const StatCard = ({ label, value, color }) => (
  <div className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden transition-all hover:shadow-md`}>
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-900">{value}</div>
    <div className={`absolute bottom-0 left-0 w-full h-1 ${color === 'blue' ? 'bg-blue-500' : color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
  </div>
);

// --- Sub-View: Maintenance List ---
const MaintenanceView = ({ logs, onUpdate }) => {
  const pending = logs.filter(l => l.status === 'pending');
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-rose-50 border border-rose-100 p-10 rounded-[2.5rem] text-center">
        <Ban className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-3xl font-black text-rose-900 tracking-tighter">{pending.length} Broken Lockers</h2>
        <p className="text-rose-600 font-medium">Locker maintenance and repair requests.</p>
      </div>
      <div className="grid gap-4">
        {pending.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(log => (
          <div key={log.id} className="bg-white p-6 rounded-[1.5rem] border border-slate-200 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-5">
               <div className="bg-rose-100 w-14 h-14 rounded-2xl flex items-center justify-center text-rose-600 font-black text-xl">#{log.lockerNumber}</div>
               <div>
                  <p className="font-black text-slate-900 text-lg">{log.issue}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Reported: {new Date(log.createdAt).toLocaleDateString()}</p>
               </div>
            </div>
            <button onClick={() => onUpdate(log.id, { status: 'resolved' })} className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white shadow-lg hover:bg-emerald-700">
              Mark Fixed
            </button>
          </div>
        ))}
        {pending.length === 0 && (
          <div className="p-20 text-center text-slate-300 font-bold italic">No active maintenance issues.</div>
        )}
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState(null);
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
  
  const [activeLockerForAssign, setActiveLockerForAssign] = useState(null);
  const [activeLockerForStatus, setActiveLockerForStatus] = useState(null);
  const [viewingCombination, setViewingCombination] = useState(null);
  const [notification, setNotification] = useState(null);

  // Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data Listeners (Rule 1 & 3)
  useEffect(() => {
    if (!user) return;
    
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const lockersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lockers');
    const studentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setActiveSet(docSnap.data().activeSet || 4);
    }, (err) => console.error(err));

    const unsubLockers = onSnapshot(query(lockersRef), (snapshot) => {
      setLockers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => notify("Database Error", "error"));

    const unsubStudents = onSnapshot(query(studentsRef), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    const unsubLogs = onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error(err));

    return () => { unsubSettings(); unsubLockers(); unsubStudents(); unsubLogs(); };
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

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
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
              // Student format: Name, Grade, Homeroom, ID
              await addDoc(colRef, {
                name: p[0], grade: p[1] || "", homeroom: p[2] || "", studentId: p[3] || "",
                lastModified: new Date().toISOString()
              });
            }
            count++;
            setProgress(count);
          }
        }
        notify(`Imported ${count} ${importType}!`);
        setImportModalOpen(false);
      } catch (err) { notify("Import failed", "error"); }
      setIsUploading(false);
    };
    reader.readAsText(file);
  };

  const currentStudentDetails = useMemo(() => {
    return students.find(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b sticky top-0 z-40 p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-xs shadow-md">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Inventory</button>
            <button onClick={() => setView('students')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'students' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Students</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${view === 'maintenance' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Broken</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 items-center mr-4">
            <span className="text-[10px] font-black text-slate-400 mr-2 tracking-widest uppercase">Combo Set:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => setImportModalOpen(true)} className="p-2 text-slate-400 border rounded-xl hover:bg-slate-50 transition-colors shadow-sm"><FileUp size={20}/></button>
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100 transition-all hover:bg-blue-700 active:scale-95">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {view === 'inventory' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <StatCard label="Total Lockers" value={lockers.length} color="blue" />
              <StatCard label="Available" value={lockers.filter(l => !l.studentName).length} color="emerald" />
              <StatCard label="Broken" value={maintenanceLogs.filter(l => l.status === 'pending').length} color="rose" />
              <StatCard label="Active Set" value={`#${activeSet}`} color="blue" />
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-10">
              <div className="relative flex-grow">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input type="text" placeholder="Search Number or Student..." className="w-full pl-14 pr-6 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm text-lg font-medium focus:ring-4 focus:ring-blue-50 transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative min-w-[220px]">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select 
                  value={locationFilter} 
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-5 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm appearance-none font-bold text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
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
                        <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mt-1 tracking-widest"><MapPin size={10}/> {l.location || "Hall"}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => { setActiveLockerForStatus(l); setIsUnusableModalOpen(true); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Ban size={16}/></button>
                         <button onClick={() => { if(window.confirm('Delete locker?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))}} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mb-5">
                      <div className={`truncate font-bold text-sm ${l.studentName ? 'text-slate-900' : 'text-slate-300 italic'}`}>{l.studentName || "Available"}</div>
                      {!isUnusable && (
                        l.studentName ? 
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id), {studentName: ""})} className="text-slate-200 hover:text-red-500 transition-colors"><UserMinus size={20}/></button> :
                        <button onClick={() => {setActiveLockerForAssign(l); setIsAssignModalOpen(true);}} className="text-emerald-400 hover:text-emerald-600 transition-colors"><UserPlus size={20}/></button>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100 shadow-inner">
                      <div className="flex items-center gap-2">
                         <div className="w-6 h-6 rounded-lg bg-slate-800 text-[10px] flex items-center justify-center text-white font-black">{activeSet}</div>
                         <div className="font-mono font-black text-sm tracking-[0.25em] text-slate-700">{viewingCombination === l.id ? (l[`combination${activeSet}`] || "0-0-0") : "••-••-••"}</div>
                      </div>
                      <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform">Reveal</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'students' && (
          <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-200 mb-8">
              <h2 className="text-3xl font-black mb-6 tracking-tighter flex items-center gap-3 text-slate-800">
                <GraduationCap className="text-blue-600" size={32} />
                Student Lookup
              </h2>
              
              <div className="relative mb-10">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <select 
                  value={selectedStudentId} 
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full pl-14 pr-10 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none shadow-inner appearance-none font-black text-xl cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <option value="">Choose a student...</option>
                  {[...students].sort((a,b) => (a.name || "").localeCompare(b.name || "")).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
              </div>

              {currentStudentDetails ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in zoom-in duration-200">
                  <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <GraduationCap size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Grade</span>
                    </div>
                    <p className="text-2xl font-black text-blue-900">{currentStudentDetails.grade || "N/A"}</p>
                  </div>
                  <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100">
                    <div className="flex items-center gap-2 text-emerald-400 mb-2">
                      <School size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Homeroom</span>
                    </div>
                    <p className="text-2xl font-black text-emerald-900">{currentStudentDetails.homeroom || "N/A"}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <IdCard size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Student ID</span>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{currentStudentDetails.studentId || "N/A"}</p>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-slate-300 font-bold italic border-2 border-dashed border-slate-100 rounded-3xl">
                  Select a student above to view their school details.
                </div>
              )}
            </div>
            
            <div className="text-center">
              <button 
                onClick={() => { setImportType('students'); setImportModalOpen(true); }}
                className="text-blue-600 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 mx-auto hover:underline"
              >
                <FileUp size={16} /> Upload Student CSV
              </button>
            </div>
          </div>
        )}

        {view === 'maintenance' && (
          <MaintenanceView 
            logs={maintenanceLogs} 
            onUpdate={(id, data) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id), data)} 
          />
        )}
      </main>

      {/* Modals */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-center shadow-2xl">
            <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6"><FileUp size={40}/></div>
            <h2 className="text-3xl font-black mb-2 tracking-tighter">Bulk Upload {importType === 'lockers' ? 'Lockers' : 'Students'}</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium italic">
              {importType === 'lockers' 
                ? 'Columns: Number, Student, Sets 1-5, Location' 
                : 'Columns: Name, Grade, Homeroom, ID'}
            </p>
            
            <div className="space-y-4">
              <div className="flex gap-2 mb-4 justify-center bg-slate-100 p-1 rounded-xl">
                 <button onClick={() => setImportType('lockers')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${importType === 'lockers' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Lockers</button>
                 <button onClick={() => setImportType('students')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${importType === 'students' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400'}`}>Students</button>
              </div>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="block w-full text-xs text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-600 file:text-white cursor-pointer" />
              {isUploading && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={24}/>
                  <div className="text-xs font-black uppercase text-slate-400 text-center tracking-widest">Processing {progress} of {totalToUpload}</div>
                  <div className="w-full h-2 bg-slate-200 rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{width: `${(progress/totalToUpload)*100}%`}}></div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setImportModalOpen(false)} className="mt-8 text-slate-300 font-black text-xs uppercase tracking-[0.2em] hover:text-slate-500">Close</button>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const name = new FormData(e.target).get('studentName');
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', activeLockerForAssign.id), { studentName: name });
             setIsAssignModalOpen(false);
             notify(`Assigned to ${name}`);
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center animate-in zoom-in duration-200">
              <h2 className="text-3xl font-black mb-8 tracking-tighter">Assign #{activeLockerForAssign?.lockerNumber}</h2>
              <input name="studentName" required autoFocus className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-center mb-8 outline-none focus:border-blue-300 transition-all shadow-inner" placeholder="Enter Full Name" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 py-4 text-slate-300 font-black text-xs uppercase tracking-widest transition-colors hover:text-slate-500">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-700">Confirm</button>
              </div>
           </form>
        </div>
      )}

      {isUnusableModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const issue = new FormData(e.target).get('issue');
             await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'maintenance'), {
               lockerId: activeLockerForStatus.id, lockerNumber: activeLockerForStatus.lockerNumber, issue, status: 'pending', createdAt: new Date().toISOString()
             });
             setIsUnusableModalOpen(false);
             notify("Report submitted");
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
              <h2 className="text-3xl font-black mb-4 tracking-tighter text-center text-rose-600">Mark Broken</h2>
              <p className="text-slate-400 text-sm mb-6 text-center font-medium italic">Locker #{activeLockerForStatus?.lockerNumber}</p>
              <textarea name="issue" required placeholder="What is wrong with this locker?" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-medium min-h-[120px] mb-6 shadow-inner outline-none focus:border-rose-200 transition-all" />
              <div className="flex gap-3">
                 <button type="button" onClick={() => setIsUnusableModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs hover:text-slate-500 transition-colors">Cancel</button>
                 <button type="submit" className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all active:scale-95">Submit</button>
              </div>
           </form>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in duration-200">
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
            notify("Locker added");
          }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-xl shadow-2xl">
             <h2 className="text-3xl font-black mb-8 tracking-tighter text-slate-800">Add New Locker</h2>
             <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Locker #</label>
                  <input name="lockerNumber" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-300 transition-all" placeholder="101" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Location</label>
                  <select name="location" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 appearance-none outline-none focus:border-blue-300 transition-all">
                    {LOCATIONS.filter(l => l !== "All Locations").map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>
             </div>
             <label className="block text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Combinations (Sets 1-5)</label>
             <div className="grid grid-cols-5 gap-2 mb-8">
                {[1,2,3,4,5].map(n => (
                  <div key={n}>
                    <div className="text-[8px] font-black text-slate-300 text-center mb-1 uppercase tracking-widest">Set {n}</div>
                    <input name={`combination${n}`} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-xl font-mono text-[10px] text-center font-bold outline-none focus:border-blue-200" placeholder="0-0-0" />
                  </div>
                ))}
             </div>
             <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-500 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase shadow-lg active:scale-95 transition-transform hover:bg-blue-700">Create Locker</button>
             </div>
          </form>
        </div>
      )}

      {notification && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-[200] font-black text-xs uppercase tracking-[0.2em] text-white transition-all animate-bounce ${notification.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}
