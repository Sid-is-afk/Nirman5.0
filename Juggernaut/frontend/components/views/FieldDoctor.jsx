import React, { useState, useRef, useEffect } from 'react';
import { FileUpload } from '../FileUpload';
import { Stethoscope, Activity, Loader2, CheckCircle2, AlertOctagon, ShieldCheck, Leaf, AlertTriangle, Camera, Upload, X, RefreshCw, SwitchCamera, CloudUpload, FileCheck, Search, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResultsActions } from './ResultsActions';
import { translations } from '../../translations';

// --- CONFIGURATION ---
const getBaseUrl = () => {
  if (window.location.hostname === 'localhost') {
    return "http://localhost:5001"; 
  }
  return `http://${window.location.hostname}:5001`; 
};
const API_URL = getBaseUrl();

// Node.js Backend (For History/Database)
const DB_URL = "http://localhost:5000"; 

export const FieldDoctor = ({ language }) => {
  const t = translations[language];
  
  // 1. STATE: Selected Language for the NEXT scan
  const [selectedScanLang, setSelectedScanLang] = useState('en');

  // States
  const [hasFile, setHasFile] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  
  // Camera States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); 

  // --- HISTORY STATE ---
  const [history, setHistory] = useState([]);
  const user = JSON.parse(localStorage.getItem('user')); 
  
  // *** ADDED: STATE FOR MODAL VIEWING ***
  const [viewingScan, setViewingScan] = useState(null);
  
  // *** NEW: Refs for PDF Generation ***
  const reportRef = useRef(null);
  const modalReportRef = useRef(null); // Added for Modal PDF
  const [deletingIds, setDeletingIds] = useState([]);

  // Fetch History on Load
  const fetchHistory = async () => {
      if(!user || !user._id) return;
      try {
          const res = await fetch(`${DB_URL}/api/scans/history/${user._id}`);
          const data = await res.json();
          setHistory(data.filter(item => item.scanType === 'disease').reverse()); // Show newest first
      } catch(err) { console.error(err); }
  };

  useEffect(() => {
      fetchHistory();
      window.addEventListener('scanSaved', fetchHistory);
      return () => window.removeEventListener('scanSaved', fetchHistory);
  }, []);
const handleDelete = async (e, scanId) => {
  e.stopPropagation(); // prevent opening modal when deleting

  if (!window.confirm("Delete this record?")) return;
  if (!user || !user._id) {
    alert("You must be logged in to delete records.");
    return;
  }

  // Snapshot previous history to allow rollback on failure
  const prevHistory = history;
  const itemToDelete = history.find(h => h._id === scanId);

  // Optimistically remove from UI
  setHistory(prev => prev.filter(item => item._id !== scanId));
  // Mark as deleting (so UI can show spinner / disable button)
  setDeletingIds(prev => [...prev, scanId]);

  try {
    const res = await fetch(`${DB_URL}/api/scans/delete/${user._id}/${scanId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      // If backend returned error, throw to go to catch block
      const text = await res.text().catch(() => 'Delete failed');
      throw new Error(text || 'Delete failed');
    }

    // Success: remove id from deleting list
    setDeletingIds(prev => prev.filter(id => id !== scanId));
    // Optionally re-fetch history to ensure server-state sync
    // await fetchHistory();
  } catch (err) {
    console.error('Delete error:', err);
    // Rollback: restore previous history
    setHistory(prevHistory);
    // Remove from deleting list
    setDeletingIds(prev => prev.filter(id => id !== scanId));
    alert('Could not delete record. Please try again.');
  }
};
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // --- Camera Logic ---
  const startCameraStream = async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: facingMode } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setIsCameraOpen(false);
    }
  };

  useEffect(() => {
    if (isCameraOpen) startCameraStream();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [facingMode, isCameraOpen]);

  const handleStartCamera = () => {
    setIsCameraOpen(true);
    setCapturedImage(null);
    setHasFile(false);
    setDiagnosisResult(null);
  };

  const handleStopCamera = () => {
    setIsCameraOpen(false);
  };

  const toggleCameraFacing = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageUrl);
      setHasFile(true);
      setIsCameraOpen(false);
    }
  };

  const handleFileSelect = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        setCapturedImage(reader.result);
        setHasFile(true);
        setDiagnosisResult(null);
    };
    reader.readAsDataURL(file);
  };

  // --- API CALL ---
  const handleDiagnose = async () => {
    if (!capturedImage) return;
    setDiagnosing(true);
    try {
      const response = await fetch(`${API_URL}/api/scans/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            image: capturedImage,
            language: selectedScanLang 
        }), 
      });

      if (!response.ok) throw new Error('Diagnosis failed');

      const data = await response.json();
      setDiagnosisResult(data.diagnosis); 

    } catch (error) {
      console.error(error);
      alert("Server Error. Ensure Python backend is running on Port 5001.");
    } finally {
      setDiagnosing(false);
    }
  };

  const resetProcess = () => {
    setHasFile(false);
    setDiagnosisResult(null);
    setCapturedImage(null);
  };

  // Helper for dynamic UI styles
  const getSeverityStyles = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-900',
          subText: 'text-red-700',
          accent: 'text-red-600',
          badge: 'bg-red-100 text-red-700 border-red-200',
          icon: <AlertOctagon size={18} className="text-red-600" />,
          gradient: 'from-red-500 to-rose-600', // Added for modal
          label: 'CRITICAL' // Added for modal
        };
      case 'medium':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-900',
          subText: 'text-amber-700',
          accent: 'text-amber-600',
          badge: 'bg-amber-100 text-amber-700 border-amber-200',
          icon: <AlertTriangle size={18} className="text-amber-600" />,
          gradient: 'from-amber-400 to-orange-500', // Added for modal
          label: 'MODERATE' // Added for modal
        };
      case 'healthy':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200',
          text: 'text-emerald-900',
          subText: 'text-emerald-700',
          accent: 'text-emerald-600',
          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          icon: <ShieldCheck size={18} className="text-emerald-600" />,
          gradient: 'from-emerald-500 to-green-600', // Added for modal
          label: 'HEALTHY' // Added for modal
        };
      default:
        return {
          bg: 'bg-slate-50',
          border: 'border-slate-200',
          text: 'text-slate-900',
          subText: 'text-slate-700',
          accent: 'text-slate-600',
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: <Leaf size={18} />,
          gradient: 'from-blue-400 to-indigo-500', // Added for modal
          label: 'UNKNOWN' // Added for modal
        };
    }
  };

  const activeResult = diagnosisResult;
  const styles = activeResult ? getSeverityStyles(activeResult.severity) : null;

  // *** ADDED: RENDER MODAL CONTENT ***
  const renderModalContent = () => {
    if (!viewingScan) return null;
    const result = viewingScan.resultData;
    const modalStyles = getSeverityStyles(result.severity);
    // Create instance of icon
    const ModalIcon = modalStyles.icon;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative"
            >
                <div className="sticky top-0 z-20 flex items-center justify-between p-4 bg-white/90 backdrop-blur-md border-b border-slate-100">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <FileCheck className="text-emerald-500" size={20} /> Saved Report
                    </h3>
                    <button onClick={() => setViewingScan(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6" ref={modalReportRef}>
                    <div className="w-full h-56 bg-slate-900 rounded-2xl overflow-hidden shadow-md">
                        <img src={viewingScan.image} alt="Scan" className="w-full h-full object-contain" />
                    </div>

                    {/* Severity Card in Modal */}
                    <div className={`relative overflow-hidden rounded-2xl p-6 text-white bg-gradient-to-br ${modalStyles.gradient} shadow-lg`}>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                {ModalIcon}
                                <span className="text-xs font-bold tracking-widest">{modalStyles.label}</span>
                            </div>
                            <h3 className="text-2xl font-bold mb-2">{viewingScan.name}</h3>
                            <p className="text-white/90 text-sm bg-white/10 p-3 rounded-lg border border-white/10 leading-relaxed">
                                "{result.description}"
                            </p>
                        </div>
                    </div>

                    {/* Treatments in Modal */}
                    {result.severity !== 'healthy' && (
                      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <Activity size={18} className="text-blue-500" /> Recommended Treatment
                          </h4>
                          <div className="space-y-4 relative pl-2">
                              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200"></div>
                              {result.treatments?.map((t, idx) => (
                                  <div key={idx} className="relative flex gap-3">
                                      <div className="w-8 h-8 shrink-0 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10 text-xs font-bold text-slate-500">
                                          {idx + 1}
                                      </div>
                                      <p className="text-sm text-slate-600 pt-1 leading-relaxed">{t}</p>
                                  </div>
                              ))}
                          </div>
                      </div>
                    )}
                    
                    <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-100">
                        Scan Date: {new Date(viewingScan.date).toLocaleString()}
                    </div>
                </div>
                
                {/* Actions in Modal */}
                <div className="p-6 pt-0 bg-white">
                   <ResultsActions 
                        data={result} 
                        image={viewingScan.image} 
                        type="disease" 
                        reportRef={modalReportRef} 
                    />
                </div>
            </motion.div>
        </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0 relative">
       
       {/* *** ADDED: MODAL RENDERER *** */}
       <AnimatePresence>
         {viewingScan && renderModalContent()}
       </AnimatePresence>

       {/* Header */}
       <div className="mb-4 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-bold text-emerald-900 flex items-center justify-center md:justify-start gap-3">
          <Stethoscope className="text-lime-600" size={36} />
          {t.diagnoseHeader}
        </h2>
        <p className="text-slate-500 mt-2 text-sm md:text-lg max-w-2xl mx-auto md:mx-0">
          {t.diagnoseSub}
        </p>
      </div>

      <div className="bg-white rounded-[2rem] shadow-md shadow-emerald-900/5 overflow-hidden border border-slate-200">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          
          {/* --- LEFT COLUMN: INPUT --- */}
          <div className="p-4 md:p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/30">
            <div className="flex items-center gap-3 mb-6 md:mb-8">
               <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lime-100 text-lime-700 font-bold text-sm border border-lime-200">1</span>
               <h3 className="text-lg md:text-xl font-bold text-slate-800">{t.uploadSpecimen}</h3>
            </div>
            
            <AnimatePresence mode="wait">
              {/* STATE: CAMERA ACTIVE */}
              {isCameraOpen ? (
                <motion.div
                  key="camera"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-black rounded-2xl overflow-hidden relative aspect-[3/4] md:aspect-video shadow-lg"
                >
                   <video 
                     ref={videoRef} 
                     autoPlay 
                     playsInline 
                     muted 
                     className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} 
                   />
                   <canvas ref={canvasRef} className="hidden" />
                   
                   <div className="absolute inset-0 flex flex-col justify-between p-4 z-20 pointer-events-none">
                      <div className="flex justify-between items-start pointer-events-auto">
                         <button onClick={handleStopCamera} className="bg-black/40 p-2 rounded-full backdrop-blur-md text-white border border-white/20">
                            <X size={20} />
                         </button>
                         <button onClick={toggleCameraFacing} className="bg-black/40 p-2 rounded-full backdrop-blur-md text-white border border-white/20 flex items-center gap-2">
                            <SwitchCamera size={20} />
                         </button>
                      </div>
                      <div className="flex justify-center items-center pb-4 pointer-events-auto">
                         <button 
                           onClick={capturePhoto} 
                           className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 backdrop-blur-sm active:scale-95 transition-all shadow-lg"
                         >
                           <div className="w-12 h-12 bg-white rounded-full"></div>
                         </button>
                      </div>
                   </div>
                </motion.div>

              /* STATE: PREVIEW IMAGE */
              ) : capturedImage ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center"
                >
                   <div className="relative w-full max-w-sm aspect-square bg-slate-900 rounded-2xl overflow-hidden shadow-md border border-slate-200 mb-6 group">
                      <img src={capturedImage} alt="Specimen" className="w-full h-full object-contain" />
                      <button 
                        onClick={resetProcess}
                        className="absolute top-3 right-3 bg-black/50 p-2 rounded-full text-white backdrop-blur-md hover:bg-red-500 transition-colors"
                      >
                        <X size={20} />
                      </button>
                   </div>
                   
                   {/* Language Selector */}
                   {!diagnosisResult && (
                    <div className="flex gap-2 mb-4 justify-center w-full">
                        {[
                        { code: 'en', label: 'English' },
                        { code: 'hi', label: 'हिंदी' },
                        { code: 'or', label: 'ଓଡ଼ିଆ' }
                        ].map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => setSelectedScanLang(lang.code)}
                            className={`flex-1 py-2 rounded-xl border transition-all font-bold text-sm ${
                            selectedScanLang === lang.code
                                ? 'bg-lime-600 text-white border-lime-600 shadow-md transform scale-105'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-lime-400'
                            }`}
                        >
                            {lang.label}
                        </button>
                        ))}
                    </div>
                   )}

                   {!diagnosisResult && (
                     <button 
                       onClick={handleDiagnose}
                       disabled={diagnosing}
                       className="w-full md:max-w-sm py-4 bg-lime-600 hover:bg-lime-700 text-white rounded-xl font-bold shadow-lg shadow-lime-500/20 transition-all flex items-center justify-center gap-2"
                     >
                       {diagnosing ? (
                         <>
                           <Loader2 size={20} className="animate-spin" />
                           {t.analyzingLeaf}
                         </>
                       ) : (
                         <>
                           <Activity size={20} />
                           {t.diagnoseSpecimen}
                         </>
                       )}
                     </button>
                   )}
                </motion.div>

              /* STATE: INPUT SELECTION (DEFAULT) */
              ) : (
                <motion.div 
                  key="selection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-4"
                >
                   <button 
                     onClick={handleStartCamera}
                     className="w-full py-8 md:py-12 bg-white border-2 border-dashed border-lime-300 rounded-2xl hover:bg-lime-50 hover:border-lime-500 transition-all group flex flex-col items-center gap-3"
                   >
                      <div className="w-14 h-14 bg-lime-100 text-lime-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Camera size={28} />
                      </div>
                      <div className="text-center">
                        <span className="block font-bold text-lg text-slate-700">Take Photo</span>
                        <span className="text-xs font-semibold text-lime-600 uppercase tracking-wider">Use Camera</span>
                      </div>
                   </button>

                   <div className="relative w-full py-8 md:py-12 bg-white border-2 border-dashed border-slate-200 rounded-2xl hover:bg-slate-50 hover:border-slate-400 transition-all flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mb-1">
                        <Upload size={28} />
                      </div>
                      <div className="text-center">
                        <span className="block font-bold text-lg text-slate-700">Upload File</span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Browse Gallery</span>
                      </div>
                      <div className="absolute inset-0 opacity-0 cursor-pointer">
                         <FileUpload label="" onFileSelect={handleFileSelect} className="w-full h-full" />
                      </div>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-8 bg-blue-50/50 rounded-xl p-4 text-sm text-slate-600 border border-blue-100">
              <p className="font-semibold mb-2 text-blue-800 flex items-center gap-2">
                <ShieldCheck size={16} /> Tips for accuracy:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-500">
                <li>Ensure the leaf is well-lit.</li>
                <li>Avoid blurry images.</li>
                <li>Include healthy tissue for contrast.</li>
              </ul>
            </div>
          </div>

          {/* --- RIGHT COLUMN: DIAGNOSIS RESULTS --- */}
          <div className="p-4 md:p-8 lg:p-12 bg-white flex flex-col justify-center relative min-h-[400px]">
             
             <div className="flex items-center gap-3 mb-6 md:mb-8">
               <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold text-sm">2</span>
               <h3 className="text-lg md:text-xl font-bold text-slate-800">{t.aiDiagnosis}</h3>
            </div>

            {/* Content Switcher */}
            <div className="flex-1 flex flex-col items-center justify-center">
               
               {!hasFile && !diagnosisResult && (
                 <div className="text-center py-6 md:py-10">
                   <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-50 rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4 mx-auto">
                     <Stethoscope className="text-slate-300" size={40} />
                   </div>
                   <h4 className="text-lg font-medium text-slate-700">{t.waitingInput}</h4>
                   <p className="text-slate-400 text-sm max-w-xs mt-2 mx-auto">Upload an image on the left to start the diagnostic process.</p>
                 </div>
               )}

               {hasFile && !diagnosisResult && !diagnosing && (
                 <div className="text-center py-10 opacity-50">
                    <p>Select Language & Click Diagnose.</p>
                 </div>
               )}

               {diagnosing && (
                  <div className="flex flex-col items-center justify-center py-10">
                     <Loader2 size={48} className="text-lime-500 animate-spin mb-4" />
                     <p className="text-slate-500 font-medium animate-pulse">Analyzing leaf patterns...</p>
                  </div>
               )}

               {activeResult && styles && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="w-full"
                 >
                   {/* --- REPORT CONTENT (Wrapped in Ref for PDF) --- */}
                   <div ref={reportRef} className={`${styles.bg} p-5 md:p-6 rounded-2xl border ${styles.border} shadow-sm mb-6 relative overflow-hidden`}>
                     <div className={`absolute top-0 left-0 w-1 h-full ${styles.text.replace('text', 'bg').replace('900', '500')}`}></div>
                     
                     <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-2">
                       <div>
                         <h4 className={`text-xl md:text-2xl font-bold ${styles.text}`}>{activeResult.diseaseName}</h4>
                          <p className={`text-sm font-mono mt-1 opacity-80 ${styles.subText}`}>{activeResult.pathogen}</p>
                       </div>
                       <span className={`${styles.badge} text-xs font-bold px-3 py-1 rounded-full border self-start`}>
                        {Math.round(activeResult.confidence * 100)}% {t.confidence}
                       </span>
                     </div>
                     
                     <p className={`text-sm mb-6 ${styles.subText} bg-white/40 p-3 rounded-lg italic`}>
                       "{activeResult.description}"
                     </p>

                     <div className="space-y-4">
                        <div className={`p-3 bg-white/60 rounded-lg border ${styles.border} text-sm ${styles.text} flex gap-3 shadow-sm`}>
                           <div className="shrink-0 pt-0.5">{styles.icon}</div>
                           <p className="font-medium">
                            {activeResult.severity === 'healthy'
                               ? 'Plant appears healthy. No action needed.' 
                               : t.immediateAction}
                           </p>
                        </div>
                        
                        <div>
                           <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                             <Activity size={14} /> {t.recommendedTreatment}
                           </p>
                           <ul className="text-sm text-slate-700 space-y-2 bg-white p-4 rounded-xl border border-slate-100">
                            {activeResult.treatments.map((treatment, idx) => (
                               <li key={idx} className="flex items-start gap-2">
                                 <CheckCircle2 size={16} className={`${styles.accent} shrink-0 mt-0.5`} />
                                 <span className="leading-snug">{treatment}</span>
                               </li>
                            ))}
                           </ul>
                        </div>
                     </div>
                     
                     <div className="mt-6 pt-4 border-t border-slate-200/50 text-center text-xs text-slate-400 hidden print:block">
                        Generated by Agri-Sentry AI • {new Date().toLocaleDateString()}
                     </div>
                   </div>

                   {/* --- SAVE & SHARE ACTIONS --- */}
                   <ResultsActions 
                      data={activeResult} 
                      image={capturedImage} 
                      type="disease" 
                      reportRef={reportRef} 
                   />

                   <button 
                     onClick={resetProcess}
                     className="w-full py-3 md:py-4 mt-6 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
                   >
                     <RefreshCw size={18} />
                     {t.reset}
                   </button>
                 </motion.div>
               )}

            </div>
          </div>

        </div>
      </div>

      {/* --- PREVIOUS DIAGNOSES --- */}
      {/* <div className="mt-12 pt-8 border-t border-slate-200">
        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="text-emerald-600" /> Your Previous Diagnoses
        </h3>
        
        {!user ? (
            <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <p className="text-slate-500">Please log in to view your history.</p>
            </div>
        ) : history.length === 0 ? (
            <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                <p className="text-slate-500">No saved diagnoses yet. Scan a plant to get started!</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map((scan) => (
                    // *** ADDED ONCLICK TO OPEN MODAL ***
                    <div 
                        key={scan._id} 
                        onClick={() => setViewingScan(scan)}
                        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex gap-4 items-start relative group cursor-pointer"
                    >
                        <img src={scan.image} alt="Thumbnail" className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 truncate text-sm">{scan.name}</h4>
                            <p className="text-xs text-slate-500 mb-2">{new Date(scan.date).toLocaleDateString()}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                scan.severity?.toLowerCase() === 'high' ? 'bg-red-100 text-red-700' : 
                                scan.severity?.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-emerald-100 text-emerald-700'
                            }`}>
                                {scan.severity}
                            </span>
                        </div>
<button
  onClick={(e) => handleDelete(e, scan._id)}
  className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all
              opacity-40 group-hover:opacity-100 hover:scale-105
              bg-white/50 backdrop-blur-sm shadow-sm`}
  aria-label={deletingIds.includes(scan._id) ? 'Deleting' : 'Delete'}
  disabled={deletingIds.includes(scan._id)}
  title={deletingIds.includes(scan._id) ? 'Deleting...' : 'Delete'}
  style={{ pointerEvents: deletingIds.includes(scan._id) ? 'none' : 'auto', zIndex: 30 }}
>
  {deletingIds.includes(scan._id) ? (
    <Loader2 size={16} className="animate-spin text-slate-500" />
  ) : (
    <Trash2 size={16} className="text-slate-600 hover:text-red-600" />
  )}
</button>
                    </div>
                ))}
            </div>
        )}
      </div> */}
    </div>
  );
};