import React, { useState, useRef, useEffect } from 'react';
import { FileUpload } from '../FileUpload'; // Assuming this exists in your project
import { ScanEye, AlertTriangle, Loader2, FileCheck, Bug, CheckCircle2, Camera, Upload, X, RefreshCw, SwitchCamera, CloudUpload, Zap, Activity, Shield, AlertOctagon, Search, Trash2, Calendar, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResultsActions } from './ResultsActions';
import { translations } from '../../translations';

// --- CONFIGURATION ---
const getBaseUrl = (port) => {
  if (window.location.hostname === 'localhost') {
    return `http://localhost:${port}`;
  }
  return `http://${window.location.hostname}:${port}`;
};

// Python AI Engine (For Pest Analysis)
const AI_URL = getBaseUrl(5001);
// Node.js Backend (For History/Database)
const DB_URL = getBaseUrl(5000);

export const FieldMonitor = ({ language }) => {
  const t = translations[language];
  
  // --- States ---
  const [selectedScanLang, setSelectedScanLang] = useState('en');
  const [analyzing, setAnalyzing] = useState(false);
  const [monitorResult, setMonitorResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null); 
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // NEW: Modal State
  const [viewingScan, setViewingScan] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const reportRef = useRef(null);      // For Main Result PDF
  const modalReportRef = useRef(null); // For History Modal PDF

  // --- HISTORY LOGIC ---
  const [history, setHistory] = useState([]);
  // Safe check for user in localStorage
  const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
  const [deletingIds, setDeletingIds] = useState([]);

  const fetchHistory = async () => {
      if(!user || !user._id) {
        setIsLoadingHistory(false);
        return;
      }
      try {
          const res = await fetch(`${DB_URL}/api/scans/history/${user._id}`);
          const data = await res.json();
          // Filter for 'pest' only and sort newest first
          const pests = data.filter(item => item.scanType === 'pest').sort((a, b) => new Date(b.date) - new Date(a.date));
          setHistory(pests);
      } catch(err) { console.error(err); }
      finally { setIsLoadingHistory(false); }
  };

  useEffect(() => {
      fetchHistory();
      window.addEventListener('scanSaved', fetchHistory);
      return () => window.removeEventListener('scanSaved', fetchHistory);
  }, []);

  const handleDelete = async (e, scanId) => {
      e.stopPropagation();
      if(!window.confirm("Delete this record permanently?")) return;
      
      // UI Optimistic update
      setDeletingIds(prev => [...prev, scanId]);
      
      try {
        await fetch(`${DB_URL}/api/scans/delete/${user._id}/${scanId}`, { method: 'DELETE' });
        setHistory(prev => prev.filter(item => item._id !== scanId));
      } catch(err) { 
        console.error(err);
        fetchHistory(); // Revert on error
      } finally {
        setDeletingIds(prev => prev.filter(id => id !== scanId));
      }
  };

  // --- UI THEME HELPER ---
  const getSeverityTheme = (severity) => {
    switch (severity?.toLowerCase()) {
        case 'high':
            return { gradient: 'from-red-500 to-rose-600', label: 'CRITICAL RISK', icon: AlertTriangle, glow: 'shadow-red-500/30', border: 'border-red-500' };
        case 'medium':
            return { gradient: 'from-amber-400 to-orange-500', label: 'MODERATE RISK', icon: AlertOctagon, glow: 'shadow-amber-500/30', border: 'border-amber-400' };
        case 'healthy':
            return { gradient: 'from-emerald-500 to-green-600', label: 'CROP HEALTHY', icon: CheckCircle2, glow: 'shadow-emerald-500/30', border: 'border-emerald-500' };
        case 'invalid':
            return { gradient: 'from-slate-600 to-slate-800', label: 'INVALID IMAGE', icon: X, glow: 'shadow-slate-500/30', border: 'border-slate-500' };
        default:
            return { gradient: 'from-blue-400 to-teal-500', label: 'LOW RISK', icon: Shield, glow: 'shadow-blue-500/30', border: 'border-blue-400' };
    }
  };

  // --- RENDER MODAL CONTENT ---
  const renderHistoryModal = () => {
      if (!viewingScan) return null;
      const result = viewingScan.resultData;
      const theme = getSeverityTheme(result.severity);
      const ModalIcon = theme.icon;

      return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
              <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative flex flex-col"
              >
                  <div className="sticky top-0 z-20 flex items-center justify-between p-4 bg-white/95 backdrop-blur-md border-b border-slate-100">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                          <FileCheck className="text-emerald-500" size={20} /> Scan Detail
                      </h3>
                      <button onClick={() => setViewingScan(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                          <X size={20} className="text-slate-600" />
                      </button>
                  </div>

                  <div className="p-4 md:p-6 space-y-6" ref={modalReportRef}>
                      <div className="w-full aspect-video bg-slate-100 rounded-2xl overflow-hidden shadow-inner border border-slate-200">
                          <img src={viewingScan.image} alt="Scan" className="w-full h-full object-contain" />
                      </div>

                      <div className={`relative overflow-hidden rounded-2xl p-5 md:p-6 text-white bg-gradient-to-br ${theme.gradient} shadow-lg`}>
                          <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-2 opacity-90">
                                  <ModalIcon size={18} />
                                  <span className="text-xs font-bold tracking-widest">{theme.label}</span>
                              </div>
                              <h3 className="text-2xl font-bold mb-3">{viewingScan.name}</h3>
                              <p className="text-white/90 text-sm bg-white/10 p-3 rounded-lg border border-white/10 leading-relaxed backdrop-blur-sm">
                                  {result.description}
                              </p>
                          </div>
                      </div>

                      {result.severity !== 'healthy' && result.severity !== 'invalid' && result.treatments && (
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Activity size={18} className="text-blue-500" /> Treatment Plan
                            </h4>
                            <div className="space-y-4">
                                {result.treatments.map((t, idx) => (
                                    <div key={idx} className="flex gap-3 items-start">
                                        <div className="w-6 h-6 shrink-0 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold mt-0.5">
                                            {idx + 1}
                                        </div>
                                        <p className="text-sm text-slate-600 leading-relaxed">{t}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                      )}
                  </div>
                  
                  <div className="p-6 pt-0 bg-white">
                     <ResultsActions 
                          data={result} 
                          image={viewingScan.image} 
                          type="pest" 
                          reportRef={modalReportRef} 
                      />
                  </div>
              </motion.div>
          </div>
      );
  };

  // --- Camera Logic ---
  const startCameraStream = async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { setIsCameraOpen(false); alert("Camera access denied or unavailable."); }
  };
  useEffect(() => { if (isCameraOpen) startCameraStream(); }, [facingMode, isCameraOpen]);
  
  const handleStartCamera = () => { setIsCameraOpen(true); setCapturedImage(null); setMonitorResult(null); };
  
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      if (facingMode === 'user') { ctx.translate(canvasRef.current.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(videoRef.current, 0, 0);
      setCapturedImage(canvasRef.current.toDataURL('image/jpeg', 0.8));
      setIsCameraOpen(false);
    }
  };
  
  const handleFileSelect = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => { setCapturedImage(reader.result); setMonitorResult(null); };
    if(file) reader.readAsDataURL(file);
  };
  
  // --- API ANALYSIS ---
  const handleAnalysis = async () => {
    if (!capturedImage) return;
    setAnalyzing(true);
    try {
      const response = await fetch('http://127.0.0.1:5001/api/scans/monitor', { 
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ image: capturedImage, language: selectedScanLang }),
      });
      if (!response.ok) throw new Error('Analysis failed');
      const data = await response.json();
      setMonitorResult(data.monitoring);
    } catch (error) { alert("Analysis Engine Error. Ensure Python backend is running."); } 
    finally { setAnalyzing(false); }
  };
  
  const resetProcess = () => { setCapturedImage(null); setMonitorResult(null); setIsCameraOpen(false); };

  const theme = monitorResult ? getSeverityTheme(monitorResult.severity) : {};
  const SeverityIcon = theme.icon;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 md:space-y-8 pb-24">
      
      {/* --- HISTORY MODAL --- */}
      <AnimatePresence>
         {viewingScan && renderHistoryModal()}
      </AnimatePresence>

      {/* Header - Hidden in Camera Mode to save space */}
      {!isCameraOpen && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-700">
               <Bug size={24} />
             </div>
             <div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                    {t.newAnalysis || "Pest Monitor"}
                </h2>
                <p className="text-slate-500 text-sm font-medium">
                    AI-Powered Early Detection System
                </p>
             </div>
          </div>
        </div>
      )}

      {/* Main Analysis Card */}
      <div className={`bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden relative transition-all duration-500 ${isCameraOpen ? 'fixed inset-0 z-50 rounded-none h-[100dvh]' : 'min-h-[400px]'}`}>
        
        <AnimatePresence mode="wait">
          
          {/* VIEW 1: RESULTS */}
          {monitorResult ? (
              <motion.div 
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col w-full h-full overflow-y-auto"
              >
                {/* Close Button sticky top */}
                <div className="sticky top-0 bg-white/80 backdrop-blur-md p-4 flex justify-between items-center border-b border-slate-100 z-10">
                    <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-emerald-100">
                        <FileCheck size={14} /> Analysis Complete
                    </span>
                    <button onClick={resetProcess} className="w-9 h-9 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 md:p-8 space-y-6">
                    {/* --- REPORT CONTAINER --- */}
                    <div ref={reportRef} className="bg-white rounded-xl">
                        
                        {/* HERO CARD */}
                        <div className={`relative overflow-hidden rounded-3xl p-6 md:p-10 text-white bg-gradient-to-br ${theme.gradient} shadow-lg ${theme.glow}`}>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/20">
                                        {SeverityIcon && <SeverityIcon size={16} />}
                                        <span className="text-xs font-bold tracking-widest uppercase">{theme.label}</span>
                                    </div>
                                    <h3 className="text-3xl md:text-5xl font-extrabold tracking-tight">{monitorResult.pestName}</h3>
                                    <p className="text-white/90 text-sm md:text-lg leading-relaxed max-w-2xl font-medium">{monitorResult.description}</p>
                                </div>
                                
                                {monitorResult.count && (
                                    <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center min-w-[120px]">
                                        <span className="block text-xs uppercase opacity-80 mb-1 font-semibold">Detected</span>
                                        <span className="text-4xl font-black">{monitorResult.count}</span>
                                    </div>
                                )}
                            </div>
                            {/* Decorative Background Icon */}
                            <Bug className="absolute -bottom-12 -right-12 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
                        </div>

                        {/* TREATMENT TIMELINE */}
                        {monitorResult.treatments && monitorResult.treatments.length > 0 && (
                        <div className="mt-8">
                            <h4 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-xl">
                                <Activity size={22} className="text-blue-500" /> 
                                Action Plan
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {monitorResult.treatments.map((step, idx) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex gap-4 items-start hover:border-blue-200 hover:shadow-sm transition-all">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm shrink-0">
                                            {idx + 1}
                                        </span>
                                        <p className="text-slate-700 text-sm leading-relaxed pt-1 font-medium">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        )}
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400 hidden print:block">
                            Agri-Sentry Report • {new Date().toLocaleDateString()}
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="pt-4 border-t border-slate-100">
                        <ResultsActions 
                            data={monitorResult} 
                            image={capturedImage} 
                            type="pest" 
                            reportRef={reportRef} 
                        />
                        <button 
                          onClick={resetProcess}
                          className="mt-4 w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-98 flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={20} /> Analyze Another
                        </button>
                    </div>
                </div>
              </motion.div>

          /* VIEW 2: CAMERA/UPLOAD SELECTOR (Home State) */
          ) : !capturedImage && !isCameraOpen ? (
            <div className="p-6 md:p-12 flex flex-col h-full items-center justify-center gap-8">
                <div className="text-center max-w-md mx-auto space-y-2">
                    <h3 className="text-xl font-bold text-slate-800">Select Input Method</h3>
                    <p className="text-slate-400 text-sm">Choose how you want to capture the crop image.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mx-auto">
                    <button 
                        onClick={handleStartCamera} 
                        className="flex-1 aspect-[4/3] sm:aspect-square rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-4 group active:scale-95"
                    >
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-md shadow-slate-200 group-hover:scale-110 transition-transform">
                            <Camera size={32} className="text-blue-500" />
                        </div>
                        <div className="text-center">
                            <span className="block font-bold text-slate-700 text-lg group-hover:text-blue-700">Open Camera</span>
                            <span className="text-xs text-slate-400">Take a photo now</span>
                        </div>
                    </button>

                    <div className="flex items-center justify-center text-slate-300 font-bold uppercase text-xs sm:hidden">OR</div>

                    <div className="relative flex-1 aspect-[4/3] sm:aspect-square rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 transition-all flex flex-col items-center justify-center gap-4 group active:scale-95">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-md shadow-slate-200 group-hover:scale-110 transition-transform">
                            <CloudUpload size={32} className="text-emerald-500" />
                        </div>
                        <div className="text-center">
                            <span className="block font-bold text-slate-700 text-lg group-hover:text-emerald-700">Upload Image</span>
                            <span className="text-xs text-slate-400">From gallery</span>
                        </div>
                        <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    </div>
                </div>
            </div>

          /* VIEW 3: IMAGE PREVIEW & PROCESSING */
          ) : capturedImage ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center w-full h-full p-4 md:p-8">
                <div className="relative w-full max-w-md aspect-square bg-slate-900 rounded-3xl overflow-hidden shadow-2xl mb-8 group ring-4 ring-white shadow-slate-300">
                    <img src={capturedImage} alt="Preview" className="w-full h-full object-cover" />
                    
                    {/* Scanning Animation Overlay */}
                    {analyzing && (
                        <div className="absolute inset-0 bg-emerald-900/20 z-10 backdrop-blur-[2px]">
                            <motion.div 
                                className="w-full h-1.5 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,1)] absolute"
                                animate={{ top: ['0%', '100%', '0%'] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <div className="bg-black/60 backdrop-blur-md px-6 py-4 rounded-2xl flex flex-col items-center gap-3">
                                    <Loader2 size={36} className="animate-spin text-emerald-400" />
                                    <span className="font-bold text-white tracking-widest text-sm uppercase">Processing Crop</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {!analyzing && (
                        <button onClick={resetProcess} className="absolute top-3 right-3 w-8 h-8 bg-black/40 hover:bg-red-500 backdrop-blur-md rounded-full text-white transition-all flex items-center justify-center">
                          <X size={16} />
                        </button>
                    )}
                </div>

                {!analyzing && (
                    <div className="w-full max-w-md space-y-4">
                        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl">
                            {[{ code: 'en', label: 'English' },{ code: 'hi', label: 'Hindi' },{ code: 'or', label: 'Odia' }].map((lang) => (
                                <button
                                key={lang.code}
                                onClick={() => setSelectedScanLang(lang.code)}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                                    selectedScanLang === lang.code
                                    ? 'bg-white text-emerald-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                                }`}
                                >
                                {lang.label}
                                </button>
                            ))}
                        </div>

                        <button 
                            onClick={handleAnalysis}
                            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-3 text-lg"
                        >
                            <ScanEye size={24} /> Start Analysis
                        </button>
                    </div>
                )}
            </motion.div>

          /* VIEW 4: CAMERA OVERLAY (Mobile Optimized) */
         ) : (
            <div className="absolute inset-0 bg-black flex flex-col">
               <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full h-full object-cover" />
               
               {/* 👇 THIS WAS MISSING. REQUIRED FOR CAPTURE TO WORK 👇 */}
               <canvas ref={canvasRef} className="hidden" />
               
               {/* Grid Overlay */}
               <div className="absolute inset-0 pointer-events-none opacity-20 grid grid-cols-3 grid-rows-3">
                  {[...Array(9)].map((_, i) => <div key={i} className="border border-white/50"></div>)}
               </div>

               {/* Camera Controls */}
               <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center z-30">
                  <button onClick={() => setIsCameraOpen(false)} className="w-12 h-12 bg-white/10 rounded-full text-white backdrop-blur-md flex items-center justify-center hover:bg-white/20 active:scale-95"><X size={24} /></button>
                  
                  <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-4 border-slate-300 ring-4 ring-white/20 transition-all active:scale-90 shadow-lg"></button>
                  
                  <button onClick={() => setFacingMode(m => m==='user'?'environment':'user')} className="w-12 h-12 bg-white/10 rounded-full text-white backdrop-blur-md flex items-center justify-center hover:bg-white/20 active:scale-95"><SwitchCamera size={24} /></button>
               </div>
            </div>
          )}
        </AnimatePresence>
      </div>

  
     
    </div>
  );
};