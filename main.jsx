import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, User, UserPlus, UserMinus, Trash2, FileUp, 
  CheckCircle, MapPin, ChevronDown, Loader2, Ban,
  Printer, BookOpen, Upload
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, addDoc, updateDoc, setDoc, deleteDoc, query } from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBX37YTsUcqLPsgT-6nT1Lt7myTerDJUcc",
  authDomain: "wrms-lockers.firebaseapp.com",
  projectId: "wrms-lockers",
  storageBucket: "wrms-lockers.firebasestorage.app",
  messagingSenderId: "870499565234",
  appId: "1:870499565234:web:31b19a27693bfd6c1313ab"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'wrms-locker-system';
const LOCATIONS = ["All Locations", "2nd Floor", "Lower Level", "Main Hall", "Science Wing"];

// --- UI Components ---
const StatCard = ({ label, value, color }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md print:hidden relative overflow-hidden">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
    {color && <div className={`absolute bottom-0 left-0 w-full h-1 ${color === 'blue' ? 'bg-blue-500' : color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>}
  </div>
);

// --- Main App Component ---
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

  // THE FAILSAFE: Drops the loading screen after 1.5 seconds NO MATTER WHAT.
  useEffect(() => {
    let isMounted = true;
    
    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsAuthLoading(false);
    }, 1500);

    signInAnonymously(auth)
      .catch((err) => console.warn("Firebase Auth blocked:", err))
      .finally(() => {
         if (isMounted) setIsAuthLoading(false);
         clearTimeout(safetyTimer);
      });

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  // Data Syncing
  useEffect(() => {
    if (!user) return;
    
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const lockersRef = collection(db, 'artifacts', appId, 'public', 'data', 'lockers');
    const studentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'students');
    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setActiveSet(docSnap.data().activeSet || 4);
    }, () => {});

    const unsubLockers = onSnapshot(query(lockersRef), (snapshot) => {
      setLockers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubStudents = onSnapshot(query(studentsRef), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubLogs = onSnapshot(query(logsRef), (snapshot) => {
      setMaintenanceLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    return () => { unsubSettings(); unsubLockers(); unsubStudents(); unsubLogs(); };
  }, [user]);

  const notify = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const updateGlobalComboSet = async (newSet) => {
    if (!user) return notify("Connecting...", "error");
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
      await setDoc(settingsRef, { activeSet: newSet, updatedAt: new Date().toISOString() }, { merge: true });
      notify(`Global Set switched to #${newSet}`);
    } catch (e) { notify("Update failed. Check database permissions.", "error"); }
  };

  // CSV Import Logic
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
                lockerNumber: String(p[0]), 
                studentName: p[1] || "", 
                combination1: p[2] || "00-00-00", 
                combination2: p[3] || "00-00-00", 
                combination3: p[4] || "00-00-00", 
                combination4: p[5] || "00-00-00", 
                combination5: p[6] || "00-00-00", 
                location: p[7] || "Main Hall", 
                lastModified: new Date().toISOString()
              });
            } else {
              await addDoc(colRef, {
                name: String(p[0]), 
                grade: p[1] || "N/A", 
                homeroom: p[2] || "N/A", 
                studentId: p[3] || "N/A",
                lastModified: new Date().toISOString()
              });
            }
            count++;
            setProgress(count);
          }
        }
        notify(`Successfully imported ${count} items!`);
        setIsUploading(false);
        setImportModalOpen(false);
        setSelectedFile(null);
      } catch (err) {
        console.error("CSV Import Error:", err);
        setIsUploading(false);
        notify("Import failed. Check CSV file formatting.", "error");
      }
    };
    reader.readAsText(selectedFile);
  };

  const currentStudentDetails = useMemo(() => students.find(s => s.id === selectedStudentId), [students, selectedStudentId]);

  const filteredLockers = useMemo(() => {
    return lockers
      .filter(l => {
        const matchesSearch = String(l.lockerNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                              String(l.studentName || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesLocation = locationFilter === "All Locations" || l.location === locationFilter;
        return matchesSearch && matchesLocation;
      })
      .sort((a, b) => String(a.lockerNumber || "").localeCompare(String(b.lockerNumber || ""), undefined, {numeric: true}));
  }, [lockers, searchTerm, locationFilter]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 text-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase">WRMS</h1>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 animate-pulse">Connecting to database...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 print:bg-white print:pb-0">
      
      {/* Print View */}
      <div className="hidden print:block p-10">
        <div className="flex justify-between items-end border-b-4 border-slate-900 pb-6 mb-10 text-left">
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase text-slate-900">Assignment Report</h1>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest mt-2">WRMS Middle School • Printed: {new Date().toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Wing: {locationFilter}</p>
            <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Set: #{activeSet}</p>
          </div>
        </div>
        
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-left text-slate-600">
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Locker #</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Student Name</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest">Wing / Location</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-blue-600">Active Code</th>
            </tr>
          </thead>
          <tbody>
            {filteredLockers.map(l => (
              <tr key={l.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-4 font-mono font-black text-xl text-slate-900">#{l.lockerNumber}</td>
                <td className={`p-4 font-bold text-lg ${!l.studentName ? 'text-slate-300 italic' : 'text-slate-800'}`}>
                  {l.studentName || "UNASSIGNED"}
                </td>
                <td className="p-4 text-xs text-slate-500 font-black uppercase tracking-widest">{l.location}</td>
                <td className="p-4 font-mono font-black text-blue-600">{l[`combination${activeSet}`] || "0-0-0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Main Dashboard UI */}
      <header className="bg-white border-b sticky top-0 z-40 p-4 shadow-sm flex justify-between items-center print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg text-white font-black text-xs shadow-md uppercase">WRMS</div>
          <nav className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
            <button onClick={() => setView('inventory')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'inventory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Inventory</button>
            <button onClick={() => setView('students')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'students' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Students</button>
            <button onClick={() => setView('maintenance')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${view === 'maintenance' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Broken</button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex gap-1 border-r pr-4 border-slate-200 mr-2 items-center">
             <span className="text-[10px] font-black text-slate-400 mr-2 tracking-widest">SET:</span>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => updateGlobalComboSet(n)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${activeSet === n ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{n}</button>
            ))}
          </div>
          <button onClick={() => { setImportType('lockers'); setImportModalOpen(true); }} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200" title="Import Locker CSV"><FileUp size={18}/></button>
          <button onClick={() => window.print()} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200" title="Print Report"><Printer size={18}/></button>
          <button onClick={() => {setIsModalOpen(true);}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-blue-100">+ NEW</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 print:hidden">
        {view === 'inventory' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <StatCard label="Total" value={lockers.length} color="blue" />
              <StatCard label="Empty" value={lockers.filter(l => !l.studentName).length} color="emerald" />
              <StatCard label="Issues" value={maintenanceLogs.filter(l => l.status === 'pending').length} color="rose" />
              <StatCard label="Active Set" value={`#${activeSet}`} color="blue" />
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-10">
              <div className="relative flex-grow text-left">
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
              {filteredLockers.map(l => {
                const isUnusable = maintenanceLogs.some(log => log.lockerId === l.id && log.status === 'pending');
                return (
                  <div key={l.id} className={`bg-white border rounded-[2rem] p-6 group relative shadow-sm transition-all hover:shadow-md ${isUnusable ? 'border-rose-200 bg-rose-50/20' : l.studentName ? 'border-blue-100 bg-blue-50/10' : 'border-slate-200'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 text-left">
                          <span className="text-2xl font-black font-mono tracking-tighter">#{l.lockerNumber}</span>
                          {isUnusable && <span className="bg-rose-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest shadow-sm animate-pulse">Broken</span>}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 mt-1 tracking-widest text-left"><MapPin size={10}/> {l.location || "Hall"}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => { setActiveLockerForStatus(l); setIsUnusableModalOpen(true); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors" title="Mark Broken"><Ban size={16}/></button>
                         <button onClick={() => { if(window.confirm('Delete locker?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', l.id))}} className="p-2 text-slate-200 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={16}/></button>
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
                      <button onMouseDown={() => setViewingCombination(l.id)} onMouseUp={() => setViewingCombination(null)} onMouseLeave={() => setViewingCombination(null)} className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform border border-slate-200/50">Reveal</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'students' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-200 mb-8 text-center relative overflow-hidden">
              <h2 className="text-3xl font-black mb-1 tracking-tighter text-slate-800 uppercase">Student Directory</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-10">Look up student info or update school list</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <div className="relative text-left">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                  <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="w-full pl-14 pr-10 py-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none shadow-inner appearance-none font-black text-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <option value="">Select Student...</option>
                    {[...students].sort((a,b) => String(a.name || "").localeCompare(String(b.name || ""))).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={24} />
                </div>
                
                <button 
                  onClick={() => { setImportType('students'); setImportModalOpen(true); }}
                  className="bg-blue-600 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 py-5 border-b-4 border-blue-800"
                >
                  <Upload size={18} /> Upload Student CSV List
                </button>
              </div>

              {currentStudentDetails ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in zoom-in duration-200 text-left">
                  <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2 block">Grade Level</span>
                    <p className="text-2xl font-black text-blue-900">{currentStudentDetails.grade || "N/A"}</p>
                  </div>
                  <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 block">Homeroom</span>
                    <p className="text-2xl font-black text-emerald-900">{currentStudentDetails.homeroom || "N/A"}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm text-slate-400">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-2 block">Student ID</span>
                    <p className="text-2xl font-black">{currentStudentDetails.studentId || "N/A"}</p>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center">
                   <BookOpen className="text-slate-200 mb-4" size={64} />
                   <p className="text-slate-300 font-black uppercase text-[10px] tracking-widest">Pick a student above to see info</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'maintenance' && (
          <div className="grid gap-4 animate-in fade-in duration-300">
             {maintenanceLogs.filter(l => l.status === 'pending').map(log => (
               <div key={log.id} className="bg-white p-6 rounded-2xl border border-slate-200 flex justify-between items-center shadow-sm">
                  <div className="text-left">
                    <h3 className="font-black text-lg text-slate-900 tracking-tighter uppercase text-rose-600">Locker #{log.lockerNumber}</h3>
                    <p className="text-slate-500 font-medium italic text-left">"{log.issue}"</p>
                  </div>
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', log.id), { status: 'resolved' })} className="bg-emerald-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 transition-all active:scale-95">Mark Fixed</button>
               </div>
             ))}
             {maintenanceLogs.filter(l => l.status === 'pending').length === 0 && <div className="p-20 text-center text-slate-300 italic font-black uppercase tracking-tighter text-2xl opacity-50 flex flex-col items-center gap-4">
                <CheckCircle size={48} className="text-emerald-200" />
                No Broken Lockers!
             </div>}
          </div>
        )}
      </main>

      {/* CSV Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-center shadow-2xl border border-slate-100">
            <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center text-blue-600 mx-auto mb-6 shadow-inner"><Upload size={40}/></div>
            <h2 className="text-3xl font-black mb-2 tracking-tighter text-slate-800 uppercase">CSV Import</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-8">Importing into: {importType}</p>
            
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50/50 relative">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => setSelectedFile(e.target.files[0])} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest">
                    <CheckCircle size={24} /> {selectedFile.name}
                  </div>
                ) : (
                  <div className="text-slate-400 font-black text-xs uppercase tracking-widest flex flex-col items-center gap-2">
                    <Upload size={24}/> Pick CSV File
                  </div>
                )}
              </div>

              {selectedFile && (
                <button 
                  onClick={startCSVImport}
                  disabled={isUploading}
                  className="w-full bg-emerald-600 text-white rounded-2xl py-5 font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  {isUploading ? <Loader2 className="animate-spin" size={18}/> : <Upload size={18}/>}
                  {isUploading ? `Uploading ${progress}/${totalToUpload}` : "Finalize and Save"}
                </button>
              )}
            </div>
            
            <button 
              onClick={() => { setImportModalOpen(false); setSelectedFile(null); }} 
              className="mt-8 text-slate-300 font-black text-[10px] uppercase tracking-[0.2em] hover:text-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
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
          }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-xl shadow-2xl border border-slate-100 text-left">
             <h2 className="text-3xl font-black mb-8 tracking-tighter text-slate-800 uppercase text-left">New Entry</h2>
             <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                   <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest text-left">Locker #</label>
                   <input name="lockerNumber" required className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-blue-300 shadow-inner placeholder:text-slate-200" placeholder="101" />
                </div>
                <div>
                   <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest text-left">Wing/Floor</label>
                   <select name="location" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 appearance-none outline-none focus:border-blue-300 shadow-inner">
                    {LOCATIONS.filter(l => l !== "All Locations").map(loc => <option key={loc} value={loc}>{loc}</option>)}
                   </select>
                </div>
             </div>
             <label className="block text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest text-left">Codes (Sets 1-5)</label>
             <div className="grid grid-cols-5 gap-2 mb-8">
                {[1,2,3,4,5].map(n => (
                  <div key={n}>
                    <div className="text-[8px] font-black text-slate-300 text-center mb-1">SET {n}</div>
                    <input name={`combination${n}`} className="w-full p-2 bg-slate-50 border border-slate-100 rounded-xl font-mono text-[10px] text-center font-bold outline-none focus:border-blue-200 shadow-sm" placeholder="0-0-0" />
                  </div>
                ))}
             </div>
             <div className="flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-500 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase shadow-lg active:scale-95 transition-transform hover:bg-blue-700">Create</button>
             </div>
          </form>
        </div>
      )}

      {/* Assign Student Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={async (e) => {
             e.preventDefault();
             const name = new FormData(e.target).get('studentName');
             await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lockers', activeLockerForAssign.id), { studentName: name });
             setIsAssignModalOpen(false);
             notify(`Assigned to ${name}`);
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center animate-in zoom-in duration-200 border border-slate-100">
              <h2 className="text-3xl font-black mb-8 tracking-tighter text-slate-800 uppercase text-center">Assign #{activeLockerForAssign?.lockerNumber}</h2>
              <input name="studentName" required autoFocus className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-center mb-8 outline-none focus:border-blue-300 transition-all shadow-inner placeholder:text-slate-200" placeholder="Full Student Name" />
              <div className="flex gap-3 text-center items-center justify-center">
                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="flex-1 py-4 text-slate-300 font-black text-xs uppercase tracking-widest hover:text-slate-500 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-transform hover:bg-blue-700">Confirm</button>
              </div>
           </form>
        </div>
      )}

      {/* Mark Broken Modal */}
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
           }} className="bg-white p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-200 border border-slate-100 text-center">
              <h2 className="text-3xl font-black mb-4 tracking-tighter text-rose-600 uppercase">Mark Broken</h2>
              <p className="text-slate-400 text-sm mb-6 text-center font-medium italic tracking-widest uppercase text-left">Locker #{activeLockerForStatus?.lockerNumber}</p>
              <textarea name="issue" required placeholder="What is wrong with this locker?" className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl font-medium min-h-[120px] mb-6 shadow-inner outline-none focus:border-rose-200 transition-all" />
              <div className="flex gap-3">
                 <button type="button" onClick={() => setIsUnusableModalOpen(false)} className="flex-1 py-4 text-slate-400 font-black uppercase text-xs hover:text-slate-500 transition-colors text-center">Cancel</button>
                 <button type="submit" className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-transform hover:bg-rose-700 text-center">Submit</button>
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

// --- Mount Command ---
// Ensures standard rendering locally or in standard bundlers
export const renderApp = () => {
    const el = document.getElementById('root')
    if (el) {
        createRoot(el).render(<App />)
    }
}
